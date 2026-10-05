/**
 * Training Tracker API (Cloudflare Worker).
 * Static files in /public are served by Cloudflare directly; only /api/* runs here.
 */
import {
  HttpError, fail, json, now, newId, cleanUsername, checkUsername, checkPassword,
  hashPassword, verifyPassword, sameSecret, createSession, authenticate, publicUser,
  notifyStmt, ensureSchema, sha256Hex
} from './lib.js';

const USER_KINDS = new Set(['exercises', 'sets', 'sessions', 'routines', 'categories', 'settings']);
const COACH_KINDS = new Set(['exercises', 'sets', 'sessions', 'routines', 'categories', 'coachNotes']);
const BATCH = 80;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (url.pathname === '/api/health') {
        let db = false;
        if (env.DB) { try { await ensureSchema(env.DB); db = true; } catch (e) { db = false; } }
        return json({ ok: true, service: 'trainingtracker', db, adminSetup: !!env.SETUP_CODE, time: now() });
      }
      if (!env.DB) fail(503, 'The database is not connected yet.');
      await ensureSchema(env.DB);
      return await route(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong on the server.' }, 500);
    }
  }
};

/* ================= router ================= */
const ROUTES = [
  ['POST', /^\/api\/auth\/signup$/, signup, null],
  ['POST', /^\/api\/auth\/login$/, login, null],
  ['POST', /^\/api\/auth\/setup$/, setupAdmin, null],
  ['POST', /^\/api\/auth\/forgot$/, forgot, null],
  ['POST', /^\/api\/auth\/logout$/, logout, 'any'],
  ['POST', /^\/api\/auth\/password$/, changePassword, 'any'],
  ['GET', /^\/api\/me$/, me, 'any'],
  ['POST', /^\/api\/sync$/, sync, 'user'],
  ['GET', /^\/api\/notifications$/, listNotifications, 'user'],
  ['POST', /^\/api\/notifications\/read$/, readNotifications, 'user'],
  ['POST', /^\/api\/links\/respond$/, respondLink, 'user'],
  ['POST', /^\/api\/links\/remove$/, removeLink, 'user'],
  ['GET', /^\/api\/coach\/overview$/, coachOverview, 'pt'],
  ['POST', /^\/api\/coach\/invite$/, coachInvite, 'pt'],
  ['POST', /^\/api\/coach\/clients$/, coachCreateClient, 'pt'],
  ['DELETE', /^\/api\/coach\/clients\/([\w-]+)$/, coachRemoveClient, 'pt'],
  ['GET', /^\/api\/coach\/clients\/([\w-]+)\/data$/, coachClientData, 'pt'],
  ['POST', /^\/api\/coach\/clients\/([\w-]+)\/sync$/, coachClientSync, 'pt'],
  ['POST', /^\/api\/coach\/groups$/, groupCreate, 'pt'],
  ['POST', /^\/api\/coach\/groups\/([\w-]+)$/, groupRename, 'pt'],
  ['DELETE', /^\/api\/coach\/groups\/([\w-]+)$/, groupDelete, 'pt'],
  ['POST', /^\/api\/coach\/groups\/([\w-]+)\/members$/, groupMembers, 'pt'],
  ['GET', /^\/api\/admin\/users$/, adminUsers, 'admin'],
  ['POST', /^\/api\/admin\/users\/([\w-]+)\/role$/, adminRole, 'admin'],
  ['POST', /^\/api\/admin\/users\/([\w-]+)\/reset$/, adminReset, 'admin'],
  ['GET', /^\/api\/admin\/resets$/, adminResets, 'admin'],
  ['POST', /^\/api\/admin\/resets\/([\w-]+)\/dismiss$/, adminDismiss, 'admin']
];

async function route(req, env, url) {
  for (const [method, re, handler, level] of ROUTES) {
    const m = url.pathname.match(re);
    if (!m || req.method !== method) continue;
    const c = { req, env, db: env.DB, url, params: m.slice(1), user: null };
    if (level) {
      c.user = await authenticate(req, env.DB);
      if (!c.user) fail(401, 'Please sign in again.');
      if (level !== 'any' && c.user.must_change) fail(403, 'Please choose a new password first.');
      if (level === 'pt' && !['pt', 'admin'].includes(c.user.role)) fail(403, 'Coach access only.');
      if (level === 'admin' && c.user.role !== 'admin') fail(403, 'Admin access only.');
    }
    if (method !== 'GET') {
      try { c.body = await req.json(); } catch (e) { c.body = {}; }
      if (!c.body || typeof c.body !== 'object') c.body = {};
    }
    return handler(c);
  }
  fail(404, 'Not found.');
}

