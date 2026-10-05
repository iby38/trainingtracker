/* Talks to the Cloudflare Worker. Throws an Error with .status (0 = no connection). */
const API = {
  async call(method, path, body) {
    const a = Store.getAuth();
    let r;
    try {
      r = await fetch(((window.TRAININGTRACKER_CONFIG || {}).apiBase || '') + path, {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, a && a.token ? { Authorization: 'Bearer ' + a.token } : {}),
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store'
      });
    } catch (e) {
      const err = new Error("You're offline. Check your connection and try again."); err.status = 0; throw err;
    }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (r.status === 401 && a && a.token && !path.startsWith('/api/auth/')) Auth.expired();
    if (!r.ok) { const err = new Error((j && j.error) || `Server error (${r.status})`); err.status = r.status; throw err; }
    return j;
  },
  get(p) { return this.call('GET', p); },
  post(p, b) { return this.call('POST', p, b || {}); },
  del(p) { return this.call('DELETE', p); }
};
