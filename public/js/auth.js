/* Accounts on the app side: who is signed in, the sign-in screens, and start-up. */
const Auth = {
  state: Store.getAuth(),           // { token, user: {id, username, role, mustChange} }
  me: { coaches: [], resetsOpen: 0 },
  signedIn() { return !!(this.state && this.state.token); },
  user() { return (this.state && this.state.user) || {}; },
  isCoach() { return ['pt', 'admin'].includes(this.user().role); },
  isAdmin() { return this.user().role === 'admin'; },
  patchUser(p) { this.state.user = Object.assign({}, this.state.user, p); Store.setAuth(this.state); },

  signIn(res) { this.state = { token: res.token, user: res.user }; Store.setAuth(this.state); afterSignIn(true); },

  /* Session no longer valid (e.g. password reset by admin). Keep the data on the device. */
  expired() {
    if (!this.signedIn()) return;
    const u = this.user();
    this.state = { token: null, user: u }; Store.setAuth(this.state);
    Sync.stop(); closeSheet(); CTX.client = null;
    showAuth('login', { username: u.username, msg: 'Please sign in again.' });
  },

  async refreshMe() {
    try {
      const r = await API.get('/api/me');
      const roleChanged = r.user.role !== this.user().role;
      this.patchUser(r.user);
      this.me = { coaches: r.coaches || [], resetsOpen: r.resetsOpen || 0 };
      Sync.unread = r.unread || 0;
      if (r.user.mustChange) { showAuth('change', { forced: true }); return; }
      if (roleChanged) buildTabs();
      updateBadges();
      const v = cur();
      if (!CTX.client && !$('#ov') && ['home', 'settings'].includes(v.v)) render();
    } catch (e) { /* offline: fine */ }
  },

  async logout() {
    await Sync.run();
    const pending = Sync.pendingCount();
    if (pending && !await confirmBox(`${pending} change${pending > 1 ? "s haven't" : " hasn't"} been uploaded yet (you're offline). Log out anyway and lose ${pending > 1 ? 'them' : 'it'}?`, 'Log out')) return;
    try { await API.post('/api/auth/logout'); } catch (e) {}
    const uid = this.user().id;
    Sync.stop(); Store.clearUser(uid); Store.setAuth(null); this.state = null; CTX.client = null;
    S = defaults(); IX = null;
    showAuth('login', { msg: 'Signed out. Your training is saved to your account.' });
  }
};

/* ---------------- start-up ---------------- */
function boot() {
  Store.askPersistent();
  if (location.hash === '#setup') { showAuth('setup'); return; }
  if (Auth.signedIn()) afterSignIn(false);
  else showAuth('login', { username: Auth.user().username || '' });
}

async function afterSignIn(fresh) {
  document.body.classList.remove('authmode');
  if (location.hash === '#setup') history.replaceState(null, '', location.pathname);
  loadUser(Auth.user().id);
  resetNav(); tab = 'home'; buildTabs();
  if (Auth.user().mustChange) { showAuth('change', { forced: true }); return; }
  render('push');
  Sync.start();
  Auth.refreshMe();
  if (fresh) setTimeout(offerLegacyImport, 400);
}

/* Data logged on this device before accounts existed → offer to add it to the account. */
async function offerLegacyImport() {
  const L = Store.loadLegacy(); if (!L) return;
  const n = L.data.sets.length;
  if (!await confirmBox(`This device has ${n} set${n === 1 ? '' : 's'} saved from before accounts. Add ${n === 1 ? 'it' : 'them'} to ${Auth.user().username}'s account?`, 'Add', false)) return;
  const added = mergeBackup(L.data); Sync.schedule(100);
  Store.retireLegacy(); render(); toast(`Added ${added} items to your account`);
}

/* Add a backup's contents to the current account (never deletes anything). */
function mergeBackup(d) {
  let n = 0;
  for (const c of SYNC_KINDS) {
    if (!Array.isArray(d[c])) continue;
    const byId = new Map(S[c].map(r => [r.id, r]));
    for (const r of d[c]) if (r && r.id) { byId.set(r.id, Object.assign({}, r)); n++; }
    S[c] = [...byId.values()];
  }
  migrate(); IX = null; save();
  return n;
}

/* ---------------- sign-in screens ---------------- */
let AV = { mode: 'login', msg: '', username: '' };
function showAuth(mode, o = {}) {
  AV = Object.assign({ mode, msg: '', username: '', forced: false }, o);
  document.body.classList.add('authmode');
  closeSheet();
  const main = $('#main');
  main.dataset.v = 'auth';
  main.innerHTML = authView();
  main.scrollTop = 0;
  const first = main.querySelector('input:not([value]), input[value=""]') || main.querySelector('input');
  if (first && window.innerWidth > 700) first.focus();
}
const fieldU = (val) => `<label class="af"><span>Username</span><input name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(val || '')}" required></label>`;
const fieldP = (name, label, ac) => `<label class="af"><span>${label}</span><input name="${name}" type="password" autocomplete="${ac}" required></label>`;

