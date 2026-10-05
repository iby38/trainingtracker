/* Shared server helpers: responses, password hashing, sessions, database schema. */

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export const now = () => Date.now();
export const newId = () => crypto.randomUUID();

/* ---------------- usernames & passwords ---------------- */
export const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'support', 'coach', 'trainer', 'null', 'undefined']);

export function cleanUsername(u) { return String(u || '').trim().toLowerCase(); }
export function checkUsername(u, env) {
  if (!USERNAME_RE.test(u)) fail(400, 'Usernames are 3–24 characters: letters, numbers, dots and underscores.');
  if (RESERVED.has(u) || u === cleanUsername(env.ADMIN_USERNAME)) fail(409, 'That username is taken.');
}
export function checkPassword(p) {
  if (typeof p !== 'string' || p.length < 8) fail(400, 'Passwords need at least 8 characters.');
  if (p.length > 128) fail(400, 'That password is too long.');
}

// Cloudflare's runtime caps PBKDF2 at 100,000 iterations. The count is stored in each
// hash, so it can be changed later without breaking existing passwords.
const ITERATIONS = 100000;
const enc = new TextEncoder();
const toB64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}
export async function verifyPassword(password, stored) {
  try {
    const [alg, it, salt, hash] = String(stored).split('$');
    if (alg !== 'pbkdf2') return false;
    const iterations = Math.min(+it, ITERATIONS);
    const got = await pbkdf2(password, fromB64(salt), iterations);
    return equalBytes(got, fromB64(hash));
  } catch (e) { return false; }
}
function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}
export async function sha256Hex(text) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}
export async function sameSecret(a, b) {
  if (!a || !b) return false;
  return (await sha256Hex(String(a))) === (await sha256Hex(String(b)));
}

/* ---------------- sessions ---------------- */
const SESSION_DAYS = 365; // long-lived so the app keeps working offline for months

export async function createSession(db, userId, device) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = toB64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const t = now();
  await db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, device) VALUES (?,?,?,?,?)')
    .bind(await sha256Hex(token), userId, t, t + SESSION_DAYS * 86400000, String(device || '').slice(0, 120)).run();
  return token;
}

export async function authenticate(req, db) {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  const th = await sha256Hex(token);
  const row = await db.prepare(
    `SELECT u.id, u.username, u.display, u.role, u.must_change, u.last_seen, s.expires_at, s.token_hash
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).bind(th).first();
  if (!row || row.expires_at < now()) return null;
  if (now() - row.last_seen > 10 * 60000) {
    await db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now(), row.id).run();
  }
  return row;
}

export const publicUser = (u) => ({ id: u.id, username: u.display || u.username, role: u.role, mustChange: !!u.must_change });

/* ---------------- notifications ---------------- */
export function notifyStmt(db, userId, type, text, data) {
  return db.prepare('INSERT INTO notifications (id, user_id, type, text, data, created_at) VALUES (?,?,?,?,?,?)')
    .bind(newId(), userId, type, String(text).slice(0, 500), JSON.stringify(data || {}), now());
}

/* ---------------- schema (created automatically on first use) ---------------- */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`,
  `INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', 0)`,
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display TEXT NOT NULL, pw TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'user', must_change INTEGER NOT NULL DEFAULT 0,
     failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL, device TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS records (
     user_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
     updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, rev INTEGER NOT NULL,
     PRIMARY KEY (user_id, kind, id))`,
  `CREATE INDEX IF NOT EXISTS idx_records_rev ON records (user_id, rev)`,
  `CREATE TABLE IF NOT EXISTS links (
     coach_id TEXT NOT NULL, client_id TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL,
     PRIMARY KEY (coach_id, client_id))`,
  `CREATE INDEX IF NOT EXISTS idx_links_client ON links (client_id)`,
  `CREATE TABLE IF NOT EXISTS coach_groups (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_groups_coach ON coach_groups (coach_id)`,
  `CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL, client_id TEXT NOT NULL, PRIMARY KEY (group_id, client_id))`,
  `CREATE TABLE IF NOT EXISTS notifications (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, text TEXT NOT NULL,
     data TEXT, created_at INTEGER NOT NULL, read_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS reset_requests (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL, message TEXT,
     created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open')`
];
let schemaReady = null;
export function ensureSchema(db) {
  if (!schemaReady) schemaReady = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}
