/* Coach (PT) portal + super admin tools.
   A coach sees groups of clients, each client's insights, and can open a client's
   training to edit it directly. Edits go straight to the client's account and the
   client gets a notification. */
const Coach = {
  ov: null, ovAt: 0, loadingOv: false, err: '',
  data: {},            // clientId -> { d, ins, sum, at, err }
  stash: null, pt: null,

  activeClients() { return (this.ov ? this.ov.clients : []).filter(c => c.status === 'active'); },
  client(id) { return (this.ov ? this.ov.clients : []).find(c => c.id === id); },

  async loadOverview(force) {
    if (this.loadingOv || (!force && this.ov && Date.now() - this.ovAt < 60000)) return;
    this.loadingOv = true;
    try { this.ov = await API.get('/api/coach/overview'); this.ovAt = Date.now(); this.err = ''; }
    catch (e) { this.err = e.message; }
    finally { this.loadingOv = false; refreshCoachView(); }
    this.loadClients();
  },
  async loadClients(force) {
    for (const c of this.activeClients()) {
      const x = this.data[c.id];
      if (!force && x && (x.loading || Date.now() - x.at < 120000)) continue;
      await this.loadClient(c.id);
    }
  },
  async loadClient(id) {
    const x = this.data[id] = Object.assign(this.data[id] || {}, { loading: true });
    try {
      const res = await API.get(`/api/coach/clients/${id}/data`);
      const d = this.dataset(res);
      Object.assign(x, { d, at: Date.now(), err: '' }, this.analyse(d));
    } catch (e) { x.err = e.message; x.at = Date.now(); }
    finally { x.loading = false; refreshCoachView(); }
  },
  dataset(res) {
    const d = defaults(); d.deviceId = 'coach';
    for (const c of COLLS) d[c] = (res.changes && res.changes[c]) || [];
    if (res.settings) d.settings = res.settings;
    withData(d, migrate);
    return d;
  },
  analyse(d) { return withData(d, () => ({ ins: computeInsights(), sum: trainingSummary() })); },
  status(id) {
    const x = this.data[id];
    if (!x || !x.ins) return 'grey';
    return x.ins.some(i => i.level === 'warn') ? 'red' : x.ins.some(i => i.level === 'info') ? 'amber' : 'green';
  },

  /* ---------- editing a client's training ---------- */
  async enter(id, then) {
    const c = this.client(id); if (!c) return;
    toast(`Opening ${c.username}'s training…`);
    await this.loadClient(id);
    const x = this.data[id];
    if (!x || !x.d) { toast(x && x.err ? x.err : "Couldn't load that client"); return; }
    Sync.stop();
    this.stash = { S, SNAP, stacks, tab };
    S = JSON.parse(JSON.stringify(x.d)); IX = null; takeSnap();
    CTX.client = { id, username: c.username, lastPush: Date.now() - 1, status: 'ready', pushing: false };
    resetNav(); tab = 'home'; buildTabs(); render('push');
    if (then) then();
  },
  queuePush() { clearTimeout(this.pt); this.setBar('Saving…'); this.pt = setTimeout(() => this.push(), 1200); },
  async push() {
    const c = CTX.client; if (!c) return true;
    if (c.pushing) { c.again = true; return false; }
    const t0 = Date.now();
    const body = Sync.changesSince(c.lastPush, [...SYNC_KINDS, 'coachNotes']);
    body.settings = null;
    const n = Object.values(body.changes).reduce((t, l) => t + l.length, 0) + body.tombstones.length;
    if (!n) { this.setBar('All changes saved'); return true; }
    c.pushing = true;
    let ok = false;
    try {
      await API.post(`/api/coach/clients/${c.id}/sync`, body);
      c.lastPush = t0 - 1; ok = true;
      this.setBar(`Saved, ${c.username} has been notified`);
    } catch (e) { this.setBar("Couldn't save: " + e.message, true); }
    finally { c.pushing = false; if (c.again) { c.again = false; setTimeout(() => this.push(), 300); } }
    return ok;
  },
  setBar(t, err) { const el = $('#cbstat'); if (el) { el.textContent = t; el.classList.toggle('err', !!err); } },
  async exit() {
    if (!CTX.client) return;
    clearTimeout(this.pt);
    const ok = await this.push();
    if (!ok && !await confirmBox("Some changes couldn't be saved to the client (check your connection). Leave anyway?", 'Leave')) return;
    const id = CTX.client.id, x = this.data[id];
    if (x) { x.d = JSON.parse(JSON.stringify(S)); Object.assign(x, withData(x.d, () => ({ ins: computeInsights(), sum: trainingSummary() }))); }
    const st = this.stash;
    S = st.S; SNAP = st.SNAP; stacks = st.stacks; tab = 'coach'; IX = null; CTX.client = null; this.stash = null;
    buildTabs(); render('pop'); Sync.start();
  }
};
window.Coach = Coach;

