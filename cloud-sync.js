/**
 * Physio Cloud — browser sync adapter
 * ------------------------------------
 * Mirrors the app's localStorage stores to the Cloudflare Worker
 * (D1 for text/records, R2 for photos, KV for small config).
 *
 * The API URL is built in, so sync is on by default. It is completely
 * passive when the device has no cloud session yet: no token means no
 * network calls, and the app keeps working from localStorage.
 *
 * Manual controls (normally used from Administrative Core > Cloud Storage):
 *   PhysioCloud.configure({ baseUrl: 'https://...' })   // change endpoint
 *   PhysioCloud.disable()                               // turn off on this device
 *   PhysioCloud.seedFromRoster(setupKey)                // upload staff accounts
 *   PhysioCloud.pullAll() / .flush() / .stats()
 */
(function () {
  'use strict';

  var DEFAULT_BASE_URL = 'https://physio-cloud.psfamily.workers.dev';

  var KEY_CFG = 'physioCloudConfig';
  var KEY_TOKEN = 'physioCloudToken';
  var KEY_META = 'physioCloudMeta';      // key -> last known server timestamp
  var KEY_PUSHED = 'physioCloudPushed';  // key -> hash of last value pushed
  var KEY_STATE = 'physioCloudState';    // small status record
  var KEY_SKIPPED = 'physioCloudSkipped'; // key -> why the server refused it
  var PULL_FLAG = 'physioCloudPulledOnce';

  // Which localStorage keys belong to the app and should be synced.
  var SYNC_PREFIXES = ['physio', 'psCal', 'roster', 'ptRoster', 'PT'];

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota */ }
  }

  var KEY_BACKUP = 'physioCloudBackup';

  // Keep a bounded local safety copy of anything the cloud overwrites.
  function backupBeforeOverwrite(key, value) {
    if (value == null || value.length > 400000) return;
    var backups = readJson(KEY_BACKUP, {}) || {};
    backups[key] = { value: value, at: Date.now() };
    var keys = Object.keys(backups);
    if (keys.length > 8) {
      keys.sort(function (a, b) { return (backups[a].at || 0) - (backups[b].at || 0); });
      while (keys.length > 8) delete backups[keys.shift()];
    }
    writeJson(KEY_BACKUP, backups);
  }

  // Fast non-cryptographic hash so we can tell "unchanged" without keeping a
  // second full copy of every store in localStorage.
  function hash(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return text.length.toString(36) + ':' + h.toString(36);
  }

  var cfg = readJson(KEY_CFG, {}) || {};
  if (window.PHYSIO_CLOUD) {
    for (var k in window.PHYSIO_CLOUD) {
      if (Object.prototype.hasOwnProperty.call(window.PHYSIO_CLOUD, k)) cfg[k] = window.PHYSIO_CLOUD[k];
    }
  }

  var baseUrl = String(cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  var enabled = !!baseUrl && cfg.disabled !== true;
  var token = localStorage.getItem(KEY_TOKEN) || '';
  var timer = null;
  var inFlight = false;
  var reloading = false;

  // "Nothing stored here yet" placeholder values, e.g. [] or {} or ''.
  function isEmptyish(value) {
    if (value == null) return true;
    var t = String(value).trim();
    return t === '' || t === '[]' || t === '{}' || t === 'null' || t === '0';
  }

  // Rough "how much is in here" measure: array length, object key count, or 1
  // for a plain scalar. Used only to decide which side wins on first contact.
  function contentScore(value) {
    if (value == null) return 0;
    var t = String(value).trim();
    if (!t || t === 'null') return 0;
    try {
      var parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.length;
      if (parsed && typeof parsed === 'object') return Object.keys(parsed).length;
      return 1;
    } catch (e) {
      return 1;
    }
  }

  function isSyncKey(key) {    if (!key) return false;
    if (key.indexOf('physioCloud') === 0) return false;       // never sync our own bookkeeping
    if (key.indexOf('physioBiometric') === 0) return false;   // device-specific credential
    for (var i = 0; i < SYNC_PREFIXES.length; i++) {
      if (key.indexOf(SYNC_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function authHeaders(extra) {
    var h = extra || {};
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  function localKeys() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (isSyncKey(key)) out.push(key);
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  function note(label, detail) {
    var state = readJson(KEY_STATE, {}) || {};
    state[label] = Date.now();
    if (detail !== undefined) state[label + 'Detail'] = detail;
    writeJson(KEY_STATE, state);
  }

  function reloadOnce() {
    if (reloading) return;
    reloading = true;
    try { location.reload(); } catch (e) { /* ignore */ }
  }

  function scheduleSync() {
    if (!enabled) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; flush(); }, 1800);
  }

  /* ---------------- push ---------------- */

  function pushEntries(entries, meta, pushed) {
    if (!entries.length) {
      writeJson(KEY_META, meta);
      writeJson(KEY_PUSHED, pushed);
      return Promise.resolve(true);
    }
    var chunks = [];
    for (var i = 0; i < entries.length; i += 25) chunks.push(entries.slice(i, i + 25));

    return chunks.reduce(function (chain, chunk) {
      return chain.then(function (ok) {
        if (!ok) return false;
        return fetch(baseUrl + '/sync', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ entries: chunk })
        }).then(function (res) {
          if (res.status === 401) { clearToken(); return false; }
          if (!res.ok) return false;
          return res.json().catch(function () { return {}; }).then(function (data) {
            var skippedMap = readJson(KEY_SKIPPED, {}) || {};
            var refused = {};
            ((data && data.skipped) || []).forEach(function (s) {
              if (!s || !s.key) return;
              refused[s.key] = true;
              skippedMap[s.key] = { reason: s.reason || 'refused', bytes: s.bytes || 0, at: Date.now() };
            });
            chunk.forEach(function (e) {
              if (refused[e.key]) {
                // Store it so we do not retry the same oversized payload forever.
                pushed[e.key] = hash(e.value);
                meta[e.key] = e.updatedAt;
                return;
              }
              delete skippedMap[e.key];
              pushed[e.key] = hash(e.value);
              meta[e.key] = e.updatedAt;
            });
            writeJson(KEY_SKIPPED, skippedMap);
            return true;
          });
        });
      });
    }, Promise.resolve(true)).then(function (ok) {
      if (ok) {
        writeJson(KEY_META, meta);
        writeJson(KEY_PUSHED, pushed);
        note('lastPush');
      } else {
        note('lastError', 'push failed');
      }
      return ok;
    });
  }

  function flush() {
    if (!enabled || !token || inFlight) return Promise.resolve(false);
    var pushed = readJson(KEY_PUSHED, {}) || {};
    var meta = readJson(KEY_META, {}) || {};
    var now = Date.now();
    var entries = [];

    localKeys().forEach(function (key) {
      var value = localStorage.getItem(key);
      if (value == null) return;
      if (pushed[key] === hash(value)) return;              // unchanged since last push
      meta[key] = now;
      entries.push({ key: key, value: value, updatedAt: now });
    });

    if (!entries.length) return Promise.resolve(true);

    inFlight = true;
    return pushEntries(entries, meta, pushed)
      .then(function (ok) { inFlight = false; return ok; })
      .catch(function () { inFlight = false; note('lastError', 'push network error'); return false; });
  }

  /* ---------------- pull ---------------- */

  function pullAll() {
    if (!enabled || !token) return Promise.resolve(false);
    return fetch(baseUrl + '/sync', { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 401) { clearToken(); return null; }
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.entries) return false;
        var meta = readJson(KEY_META, {}) || {};
        var pushed = readJson(KEY_PUSHED, {}) || {};
        var changed = false;
        data.entries.forEach(function (entry) {
          if (!isSyncKey(entry.key)) return;
          var serverTs = Number(entry.updated_at) || 0;
          var localTs = Number(meta[entry.key]) || 0;
          if (serverTs > localTs) {
            try { localStorage.setItem(entry.key, entry.value); } catch (e) { return; }
            meta[entry.key] = serverTs;
            pushed[entry.key] = hash(entry.value);
            changed = true;
          }
        });
        if (changed) {
          writeJson(KEY_META, meta);
          writeJson(KEY_PUSHED, pushed);
        }
        note('lastPull');
        return changed;
      })
      .catch(function () { note('lastError', 'pull network error'); return false; });
  }

  /**
   * First time this device talks to the cloud.
   * The server is authoritative for keys it already has, EXCEPT when the local
   * copy has real content and the server copy is an empty placeholder — that
   * case is almost always "this device is the source of truth", so local wins
   * and gets uploaded. Keys that exist only on this device are uploaded too.
   */
  function firstContactMerge() {
    if (!enabled || !token) return Promise.resolve(false);
    return fetch(baseUrl + '/sync', { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 401) { clearToken(); return null; }
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data || !data.entries) return false;
        var meta = {};
        var pushed = {};
        var serverKeys = {};
        var changed = false;

        data.entries.forEach(function (entry) {
          if (!isSyncKey(entry.key)) return;
          var localValue = null;
          try { localValue = localStorage.getItem(entry.key); } catch (e) { /* ignore */ }
          // First contact: whichever side holds more content wins. This stops an
          // empty cloud copy from wiping a device that has the real data (and
          // stops a brand-new device from wiping a populated cloud).
          if (localValue != null && !isEmptyish(localValue) && contentScore(localValue) > contentScore(entry.value)) {
            return; // keep local; it is uploaded below
          }
          serverKeys[entry.key] = true;
          meta[entry.key] = Number(entry.updated_at) || 0;
          pushed[entry.key] = hash(entry.value);
          try {
            if (localStorage.getItem(entry.key) !== entry.value) {
              backupBeforeOverwrite(entry.key, localStorage.getItem(entry.key));
              localStorage.setItem(entry.key, entry.value);
              changed = true;
            }
          } catch (e) { /* quota */ }
        });

        var now = Date.now();
        var uploads = [];
        localKeys().forEach(function (key) {
          if (serverKeys[key]) return;
          var value = localStorage.getItem(key);
          if (value == null) return;
          meta[key] = now;
          uploads.push({ key: key, value: value, updatedAt: now });
        });

        return pushEntries(uploads, meta, pushed).then(function (ok) {
          note('firstMerge', changed ? 'pulled' : (uploads.length ? 'uploaded ' + uploads.length : 'clean'));
          if (changed) { reloadOnce(); return true; }
          return ok;
        });
      })
      .catch(function () { note('lastError', 'first merge failed'); return false; });
  }

  /* ---------------- auth ---------------- */

  function setToken(value) {
    token = value || '';
    try {
      if (token) localStorage.setItem(KEY_TOKEN, token);
      else localStorage.removeItem(KEY_TOKEN);
    } catch (e) { /* ignore */ }
  }

  function clearToken() {
    setToken('');
  }

  function login(email, password) {
    if (!enabled) return Promise.resolve(false);
    return fetch(baseUrl + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      if (!res.ok) return false;
      return res.json().then(function (data) {
        if (!data || !data.token) return false;
        setToken(data.token);
        note('lastLogin');
        return true;
      });
    }).catch(function () { return false; });
  }

  // Called by app.js right after a successful local login.
  function onLocalLogin(email, password) {
    if (!enabled || !email || !password) return;
    login(email, password).then(function (ok) {
      if (!ok) return;
      var known = readJson(KEY_PUSHED, null);
      if (!known) return firstContactMerge();
      pullAll().then(function (changed) {
        if (changed) { reloadOnce(); return; }
        flush().then(function () { scheduleSync(); });
      });
    }).catch(function () { /* silent */ });
  }

  function logout() {
    if (enabled && token) {
      try {
        fetch(baseUrl + '/auth/logout', { method: 'POST', headers: authHeaders() }).catch(function () {});
      } catch (e) { /* ignore */ }
    }
    clearToken();
  }

  /* ---------------- config / admin ---------------- */

  function configure(options) {
    var next = readJson(KEY_CFG, {}) || {};
    for (var key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) next[key] = options[key];
    }
    delete next.disabled;
    writeJson(KEY_CFG, next);
    try { sessionStorage.removeItem(PULL_FLAG); } catch (e) { /* ignore */ }
    if (options && options.reload !== false) location.reload();
  }

  function disable() {
    var next = readJson(KEY_CFG, {}) || {};
    next.disabled = true;
    writeJson(KEY_CFG, next);
    clearToken();
    try { localStorage.removeItem(KEY_PUSHED); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(KEY_META); } catch (e) { /* ignore */ }
    if (typeof location !== 'undefined') location.reload();
  }

  /**
   * Seed every staff account from the locally stored roster.
   * Usage: PhysioCloud.seedFromRoster('<setup key>')
   */
  function seedFromRoster(setupKey) {
    if (!enabled) return Promise.resolve({ ok: false, error: 'Cloud sync is turned off on this device' });
    var roster = readJson('physioStaffDirectoryRepository', []);
    if (!Array.isArray(roster) || !roster.length) {
      return Promise.resolve({ ok: false, error: 'No staff roster found on this device' });
    }
    var users = roster.filter(function (u) {
      return u && u.email && u.password;
    }).map(function (u) {
      return {
        email: u.email,
        password: u.password,
        role: u.position,
        active: u.active !== false,
        data: { name: u.name, phone: u.phone, department: u.department }
      };
    });
    if (!users.length) return Promise.resolve({ ok: false, error: 'No staff accounts with email + password found' });
    return fetch(baseUrl + '/auth/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bootstrap-Secret': String(setupKey || '') },
      body: JSON.stringify({ users: users })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (data && data.ok) data.seeded = users.length;
        if (!res.ok && data && !data.error) data.error = 'HTTP ' + res.status;
        return data;
      });
    }).catch(function (err) {
      return { ok: false, error: 'Network error: ' + String((err && err.message) || err) };
    });
  }

  function stats() {
    if (!enabled || !token) return Promise.resolve(null);
    return fetch(baseUrl + '/stats', { headers: authHeaders() })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  function status() {
    var state = readJson(KEY_STATE, {}) || {};
    var pending = 0;
    if (enabled && token) {
      var pushed = readJson(KEY_PUSHED, {}) || {};
      localKeys().forEach(function (key) {
        var value = localStorage.getItem(key);
        if (value == null) return;
        if (pushed[key] !== hash(value)) pending++;
      });
    }
    return {
      configured: !!baseUrl,
      enabled: enabled,
      baseUrl: baseUrl,
      signedIn: !!token,
      pending: pending,
      lastPush: state.lastPush || 0,
      lastPull: state.lastPull || 0,
      lastMerge: state.firstMergeDetail || '',
      lastError: state.lastError || '',
      lastErrorAt: state.lastErrorAt || 0,
      skipped: readJson(KEY_SKIPPED, {}) || {}
    };
  }

  /**
   * Upload a photo to R2 and return its public URL.
   * Accepts a File/Blob or a data: URL string.
   */
  function uploadPhoto(fileOrDataUrl, key) {
    if (!enabled || !token) return Promise.reject(new Error('cloud not enabled'));
    return toBlob(fileOrDataUrl).then(function (blob) {
      var form = new FormData();
      form.append('file', blob, 'photo.jpg');
      if (key) form.append('key', key);
      return fetch(baseUrl + '/photos', {
        method: 'POST',
        headers: authHeaders(),
        body: form
      });
    }).then(function (res) {
      if (!res.ok) throw new Error('photo upload failed (' + res.status + ')');
      return res.json();
    }).then(function (data) {
      return baseUrl + data.url;
    });
  }

  function toBlob(input) {
    if (typeof input === 'string' && input.indexOf('data:') === 0) {
      return fetch(input).then(function (r) { return r.blob(); });
    }
    return Promise.resolve(input);
  }

  // ---- first-load pull (runs before the app is used) ----
  if (enabled && token) {
    var alreadyPulled = false;
    try { alreadyPulled = sessionStorage.getItem(PULL_FLAG) === '1'; } catch (e) { /* ignore */ }
    if (!alreadyPulled) {
      try { sessionStorage.setItem(PULL_FLAG, '1'); } catch (e) { /* ignore */ }
      pullAll().then(function (changed) {
        if (changed) reloadOnce();
      }).catch(function () { /* ignore */ });
    }
  }

  window.PhysioCloud = {
    enabled: enabled,
    get baseUrl() { return baseUrl; },
    get token() { return token; },
    configure: configure,
    disable: disable,
    login: login,
    onLocalLogin: onLocalLogin,
    logout: logout,
    pullAll: pullAll,
    flush: flush,
    scheduleSync: scheduleSync,
    firstContactMerge: firstContactMerge,
    uploadPhoto: uploadPhoto,
    seedFromRoster: seedFromRoster,
    stats: stats,
    status: status,
    isSyncKey: isSyncKey
  };
})();