/* ================= accounts ================= */
async function signup({ db, env, body, req }) {
  const username = cleanUsername(body.username);
  checkUsername(username, env);
  checkPassword(body.password);
  if (await db.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first()) fail(409, 'That username is taken.');
  const id = newId();
  await db.prepare('INSERT INTO users (id, username, display, pw, role, created_at, last_seen) VALUES (?,?,?,?,?,?,?)')
    .bind(id, username, String(body.username).trim(), await hashPassword(body.password), 'user', now(), now()).run();
  const token = await createSession(db, id, req.headers.get('User-Agent'));
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ token, user: publicUser(u) });
}

async function login({ db, body, req }) {
  const username = cleanUsername(body.username);
  const u = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!u) fail(401, 'Wrong username or password.');
  if (u.locked_until > now()) fail(429, 'Too many attempts. Try again in a few minutes.');
  if (!(await verifyPassword(String(body.password || ''), u.pw))) {
    const failed = u.failed + 1;
    const lock = failed >= 8 ? now() + 15 * 60000 : 0;
    await db.prepare('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?').bind(lock ? 0 : failed, lock, u.id).run();
    fail(401, 'Wrong username or password.');
  }
  await db.prepare('UPDATE users SET failed = 0, locked_until = 0, last_seen = ? WHERE id = ?').bind(now(), u.id).run();
  const token = await createSession(db, u.id, req.headers.get('User-Agent'));
  return json({ token, user: publicUser(u) });
}

/* The super admin account (ADMIN_USERNAME) can only be created — or have its password
   recovered — with the SETUP_CODE secret set in the Cloudflare dashboard. */
async function setupAdmin({ db, env, body, req }) {
  const admin = cleanUsername(env.ADMIN_USERNAME);
  if (!admin || !env.SETUP_CODE) fail(400, 'Admin setup is not configured on the server.');
  if (cleanUsername(body.username) !== admin || !(await sameSecret(body.code, env.SETUP_CODE))) {
    fail(403, 'Username or setup code is wrong.');
  }
  checkPassword(body.password);
  const pw = await hashPassword(body.password);
  let u = await db.prepare('SELECT * FROM users WHERE username = ?').bind(admin).first();
  if (u) {
    await db.batch([
      db.prepare("UPDATE users SET pw = ?, role = 'admin', must_change = 0, failed = 0, locked_until = 0 WHERE id = ?").bind(pw, u.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id)
    ]);
  } else {
    await db.prepare('INSERT INTO users (id, username, display, pw, role, created_at, last_seen) VALUES (?,?,?,?,?,?,?)')
      .bind(newId(), admin, admin, pw, 'admin', now(), now()).run();
  }
  u = await db.prepare('SELECT * FROM users WHERE username = ?').bind(admin).first();
  const token = await createSession(db, u.id, req.headers.get('User-Agent'));
  return json({ token, user: publicUser(u) });
}

async function forgot({ db, body }) {
  const username = cleanUsername(body.username);
  const u = username && await db.prepare('SELECT id, display FROM users WHERE username = ?').bind(username).first();
  if (u) {
    const open = await db.prepare("SELECT 1 FROM reset_requests WHERE user_id = ? AND status = 'open' AND created_at > ?")
      .bind(u.id, now() - 3600000).first();
    if (!open) {
      const msg = String(body.message || '').slice(0, 300);
      const admins = (await db.prepare("SELECT id FROM users WHERE role = 'admin'").all()).results;
      await db.batch([
        db.prepare('INSERT INTO reset_requests (id, user_id, username, message, created_at) VALUES (?,?,?,?,?)')
          .bind(newId(), u.id, u.display, msg, now()),
        ...admins.map((a) => notifyStmt(db, a.id, 'reset', `${u.display} asked for a password reset${msg ? `: “${msg}”` : ''}`, {}))
      ]);
    }
  }
  // Same answer whether or not the username exists.
  return json({ ok: true });
}