function refreshCoachView() {
  const v = cur();
  if (!CTX.client && tab === 'coach' && !$('#ov') && !$('.modal') && /^coach|^admin/.test(v.v)) render();
}

/* ---------------- coach views ---------------- */
function clientCard(c) {
  const x = Coach.data[c.id], st = Coach.status(c.id);
  let line = 'Loading…', top = '';
  if (x && x.err && !x.d) line = esc(x.err);
  else if (x && x.sum) {
    const s = x.sum;
    line = `${s.last ? 'Last session ' + ago(s.last).toLowerCase() : 'No sessions yet'} · ${s.thisWeek}${s.plannedWeek ? '/' + s.plannedWeek : ''} this week`;
    const w = x.ins.find(i => i.level === 'warn') || x.ins.find(i => i.level === 'info') || x.ins[0];
    if (w) top = `<div class="cc-ins ${w.level}">${esc(w.title)}</div>`;
  }
  return `<div class="card pad tap cc" data-a="push" data-v="coachClient" data-id="${c.id}">
    <div class="cc-h"><i class="sdot ${st}"></i><span class="cc-n">${esc(c.username)}</span>${I.chev}</div>
    <div class="sub">${line}</div>${top}</div>`;
}
function vCoach() {
  if (CTX.client) return topBar('Coach') + empty('Coaching mode', 'Tap Done in the green bar to return to your clients.');
  let h = topBar('Coach', { right: `<button class="icon-btn" data-a="coachRefresh" aria-label="Refresh">${I.repeat}</button>` });
  if (Auth.isAdmin()) {
    const n = Auth.me.resetsOpen || 0;
    h += `<div class="sect">Admin</div><div class="card">
      <div class="row tap" data-a="push" data-v="adminResets"><span class="grow">Password reset requests</span>${n ? `<span class="nbadge">${n}</span>` : '<span class="dim">None</span>'}${I.chev}</div>
      <div class="row tap" data-a="push" data-v="adminUsers"><span class="grow">All users and roles</span>${I.chev}</div></div>`;
  }
  if (!Coach.ov) return h + (Coach.err ? empty("Couldn't load your clients", esc(Coach.err) + '<br><button class="txt-btn mt" data-a="coachRefresh">Try again</button>') : empty('Loading…', ''));
  const active = Coach.activeClients(), pending = Coach.ov.clients.filter(c => c.status === 'pending');
  const attention = active.filter(c => Coach.status(c.id) === 'red');
  if (attention.length) h += `<div class="sect">Needs attention</div>` + attention.map(clientCard).join('');
  h += `<div class="sect">Groups</div><div class="card">${Coach.ov.groups.map(g => {
    const red = g.members.filter(id => Coach.status(id) === 'red').length;
    return `<div class="row tap" data-a="push" data-v="coachGroup" data-id="${g.id}"><span class="ic green">${I.people}</span><div class="grow"><div>${esc(g.name)}</div><div class="sub">${g.members.length} client${g.members.length === 1 ? '' : 's'}${red ? ` · <span class="red">${red} need attention</span>` : ''}</div></div>${I.chev}</div>`;
  }).join('')}<div class="row tap green" data-a="coachNewGroup"><span class="ic">${I.plus}</span><span>New group</span></div></div>`;
  h += `<div class="sect">Clients</div><div class="card">
    <div class="row tap" data-a="push" data-v="coachClients"><span class="grow">All clients</span><span class="dim">${active.length}</span>${I.chev}</div>
    ${pending.map(c => `<div class="row"><span class="grow">${esc(c.username)}<div class="sub">Invite sent, waiting for them to accept</div></span><button class="mini red" data-a="coachRemove" data-id="${c.id}" aria-label="Cancel invite">${I.x}</button></div>`).join('')}
    <div class="row tap green" data-a="coachAddClient"><span class="ic">${I.plus}</span><span>Add client</span></div></div>
    <div class="foot">Clients either accept your invite, or use an account you create for them. Status: <i class="sdot red"></i> needs attention <i class="sdot amber"></i> worth a look <i class="sdot green"></i> on track.</div>`;
  return h;
}
function vCoachClients() {
  if (!Coach.ov) return topBar('All clients') + empty('Loading…', '');
  const list = Coach.activeClients();
  const rank = { red: 0, amber: 1, green: 2, grey: 3 };
  list.sort((a, b) => rank[Coach.status(a.id)] - rank[Coach.status(b.id)] || a.username.localeCompare(b.username));
  return topBar('All clients') + (list.length ? list.map(clientCard).join('') : empty('No clients yet', 'Add a client from the Coach page.'));
}
function vCoachGroup(v) {
  const g = Coach.ov && Coach.ov.groups.find(x => x.id === v.id);
  if (!g) return topBar('Group') + empty(Coach.ov ? 'Group not found' : 'Loading…', '');
  const rank = { red: 0, amber: 1, green: 2, grey: 3 };
  const members = g.members.map(id => Coach.client(id)).filter(Boolean).sort((a, b) => rank[Coach.status(a.id)] - rank[Coach.status(b.id)]);
  return topBar(esc(g.name), { right: `<button class="icon-btn" data-a="coachGroupMenu" data-id="${g.id}" aria-label="Group options">${I.more}</button>` })
    + (members.length ? members.map(clientCard).join('') : empty('No clients in this group', 'Tap ⋯ to add clients.'))
    + `<button class="bigbtn" data-a="coachGroupMembers" data-id="${g.id}">${I.people}<span>Add or remove clients</span>${I.chev}</button>`;
}
function vCoachClient(v) {
  const c = Coach.client(v.id);
  if (!c) return topBar('Client') + empty(Coach.ov ? 'Client not found' : 'Loading…', '');
  const x = Coach.data[v.id];
  let h = topBar(esc(c.username), { right: `<button class="icon-btn" data-a="coachClientMenu" data-id="${c.id}" aria-label="Client options">${I.more}</button>` });
  h += `<button class="bigbtn primary" data-a="coachEnter" data-id="${c.id}">${I.dumbbell}<span>Open ${esc(c.username)}'s training</span>${I.chev}</button>
    <div class="foot mt">View and edit their plan, exercises and sessions, add coach notes and cues, or log sets for them. They're notified of changes.</div>`;
  if (!x || (!x.d && !x.err)) return h + empty('Loading…', '');
  if (x.err && !x.d) return h + empty("Couldn't load", esc(x.err));
  const s = x.sum;
  h += `<div class="stats3"><div><b>${s.thisWeek}${s.plannedWeek ? '/' + s.plannedWeek : ''}</b><span>this week</span></div><div><b>${s.last ? ago(s.last) : '–'}</b><span>last session</span></div><div><b>${s.last28}</b><span>last 4 weeks</span></div></div>`;
  h += `<div class="sect">Insights</div><div class="card">${x.ins.length ? insightRows(x.ins, 0, c.id) : '<div class="row dim">Nothing to flag yet. Insights appear once there are a few weeks of training.</div>'}</div>`;
  const recent = withData(x.d, () => [...S.sessions].sort((a, b) => b.start - a.start).slice(0, 6).map(ss => {
    const n = sesSets(ss).length;
    return `<div class="row tap" data-a="coachOpenSession" data-c="${c.id}" data-id="${ss.id}"><i class="dot" style="background:${catById(ss.categoryId).color}"></i><div class="grow"><div>${esc(sesName(ss))}</div><div class="sub">${fmtDay(ss.start)} · ${fmtHM(sesDur(ss))}${n ? ` · ${n} sets` : ''}</div>${ss.notes ? `<div class="sub pre">“${esc(ss.notes)}”</div>` : ''}</div>${I.chev}</div>`;
  }).join(''));
  h += `<div class="sect">Recent sessions</div><div class="card">${recent || '<div class="row dim">No sessions yet.</div>'}</div>`;
  const gs = Coach.ov.groups.filter(g => g.members.includes(c.id));
  h += `<div class="sect">Groups</div><div class="card"><div class="row tap" data-a="coachClientGroups" data-id="${c.id}"><span class="grow">${gs.length ? gs.map(g => esc(g.name)).join(', ') : '<span class="dim">Not in a group</span>'}</span>${I.chev}</div></div>`;
  return h;
}

