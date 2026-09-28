/* Sync client — ready for the future backend, switched off until then.

   Contract the backend will implement (POST /api/sync):
     request:  { deviceId, since, changes: { exercises:[...], sets:[...], ... },
                 tombstones:[{kind,id,at}], settings, settingsUpdatedAt }
     response: { serverTime, changes: {...same shape...}, tombstones:[...],
                 settings, settingsUpdatedAt }
   Merge rule: newest updatedAt wins per record; a deletion wins over any older edit. */
const Sync = {
  timer: null,
  busy: false,
  status: 'off',
  enabled() { const c = window.TRAININGTRACKER_CONFIG || {}; return !!c.syncEnabled; },
  url(p) { return ((window.TRAININGTRACKER_CONFIG || {}).apiBase || '') + p; },

  /* Everything changed on this device since a point in time. */
  changesSince(since) {
    const changes = {};
    for (const c of COLLS) changes[c] = S[c].filter(r => (r.updatedAt || 0) > since);
    return {
      deviceId: S.deviceId, since,
      changes,
      tombstones: S.tombstones.filter(t => t.at > since),
      settings: S.settingsUpdatedAt > since ? S.settings : null,
      settingsUpdatedAt: S.settingsUpdatedAt
    };
  },

  /* Merge another copy of the data into this device (from the server, or a backup). */
  merge(remote) {
    const dead = new Map();
    for (const t of [...S.tombstones, ...(remote.tombstones || [])]) {
      const k = t.kind + ':' + t.id; dead.set(k, Math.max(dead.get(k) || 0, t.at));
    }
    const src = remote.changes || remote;
    for (const c of COLLS) {
      const byId = new Map(S[c].map(r => [r.id, r]));
      for (const r of (src[c] || [])) {
        const l = byId.get(r.id);
        if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) byId.set(r.id, r);
      }
      S[c] = [...byId.values()].filter(r => { const d = dead.get(c + ':' + r.id); return !d || (r.updatedAt || 0) > d; });
    }
    const seen = new Set();
    S.tombstones = [...S.tombstones, ...(remote.tombstones || [])].filter(t => { const k = t.kind + ':' + t.id + ':' + t.at; if (seen.has(k)) return false; seen.add(k); return true; });
    if (remote.settings && (remote.settingsUpdatedAt || 0) > (S.settingsUpdatedAt || 0)) {
      S.settings = remote.settings; S.settingsUpdatedAt = remote.settingsUpdatedAt;
    }
    migrate(); takeSnap(); IX = null; Store.save(S);
  },

  schedule() {
    if (!this.enabled()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), 4000);
  },

  async run() {
    if (!this.enabled() || this.busy || !navigator.onLine) return;
    this.busy = true; this.status = 'syncing';
    try {
      const body = this.changesSince(S.lastSyncAt || 0);
      const r = await fetch(this.url('/api/sync'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const remote = await r.json();
      this.merge(remote);
      S.lastSyncAt = remote.serverTime || Date.now(); Store.save(S);
      this.status = 'ok';
      if (typeof render === 'function' && !document.querySelector('#ov')) render();
    } catch (e) { this.status = 'error'; }
    finally { this.busy = false; }
  },

  init() {
    if (!this.enabled()) return;
    window.addEventListener('online', () => this.run());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.run(); });
    this.run();
  },

  /* Is the Cloudflare Worker reachable? Used on the Settings page. */
  async health() {
    try {
      const r = await fetch(this.url('/api/health'), { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }
};
window.Sync = Sync;
