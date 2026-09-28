/* Storage adapter. Everything that touches the device's storage goes through here,
   so it can be swapped (e.g. to IndexedDB) without touching the rest of the app. */
const Store = {
  KEY: 'trainingtracker.data.v1',
  OLD_KEY: 'liftlog.data.v1', // name used by earlier test versions; data is carried over automatically
  ok: true,
  load() {
    try {
      let raw = localStorage.getItem(this.KEY);
      if (!raw) { // first run after the rename: move any data saved under the old name
        const old = localStorage.getItem(this.OLD_KEY);
        if (old) {
          raw = old; localStorage.setItem(this.KEY, old);
          for (const x of ['before-update']) { const v = localStorage.getItem(this.OLD_KEY + '.' + x); if (v) localStorage.setItem(this.KEY + '.' + x, v); }
        }
      }
      return raw ? JSON.parse(raw) : null;
    }
    catch (e) { this.ok = false; return null; }
  },
  save(data) {
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); return true; }
    catch (e) { this.ok = false; return false; }
  },
  getExtra(name) { try { const r = localStorage.getItem(this.KEY + '.' + name); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
  setExtra(name, val) { try { localStorage.setItem(this.KEY + '.' + name, JSON.stringify(val)); } catch (e) {} },
  askPersistent() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {} }
};
