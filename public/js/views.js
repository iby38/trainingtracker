/* ================= shared bits ================= */
function topBar(title,o={}){
  const back=o.back!=null?o.back:!!peekBack();
  return `<div class="topbar">${o.left||(back?`<button class="icon-btn" data-a="back" aria-label="Back">${I.back}</button>`:'<div class="sp44"></div>')}<div class="title">${title}</div>${o.right||'<div class="sp44"></div>'}</div>`;
}
const empty=(t,s)=>`<div class="empty"><b>${t}</b>${s||''}</div>`;
const gone=()=>topBar('')+empty('Not found','This item has been deleted.');
function catChips(active,key){
  return `<div class="chips scroll">${[{id:'all',name:'All',color:COL.green},...S.categories].map(c=>
    `<button class="chip ${active===c.id?'on':''}" style="--c:${c.color}" data-a="setFilter" data-k="${key}" data-val="${c.id}">${c.id!=='all'?`<i class="dot" style="background:${c.color}"></i>`:''}${esc(c.name)}</button>`).join('')}
    <button class="chip" data-a="addCat" aria-label="Add category">${I.plus}</button></div>`;
}
function exRows(list,rid){
  return list.map(ex=>{
    const ld=lastDone(ex.id);
    return `<div class="sw">
      <button class="sw-bg l" data-a="record" data-id="${ex.id}" data-rid="${rid||''}">Record</button>
      <button class="sw-bg r" data-a="${rid?'rmFromRoutine':'delEx'}" data-id="${ex.id}" data-rid="${rid||''}">${rid?'Remove':'Delete'}</button>
      <div class="sw-front row tap" data-a="openEx" data-id="${ex.id}" data-rid="${rid||''}">
        <div class="grow"><div class="name">${esc(ex.name)}</div>${ex.notes?`<div class="sub pre">${esc(ex.notes)}</div>`:''}</div>
        <span class="ago">${ld?ago(ld):'New'}</span>${I.chev}
      </div></div>`;
  }).join('');
}
function statsCard(sets,sess){
  let reps=0,v=0;const exs=new Set();
  for(const s of sets){const ex=exById(s.exerciseId),m=M(ex);if(m.reps) reps+=s.reps||0;v+=kgVol(s,ex);exs.add(s.exerciseId)}
  const dur=sess.reduce((t,s)=>t+sesDur(s),0);
  const gaps=[];
  for(const ss of sess){const a=sets.filter(x=>x.sessionId===ss.id);for(let i=1;i<a.length;i++){const g=(a[i].ts-a[i-1].ts)/1000;if(g>0&&g<900) gaps.push(g)}}
  const avg=gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:0;
  const cell=(l,val,c)=>`<div><div class="stl">${l}</div><div class="stv" style="color:${c}">${val}</div></div>`;
  return `<div class="card pad stgrid">${cell('Sets',sets.length,'#ff5a6e')}${cell('Repetitions',reps,COL.green)}${cell('Exercises',exs.size,COL.blue)}${cell('Volume',`${num(v)} <small>${U()}</small>`,COL.teal)}${cell('Duration',dur?fmtHM(dur):'--','#fff')}${cell('Avg rest',avg?fmtDur(avg):'--','#fff')}</div>`;
}
function exBlocks(sets){
  if(!sets.length) return '';
  const order=[],g={};
  for(const s of sets){if(!g[s.exerciseId]){g[s.exerciseId]=[];order.push(s.exerciseId)}g[s.exerciseId].push(s)}
  return `<div class="sect">Set details</div>`+order.map(id=>{
    const ex=exById(id);if(!ex) return '';
    return `<div class="card tap exblock" data-a="openEx" data-id="${id}"><div class="exb-name"><span>${esc(ex.name)}</span>${I.chev}</div>${
      g[id].map((s,i)=>`<div class="exb-set"><span class="si">${i+1}</span>${vals(s,ex)}${s.label?`<span class="lbl">${LABELS[s.label]||''}</span>`:''}${s.note?`<span class="dim sm">${esc(s.note)}</span>`:''}</div>`).join('')}</div>`;
  }).join('');
}