async function logout({ db, req }) {
  const h = req.headers.get('Authorization') || '';
  if (h.startsWith('Bearer ')) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(h.slice(7).trim())).run();
  return json({ ok: true });
}

async function changePassword({ db, user, body }) {
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  if (!(await verifyPassword(String(body.current || ''), u.pw))) fail(403, 'Your current password is wrong.');
  checkPassword(body.next);
  await db.batch([
    db.prepare('UPDATE users SET pw = ?, must_change = 0 WHERE id = ?').bind(await hashPassword(body.next), user.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, user.token_hash)
  ]);
  return json({ ok: true, user: publicUser({ ...u, must_change: 0 }) });
}

async function me({ db, user }) {
  const unread = await db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at = 0').bind(user.id).first();
  const coaches = (await db.prepare(
    `SELECT l.coach_id AS id, u.display AS username, l.status, l.created_at FROM links l JOIN users u ON u.id = l.coach_id
     WHERE l.client_id = ? ORDER BY l.created_at DESC`).bind(user.id).all()).results;
  let resetsOpen = 0;
  if (user.role === 'admin') resetsOpen = (await db.prepare("SELECT COUNT(*) AS n FROM reset_requests WHERE status = 'open'").first()).n;
  return json({ user: publicUser(user), unread: unread.n, coaches, resetsOpen });
}

/* ================= sync ================= */
const UPSERT = `INSERT INTO records (user_id, kind, id, data, updated_at, deleted, rev)
  VALUES (?1, ?2, ?3, ?4, ?5, 0, (SELECT v FROM meta WHERE k = 'rev'))
  ON CONFLICT (user_id, kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = 0, rev = excluded.rev
  WHERE excluded.updated_at > records.updated_at`;
const TOMBSTONE = `INSERT INTO records (user_id, kind, id, data, updated_at, deleted, rev)
  VALUES (?1, ?2, ?3, 'null', ?4, 1, (SELECT v FROM meta WHERE k = 'rev'))
  ON CONFLICT (user_id, kind, id) DO UPDATE SET data = 'null', updated_at = excluded.updated_at, deleted = 1, rev = excluded.rev
  WHERE excluded.updated_at >= records.updated_at AND records.deleted = 0`;
const clampTime = (t) => { t = Number(t); return Number.isFinite(t) && t > 0 && t < now() + 86400000 ? Math.round(t) : now(); };

async function writeRecords(db, userId, body, allowed, transform) {
  const stmts = [];
  const changes = body.changes && typeof body.changes === 'object' ? body.changes : {};
  for (const [kind, list] of Object.entries(changes)) {
    if (!allowed.has(kind) || !Array.isArray(list)) continue;
    for (let r of list.slice(0, 20000)) {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 100) continue;
      const at = clampTime(r.updatedAt);
      r = { ...r, updatedAt: at };
      if (transform) r = transform(kind, r);
      const data = JSON.stringify(r);
      if (data.length > 100000) continue;
      stmts.push(db.prepare(UPSERT).bind(userId, kind, r.id, data, at));
    }
  }
  for (const t of Array.isArray(body.tombstones) ? body.tombstones.slice(0, 20000) : []) {
    if (!t || !allowed.has(t.kind) || typeof t.id !== 'string' || t.id.length > 100) continue;
    stmts.push(db.prepare(TOMBSTONE).bind(userId, t.kind, t.id, clampTime(t.at)));
  }
  if (allowed.has('settings') && body.settings && typeof body.settings === 'object') {
    const at = clampTime(body.settingsUpdatedAt);
    stmts.push(db.prepare(UPSERT).bind(userId, 'settings', 'main', JSON.stringify({ id: 'main', settings: body.settings, updatedAt: at }), at));
  }
  for (let i = 0; i < stmts.length; i += BATCH) {
    await db.batch([db.prepare("UPDATE meta SET v = v + 1 WHERE k = 'rev'"), ...stmts.slice(i, i + BATCH)]);
  }
  return stmts.length;
}

