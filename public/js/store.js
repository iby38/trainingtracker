/* Device storage. Each account's data is kept separately on the device, so two people
   can share a phone/tablet and logging out never mixes their training. */
const Store = {
  PREFIX: 'trainingtracker',
  LEGACY_KEYS: ['trainingtracker.data.v1', 'liftlog.data.v1'], // data saved before accounts existed
  uid: null,
  ok: true,
  key() { return `${this.PREFIX}.u.${this.uid}`; },
  load() {
    if (!this.uid) return null;
    try { const raw = localStorage.getItem(this.key()); return raw ? JSON.parse(raw) : null; }
    catch (e) { this.ok = false; return null; }
  },
  save(data) {
    if (!this.uid) return false;
    try { localStorage.setItem(this.key(), JSON.stringify(data)); return true; }
    catch (e) { this.ok = false; return false; }
  },
  clearUser(uid) { try { localStorage.removeItem(`${this.PREFIX}.u.${uid}`); } catch (e) {} },
  getAuth() { try { return JSON.parse(localStorage.getItem(this.PREFIX + '.auth') || 'null'); } catch (e) { return null; } },
  setAuth(a) { try { a ? localStorage.setItem(this.PREFIX + '.auth', JSON.stringify(a)) : localStorage.removeItem(this.PREFIX + '.auth'); } catch (e) {} },
  loadLegacy() {
    for (const k of this.LEGACY_KEYS) {
      try { const raw = localStorage.getItem(k); if (raw) { const d = JSON.parse(raw); if (d && (d.sets || []).length) return { key: k, data: d }; } } catch (e) {}
    }
    return null;
  },
  retireLegacy() { for (const k of this.LEGACY_KEYS) { try { const v = localStorage.getItem(k); if (v) { localStorage.setItem(k + '.imported', v); localStorage.removeItem(k); } } catch (e) {} } },
  askPersistent() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {} }
};
