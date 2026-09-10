import crypto from 'node:crypto';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.OTP_FROM_EMAIL || 'PS Family <password-reset@psfamily.vercel.app>';
const SECRET = process.env.OTP_SECRET || RESEND_API_KEY || 'dev-only-insecure-secret';
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS = 3;
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MIN_SEND_GAP_MS = 45 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const BLOCK_MS = 10 * 60 * 1000;

const rate = new Map();

function getEntry(email) {
  let e = rate.get(email);
  if (!e) {
    e = { sends: [], attempts: 0, blockUntil: 0 };
    rate.set(email, e);
  }
  return e;
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidNonce(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 64 && /^[a-f0-9]+$/.test(value);
}

function sign(email, nonce, otp, expiry) {
  return crypto.createHmac('sha256', SECRET).update(`${email}|${nonce}|${otp}|${expiry}`).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(data));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      if (Buffer.isBuffer(req.body)) return resolve(req.body.toString('utf8'));
      // Vercel may hand us an already-parsed object
      if (typeof req.body === 'object') return resolve(req.body);
      return resolve(String(req.body));
    }
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy(new Error('Body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function sendOtpEmail(to, otp) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Your PS Family password reset code',
      text: `Your PS Family password reset code is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#004b87;">PS Family Password Reset</h2>
        <p>Your recovery code is:</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#004b87;">${otp}</p>
        <p>Enter this code on the login page to set a new password. It expires in <strong>10 minutes</strong>.</p>
        <p style="color:#777;font-size:12px;">If you did not request this, you can safely ignore this email.</p>
      </div>`
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  let payload;
  try {
    const raw = await readRequestBody(req);
    payload = (raw && typeof raw === 'object') ? raw : JSON.parse(raw || '{}');
  } catch (e) {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const action = payload.action;
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) return json(res, 400, { ok: false, error: 'Invalid email address' });

  const now = Date.now();
  const entry = getEntry(email);

  if (action === 'send') {
    if (!RESEND_API_KEY) {
      return json(res, 500, { ok: false, error: 'Email service is not configured. The administrator must add RESEND_API_KEY on Vercel.' });
    }
    if (now < entry.blockUntil) return json(res, 429, { ok: false, error: 'Too many attempts. Wait a few minutes.' });

    entry.sends = entry.sends.filter(t => now - t < SEND_WINDOW_MS);
    if (entry.sends.length >= MAX_SENDS) return json(res, 429, { ok: false, error: 'Too many codes requested for this address. Try again later.' });
    const last = entry.sends[entry.sends.length - 1];
    if (last && now - last < MIN_SEND_GAP_MS) return json(res, 429, { ok: false, error: 'Please wait a moment before requesting another code.' });

    const nonce = typeof payload.nonce === 'string' ? payload.nonce : '';
    if (!isValidNonce(nonce)) return json(res, 400, { ok: false, error: 'Invalid request token.' });

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const expiry = now + OTP_TTL_MS;
    const token = sign(email, nonce, otp, expiry);

    try {
      const resp = await sendOtpEmail(email, otp);
      if (!resp.ok) {
        let msg = 'The email service rejected the message. Check the sender address configuration.';
        try {
          const j = await resp.json();
          if (j && j.message) msg = 'Email service error: ' + j.message;
        } catch (e) { }
        return json(res, 502, { ok: false, error: msg });
      }
      entry.sends.push(now);
      entry.attempts = 0;
      return json(res, 200, { ok: true, token, expiry });
    } catch (err) {
      return json(res, 500, { ok: false, error: 'Could not connect to the email service.' });
    }
  }

  if (action === 'verify') {
    const otp = typeof payload.otp === 'string' && /^\d{6}$/.test(payload.otp) ? payload.otp : '';
    const nonce = typeof payload.nonce === 'string' ? payload.nonce : '';
    const token = typeof payload.token === 'string' ? payload.token : '';
    const expiry = typeof payload.expiry === 'number' && isFinite(payload.expiry) ? payload.expiry : NaN;

    if (!otp || !nonce || !token || !isFinite(expiry)) return json(res, 400, { ok: false, error: 'Invalid verification payload.' });

    if (now < entry.blockUntil) return json(res, 429, { ok: false, error: 'Too many attempts. Wait a few minutes.' });

    entry.attempts = (entry.attempts || 0) + 1;
    if (entry.attempts > MAX_VERIFY_ATTEMPTS) {
      entry.blockUntil = now + BLOCK_MS;
      return json(res, 429, { ok: false, error: 'Too many attempts. Blocked for 10 minutes.' });
    }

    if (now > expiry) return json(res, 400, { ok: false, error: 'This code has expired. Please request a new one.' });

    const expected = sign(email, nonce, otp, expiry);
    if (!safeEqual(expected, token)) return json(res, 400, { ok: false, error: 'Invalid code. Please try again.' });

    entry.attempts = 0;
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { ok: false, error: 'Unknown action.' });
}