function shape(rows) {
  const out = { changes: {}, tombstones: [], settings: null, settingsUpdatedAt: 0 };
  for (const r of rows) {
    if (r.deleted) { out.tombstones.push({ kind: r.kind, id: r.id, at: r.updated_at }); continue; }
    let d; try { d = JSON.parse(r.data); } catch (e) { continue; }
    if (r.kind === 'settings') { out.settings = d.settings; out.settingsUpdatedAt = r.updated_at; continue; }
    (out.changes[r.kind] || (out.changes[r.kind] = [])).push(d);
  }
  return out;
}

async function pull(db, userId, since, limit = 3000) {
  let rows = (await db.prepare('SELECT kind, id, data, updated_at, deleted, rev FROM records WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT ?')
    .bind(userId, since, limit).all()).results;
  let more = false;
  if (rows.length === limit) {
    // never split one write batch across two pulls
    const last = rows[rows.length - 1].rev;
    const trimmed = rows.filter((r) => r.rev !== last);
    if (trimmed.length) { rows = trimmed; more = true; }
  }
  const out = shape(rows);
  out.rev = rows.length ? rows[rows.length - 1].rev : since;
  out.more = more;
  return out;
}

async function sync({ db, user, body }) {
  await writeRecords(db, user.id, body, USER_KINDS);
  const out = await pull(db, user.id, Math.max(0, Number(body.since) || 0));
  out.unread = (await db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at = 0').bind(user.id).first()).n;
  out.role = user.role;
  return json(out);
}

/* ================= notifications & coach links (client side) ================= */
async function listNotifications({ db, user }) {
  const rows = (await db.prepare('SELECT id, type, text, data, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60')
    .bind(user.id).all()).results;
  return json({ notifications: rows.map((r) => ({ ...r, data: safeParse(r.data) })) });
}
async function readNotifications({ db, user }) {
  await db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at = 0').bind(now(), user.id).run();
  return json({ ok: true });
}
async function respondLink({ db, user, body }) {
  const link = await db.prepare('SELECT * FROM links WHERE coach_id = ? AND client_id = ?').bind(String(body.coachId), user.id).first();
  if (!link) fail(404, 'That invite no longer exists.');
  if (body.accept) {
    await db.batch([
      db.prepare("UPDATE links SET status = 'active' WHERE coach_id = ? AND client_id = ?").bind(link.coach_id, user.id),
      notifyStmt(db, link.coach_id, 'link', `${user.display} accepted your coaching invite`, { clientId: user.id })
    ]);
  } else {
    await db.prepare('DELETE FROM links WHERE coach_id = ? AND client_id = ?').bind(link.coach_id, user.id).run();
  }
  return json({ ok: true });
}
async function removeLink({ db, user, body }) {
  const coachId = String(body.coachId);
  await db.batch([
    db.prepare('DELETE FROM links WHERE coach_id = ? AND client_id = ?').bind(coachId, user.id),
    db.prepare('DELETE FROM group_members WHERE client_id = ? AND group_id IN (SELECT id FROM coach_groups WHERE coach_id = ?)').bind(user.id, coachId),
    notifyStmt(db, coachId, 'link', `${user.display} stopped sharing their training with you`, {})
  ]);
  return json({ ok: true });
}

/* ================= coach ================= */
async function activeClient(db, coachId, clientId) {
  const ok = await db.prepare("SELECT 1 FROM links WHERE coach_id = ? AND client_id = ? AND status = 'active'").bind(coachId, clientId).first();
  if (!ok) fail(403, 'This person is not one of your clients.');
}

async function coachOverview({ db, user }) {
  const clients = (await db.prepare(
    `SELECT u.id, u.display AS username, u.last_seen, l.status, l.created_at AS linked_at
     FROM links l JOIN users u ON u.id = l.client_id WHERE l.coach_id = ? ORDER BY u.username`).bind(user.id).all()).results;
  const groups = (await db.prepare('SELECT id, name, created_at FROM coach_groups WHERE coach_id = ? ORDER BY created_at').bind(user.id).all()).results;
  const members = (await db.prepare(
    'SELECT m.group_id, m.client_id FROM group_members m JOIN coach_groups g ON g.id = m.group_id WHERE g.coach_id = ?').bind(user.id).all()).results;
  for (const g of groups) g.members = members.filter((m) => m.group_id === g.id).map((m) => m.client_id);
  return json({ clients, groups });
}

async function coachInvite({ db, user, body }) {
  const username = cleanUsername(body.username);
  const c = await db.prepare('SELECT id, display FROM users WHERE username = ?').bind(username).first();
  if (!c) fail(404, 'No account with that username.');
  if (c.id === user.id) fail(400, "You can't coach yourself.");
  const existing = await db.prepare('SELECT status FROM links WHERE coach_id = ? AND client_id = ?').bind(user.id, c.id).first();
  if (existing) fail(409, existing.status === 'active' ? 'Already your client.' : 'Invite already sent.');
  await db.batch([
    db.prepare("INSERT INTO links (coach_id, client_id, status, created_at) VALUES (?,?,'pending',?)").bind(user.id, c.id, now()),
    notifyStmt(db, c.id, 'invite', `${user.display} wants to coach you. Accepting lets them see your training and update your plan.`, { coachId: user.id, coachName: user.display })
  ]);
  return json({ ok: true, client: { id: c.id, username: c.display, status: 'pending' } });
}

async function coachCreateClient({ db, env, user, body }) {
  const username = cleanUsername(body.username);
  checkUsername(username, env);
  checkPassword(body.password);
  if (await db.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first()) fail(409, 'That username is taken.');
  const id = newId();
  await db.batch([
    db.prepare("INSERT INTO users (id, username, display, pw, role, must_change, created_at) VALUES (?,?,?,?,'user',1,?)")
      .bind(id, username, String(body.username).trim(), await hashPassword(body.password), now()),
    db.prepare("INSERT INTO links (coach_id, client_id, status, created_at) VALUES (?,?,'active',?)").bind(user.id, id, now()),
    notifyStmt(db, id, 'welcome', `Welcome! ${user.display} set up this account and is your coach.`, { coachId: user.id })
  ]);
  return json({ ok: true, client: { id, username: String(body.username).trim(), status: 'active' } });
}

async function coachRemoveClient({ db, user, params }) {
  const [clientId] = params;
  await db.batch([
    db.prepare('DELETE FROM links WHERE coach_id = ? AND client_id = ?').bind(user.id, clientId),
    db.prepare('DELETE FROM group_members WHERE client_id = ? AND group_id IN (SELECT id FROM coach_groups WHERE coach_id = ?)').bind(clientId, user.id)
  ]);
  return json({ ok: true });
}

async function coachClientData({ db, user, params }) {
  const [clientId] = params;
  await activeClient(db, user.id, clientId);
  const c = await db.prepare('SELECT id, display, last_seen FROM users WHERE id = ?').bind(clientId).first();
  const rows = (await db.prepare('SELECT kind, id, data, updated_at, deleted, rev FROM records WHERE user_id = ? AND deleted = 0 LIMIT 60000')
    .bind(clientId).all()).results;
  const out = shape(rows);
  out.client = { id: c.id, username: c.display, lastSeen: c.last_seen };
  return json(out);
}

async function coachClientSync({ db, user, params, body }) {
  const [clientId] = params;
  await activeClient(db, user.id, clientId);
  const written = await writeRecords(db, clientId, body, COACH_KINDS, (kind, r) =>
    kind === 'coachNotes' ? { ...r, author: user.display, authorId: user.id } : r);
  if (written) {
    const ch = body.changes || {};
    const names = (list, f) => [...new Set((list || []).map(f).filter(Boolean))].slice(0, 3).join(', ');
    const parts = [];
    if (ch.routines?.length) parts.push(`updated your plan (${names(ch.routines, (r) => r.name)})`);
    if (ch.exercises?.length) parts.push(`updated ${names(ch.exercises, (r) => r.name)}`);
    const notes = (ch.coachNotes || []).filter((n) => n.text);
    if (notes.length) parts.push(`left a note on ${names(notes, (n) => n.targetName)}`);
    if (ch.sets?.length) parts.push(`logged or edited ${ch.sets.length} set${ch.sets.length > 1 ? 's' : ''}`);
    if (ch.sessions?.length && !ch.sets?.length) parts.push('updated a session');
    const removed = (body.tombstones || []).filter((t) => t.kind !== 'sessions').length;
    if (removed) parts.push(`removed ${removed} item${removed > 1 ? 's' : ''}`);
    if (parts.length) {
      const link = ch.routines?.[0] ? { kind: 'routine', id: ch.routines[0].id }
        : ch.exercises?.[0] ? { kind: 'exercise', id: ch.exercises[0].id }
        : notes[0] ? { kind: notes[0].target, id: notes[0].targetId } : {};
      await notifyStmt(db, clientId, 'plan', `${user.display} ${parts.join('; ')}`, link).run();
    }
  }
  return json({ ok: true, written });
}

async function ownGroup(db, coachId, groupId) {
  const g = await db.prepare('SELECT * FROM coach_groups WHERE id = ? AND coach_id = ?').bind(groupId, coachId).first();
  if (!g) fail(404, 'Group not found.');
  return g;
}
async function groupCreate({ db, user, body }) {
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) fail(400, 'Give the group a name.');
  const id = newId();
  await db.prepare('INSERT INTO coach_groups (id, coach_id, name, created_at) VALUES (?,?,?,?)').bind(id, user.id, name, now()).run();
  return json({ ok: true, group: { id, name, members: [] } });
}
async function groupRename({ db, user, params, body }) {
  await ownGroup(db, user.id, params[0]);
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) fail(400, 'Give the group a name.');
  await db.prepare('UPDATE coach_groups SET name = ? WHERE id = ?').bind(name, params[0]).run();
  return json({ ok: true });
}
async function groupDelete({ db, user, params }) {
  await ownGroup(db, user.id, params[0]);
  await db.batch([
    db.prepare('DELETE FROM group_members WHERE group_id = ?').bind(params[0]),
    db.prepare('DELETE FROM coach_groups WHERE id = ?').bind(params[0])
  ]);
  return json({ ok: true });
}
async function groupMembers({ db, user, params, body }) {
  await ownGroup(db, user.id, params[0]);
  const clientId = String(body.clientId || '');
  if (body.add) {
    await activeClient(db, user.id, clientId);
    await db.prepare('INSERT OR IGNORE INTO group_members (group_id, client_id) VALUES (?,?)').bind(params[0], clientId).run();
  } else {
    await db.prepare('DELETE FROM group_members WHERE group_id = ? AND client_id = ?').bind(params[0], clientId).run();
  }
  return json({ ok: true });
}