/* ---------------- admin views ---------------- */
let ADM = { users: null, resets: null, q: '' };
async function loadAdmin(kind) {
  try {
    if (kind === 'users') ADM.users = (await API.get('/api/admin/users')).users;
    else { ADM.resets = (await API.get('/api/admin/resets')).requests; Auth.me.resetsOpen = ADM.resets.length; updateBadges(); }
  } catch (e) { toast(e.message); }
  refreshCoachView();
}
function vAdminResets() {
  let h = topBar('Reset requests');
  if (!ADM.resets) return h + empty('Loading…', '');
  if (!ADM.resets.length) return h + empty('No open requests', 'When someone taps “Forgot password?”, it appears here and you get a notification.');
  return h + `<div class="card">${ADM.resets.map(r => `<div class="row"><div class="grow"><div><b>${esc(r.username)}</b></div><div class="sub">${ago(r.created_at)}, ${fmtTime(r.created_at)}${r.message ? ` · “${esc(r.message)}”` : ''}</div></div>
    <button class="txt-btn sm" data-a="adminResetUser" data-id="${r.user_id}" data-name="${esc(r.username)}">Reset</button><button class="mini" data-a="adminDismiss" data-id="${r.id}" aria-label="Dismiss">${I.x}</button></div>`).join('')}</div>
    <div class="foot">Resetting sets a temporary password that you pass on to them. They choose their own the next time they sign in, and are signed out everywhere else.</div>`;
}
function vAdminUsers() {
  let h = topBar('Users');
  if (!ADM.users) return h + empty('Loading…', '');
  const rl = { admin: 'Super admin', pt: 'PT', user: 'User' };
  h += `<div class="search mb">${I.search}<input id="adm-q" placeholder="Search usernames" value="${esc(ADM.q)}" autocapitalize="none"></div>`;
  return h + `<div class="card" id="adm-list">${ADM.users.map(u => `<div class="row tap" data-a="adminUser" data-id="${u.id}" data-q="${esc(u.username.toLowerCase())}"><div class="grow"><div>${esc(u.username)}</div><div class="sub">Joined ${fmtShort(u.created_at)}${u.last_seen ? ` · seen ${ago(u.last_seen).toLowerCase()}` : ''}${u.must_change ? ' · temporary password' : ''}</div></div><span class="pill" style="--c:${u.role === 'user' ? '#8e8e93' : u.role === 'pt' ? COL.blue : COL.yellow}">${rl[u.role] || u.role}</span>${I.chev}</div>`).join('')}</div>`;
}
const genPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; const r = crypto.getRandomValues(new Uint8Array(10)); for (const b of r) s += a[b % a.length]; return s.slice(0, 5) + '-' + s.slice(5); };