function authView() {
  const m = AV.mode, msg = AV.msg ? `<div class="amsg ${AV.err ? 'err' : ''}">${esc(AV.msg)}</div>` : '';
  const head = (t, s) => `<div class="ahead"><div class="alogo">${I.dumbbell}</div><h1>${t}</h1>${s ? `<p class="dim">${s}</p>` : ''}</div>`;
  if (m === 'login') return `${head('Training Tracker', 'Sign in to your account')}${msg}
    <form class="aform" data-form="authLogin">${fieldU(AV.username)}${fieldP('password', 'Password', 'current-password')}
    <button class="abtn" type="submit">Sign in</button></form>
    <div class="alinks"><button data-a="authGo" data-m="signup">Create an account</button><button data-a="authGo" data-m="forgot">Forgot password?</button><button class="owner" data-a="authGo" data-m="setup">App owner setup</button></div>`;
  if (m === 'signup') return `${head('Create account', 'Pick a username and password. No email or phone needed.')}${msg}
    <form class="aform" data-form="authSignup">${fieldU(AV.username)}
    <div class="ahint">3–24 characters: letters, numbers, dots and underscores. This is how your coach finds you.</div>
    ${fieldP('password', 'Password', 'new-password')}${fieldP('confirm', 'Confirm password', 'new-password')}
    <div class="ahint">At least 8 characters. Without an email there's no automatic reset, so choose one you'll remember.</div>
    <button class="abtn" type="submit">Create account</button></form>
    <div class="alinks"><button data-a="authGo" data-m="login">I already have an account</button></div>`;
  if (m === 'forgot') return `${head('Forgot password', 'Your request goes to the app admin, who will set a temporary password and pass it to you.')}${msg}
    <form class="aform" data-form="authForgot">${fieldU(AV.username)}
    <label class="af"><span>Message for the admin (optional)</span><input name="message" maxlength="300" placeholder="e.g. how to reach you"></label>
    <button class="abtn" type="submit">Send request</button></form>
    <div class="alinks"><button data-a="authGo" data-m="login">Back to sign in</button></div>`;
  if (m === 'setup') return `${head('Admin setup', 'For the app owner only. Needs the setup code from the Cloudflare dashboard. Also used to recover the admin password.')}${msg}
    <form class="aform" data-form="authSetup">${fieldU('')}${fieldP('password', 'New password', 'new-password')}${fieldP('confirm', 'Confirm password', 'new-password')}
    <label class="af"><span>Setup code</span><input name="code" type="password" autocomplete="off" required></label>
    <button class="abtn" type="submit">Set up admin account</button></form>
    <div class="alinks"><button data-a="authGo" data-m="login">Back to sign in</button></div>`;
  if (m === 'change') return `${head('Choose a new password', AV.forced ? 'You signed in with a temporary password. Pick your own to continue.' : '')}${msg}
    <form class="aform" data-form="authChange">${fieldP('current', AV.forced ? 'Temporary password' : 'Current password', 'current-password')}
    ${fieldP('next', 'New password', 'new-password')}${fieldP('confirm', 'Confirm new password', 'new-password')}
    <button class="abtn" type="submit">Save password</button></form>
    <div class="alinks"><button data-a="authSignOutHard">Sign out</button></div>`;
  return '';
}
function authErr(e) { if ($('#ov .aform')) { toast(e.message); return; } AV.msg = e.message; AV.err = true; const f = $('#main .aform'); const vals = f ? Object.fromEntries(new FormData(f)) : {}; $('#main').innerHTML = authView(); if (vals.username && $('#main [name=username]')) $('#main [name=username]').value = vals.username; }
function formVals(form) { return Object.fromEntries(new FormData(form)); }
async function busy(form, fn) {
  const b = form.querySelector('button[type=submit]'); const t = b.textContent;
  b.disabled = true; b.textContent = 'Please wait…';
  try { await fn(); } catch (e) { authErr(e); } finally { if (b.isConnected) { b.disabled = false; b.textContent = t; } }
}

const AUTH_FORMS = {
  authLogin: f => busy(f, async () => { const v = formVals(f); Auth.signIn(await API.post('/api/auth/login', { username: v.username, password: v.password })); }),
  authSignup: f => busy(f, async () => {
    const v = formVals(f);
    if (v.password !== v.confirm) throw new Error("The passwords don't match.");
    Auth.signIn(await API.post('/api/auth/signup', { username: v.username, password: v.password }));
  }),
  authForgot: f => busy(f, async () => {
    const v = formVals(f);
    await API.post('/api/auth/forgot', { username: v.username, message: v.message });
    showAuth('login', { username: v.username, msg: "Request sent. The admin will set a temporary password and let you know it. You'll pick a new one when you sign in." });
  }),
  authSetup: f => busy(f, async () => {
    const v = formVals(f);
    if (v.password !== v.confirm) throw new Error("The passwords don't match.");
    Auth.signIn(await API.post('/api/auth/setup', { username: v.username, password: v.password, code: v.code }));
  }),
  authChange: f => busy(f, async () => {
    const v = formVals(f);
    if (v.next !== v.confirm) throw new Error("The new passwords don't match.");
    const r = await API.post('/api/auth/password', { current: v.current, next: v.next });
    Auth.patchUser(r.user);
    if (AV.forced) afterSignIn(false); else { closeSheet(); toast('Password changed'); }
  })
};
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault();
  const fn = AUTH_FORMS[f.dataset.form] || (window.FORMS && FORMS[f.dataset.form]);
  if (fn) fn(f);
});
