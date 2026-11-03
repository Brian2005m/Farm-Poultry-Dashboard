const crypto = require('crypto');
const cors = require('cors');
const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'farm.db');
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`).replace(/\/$/, '');
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : crypto.randomBytes(32).toString('hex'));
const SESSION_COOKIE = 'farm_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const VERIFY_TTL_MS = 30 * 60 * 1000;
const dashboardFiles = new Set([
  '/broiler-chicken-dashboard.html',
  '/kienyeji-chicken-dashboard.html',
  '/poultry-dashboard_45 1.html',
  '/Untitled-1.html'
]);

let dbPromise;

function httpError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (error) {
    if (error) return reject(error);
    resolve({ changes: this.changes, lastID: this.lastID });
  }));
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
}

function openDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (error) => {
      if (error) return reject(error);
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS consumers (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
          address TEXT, buyerType TEXT, eggsOrdered REAL DEFAULT 0, location TEXT,
          notes TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
          email_verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS verification_tokens (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )`, (schemaError) => schemaError ? reject(schemaError) : resolve(db));
      });
    });
  });
}

function getDb() {
  if (!dbPromise) dbPromise = openDatabase().catch((error) => { dbPromise = null; throw error; });
  return dbPromise;
}

function normalizeEmail(value) {
  if (typeof value !== 'string') throw httpError(400, 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, 'Enter a valid email address.');
  }
  return email;
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [algorithm, saltHex, hashHex] = String(stored || '').split(':');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return resolve(false);
    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), 64, (error, derivedKey) => {
      if (error) return reject(error);
      const expected = Buffer.from(hashHex, 'hex');
      resolve(expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey));
    });
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD }
  });
}

async function sendVerificationEmail(email, token) {
  const transport = makeTransport();
  if (!transport) throw httpError(503, 'Email delivery is not configured. Please contact the site administrator.');
  const verifyUrl = `${PUBLIC_ORIGIN}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await transport.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Verify your Poultry Hub email',
    text: `Use this link within 30 minutes to verify your email and continue to login:\n\n${verifyUrl}\n\nIf you did not request this, you can ignore this message.`,
    html: `<p>Verify your email to continue to Poultry Hub login.</p><p><a href="${verifyUrl}">Verify email and continue</a></p><p>This link expires in 30 minutes. If you did not request it, ignore this email.</p>`
  });
}

function signSession(userId) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readCookie(req, name) {
  const cookies = (req.headers.cookie || '').split(';');
  for (const part of cookies) {
    const separator = part.indexOf('=');
    if (separator >= 0 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

function sessionUserId(req) {
  if (!SESSION_SECRET) return null;
  const value = readCookie(req, SESSION_COOKIE);
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Math.floor(Date.now() / 1000) ? data.sub : null;
  } catch {
    return null;
  }
}

function setSessionCookie(res, userId) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(signSession(userId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`);
}

async function requireLogin(req, res, next) {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.redirect('/login.html');
    const db = await getDb();
    const user = await dbGet(db, 'SELECT id, email, email_verified FROM users WHERE id = ?', [userId]);
    if (!user || !user.email_verified) return res.redirect('/login.html');
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const password = req.body && req.body.password;
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
      throw httpError(400, 'Password must be between 10 and 128 characters.');
    }
    const db = await getDb();
    let user = await dbGet(db, 'SELECT id, email, email_verified FROM users WHERE email = ?', [email]);
    if (user && user.email_verified) return res.status(200).json({ message: 'If this address can be registered, a verification email will be sent.' });

    if (!user) {
      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      await dbRun(db, 'INSERT INTO users (id, email, password_hash, email_verified, created_at) VALUES (?, ?, ?, 0, ?)', [id, email, passwordHash, new Date().toISOString()]);
      user = { id, email, email_verified: 0 };
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiry = Date.now() + VERIFY_TTL_MS;
    await dbRun(db, 'DELETE FROM verification_tokens WHERE user_id = ?', [user.id]);
    await dbRun(db, 'INSERT INTO verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hashToken(token), user.id, expiry]);
    await sendVerificationEmail(email, token);
    return res.status(202).json({ message: 'Check your email for a verification link. It expires in 30 minutes.' });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/resend-verification', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const db = await getDb();
    const user = await dbGet(db, 'SELECT id, email_verified FROM users WHERE email = ?', [email]);
    if (user && !user.email_verified) {
      const token = crypto.randomBytes(32).toString('base64url');
      await dbRun(db, 'DELETE FROM verification_tokens WHERE user_id = ?', [user.id]);
      await dbRun(db, 'INSERT INTO verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hashToken(token), user.id, Date.now() + VERIFY_TTL_MS]);
      await sendVerificationEmail(email, token);
    }
    return res.status(202).json({ message: 'If the account needs verification, a new link will be sent.' });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/auth/verify', async (req, res, next) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token || token.length > 200) return res.redirect('/login.html?error=invalid-link');
    const db = await getDb();
    const record = await dbGet(db, 'SELECT user_id, expires_at FROM verification_tokens WHERE token_hash = ?', [hashToken(token)]);
    if (!record || record.expires_at < Date.now()) {
      if (record) await dbRun(db, 'DELETE FROM verification_tokens WHERE token_hash = ?', [hashToken(token)]);
      return res.redirect('/login.html?error=expired-link');
    }
    await dbRun(db, 'UPDATE users SET email_verified = 1 WHERE id = ?', [record.user_id]);
    await dbRun(db, 'DELETE FROM verification_tokens WHERE token_hash = ?', [hashToken(token)]);
    return res.redirect('/login.html?verified=1');
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    if (!SESSION_SECRET) throw httpError(500, 'Authentication is not configured.');
    const email = normalizeEmail(req.body && req.body.email);
    const password = req.body && req.body.password;
    if (typeof password !== 'string') throw httpError(400, 'Email and password are required.');
    const db = await getDb();
    const user = await dbGet(db, 'SELECT id, email, password_hash, email_verified FROM users WHERE email = ?', [email]);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw httpError(401, 'Email or password is incorrect.');
    }
    if (!user.email_verified) throw httpError(403, 'Verify your email before logging in.');
    setSessionCookie(res, user.id);
    return res.json({ user: { email: user.email } });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/logout', (req, res) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not signed in.' });
    const db = await getDb();
    const user = await dbGet(db, 'SELECT email FROM users WHERE id = ? AND email_verified = 1', [userId]);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

// Keep dashboard HTML behind verified-email login; static libraries and images remain public.
app.get([...dashboardFiles], requireLogin, (req, res) => res.sendFile(path.join(__dirname, req.path.slice(1))));
app.use(express.static(__dirname, { index: false }));
app.get('/api/*', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.statusCode || (error.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(error);
  return res.status(status).json({ error: status >= 500 ? 'Internal server error.' : error.message });
});

async function startServer() {
  if (!SESSION_SECRET) throw new Error('Set SESSION_SECRET before starting in production.');
  await getDb();
  return app.listen(PORT, () => console.log(`Farm Poultry Dashboard running at ${PUBLIC_ORIGIN}`));
}

if (require.main === module) startServer().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { app, startServer, getDb };
