/**
 * Physio Cloud API — Cloudflare Worker
 * Storage: D1 (records) + R2 (photos) + KV (config/cache)
 *
 * Bindings (see wrangler.toml):
 *   DB     -> D1 database (schema.sql)
 *   PHOTOS -> R2 bucket
 *   CONFIG -> KV namespace
 *
 * Vars:
 *   ALLOWED_ORIGINS     comma-separated list of allowed browser origins
 *   SESSION_TTL_DAYS    session lifetime in days (default 30)
 *   BOOTSTRAP_SECRET    one-time secret for /auth/bootstrap and /auth/seed
 *
 * Endpoints:
 *   GET    /health
 *   POST   /auth/bootstrap          {email,name,password}   (X-Bootstrap-Secret)
 *   POST   /auth/seed               {users:[{email,password,role,data}]} (X-Bootstrap-Secret)
 *   POST   /auth/login              {email,password}
 *   POST   /auth/logout
 *   GET    /auth/me
 *   GET    /sync?since=<ms>         -> {entries:[{key,value,updated_at}]}
 *   POST   /sync                    {entries:[{key,value,updatedAt}]}
 *   POST   /photos                  multipart: file, key?
 *   GET    /photos/<key>
 *   DELETE /photos/<key>
 *   GET    /config/<key>
 *   PUT    /config/<key>            {value}
 */

const MAX_VALUE_BYTES = 900000;
const SYNC_PREFIXES = ['physio', 'psCal', 'roster', 'ptRoster', 'PT'];