/* ================= HOME ================= */
function vHome(){
  const now=Date.now(),d=new Date(),dow=d.getDay(),tk=dkey(now);
  const own=!CTX.client;
  let h=topBar('',{right:own?`<div class="tb-r"><button class="icon-btn bellbtn" data-a="push" data-v="notifs" aria-label="Notifications">${I.bell}<i class="nb" id="bellbadge"${Sync.unread?'':' hidden'}>${Sync.unread||''}</i></button><button class="icon-btn" data-a="push" data-v="settings" aria-label="Settings">${I.gear}</button></div>`:''})+`
  <div class="eyebrow">${own?esc(Auth.user().username)+' · ':''}${DOWL[dow]} ${d.getDate()} ${MONL[d.getMonth()]}</div><h1>${own?'Overview':esc(CTX.client.username)}</h1>`;
  if(own){
    const inv=(Auth.me.coaches||[]).filter(c=>c.status==='pending');
    if(inv.length) h+=`<div class="card pad tap banner" data-a="push" data-v="notifs"><b>${esc(inv[0].username)}</b> wants to be your coach. Tap to review.</div>`;
    if(Auth.isAdmin()&&Auth.me.resetsOpen) h+=`<div class="card pad tap banner warn" data-a="adminGoResets"><b>${Auth.me.resetsOpen} password reset request${Auth.me.resetsOpen>1?'s':''}</b> waiting for you.</div>`;
  }
  const ins=computeInsights();
  if(ins.length) h+=`<div class="sect">Insights</div><div class="card">${insightRows(ins,3)}${ins.length>3?`<div class="row tap" data-a="push" data-v="insights"><span class="grow green">See all ${ins.length}</span>${I.chev}</div>`:''}</div>`;
  if(!S.routines.length){
    h+=`<div class="card pad"><div class="big">Set up your week</div><div class="exprev">Create routines in My Workouts and assign each one to days of the week. This page will then show what's on today and what's next.</div></div>`;
  }else{
    const todays=onDay(dow);
    h+=`<div class="sect">Today</div>`;
    if(todays.length) h+=todays.map(r=>{const done=S.sessions.some(s=>s.routineId===r.id&&dkey(s.start)===tk);return routineCard(r,done?'Done today':DOWL[dow],done)}).join('');
    else h+=`<div class="card pad"><div class="big">Rest day</div><div class="exprev">Nothing is scheduled for ${DOWL[dow]}.</div></div>`;
    let next=null;
    for(let i=1;i<=7&&!next;i++){const dd=(dow+i)%7,rs=onDay(dd);if(rs.length) next={r:rs[0],i,dd}}
    if(next) h+=`<div class="sect">Up next</div>`+routineCard(next.r,next.i===1?'Tomorrow':next.i===7?`Next ${DOWL[next.dd]}`:DOWL[next.dd]);
  }
  const last=[...S.sessions].sort((a,b)=>b.start-a.start).find(s=>s.start<=now+60000);
  h+=`<div class="sect">Last workout</div>`;
  h+=last?lastCard(last):`<div class="card pad"><div class="exprev" style="margin:0">No workouts logged yet. Open an exercise and tap + to log your first set.</div></div>`;
  h+=weekStrip();
  h+=`<button class="bigbtn" data-a="tab" data-t="workouts">${I.dumbbell}<span>My Workouts</span>${I.chev}</button>`;
  return h;
}
function routineCard(r,label,done){
  const c=catById(r.categoryId),names=r.exerciseIds.map(exById).filter(Boolean).map(e=>e.name);
  return `<div class="card pad tap" data-a="push" data-v="routine" data-id="${r.id}">
    <div class="rc-top"><span class="pill" style="--c:${c.color}">${esc(c.name)}</span><span class="dim sm">${esc(label)}</span>${done?`<span class="done">${I.check}</span>`:''}</div>
    <div class="big">${esc(r.name)}</div>${r.subtitle?`<div class="dim">${esc(r.subtitle)}</div>`:''}
    <div class="exprev">${names.length?esc(names.slice(0,5).join(', '))+(names.length>5?` and ${names.length-5} more`:''):'No exercises yet'}</div></div>`;
}
function lastCard(s){
  const sets=sesSets(s),c=catById(s.categoryId),byEx={},order=[];
  let v=0;
  for(const x of sets){v+=kgVol(x,exById(x.exerciseId));if(!byEx[x.exerciseId]){byEx[x.exerciseId]=[];order.push(x.exerciseId)}byEx[x.exerciseId].push(x)}
  const rows=order.map(id=>{const ex=exById(id);if(!ex) return '';const a=byEx[id];return `<div class="lrow"><span>${esc(ex.name)}</span><span class="dim">${a.length} ${a.length>1?'sets':'set'}, best ${esc(txtSet(bestSet(a,ex),ex))}</span></div>`}).join('');
  return `<div class="card pad tap" data-a="push" data-v="session" data-id="${s.id}">
    <div class="rc-top"><span class="pill" style="--c:${c.color}">${esc(c.name)}</span><span class="dim sm">${ago(s.start)}, ${fmtDay(s.start)}</span></div>
    <div class="big">${esc(sesName(s))}</div>
    <div class="stats3"><div><b>${sets.length}</b><span>sets</span></div><div><b>${num(v)}</b><span>${U()} volume</span></div><div><b>${fmtHM(sesDur(s))}</b><span>duration</span></div></div>
    ${rows}${s.notes?`<div class="exprev">${esc(s.notes)}</div>`:''}</div>`;
}
function weekStrip(){
  const t=new Date();t.setHours(0,0,0,0);
  const mon=new Date(t.getFullYear(),t.getMonth(),t.getDate()-((t.getDay()+6)%7)),map=dayColorMap('all');
  let h='<div class="sect">This week</div><div class="card pad"><div class="hwk">';
  for(let i=0;i<7;i++){
    const d=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i),k=dkey(d.getTime()),cols=map[k],rs=onDay(d.getDay());
    h+=`<button class="hd ${k===dkey(Date.now())?'today':''}" data-a="goDay" data-d="${k}"><span class="wl">${'MTWTFSS'[i]}</span><span class="hn" style="${cols?`background:${cols[0]};color:#000`:''}">${d.getDate()}</span><span class="hr">${rs.length?esc(rs[0].name):''}</span></button>`;
  }
  return h+'</div></div>';
}

/* ================= WORKOUTS ================= */
function vWorkouts(v){
  const edit=!!v.edit;
  let h=topBar('',{right:`<div class="tb-r">${CTX.client?'':`<button class="icon-btn" data-a="push" data-v="settings" aria-label="Settings">${I.gear}</button>`}<button class="txt-btn" data-a="toggleEdit">${edit?'Done':'Edit'}</button></div>`})+`<h1>My Workouts</h1>
  <div class="card">
    <div class="row tap green" data-a="newRoutine"><span class="ic">${I.plus}</span><span class="grow">New Routine…</span></div>
    <div class="row tap" data-a="push" data-v="exercises"><span class="ic green">${I.books}</span><span class="grow">My Exercises</span><span class="dim">${S.exercises.length}</span>${I.chev}</div>
    ${S.routines.map(r=>{const c=catById(r.categoryId);const sub=[r.subtitle,daysTxt(r.days)].filter(Boolean);
      return `<div class="row ${edit?'':'tap'}" ${edit?'':`data-a="push" data-v="routine" data-id="${r.id}"`}><span class="ic" style="color:${c.color}">${I.book}</span><div class="grow"><div>${esc(r.name)}</div>${sub.map(x=>`<div class="sub">${esc(x)}</div>`).join('')}</div>${
        edit?`<button class="mini" data-a="moveR" data-id="${r.id}" data-d="-1" aria-label="Move up">↑</button><button class="mini" data-a="moveR" data-id="${r.id}" data-d="1" aria-label="Move down">↓</button><button class="mini red" data-a="delRoutine" data-id="${r.id}" aria-label="Delete">${I.trash}</button>`
        :`<span class="dim">${r.exerciseIds.length}</span>${I.chev}`}</div>`}).join('')}
  </div>
  <div class="sect">Weekly schedule</div><div class="card">${WEEK.map(d=>{const rs=onDay(d);
    return `<div class="row tap" data-a="assignDay" data-d="${d}"><span class="dname">${DOWL[d]}</span><span class="grow right">${rs.length?rs.map(r=>`<span class="pill" style="--c:${catById(r.categoryId).color}">${esc(r.name)}</span>`).join(' '):'<span class="dim">Rest</span>'}</span>${I.chev}</div>`}).join('')}</div>
  <div class="foot">Tap a day to choose which routines run on it. The Overview page uses this to show what's on today.</div>`;
  return h;
}
function vExercises(){
  const list=sortByLast(S.exercises);
  return topBar('Exercises')+(list.length?`<div class="card">${exRows(list,null)}</div><div class="hint">Swipe right to record a set, swipe left to delete</div>`:empty('No exercises yet','Tap “Search or add” to pick from the library or create your own.'))
    +`<button class="searchpill" data-a="picker" data-mode="mine">${I.search}<span>Search or add</span></button>`;
}
function vRoutine(v){
  const r=rtById(v.id);if(!r) return gone();
  const c=catById(r.categoryId),list=sortByLast(r.exerciseIds.map(exById).filter(Boolean));
  return topBar(esc(r.name),{right:`<button class="icon-btn" data-a="editRoutine" data-id="${r.id}" aria-label="Edit routine">${I.more}</button>`})
    +(r.subtitle?`<div class="center dim mb">${esc(r.subtitle)}</div>`:'')
    +coachNoteCard('routine',r.id,r.name)
    +`<div class="chips center"><button class="pill" style="--c:${c.color}" data-a="editRoutine" data-id="${r.id}">${esc(c.name)}</button><button class="pill" style="--c:#aeaeb2" data-a="editRoutine" data-id="${r.id}">${esc(daysTxt(r.days)||'No days set')}</button></div>`
    +(list.length?`<div class="card">${exRows(list,r.id)}</div><div class="hint">Swipe right to record a set, swipe left to remove from routine</div>`:empty('No exercises in this routine','Tap “Add or remove” below.'))
    +`<button class="searchpill" data-a="picker" data-mode="routine" data-id="${r.id}">${I.search}<span>Add or remove</span></button>`;
}

