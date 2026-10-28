/**
 * Physio Cloud — browser sync adapter
 * ------------------------------------
 * Mirrors the app's localStorage stores to a Cloudflare Worker
 * (D1 for text/records, R2 for photos, KV for small config).
 *
 * SAFE BY DEFAULT: if no baseUrl is configured this file does nothing.
 *
 * Enable it once (per device) from the browser console:
 *   PhysioCloud.configure({ baseUrl: 'https://physio-cloud.<your-subdomain>.workers.dev' })
 *
 * On the next login the adapter signs in against the Worker and starts syncing.
 */
(function () {
  'use strict';

  var KEY_CFG = 'physioCloudConfig';
  var KEY_TOKEN = 'physioCloudToken';
  var KEY_META = 'physioCloudMeta';      // key -> last known server timestamp
  var KEY_PUSHED = 'physioCloudPushed';  // key -> last value successfully pushed
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

  var cfg = readJson(KEY_CFG, {});
  if (window.PHYSIO_CLOUD) {
    for (var k in window.PHYSIO_CLOUD) {
      if (Object.prototype.hasOwnProperty.call(window.PHYSIO_CLOUD, k)) cfg[k] = window.PHYSIO_CLOUD[k];
    }
  }

  var baseUrl = String(cfg.baseUrl || '').replace(/\/+$/, '');
  var enabled = !!baseUrl;
  var token = localStorage.getItem(KEY_TOKEN) || '';
  var timer = null;
  var inFlight = false;
  var reloading = false;

  function isSyncKey(key) {
    if (!key) return false;
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

  function scheduleSync() {
    if (!enabled) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; flush(); }, 1800);
  }

  function flush() {
    if (!enabled || !token || inFlight) return Promise.resolve(false);
    var pushed = readJson(KEY_PUSHED, {});
    var meta = readJson(KEY_META, {});
    var now = Date.now();
    var entries = [];

    localKeys().forEach(function (key) {
      var value = localStorage.getItem(key);
      if (value == null) return;
      if (pushed[key] === value) return;              // unchanged since last push
      meta[key] = now;
      entries.push({ key: key, value: value, updatedAt: now });
    });

    if (!entries.length) return Promise.resolve(false);

    inFlight = true;
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
          chunk.forEach(function (e) { pushed[e.key] = e.value; });
          return true;
        });
      });
    }, Promise.resolve(true)).then(function (ok) {
      inFlight = false;
      if (ok) {
        writeJson(KEY_PUSHED, pushed);
        writeJson(KEY_META, meta);
      }
      return ok;
    }).catch(function () {
      inFlight = false;
      return false;
    });
  }

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
        var meta = readJson(KEY_META, {});
        var pushed = readJson(KEY_PUSHED, {});
        var changed = false;
        data.entries.forEach(function (entry) {
          if (!isSyncKey(entry.key)) return;
          var serverTs = Number(entry.updated_at) || 0;
          var localTs = Number(meta[entry.key]) || 0;
          if (serverTs > localTs) {
            try { localStorage.setItem(entry.key, entry.value); } catch (e) { return; }
            meta[entry.key] = serverTs;
            pushed[entry.key] = entry.value;
            changed = true;
          }
        });
        if (changed) {
          writeJson(KEY_META, meta);
          writeJson(KEY_PUSHED, pushed);
        }
        return changed;
      })
      .catch(function () { return false; });
  }

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
        return true;
      });
    }).catch(function () { return false; });
  }

  // Called by app.js right after a successful local login.
  function onLocalLogin(email, password) {
    if (!enabled || !email || !password) return;
    login(email, password).then(function (ok) {
      if (!ok) return;
      // Push anything this device has that the cloud does not, then pull changes.
      flush().then(function () { scheduleSync(); });
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

  function configure(options) {
    var next = readJson(KEY_CFG, {});
    for (var key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) next[key] = options[key];
    }
    writeJson(KEY_CFG, next);
    try { sessionStorage.removeItem(PULL_FLAG); } catch (e) { /* ignore */ }
    if (options && options.reload !== false) location.reload();
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
        if (changed && !reloading) {
          reloading = true;
          location.reload();
        }
      }).catch(function () { /* ignore */ });
    }
  }

  window.PhysioCloud = {
    enabled: enabled,
    get baseUrl() { return baseUrl; },
    get token() { return token; },
    configure: configure,
    login: login,
    onLocalLogin: onLocalLogin,
    logout: logout,
    pullAll: pullAll,
    flush: flush,
    scheduleSync: scheduleSync,
    uploadPhoto: uploadPhoto,
    isSyncKey: isSyncKey
  };
})();