export default {
  async fetch(request, env) {
    const cors = buildCors(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    let res;
    try {
      res = await route(request, env);
    } catch (err) {
      res = json({ ok: false, error: String((err && err.message) || err) }, 500);
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  const parts = path.split('/').filter(Boolean);

  if (path === '/' || path === '/health') {
    return json({ ok: true, service: 'physio-cloud', time: Date.now() });
  }

  // ---------- auth ----------
  if (path === '/auth/bootstrap' && method === 'POST') {
    if (!checkBootstrapSecret(request, env)) return json({ ok: false, error: 'Forbidden' }, 403);
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    if (count && count.n > 0) return json({ ok: false, error: 'Already bootstrapped' }, 409);
    const body = await readJson(request);
    const email = normEmail(body.email);
    if (!email || !body.password) return json({ ok: false, error: 'email and password required' }, 400);
    const now = Date.now();
    const hash = await hashPassword(String(body.password));
    await env.DB.prepare(
      'INSERT INTO users (email,password_hash,role,active,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'
    ).bind(email, hash, String(body.role || 'Admin'), 1, JSON.stringify({ name: body.name || email }), now, now).run();
    return json({ ok: true, email });
  }

  if (path === '/auth/seed' && method === 'POST') {
    if (!checkBootstrapSecret(request, env)) return json({ ok: false, error: 'Forbidden' }, 403);
    const body = await readJson(request);
    const users = Array.isArray(body.users) ? body.users : [];
    let saved = 0;
    for (const u of users) {
      const email = normEmail(u.email);
      if (!email || !u.password) continue;
      const now = Date.now();
      const hash = await hashPassword(String(u.password));
      await env.DB.prepare(
        `INSERT INTO users (email,password_hash,role,active,data,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(email) DO UPDATE SET
           password_hash=excluded.password_hash,
           role=excluded.role,
           data=excluded.data,
           updated_at=excluded.updated_at`
      ).bind(email, hash, String(u.role || 'Physiotherapist'), u.active === false ? 0 : 1, JSON.stringify(u.data || {}), now, now).run();
      saved++;
    }
    return json({ ok: true, saved });
  }

  if (path === '/auth/login' && method === 'POST') {
    const body = await readJson(request);
    const email = normEmail(body.email);
    if (!email || !body.password) return json({ ok: false, error: 'email and password required' }, 400);
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND active = 1').bind(email).first();
    if (!user || !(await verifyPassword(String(body.password), user.password_hash))) {
      return json({ ok: false, error: 'Invalid email or password' }, 401);
    }
    const token = await createSession(env, email);
    return json({ ok: true, token, user: { email, role: user.role, data: safeJson(user.data) } });
  }

  if (path === '/auth/logout' && method === 'POST') {
    const token = bearer(request);
    if (token) {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
    }
    return json({ ok: true });
  }

  if (path === '/auth/me' && method === 'GET') {
    const email = await currentUser(request, env);
    if (!email) return json({ ok: false, error: 'Unauthorized' }, 401);
    const user = await env.DB.prepare('SELECT email, role, data FROM users WHERE email = ?').bind(email).first();
    return json({ ok: true, user: user ? { email: user.email, role: user.role, data: safeJson(user.data) } : { email } });
  }

  // ---------- sync (auth required) ----------
  if (path === '/sync' && method === 'GET') {
    const email = await currentUser(request, env);
    if (!email) return json({ ok: false, error: 'Unauthorized' }, 401);
    const since = parseInt(url.searchParams.get('since') || '0', 10) || 0;
    const rows = since > 0
      ? await env.DB.prepare('SELECT key, value, updated_at FROM kv_store WHERE updated_at > ? ORDER BY updated_at ASC').bind(since).all()
      : await env.DB.prepare('SELECT key, value, updated_at FROM kv_store ORDER BY updated_at ASC').all();
    return json({ ok: true, serverTime: Date.now(), entries: (rows.results || []) });
  }

  if (path === '/sync' && method === 'POST') {
    const email = await currentUser(request, env);
    if (!email) return json({ ok: false, error: 'Unauthorized' }, 401);
    const body = await readJson(request);
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const clean = [];
    let tooBig = 0;
    for (const e of entries) {
      const key = String(e.key || '');
      const value = String(e.value == null ? '' : e.value);
      if (!key || key.length > 200 || !isSyncKey(key)) continue;
      if (byteLength(value) > MAX_VALUE_BYTES) { tooBig++; continue; }
      clean.push({ key, value, updatedAt: parseInt(e.updatedAt, 10) || Date.now() });
    }
    for (let i = 0; i < clean.length; i += 50) {
      const chunk = clean.slice(i, i + 50);
      const stmts = chunk.map((e) =>
        env.DB.prepare(
          `INSERT INTO kv_store (key,value,updated_at,updated_by) VALUES (?,?,?,?)
           ON CONFLICT(key) DO UPDATE SET
             value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by
           WHERE excluded.updated_at >= kv_store.updated_at`
        ).bind(e.key, e.value, e.updatedAt, email)
      );
      await env.DB.batch(stmts);
    }
    return json({ ok: true, saved: clean.length, skippedTooBig: tooBig });
  }

  // ---------- photos ----------
  if (path === '/photos' && method === 'POST') {
    const email = await currentUser(request, env);
    if (!email) return json({ ok: false, error: 'Unauthorized' }, 401);
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return json({ ok: false, error: 'file required' }, 400);
    const rawKey = form.get('key');
    const key = rawKey ? sanitizePhotoKey(String(rawKey)) : `photos/${crypto.randomUUID()}/${sanitizeFilename(file.name || 'upload.jpg')}`;
    if (!key) return json({ ok: false, error: 'invalid key' }, 400);
    await env.PHOTOS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO photos (key,content_type,size,uploaded_at,uploaded_by) VALUES (?,?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET content_type=excluded.content_type, size=excluded.size, uploaded_at=excluded.uploaded_at`
    ).bind(key, file.type || 'application/octet-stream', file.size || 0, now, email).run();
    return json({ ok: true, key, url: `/photos/${key}` });
  }

  if (parts[0] === 'photos' && parts.length >= 2) {
    const key = parts.slice(1).join('/');
    if (method === 'GET') {
      const obj = await env.PHOTOS.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      headers.set('content-type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream');
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      headers.set('etag', obj.httpEtag || '');
      return new Response(obj.body, { status: 200, headers });
    }
    if (method === 'DELETE') {
      const email = await currentUser(request, env);
      if (!email) return json({ ok: false, error: 'Unauthorized' }, 401);
      await env.PHOTOS.delete(key);
      await env.DB.prepare('DELETE FROM photos WHERE key = ?').bind(key).run();
      return json({ ok: true, deleted: key });
    }
  }

  // ---------- kv config ----------
  if (parts[0] === 'config' && parts.length >= 2) {
    const key = parts.slice(1).join('/');
    if (method === 'GET') {
      const value = await env.CONFIG.get(key);
      return json({ ok: true, key, value: value == null ? null : safeJson(value) });
    }
    if (method === 'PUT') {
      const email = await currentUser(request, env);
      if (!email) return json({ ok: false, error: 'Unauthorized' }, 401);
      const body = await readJson(request);
      const value = typeof body.value === 'string' ? body.value : JSON.stringify(body.value);
      await env.CONFIG.put(key, value);
      return json({ ok: true, key });
    }
  }

  return json({ ok: false, error: 'Not found' }, 404);
}

/* ---------------- helpers ---------------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function buildCors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || 'null',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Bootstrap-Secret',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function readJson(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch (e) {
    return {};
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch (e) { return text; }
}

function normEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function bearer(request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

function checkBootstrapSecret(request, env) {
  if (!env.BOOTSTRAP_SECRET) return false;
  return request.headers.get('X-Bootstrap-Secret') === env.BOOTSTRAP_SECRET;
}

function isSyncKey(key) {
  return SYNC_PREFIXES.some((p) => key.startsWith(p)) && !key.startsWith('physioCloud');
}

function byteLength(s) {
  return new TextEncoder().encode(s).length;
}

function sanitizeFilename(name) {
  return String(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'upload.jpg';
}

function sanitizePhotoKey(key) {
  const clean = key.replace(/\\/g, '/').replace(/\.\./g, '').replace(/^\/+/, '');
  return /^[A-Za-z0-9._/-]{1,300}$/.test(clean) ? clean : '';
}

function b64(bytes) {
  let out = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) out += String.fromCharCode(arr[i]);
  return btoa(out);
}

function unb64(text) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
  const iterations = 100000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(bits)}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10) || 100000;
  const salt = unb64(parts[2]);
  const expected = unb64(parts[3]);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function createSession(env, email) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, '').slice(0, 48);
  const hash = await sha256Hex(token);
  const ttl = (parseInt(env.SESSION_TTL_DAYS || '30', 10) || 30) * 86400000;
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash,email,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(hash, email, now, now + ttl)
    .run();
  return token;
}

async function currentUser(request, env) {
  const token = bearer(request);
  if (!token) return '';
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT email, expires_at FROM sessions WHERE token_hash = ?').bind(hash).first();
  if (!row || row.expires_at < Date.now()) return '';
  return row.email;
}