Object.assign(V, { coach: vCoach, coachClients: vCoachClients, coachGroup: vCoachGroup, coachClient: vCoachClient, adminResets: vAdminResets, adminUsers: vAdminUsers });

/* ---------------- coach & admin actions ---------------- */
Object.assign(A, {
  coachRefresh: () => { Coach.ovAt = 0; Coach.data = {}; Coach.loadOverview(true); if (Auth.isAdmin()) Auth.refreshMe(); render(); },
  coachEnter: el => Coach.enter(el.dataset.id),
  exitClient: () => Coach.exit(),
  coachOpenEx: el => Coach.enter(el.dataset.c, () => push({ v: 'ex', id: el.dataset.id, tab: 'sets' })),
  coachOpenDay: el => Coach.enter(el.dataset.c, () => push({ v: 'day', d: el.dataset.d })),
  coachOpenSession: el => Coach.enter(el.dataset.c, () => push({ v: 'session', id: el.dataset.id })),
  coachAddClient: () => sheet(`${sheetHead('Add client', 'closeSheet', '')}
    <div class="seg" id="ac-mode" data-val="invite"><button class="on" data-a="acMode" data-m="invite">They have an account</button><button data-a="acMode" data-m="create">Create one for them</button></div>
    <form data-form="coachAddClient"><div class="card"><div class="row"><input name="username" class="tinput left grow" placeholder="Their username" autocapitalize="none" autocorrect="off" required></div>
    <div class="row" id="ac-pw" hidden><input name="password" class="tinput left grow" placeholder="Temporary password (8+ characters)" value="${genPassword()}"></div></div>
    <div class="foot" id="ac-help">They'll get an invite in the app. Once they accept, you can see their training and edit their plan.</div>
    <button class="savebtn" type="submit">${I.check}</button></form>`),
  acMode: el => {
    const m = el.dataset.m; $('#ac-mode').dataset.val = m;
    $$('#ac-mode button').forEach(b => b.classList.toggle('on', b === el));
    $('#ac-pw').hidden = m !== 'create';
    $('#ac-help').textContent = m === 'create' ? "Give them the username and temporary password. They'll choose their own password the first time they sign in." : "They'll get an invite in the app. Once they accept, you can see their training and edit their plan.";
  },
  coachNewGroup: () => sheet(`${sheetHead('New group', 'closeSheet', '')}<form data-form="coachGroupSave"><div class="card"><div class="row"><input name="name" class="tinput left grow big" placeholder="e.g. Cohort 1" required></div></div><button class="savebtn" type="submit">${I.check}</button></form>`, { mount() { setTimeout(() => { const i = $('#ov input'); if (i) i.focus(); }, 80); } }),
  coachGroupMenu: el => { const id = el.dataset.id, g = Coach.ov.groups.find(x => x.id === id); menu([
    { label: 'Add or remove clients', fn: () => A.coachGroupMembers({ dataset: { id } }) },
    { label: 'Rename group', fn: () => sheet(`${sheetHead('Rename group', 'closeSheet', '')}<form data-form="coachGroupSave" data-id="${id}"><div class="card"><div class="row"><input name="name" class="tinput left grow big" value="${esc(g.name)}" required></div></div><button class="savebtn" type="submit">${I.check}</button></form>`) },
    { label: 'Delete group', danger: 1, fn: async () => { if (!await confirmBox(`Delete “${g.name}”? Clients stay as your clients.`)) return; try { await API.del(`/api/coach/groups/${id}`); Coach.ov.groups = Coach.ov.groups.filter(x => x.id !== id); goBack(); toast('Group deleted'); } catch (e) { toast(e.message); } } }
  ]); },
  coachGroupMembers: el => {
    const g = Coach.ov.groups.find(x => x.id === el.dataset.id);
    const list = Coach.activeClients();
    if (!list.length) { toast('Add a client first'); return; }
    sheet(`${sheetHead(esc(g.name), 'coachSaveMembers', g.id)}<div class="card" id="gm">${list.map(c => `<div class="row tap" data-a="tog" data-k="${c.id}"><span class="grow">${esc(c.username)}</span><span class="tog ${g.members.includes(c.id) ? 'on' : ''}"></span></div>`).join('')}</div>`);
  },
  coachSaveMembers: async el => {
    const g = Coach.ov.groups.find(x => x.id === el.dataset.id);
    const want = $$('#gm .row').filter(r => r.querySelector('.tog').classList.contains('on')).map(r => r.dataset.k);
    try {
      for (const id of want) if (!g.members.includes(id)) await API.post(`/api/coach/groups/${g.id}/members`, { clientId: id, add: true });
      for (const id of g.members) if (!want.includes(id)) await API.post(`/api/coach/groups/${g.id}/members`, { clientId: id, add: false });
      g.members = want; closeSheet(); render(); toast('Group updated');
    } catch (e) { toast(e.message); }
  },
  coachClientGroups: el => {
    const id = el.dataset.id;
    if (!Coach.ov.groups.length) { toast('Create a group first'); return; }
    sheet(`${sheetHead('Groups', 'coachSaveClientGroups', id)}<div class="card" id="cg">${Coach.ov.groups.map(g => `<div class="row tap" data-a="tog" data-k="${g.id}"><span class="grow">${esc(g.name)}</span><span class="tog ${g.members.includes(id) ? 'on' : ''}"></span></div>`).join('')}</div>`);
  },
  coachSaveClientGroups: async el => {
    const id = el.dataset.id;
    try {
      for (const row of $$('#cg .row')) {
        const g = Coach.ov.groups.find(x => x.id === row.dataset.k), on = row.querySelector('.tog').classList.contains('on');
        if (on !== g.members.includes(id)) {
          await API.post(`/api/coach/groups/${g.id}/members`, { clientId: id, add: on });
          g.members = on ? [...g.members, id] : g.members.filter(x => x !== id);
        }
      }
      closeSheet(); render();
    } catch (e) { toast(e.message); }
  },
  coachClientMenu: el => { const id = el.dataset.id, c = Coach.client(id); menu([
    { label: 'Groups', fn: () => A.coachClientGroups({ dataset: { id } }) },
    { label: 'Remove client', danger: 1, fn: () => A.coachRemove({ dataset: { id } }) }
  ]); },
  coachRemove: async el => {
    const c = Coach.client(el.dataset.id); if (!c) return;
    if (!await confirmBox(c.status === 'pending' ? `Cancel the invite to ${c.username}?` : `Remove ${c.username}? You'll lose access to their training. Their account and data are kept.`, c.status === 'pending' ? 'Cancel invite' : 'Remove')) return;
    try { await API.del(`/api/coach/clients/${c.id}`); Coach.ov.clients = Coach.ov.clients.filter(x => x.id !== c.id); Coach.ov.groups.forEach(g => g.members = g.members.filter(x => x !== c.id)); if (cur().v === 'coachClient') goBack(); else render(); toast('Done'); }
    catch (e) { toast(e.message); }
  },
  adminDismiss: async el => { try { await API.post(`/api/admin/resets/${el.dataset.id}/dismiss`); loadAdmin('resets'); } catch (e) { toast(e.message); } },
  adminResetUser: el => sheet(`${sheetHead('Reset password', 'closeSheet', '')}
    <p class="dim">Set a temporary password for <b>${esc(el.dataset.name)}</b>. Pass it on to them; they'll choose their own when they next sign in.</p>
    <form data-form="adminDoReset" data-id="${el.dataset.id}" data-name="${esc(el.dataset.name)}"><div class="card"><div class="row"><input name="password" class="tinput left grow big" value="${genPassword()}" required minlength="8"></div></div>
    <button class="savebtn" type="submit">${I.check}</button></form>`),
  adminUser: el => {
    const u = ADM.users.find(x => x.id === el.dataset.id); if (!u) return;
    const items = [];
    if (u.role !== 'admin') items.push({ label: u.role === 'pt' ? 'Remove PT access' : 'Make PT (coach access)', fn: async () => {
      try { await API.post(`/api/admin/users/${u.id}/role`, { role: u.role === 'pt' ? 'user' : 'pt' }); toast(u.role === 'pt' ? 'PT access removed' : `${u.username} is now a PT`); loadAdmin('users'); } catch (e) { toast(e.message); } } });
    items.push({ label: 'Reset password', fn: () => A.adminResetUser({ dataset: { id: u.id, name: u.username } }) });
    menu(items);
  }
});