/* ================= super admin ================= */
async function adminUsers({ db }) {
  const users = (await db.prepare(
    `SELECT id, display AS username, role, must_change, locked_until, created_at, last_seen FROM users ORDER BY username`).all()).results;
  return json({ users });
}
async function adminRole({ db, user, params, body }) {
  const role = body.role === 'pt' ? 'pt' : 'user';
  const t = await db.prepare('SELECT role, display FROM users WHERE id = ?').bind(params[0]).first();
  if (!t) fail(404, 'User not found.');
  if (t.role === 'admin') fail(400, "The super admin's role can't be changed.");
  await db.batch([
    db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, params[0]),
    notifyStmt(db, params[0], 'role', role === 'pt' ? `${user.display} gave you coach access. Open the Coach tab to add clients.` : 'Your coach access was removed.', {})
  ]);
  return json({ ok: true });
}
async function adminReset({ db, params, body }) {
  checkPassword(body.password);
  const t = await db.prepare('SELECT id FROM users WHERE id = ?').bind(params[0]).first();
  if (!t) fail(404, 'User not found.');
  await db.batch([
    db.prepare('UPDATE users SET pw = ?, must_change = 1, failed = 0, locked_until = 0 WHERE id = ?').bind(await hashPassword(body.password), t.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(t.id),
    db.prepare("UPDATE reset_requests SET status = 'done' WHERE user_id = ? AND status = 'open'").bind(t.id)
  ]);
  return json({ ok: true });
}
async function adminResets({ db }) {
  const rows = (await db.prepare("SELECT id, user_id, username, message, created_at FROM reset_requests WHERE status = 'open' ORDER BY created_at DESC").all()).results;
  return json({ requests: rows });
}
async function adminDismiss({ db, params }) {
  await db.prepare("UPDATE reset_requests SET status = 'dismissed' WHERE id = ?").bind(params[0]).run();
  return json({ ok: true });
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