/* ================= EXERCISE ================= */
const TABS=[['sets','Sets','list','#fff'],['analyze','Analyze','chart',COL.green],['orm','1RM','gauge',COL.purple],['records','Records','trophy',COL.yellow]];
let CH=null;
function vEx(v){
  const ex=exById(v.id);if(!ex) return gone();
  const tab=v.tab||'sets';
  let h=topBar(esc(ex.name),{right:`<button class="icon-btn" data-a="exMenu" data-id="${ex.id}" aria-label="Exercise options">${I.more}</button>`});
  const tabs=isCircuit(ex)?TABS.filter(x=>x[0]!=='orm'):TABS;
  h+=`<div class="extabs">${tabs.map(([k,l,ic,bg])=>k===tab?`<button class="xt on" style="background:${bg}">${I[ic]}<span>${l}</span></button>`:`<button class="xt" data-a="exTab" data-t="${k}" aria-label="${l}">${I[ic]}</button>`).join('')}</div>`;
  if(tab==='sets'){
    if(isCircuit(ex)) h+=circuitCard(ex);
    if(ex.notes) h+=`<div class="exnote tap" data-a="editInfo" data-id="${ex.id}">${esc(ex.notes)}</div>`;
    h+=coachNoteCard('exercise',ex.id,ex.name);
    h+=`<div id="rest"></div>`+tabSets(ex);
  }else if(tab==='analyze') h+=tabAnalyze(ex);
  else if(tab==='orm') h+=tabOrm(ex,v);
  else h+=tabRecords(ex);
  if(tab==='sets') h+=`<button class="fab" data-a="log" data-id="${ex.id}" data-rid="${v.rid||''}" aria-label="Log a set">${I.plus}</button>`;
  return h;
}
function tabSets(ex){
  const a=exSets(ex.id);
  if(!a.length) return empty('No sets yet','Tap + to log your first set.');
  const {prs,volDays}=prInfo(ex),orm=ex.orm&&ex.orm.on,groups=[];
  let g=null;
  for(const s of a){const k=dkey(s.ts);if(!g||g.k!==k){g={k,sets:[]};groups.push(g)}g.sets.push(s)}
  groups.reverse();
  return groups.map(g=>`<div class="dayhdr"><button class="dlink" data-a="goDay" data-d="${g.k}">${fmtDay(fromKey(g.k))}${I.chev}</button>${volDays.has(g.k)?`<span class="badge">${I.trophy}Volume</span>`:''}</div>
  <div class="card">${g.sets.map((s,i)=>{
    const pr=prs.has(s.id),gap=i?(s.ts-g.sets[i-1].ts)/1000:0,e=orm?e1rm(s,ex):0;
    return `<div class="sw"><button class="sw-bg l" data-a="repeatSet" data-id="${s.id}">${I.repeat}Repeat</button><button class="sw-bg r" data-a="delSet" data-id="${s.id}">Delete${I.trash}</button>
    <div class="sw-front setrow tap" data-a="editSet" data-id="${s.id}">
      <div class="sl"><span class="si">${i+1}</span><span class="stime">${i&&gap<3600?`<span class="restp">+ ${fmtDur(gap)}</span>`:fmtTime(s.ts)}</span>${pr?`<span class="tro">${I.trophy}</span>`:''}<span class="grow"></span><span class="vals ${pr?'pr':''}">${vals(s,ex)}</span>${I.chev}</div>
      ${(s.label||s.note)?`<div class="snote">${s.label?`<span class="lbl">${LABELS[s.label]||''}</span>`:''}${esc(s.note||'')}</div>`:''}
      ${e?`<div class="snote purple">Est. 1RM ${num(e)} ${U()}</div>`:''}
    </div></div>`}).join('')}</div>`).join('')
  +`<div class="hint mt">Swipe right to repeat a set, swipe left to delete</div>`;
}
function chartPts(ex,g){
  let a=exSets(ex.id).filter(s=>s.label!=='warmup');
  if(g.range==='2s'){const days=[...new Set(a.map(s=>dkey(s.ts)))].slice(-2);a=a.filter(s=>days.includes(dkey(s.ts)))}
  else if(g.range!=='all'){const n={'1m':30,'3m':91,'6m':182,'1y':365}[g.range]||91;const from=startOfDay(Date.now())-n*DAY;a=a.filter(s=>s.ts>=from)}
  const p=s=>({ts:s.ts,k:dkey(s.ts),rounds:roundsScore(s),reps:s.reps||0,weight:s.weight||0,volume:(s.reps||0)*(s.weight||0),e1rm:e1rm(s,ex),duration:s.duration||0,distance:s.distance||0,n:1});
  if(g.mode==='sets') return a.map(p);
  const out=[];
  for(const s of a){const q=p(s),L=out[out.length-1];
    if(L&&L.k===q.k){L.rounds=Math.max(L.rounds,q.rounds);L.reps+=q.reps;L.weight=Math.max(L.weight,q.weight);L.volume+=q.volume;L.e1rm=Math.max(L.e1rm,q.e1rm);L.duration+=q.duration;L.distance+=q.distance;L.n++}
    else out.push(q)}
  return out;
}
function tabAnalyze(ex){
  const g=S.settings.graph,m=M(ex);
  const avail=[['rounds','Rounds','#ff9f7a',m.rounds],['reps','Reps',COL.green,m.reps],['weight','Weight',COL.orange,m.weight],['volume','Volume',COL.blue,m.reps&&m.weight],['e1rm','Est. 1RM',COL.purple,m.reps&&m.weight],['duration','Time',COL.teal,m.duration],['distance','Distance',COL.pink,m.distance]].filter(x=>x[3]);
  CH={pts:chartPts(ex,g),series:avail.filter(a=>g.series[a[0]]),sel:null,mode:g.mode};
  return `<div id="readout" class="readout"></div><div id="chart" class="chart"></div><div id="legend" class="legend"></div>
  <div class="seg">${RANGES.map(([k,l])=>`<button class="${g.range===k?'on':''}" data-a="gset" data-k="range" data-val="${k}">${l}</button>`).join('')}</div>
  <div class="seg">${[['sets','Every set'],['sessions','Per session']].map(([k,l])=>`<button class="${g.mode===k?'on':''}" data-a="gset" data-k="mode" data-val="${k}">${l}</button>`).join('')}</div>
  <div class="chips">${avail.map(a=>`<button class="chip ${g.series[a[0]]?'on':''}" style="--c:${a[2]}" data-a="gser" data-k="${a[0]}">${a[1]}</button>`).join('')}</div>
  <div class="foot">Each line is scaled to its own range so you can compare trends. Per session shows total reps and volume, and the heaviest weight and best 1RM of that day. Warm-up sets are left out.</div>`;
}
const unitOf=k=>k==='reps'?'rep':k==='distance'?'km':k==='duration'?'':U();
const fmtV=(k,v)=>k==='duration'?fmtDur(v):k==='reps'?String(Math.round(v)):num(v);
function drawChart(){
  const el=$('#chart');if(!el||!CH) return;
  const pts=CH.pts,ro=$('#readout'),lg=$('#legend');
  if(!pts.length){el.innerHTML='<div class="empty-c">No sets in this range</div>';ro.innerHTML='';lg.innerHTML='';return}
  if(!CH.series.length){el.innerHTML='<div class="empty-c">Pick a metric below</div>';ro.innerHTML='';lg.innerHTML='';return}
  if(CH.sel==null||CH.sel>=pts.length) CH.sel=pts.length-1;
  const W=el.clientWidth||340,H=el.clientHeight||300,px=18,py=20,n=pts.length;
  const X=i=>n===1?W/2:px+i*(W-2*px)/(n-1);
  let s=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  for(let i=1;i<n;i++) if(pts[i].k!==pts[i-1].k){const x=((X(i)+X(i-1))/2).toFixed(1);s+=`<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="#3a3a3c" stroke-dasharray="3 4"/>`}
  const sx=X(CH.sel).toFixed(1);
  s+=`<line x1="${sx}" x2="${sx}" y1="0" y2="${H}" stroke="#fff" stroke-opacity=".3"/>`;
  const leg=[];
  for(const [key,label,col] of CH.series){
    const vs=pts.map(p=>p[key]),mn=Math.min(...vs),mx=Math.max(...vs);
    const Y=v=>(mx===mn?H/2:H-py-(v-mn)/(mx-mn)*(H-2*py)).toFixed(1);
    s+=`<polyline fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map((p,i)=>X(i).toFixed(1)+','+Y(p[key])).join(' ')}"/>`;
    if(n<=70) s+=pts.map((p,i)=>`<circle cx="${X(i).toFixed(1)}" cy="${Y(p[key])}" r="${i===CH.sel?6:4.5}" fill="${i===CH.sel?col:'#000'}" stroke="${col}" stroke-width="2.5"/>`).join('');
    else s+=`<circle cx="${sx}" cy="${Y(pts[CH.sel][key])}" r="6" fill="${col}"/>`;
    leg.push(`<span style="color:${col}">${label}: ${fmtV(key,mn)} to ${fmtV(key,mx)} ${unitOf(key)}</span>`);
  }
  el.innerHTML=s+'</svg>';
  lg.innerHTML=leg.join('');
  const p=pts[CH.sel];
  ro.innerHTML=`<div class="ro-v">${CH.series.map(([k,,c])=>`<span style="color:${c}">${fmtV(k,p[k])}<small> ${unitOf(k)}</small></span>`).join('')}</div>
    <div class="dim">${CH.mode==='sets'?`Set on ${fmtShort(p.ts)}, ${fmtTime(p.ts)}`:`Session on ${fmtShort(p.ts)}, ${p.n} ${p.n>1?'sets':'set'}`}</div>`;
  const pick=e=>{
    if(e.type==='pointermove'&&e.pointerType==='mouse'&&!e.buttons) return;
    const r=el.getBoundingClientRect(),x=e.clientX-r.left;let best=0,bd=1e9;
    for(let i=0;i<n;i++){const d=Math.abs(X(i)-x);if(d<bd){bd=d;best=i}}
    if(best!==CH.sel){CH.sel=best;drawChart()}
  };
  el.onpointerdown=pick;el.onpointermove=pick;
}
function tabOrm(ex,v){
  const o=ex.orm||{on:false,formula:'brzycki'},open=v.fopen,m=M(ex);
  let h=`<div class="sect">1RM settings</div><div class="card">
    <div class="row tap" data-a="ormToggle"><span class="ic purple">${I.gauge}</span><span class="grow">Show on sets</span><span class="tog ${o.on?'on':''}" style="${o.on?'background:var(--purple)':''}"></span></div>
    <div class="row tap ${open?'rot':''}" data-a="ormOpen"><span class="ic purple fx">f(x)</span><span class="grow">Formula</span><span class="dim">${FN[o.formula]}</span>${I.chev}</div>
    ${open?Object.keys(FN).map(k=>`<div class="row tap sub-row" data-a="ormF" data-f="${k}"><span class="grow">${FN[k]}</span>${o.formula===k?`<span class="purple">${I.check}</span>`:''}</div>`).join(''):''}
  </div><div class="foot">When on, each set shows its estimated one-rep max. Training at a percentage of your 1RM helps you target size or strength.</div>`;
  if(!(m.reps&&m.weight)) return h+`<div class="foot">This exercise needs reps and weight tracked to estimate a 1RM.</div>`;
  const a=exSets(ex.id).filter(s=>s.label!=='warmup');
  if(!a.length) return h;
  let best=null,bv=0;for(const s of a){const e=e1rm(s,ex);if(e>bv){bv=e;best=s}}
  if(!best) return h;
  const ld=dkey(a[a.length-1].ts);let lv=0;for(const s of a) if(dkey(s.ts)===ld) lv=Math.max(lv,e1rm(s,ex));
  h+=`<div class="card pad center"><div class="dim sm">Best estimated 1RM</div><div class="huge purple">${num(bv)} <small>${U()}</small></div><div class="dim sm">from ${best.reps} × ${num(best.weight)} ${U()} on ${fmtDay(best.ts)}</div><div class="dim sm mt">Latest session: <b class="purple">${num(lv)} ${U()}</b></div></div>`;
  h+=`<div class="sect">Training percentages</div><div class="card">${[100,95,90,85,80,75,70,65,60,55,50].map(p=>`<div class="row"><span class="pct">${p}%</span><span class="grow"><b>${num(Math.round(bv*p/100*2)/2)}</b> ${U()}</span><span class="dim">about ${Math.max(1,Math.round(37-36*p/100))} reps</span></div>`).join('')}</div>`;
  return h;
}
function tabRecords(ex){
  const a=exSets(ex.id).filter(s=>s.label!=='warmup'),m=M(ex);
  if(!a.length) return empty('No records yet','Log some sets to see your best efforts.');
  if(isCircuit(ex)){
    const caps={};for(const s of a){const k=s.capMin||0;if(!caps[k]||roundsScore(s)>roundsScore(caps[k])) caps[k]=s}
    return `<div class="sect">Best rounds</div><div class="card">${Object.keys(caps).sort((x,y)=>x-y).map(k=>{const s=caps[k];return `<div class="row tap" data-a="goDay" data-d="${dkey(s.ts)}"><div class="grow"><div>${+k?k+' minutes':'Any time'}</div><div class="sub">${fmtDay(s.ts)}</div></div><b>${esc(txtSet(s,ex))}</b>${I.chev}</div>`}).join('')}</div>`;
  }
  const maxBy=f=>{let b=null,bv=-Infinity;for(const s of a){const x=f(s);if(x>bv){bv=x;b=s}}return b};
  const rows=[];
  if(m.reps&&m.weight){
    const s1=maxBy(s=>(s.reps||0)*(s.weight||0));rows.push(['Set volume',`${num(s1.reps*s1.weight)} ${U()}`,dkey(s1.ts)]);
    const dv={};for(const s of a){const k=dkey(s.ts);dv[k]=(dv[k]||0)+(s.reps||0)*(s.weight||0)}
    let bk=null,bv=-1;for(const k in dv) if(dv[k]>bv){bv=dv[k];bk=k}
    rows.push(['Session volume',`${num(bv)} ${U()}`,bk]);
    const s2=maxBy(s=>(s.weight||0)*1000+(s.reps||0));rows.push(['Heaviest weight',`${num(s2.weight)} ${U()} × ${s2.reps}`,dkey(s2.ts)]);
    const s3=maxBy(s=>e1rm(s,ex));rows.push(['Best est. 1RM',`${num(e1rm(s3,ex))} ${U()}`,dkey(s3.ts)]);
  }
  if(m.reps){const s4=maxBy(s=>(s.reps||0)*10000+(s.weight||0));rows.push(['Most reps',`${s4.reps}${m.weight?` × ${num(s4.weight)} ${U()}`:' reps'}`,dkey(s4.ts)])}
  if(m.duration){const s5=maxBy(s=>s.duration||0);rows.push(['Longest',fmtDur(s5.duration),dkey(s5.ts)])}
  if(m.distance){const s6=maxBy(s=>s.distance||0);rows.push(['Furthest',`${num(s6.distance)} km`,dkey(s6.ts)])}
  let h=`<div class="sect">Best efforts</div><div class="card">${rows.map(([l,val,k])=>`<div class="row tap" data-a="goDay" data-d="${k}"><div class="grow"><div>${l}</div><div class="sub">${fmtDay(fromKey(k))}</div></div><b>${val}</b>${I.chev}</div>`).join('')}</div>`;
  if(m.reps&&m.weight){
    const maxR=Math.min(30,Math.max(...a.map(s=>s.reps||0))),best=[];
    for(let n=1;n<=maxR;n++){let b=null;for(const s of a) if((s.reps||0)>=n&&(!b||s.weight>b.weight||(s.weight===b.weight&&s.ts<b.ts))) b=s;best[n]=b}
    const ranges=[];
    for(let n=1;n<=maxR;n++){const b=best[n];if(!b) continue;const L=ranges[ranges.length-1];if(L&&L.w===b.weight) L.to=n;else ranges.push({from:n,to:n,w:b.weight,s:b})}
    h+=`<div class="sect">Rep records</div><div class="card"><div class="row hdr"><span class="grow">Repetitions</span><span>Heaviest</span></div>${ranges.map(r=>`<div class="row tap" data-a="goDay" data-d="${dkey(r.s.ts)}"><span class="grow">${r.from===r.to?r.from:`${r.from}–${r.to}`}</span><b>${num(r.w)} ${U()}</b>${I.chev}</div>`).join('')}</div>
    <div class="foot">The heaviest weight you've lifted for at least that many reps.</div>`;
  }
  return h;
}
function vSetEdit(v){
  const s=S.sets.find(x=>x.id===v.id);if(!s) return gone();
  const ex=exById(s.exerciseId),m=M(ex);
  const field=(id,label,val,mode)=>`<div class="row"><input id="${id}" class="finput" type="number" inputmode="${mode}" step="any" value="${val==null?'':val}"><span class="dim">${label}</span></div>`;
  return topBar('Edit Set',{right:`<button class="icon-btn greenbg" data-a="saveSet" data-id="${s.id}" aria-label="Save">${I.check}</button>`})
  +`<div class="card"><div class="row" style="flex-direction:column;align-items:stretch;gap:6px"><span>Exercise</span><select id="se-ex" class="sel">${[...S.exercises].sort(byName).map(e=>`<option value="${e.id}" ${e.id===s.exerciseId?'selected':''}>${esc(e.name)}</option>`).join('')}</select></div></div>
  <div class="card">${m.reps?field('se-reps','Repetitions',s.reps,'numeric'):''}${m.weight?field('se-w',`Weight (${U()})`,s.weight,'decimal'):''}${m.duration?field('se-dur','Duration (seconds)',s.duration,'numeric'):''}${m.distance?field('se-dist','Distance (km)',s.distance,'decimal'):''}</div>
  <div class="sect">Notes</div><div class="card"><textarea id="se-note" rows="2" placeholder="Comment">${esc(s.note||'')}</textarea></div>
  <div class="card"><div class="row"><span class="ic dim">${I.tag}</span><span class="grow">Label</span><select id="se-lbl" class="sel-inline"><option value="">None</option>${Object.entries(LABELS).map(([k,l])=>`<option value="${k}" ${s.label===k?'selected':''}>${l}</option>`).join('')}</select></div></div>
  <div class="card"><div class="row"><span class="grow">Date</span><input id="se-date" type="date" value="${dkey(s.ts)}"><input id="se-time" type="time" step="1" value="${fmtTimeS(s.ts)}"></div></div>
  <div class="foot">Exact time: ${fmtTimeS(s.ts)}</div>
  <div class="card"><div class="row tap red" data-a="delSet" data-id="${s.id}" data-pop="1"><span class="ic">${I.trash}</span><span>Delete</span></div></div>`;
}

