/* Storage adapter. Everything that touches the device's storage goes through here,
   so it can be swapped (e.g. to IndexedDB) without touching the rest of the app. */
const Store = {
  KEY: 'liftlog.data.v1',
  ok: true,
  load() {
    try { const raw = localStorage.getItem(this.KEY); return raw ? JSON.parse(raw) : null; }
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