/* forms */
window.FORMS = {
  coachAddClient: async f => {
    const v = Object.fromEntries(new FormData(f)), mode = $('#ac-mode').dataset.val;
    try {
      if (mode === 'create') {
        const r = await API.post('/api/coach/clients', { username: v.username, password: v.password });
        Coach.ov.clients.push(Object.assign({ last_seen: 0 }, r.client));
        sheet(`<div class="grab"></div><div class="empty"><b>Account created</b>Give ${esc(r.client.username)} these details:</div>
          <div class="card"><div class="row"><span class="grow">Username</span><b>${esc(r.client.username)}</b></div><div class="row"><span class="grow">Temporary password</span><b>${esc(v.password)}</b></div></div>
          <div class="foot">They'll pick their own password the first time they sign in.</div><button class="mbtn" data-a="closeSheet">Done</button>`);
        Coach.loadClient(r.client.id);
      } else {
        const r = await API.post('/api/coach/invite', { username: v.username });
        Coach.ov.clients.push(Object.assign({ last_seen: 0 }, r.client));
        closeSheet(); toast(`Invite sent to ${r.client.username}`);
      }
      render();
    } catch (e) { toast(e.message); }
  },
  coachGroupSave: async f => {
    const name = new FormData(f).get('name'), id = f.dataset.id;
    try {
      if (id) { await API.post(`/api/coach/groups/${id}`, { name }); Coach.ov.groups.find(g => g.id === id).name = name; }
      else { const r = await API.post('/api/coach/groups', { name }); Coach.ov.groups.push(r.group); }
      closeSheet(); render(); toast(id ? 'Group renamed' : 'Group created');
    } catch (e) { toast(e.message); }
  },
  adminDoReset: async f => {
    const pw = new FormData(f).get('password');
    try {
      await API.post(`/api/admin/users/${f.dataset.id}/reset`, { password: pw });
      sheet(`<div class="grab"></div><div class="empty"><b>Password reset</b>Tell ${esc(f.dataset.name)} their temporary password:</div>
        <div class="card"><div class="row"><span class="grow">Temporary password</span><b class="sel">${esc(pw)}</b></div></div>
        <div class="foot">They've been signed out everywhere and will choose a new password when they sign in.</div><button class="mbtn" data-a="closeSheet">Done</button>`);
      loadAdmin('resets');
    } catch (e) { toast(e.message); }
  }
};
document.addEventListener('input', e => {
  if (e.target.id !== 'adm-q') return;
  ADM.q = e.target.value.toLowerCase();
  $$('#adm-list .row').forEach(r => r.hidden = !r.dataset.q.includes(ADM.q));
});