/* ================= SESSIONS ================= */
function vSessions(){
  const f=S.settings.sessFilter||'all';
  let list=[...S.sessions].sort((a,b)=>b.start-a.start);
  if(f!=='all') list=list.filter(s=>s.categoryId===f);
  let h=topBar('Sessions')+catChips(f,'sessFilter');
  if(!list.length) h+=empty('No sessions yet','Sessions are created automatically when you log sets. For runs, classes or sparring, add one below.');
  let mk='',open=false;
  for(const s of list){
    const d=new Date(s.start),k=MONL[d.getMonth()]+' '+d.getFullYear();
    if(k!==mk){if(open) h+='</div>';h+=`<div class="month">${k}</div><div class="card">`;open=true;mk=k}
    const c=catById(s.categoryId);
    h+=`<div class="row tap" data-a="push" data-v="session" data-id="${s.id}"><span class="sic" style="--c:${c.color}">${I.dumbbell}</span><div class="grow"><div>${esc(sesName(s))}</div><div class="sdur">${fmtHM(sesDur(s))}</div></div><span class="dim sm" style="align-self:flex-end;padding-bottom:6px">${fmtShort(s.start)}</span>${I.chev}</div>`;
  }
  if(open) h+='</div>';
  h+=`<div class="bottombar"><select id="ns-cat" class="sel-inline" aria-label="Category">${S.categories.map(c=>`<option value="${c.id}" ${c.id===(f!=='all'?f:S.settings.defaultCat)?'selected':''}>${esc(c.name)}</option>`).join('')}</select><button class="txt-btn green" data-a="newSession">New Session</button></div>`;
  return h;
}
function vSession(v){
  const s=sesById(v.id);if(!s) return gone();
  const sets=sesSets(s);
  let h=topBar(esc(sesName(s)),{right:`<button class="icon-btn" data-a="delSession" data-id="${s.id}" aria-label="Delete session">${I.trash}</button>`});
  h+=`<div class="center dim mb">${fmtDay(s.start)}, ${fmtTime(s.start)}</div>`;
  h+=`<div class="card">
    <div class="row"><span class="grow">Category</span><select class="sel-inline" data-ch="sesCat" data-id="${s.id}">${S.categories.map(x=>`<option value="${x.id}" ${x.id===s.categoryId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div class="row"><span class="grow">Routine</span><select class="sel-inline" data-ch="sesRoutine" data-id="${s.id}"><option value="">None</option>${S.routines.map(r=>`<option value="${r.id}" ${r.id===s.routineId?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>
    <div class="row"><span>Name</span><input class="tinput grow" data-ch="sesName" data-id="${s.id}" value="${esc(s.name||'')}" placeholder="${esc(sesName(Object.assign({},s,{name:''})))}"></div>
    ${s.manual?`<div class="row"><span class="grow">Duration (min)</span><input class="tinput num" type="number" inputmode="numeric" data-ch="sesDurMin" data-id="${s.id}" value="${Math.round(sesDur(s)/60)}"></div>`:''}
  </div>`;
  h+=statsCard(sets,[s]);
  h+=`<div class="sect">Notes for this session</div><div class="card"><textarea rows="3" data-ch="sesNotes" data-id="${s.id}" placeholder="e.g. cut short, low energy, slight shoulder twinge">${esc(s.notes||'')}</textarea></div>`;
  h+=coachNoteCard('session',s.id,sesName(s)+', '+fmtDay(s.start));
  h+=exBlocks(sets);
  return h;
}

/* ================= CALENDAR ================= */
function vDay(v){
  const k=v.d||dkey(Date.now()),t=fromKey(k),d=new Date(t);
  const mon=new Date(d.getFullYear(),d.getMonth(),d.getDate()-((d.getDay()+6)%7)),map=dayColorMap('all'),tk=dkey(Date.now());
  let h=topBar(fmtDay(t),{right:`<button class="icon-btn" data-a="push" data-v="month" aria-label="Month view">${I.cal}</button>`});
  h+=`<div class="wkstrip"><button class="wkarrow" data-a="dayShift" data-n="-7" aria-label="Previous week">‹</button>`;
  for(let i=0;i<7;i++){
    const dd=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i),kk=dkey(dd.getTime()),cols=map[kk]||[];
    h+=`<button class="wd ${kk===k?'on':''} ${kk===tk?'today':''}" data-a="setDay" data-d="${kk}"><span class="wl">${'MTWTFSS'[i]}</span><span class="wn">${dd.getDate()}</span><span class="wdots">${cols.map(c=>`<i style="background:${c}"></i>`).join('')}</span></button>`;
  }
  h+=`<button class="wkarrow" data-a="dayShift" data-n="7" aria-label="Next week">›</button></div>`;
  const sess=S.sessions.filter(s=>dkey(s.start)===k).sort((a,b)=>a.start-b.start);
  const sets=S.sets.filter(s=>dkey(s.ts)===k).sort((a,b)=>a.ts-b.ts);
  const sch=onDay(d.getDay());
  if(!sess.length&&!sets.length){
    h+=empty(t>Date.now()?'Nothing logged yet':'No activity',sch.length?`Scheduled: ${esc(sch.map(r=>r.name).join(', '))}`:'Rest day');
  }else{
    h+=statsCard(sets,sess);
    h+=`<div class="sect">Sessions</div><div class="card">${sess.map(s=>{const c=catById(s.categoryId);return `<div class="row tap" data-a="push" data-v="session" data-id="${s.id}"><i class="dot" style="background:${c.color}"></i><div class="grow"><div>${esc(sesName(s))}</div><div class="sub">${fmtTime(s.start)}, ${fmtHM(sesDur(s))}</div></div>${I.chev}</div>`}).join('')}</div>`;
    h+=exBlocks(sets);
  }
  if(sch.length&&(sess.length||sets.length)) h+=`<div class="foot">Scheduled for ${DOWL[d.getDay()]}: ${esc(sch.map(r=>r.name).join(', '))}</div>`;
  return h;
}
function vMonth(){
  const f=S.settings.calFilter||'all',map=dayColorMap(f),now=new Date(),tk=dkey(Date.now());
  let h=topBar('Calendar',{right:`<button class="txt-btn" data-a="calToday">Today</button>`})+catChips(f,'calFilter');
  let first=Date.now();
  for(const s of S.sessions) if(s.start<first) first=s.start;
  let y=new Date(first).getFullYear(),m=new Date(first).getMonth();
  const minD=new Date(now.getFullYear(),now.getMonth()-2,1);
  if(new Date(y,m,1)>minD){y=minD.getFullYear();m=minD.getMonth()}
  h+=`<div class="calhead">${'MTWTFSS'.split('').map(x=>`<span>${x}</span>`).join('')}</div>`;
  while(y<now.getFullYear()||(y===now.getFullYear()&&m<=now.getMonth())){
    const off=(new Date(y,m,1).getDay()+6)%7,nd=new Date(y,m+1,0).getDate(),isCur=y===now.getFullYear()&&m===now.getMonth();
    let cnt=0,cells='';
    for(let i=1;i<=nd;i++){
      const k=`${y}-${pad(m+1)}-${pad(i)}`,cols=map[k];if(cols) cnt++;
      const bg=cols?(cols.length===1?cols[0]:`linear-gradient(135deg,${cols.map((c,j)=>`${c} ${Math.round(j*100/cols.length)}% ${Math.round((j+1)*100/cols.length)}%`).join(',')})`):'';
      cells+=`<button class="cd ${cols?'act':''} ${k===tk?'today':''} ${k>tk?'fut':''}" ${bg?`style="background:${bg}"`:''} data-a="calPick" data-d="${k}">${i}</button>`;
    }
    h+=`<div class="calm" ${isCur?'id="calcur"':''}><div class="calmt">${MONL[m]} ${y} <span class="dim sm" style="font-weight:400">${cnt} ${cnt===1?'day':'days'}</span></div><div class="calg">${'<span></span>'.repeat(off)}${cells}</div></div>`;
    if(++m>11){m=0;y++}
  }
  return h;
}

/* ================= coach notes & circuits ================= */
function coachNoteCard(target,id,name){
  const n=coachNote(target,id);
  if(CTX.client) return `<div class="cnote tap ${n?'':'empty'}" data-a="editCoachNote" data-t="${target}" data-id="${id}" data-name="${esc(name)}"><div class="cnote-h">${I.coach}<span>${n?'Your coach note':'Add a coach note or cue'}</span></div>${n?`<div class="cnote-b">${esc(n.text)}</div>`:''}</div>`;
  if(!n) return '';
  return `<div class="cnote"><div class="cnote-h">${I.coach}<span>From ${esc(n.author||'your coach')}</span></div><div class="cnote-b">${esc(n.text)}</div></div>`;
}
function circuitCard(ex){
  const c=ex.circuit||{minutes:10,items:[]};
  return `<div class="card pad circ"><div class="rc-top"><span class="pill" style="--c:#ff9f7a">${c.minutes} min circuit</span><span class="dim sm">As many rounds as possible</span></div>
    ${c.items.length?`<ol class="circ-items">${c.items.map(i=>`<li>${esc(i)}</li>`).join('')}</ol>`:'<div class="dim sm">No movements listed yet.</div>'}
    <div class="circ-btns"><button class="abtn sm" data-a="timerStart" data-id="${ex.id}">${I.play}<span>Start ${c.minutes}:00 timer</span></button><button class="txt-btn" data-a="editCircuit" data-id="${ex.id}">Edit</button></div></div>`;
}

/* ================= NOTIFICATIONS & INSIGHTS ================= */
let NOTIFS=null;
function vNotifs(){
  let h=topBar('Notifications');
  if(!NOTIFS) return h+empty('Loading…','');
  if(!NOTIFS.length) return h+empty('Nothing yet','Plan changes from your coach and other updates appear here.');
  const pendingIds=new Set((Auth.me.coaches||[]).filter(c=>c.status==='pending').map(c=>c.id));
  return h+`<div class="card">${NOTIFS.map(n=>{
    const d=n.data||{},inv=n.type==='invite'&&pendingIds.has(d.coachId);
    const link=d.kind==='routine'?`data-a="notifGo" data-k="routine" data-id="${d.id}"`:d.kind==='exercise'?`data-a="notifGo" data-k="exercise" data-id="${d.id}"`:d.kind==='session'?`data-a="notifGo" data-k="session" data-id="${d.id}"`:n.type==='reset'?'data-a="adminGoResets"':'';
    return `<div class="row ${n.read_at?'':'unread'} ${link?'tap':''}" ${link}><div class="grow"><div>${esc(n.text)}</div><div class="sub">${ago(n.created_at)}, ${fmtTime(n.created_at)}</div>
      ${inv?`<div class="chips mt"><button class="chip on" style="--c:${COL.green}" data-a="linkRespond" data-id="${d.coachId}" data-ok="1">Accept</button><button class="chip" data-a="linkRespond" data-id="${d.coachId}">Decline</button></div>`:''}</div>${link?I.chev:''}</div>`}).join('')}</div>`;
}
function vInsights(){
  const ins=computeInsights();
  return topBar('Insights')+(ins.length?`<div class="card">${insightRows(ins)}</div><div class="foot">Based on your schedule, sessions, lifts and notes from the last few weeks. Your coach sees the same insights.</div>`:empty('Nothing to flag','Insights appear once you have a few weeks of training logged.'));
}

/* ================= SETTINGS ================= */
function vSettings(){
  const st=S.settings;
  const u=Auth.user(),coaches=Auth.me.coaches||[];
  const syncTxt={ok:'Up to date',syncing:'Syncing…',offline:'Offline, will sync when connected',error:'Problem: '+esc(Sync.error),idle:'Waiting'}[Sync.status]||'';
  const pend=Sync.pendingCount();
  return topBar('Settings')+`
  <div class="sect">Account</div><div class="card">
    <div class="row"><span class="grow">Signed in as</span><b>${esc(u.username)}</b>${u.role!=='user'?`<span class="pill" style="--c:${u.role==='admin'?COL.yellow:COL.blue}">${u.role==='admin'?'Super admin':'PT'}</span>`:''}</div>
    <div class="row tap" data-a="changePassword"><span class="grow">Change password</span>${I.chev}</div>
    <div class="row tap red" data-a="logout"><span class="grow">Log out</span></div>
  </div>
  <div class="sect">Sync</div><div class="card">
    <div class="row"><div class="grow"><div>${syncTxt}</div><div class="sub">${Sync.lastOk?'Last synced '+ago(Sync.lastOk).toLowerCase()+', '+fmtTime(Sync.lastOk):'Not synced yet on this device'}${pend?` · ${pend} change${pend>1?'s':''} waiting to upload`:''}</div></div><button class="txt-btn sm" data-a="syncNow">Sync now</button></div>
  </div><div class="foot">Everything is saved on this device first and works offline. It syncs to your account whenever you're online, so you can sign in on any device.</div>
  <div class="sect">Coaching</div><div class="card">
    ${coaches.length?coaches.map(c=>`<div class="row"><div class="grow"><div>${esc(c.username)}</div><div class="sub">${c.status==='active'?'Your coach: can see your training and update your plan':'Wants to coach you'}</div></div>${c.status==='active'?`<button class="txt-btn sm" data-a="linkRemove" data-id="${c.id}" data-name="${esc(c.username)}">Remove</button>`:`<button class="chip on" style="--c:${COL.green}" data-a="linkRespond" data-id="${c.id}" data-ok="1">Accept</button><button class="chip" data-a="linkRespond" data-id="${c.id}">Decline</button>`}</div>`).join(''):'<div class="row dim">No coach. A PT can invite you using your username.</div>'}
  </div>`+`
  <div class="sect">Weights</div><div class="card">
    <div class="row"><span class="grow">Unit</span><div class="seg sm">${['kg','lb'].map(u=>`<button class="${st.unit===u?'on':''}" data-a="setUnit" data-u="${u}">${u}</button>`).join('')}</div></div>
    <div class="row"><span class="grow">Small step when logging</span><input class="tinput num" type="number" inputmode="decimal" step="any" data-ch="setting" data-k="step1" value="${st.step1}"></div>
    <div class="row"><span class="grow">Big step when logging</span><input class="tinput num" type="number" inputmode="decimal" step="any" data-ch="setting" data-k="step2" value="${st.step2}"></div>
  </div><div class="foot">Switching units relabels your numbers; it doesn't convert them.</div>
  <div class="sect">Sessions</div><div class="card">
    <div class="row"><span class="grow">Start a new session after a break of (min)</span><input class="tinput num" type="number" inputmode="numeric" data-ch="setting" data-k="gapMin" value="${st.gapMin}"></div>
    <div class="row"><span class="grow">Default category</span><select class="sel-inline" data-ch="setting" data-k="defaultCat">${S.categories.map(c=>`<option value="${c.id}" ${c.id===st.defaultCat?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
  </div><div class="foot">Sets are grouped into sessions automatically. A set logged from a routine takes that routine's category.</div>
  <div class="sect">Categories</div><div class="card">
    ${S.categories.map(c=>`<div class="row"><input type="color" class="colr" data-ch="catColor" data-id="${c.id}" value="${c.color}" aria-label="Colour"><input class="tinput left grow" data-ch="catName" data-id="${c.id}" value="${esc(c.name)}"><button class="mini red" data-a="delCat" data-id="${c.id}" aria-label="Delete category">${I.trash}</button></div>`).join('')}
    <div class="row tap green" data-a="addCat"><span class="ic">${I.plus}</span><span>Add category</span></div>
  </div>
  <div class="sect">Your data</div><div class="card">
    <div class="row tap" data-a="exportData"><span class="grow">Export backup</span>${I.chev}</div>
    <label class="row tap"><span class="grow">Import backup (adds to your account)</span>${I.chev}<input type="file" accept=".json,application/json" data-ch="importData" hidden></label>
    ${!S.sets.length?`<div class="row tap" data-a="demo"><span class="grow">Load demo data</span>${I.chev}</div>`:''}
    <div class="row tap red" data-a="wipe"><span class="grow">Delete all my training data</span></div>
  </div>
  <div class="sect">About</div><div class="card">
    <div class="row"><span class="grow">App version</span><span class="dim">${APP_VERSION}</span></div>
    <div class="row"><span class="grow">Server</span><span class="dim" id="srv">Checking…</span></div>
  </div>
  <div class="foot">“Delete all my training data” removes it from your account on every device. Backups are a spare copy; your account already keeps everything.${memOnly?' <b class="red">Storage isn\'t available on this device, so changes only save while online.</b>':''}</div>`;
}
const V={home:vHome,workouts:vWorkouts,exercises:vExercises,routine:vRoutine,ex:vEx,set:vSetEdit,sessions:vSessions,session:vSession,day:vDay,month:vMonth,settings:vSettings,notifs:vNotifs,insights:vInsights};
