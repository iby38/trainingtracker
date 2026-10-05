/* Sync between this device and your account on the server.
   - Everything is saved on the device first, so the app works offline.
   - When online, changes are sent up and changes from other devices (or your coach) come down.
   - Merge rule: the newest edit of each item wins; a deletion wins over older edits. */
const SYNC_KINDS = ['exercises', 'sets', 'sessions', 'routines', 'categories']; // coachNotes are coach-only

const Sync = {
  timer: null, poll: null, busy: false, again: false,
  status: 'idle',          // idle | syncing | ok | offline | error
  lastOk: 0, unread: 0, error: '',

  changesSince(since, kinds) {
    const ks = kinds || SYNC_KINDS, changes = {};
    for (const c of ks) changes[c] = S[c].filter(r => (r.updatedAt || 0) > since);
    return {
      changes,
      tombstones: S.tombstones.filter(t => t.at > since && ks.includes(t.kind)),
      settings: S.settingsUpdatedAt > since ? S.settings : null,
      settingsUpdatedAt: S.settingsUpdatedAt
    };
  },

  pendingCount() {
    const c = this.changesSince(S.lastPushAt || 0);
    return Object.values(c.changes).reduce((t, l) => t + l.length, 0) + c.tombstones.length + (c.settings ? 1 : 0);
  },

  /* Merge changes from elsewhere into the current data. */
  merge(remote) {
    const dead = new Map();
    for (const t of [...S.tombstones, ...(remote.tombstones || [])]) {
      const k = t.kind + ':' + t.id; dead.set(k, Math.max(dead.get(k) || 0, t.at));
    }
    const src = remote.changes || {};
    for (const c of COLLS) {
      const byId = new Map(S[c].map(r => [r.id, r]));
      for (const r of (src[c] || [])) {
        const l = byId.get(r.id);
        if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) byId.set(r.id, r);
      }
      S[c] = [...byId.values()].filter(r => { const d = dead.get(c + ':' + r.id); return !d || (r.updatedAt || 0) > d; });
    }
    const seen = new Set();
    S.tombstones = [...S.tombstones, ...(remote.tombstones || [])].filter(t => {
      const k = t.kind + ':' + t.id + ':' + t.at; if (seen.has(k)) return false; seen.add(k); return true;
    });
    if (remote.settings && (remote.settingsUpdatedAt || 0) > (S.settingsUpdatedAt || 0)) {
      S.settings = remote.settings; S.settingsUpdatedAt = remote.settingsUpdatedAt;
    }
    migrate(); takeSnap(); IX = null;
  },

  schedule(ms) {
    if (CTX.client || !Auth.signedIn()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), ms == null ? 2500 : ms);
  },

  async run() {
    if (CTX.client || !Auth.signedIn() || Auth.user().mustChange) return;
    if (this.busy) { this.again = true; return; }
    if (!navigator.onLine) { this.status = 'offline'; updateBadges(); return; }
    this.busy = true; this.status = 'syncing';
    let changed = false;
    try {
      for (let loop = 0; loop < 30; loop++) {
        const t0 = Date.now();
        const body = Object.assign({ since: S.lastRev || 0 }, loop === 0 ? this.changesSince(S.lastPushAt || 0) : { changes: {}, tombstones: [] });
        const res = await API.post('/api/sync', body);
        if (CTX.client || !Auth.signedIn()) return; // switched to coaching or signed out mid-sync
        if (Object.keys(res.changes || {}).length || (res.tombstones || []).length || res.settings) { this.merge(res); changed = true; }
        S.lastRev = res.rev || S.lastRev;
        if (loop === 0) S.lastPushAt = t0 - 1;
        Store.save(S);
        this.unread = res.unread || 0;
        if (res.role && res.role !== Auth.user().role) { Auth.patchUser({ role: res.role }); buildTabs(); changed = true; }
        if (!res.more) break;
      }
      this.status = 'ok'; this.lastOk = Date.now(); this.error = '';
    } catch (e) {
      this.status = e.status === 0 ? 'offline' : 'error'; this.error = e.message;
    } finally {
      this.busy = false;
      updateBadges();
      if (changed && !document.querySelector('#ov') && !document.querySelector('.modal') && !CTX.client && Auth.signedIn()) render();
      if (this.again) { this.again = false; this.schedule(500); }
    }
  },

  start() {
    clearInterval(this.poll);
    const every = ((window.TRAININGTRACKER_CONFIG || {}).syncEverySeconds || 60) * 1000;
    this.poll = setInterval(() => { if (!document.hidden) this.run(); }, every);
    this.run();
  },
  stop() { clearInterval(this.poll); clearTimeout(this.timer); }
};
window.addEventListener('online', () => Sync.run());
document.addEventListener('visibilitychange', () => { if (!document.hidden) Sync.run(); });
window.Sync = Sync;
