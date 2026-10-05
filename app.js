/* ================= navigation ================= */
/* Per-tab page stacks (like iOS), plus one global history so Back always returns
   to wherever you just were — including across tabs (e.g. Home → My Workouts → Back). */
let stacks,tab='home',lastKey='',restInt=null,OPEN=null,HIST=[],navDepth=0,ignorePop=0;
function resetNav(){stacks={home:[{v:'home'}],workouts:[{v:'workouts'}],sessions:[{v:'sessions'}],calendar:[{v:'day',d:dkey(Date.now())}],coach:[{v:'coach'}]};HIST=[]}
resetNav();
const stack=()=>stacks[tab];
const cur=()=>stack()[stack().length-1];
function render(mode){
  const main=$('#main'),v=cur();
  OPEN=null;clearInterval(restInt);
  const key=tab+'|'+stack().length+'|'+v.v+'|'+(v.id||v.d||'');
  let y=main.scrollTop;
  if(mode==='push') y=0; else if(mode==='pop') y=v._y||0; else if(key!==lastKey) y=0;
  if(!Auth.signedIn()||document.body.classList.contains('authmode')) return;
  main.dataset.v=v.v;
  const bar=CTX.client?`<div class="coachbar"><div class="grow"><b>Coaching ${esc(CTX.client.username)}</b><div id="cbstat">Changes save to their account</div></div><button data-a="exitClient">Done</button></div>`:'';
  main.classList.toggle('coaching',!!CTX.client);
  main.innerHTML=bar+(V[v.v]||vHome)(v);
  main.scrollTop=y;lastKey=key;
  $$('.tab').forEach(t=>t.classList.toggle('on',t.dataset.t===tab));
  if(v.v==='ex'){if((v.tab||'sets')==='analyze') drawChart();else if((v.tab||'sets')==='sets') startRest(v.id)}
  if(v.v==='settings') serverHealth().then(h=>{const el=$('#srv');if(el){el.textContent=h&&h.ok?(h.db?'Online':'Online (database not connected)'):'Offline';el.style.color=h&&h.ok&&h.db?COL.green:''}});
  if(/^coach/.test(v.v)&&!CTX.client) Coach.loadOverview();
  if(v.v==='adminUsers'&&!ADM.users) loadAdmin('users');
  if(v.v==='adminResets'&&!v._loaded){v._loaded=true;loadAdmin('resets')}
  if(v.v==='notifs'&&!v._loaded){v._loaded=true;loadNotifs()}
  updateBadges();
  if(v.v==='month'&&!v._scrolled){v._scrolled=true;const c=$('#calcur');if(c) main.scrollTop=c.offsetTop-90}
}
function histAdd(e){
  HIST.push(e);if(HIST.length>150) HIST.shift();
  try{history.pushState({ll:1},'');navDepth++}catch(_){}
}
function push(v){cur()._y=$('#main').scrollTop;histAdd({t:'push',tab});stack().push(v);render('push')}
function switchTab(t){
  if(t===tab) return;
  cur()._y=$('#main').scrollTop;histAdd({t:'tab',from:tab});tab=t;render('pop');
}
/* Where would Back go? Returns null if nowhere. */
function peekBack(){
  for(let i=HIST.length-1;i>=0;i--){
    const e=HIST[i];
    if(e.t==='tab') return {i,kind:'tab',tab:e.from,view:stacks[e.from][stacks[e.from].length-1]};
    if(e.tab===tab&&stack().length>1) return {i,kind:'pop',tab,view:stack()[stack().length-2]};
  }
  return stack().length>1?{i:-1,kind:'pop',tab,view:stack()[stack().length-2]}:null;
}
function doBack(){
  const p=peekBack();if(!p) return false;
  if(p.i>=0) HIST.splice(p.i);
  if(p.kind==='tab'){cur()._y=$('#main').scrollTop;tab=p.tab}else stack().pop();
  render('pop');return true;
}
/* In-app back (button, edge swipe, after deleting): update the screen now, then keep browser history in step. */
function goBack(){
  if(!doBack()) return;
  if(navDepth>0){navDepth--;ignorePop++;try{history.back()}catch(_){ignorePop--}}
}
const pop=goBack;
/* System back (Android gesture, Safari swipe, browser button) */
window.addEventListener('popstate',()=>{
  if(ignorePop>0){ignorePop--;return}
  navDepth=Math.max(0,navDepth-1);
  if($('#ov')||$('.modal')){closeSheet();try{history.pushState({ll:1},'');navDepth++}catch(_){}return}
  doBack();
});
function startRest(exId){
  const tick=()=>{
    const el=$('#rest');if(!el){clearInterval(restInt);return}
    const a=exSets(exId),L=a[a.length-1],g=L?(Date.now()-L.ts)/1000:1e9;
    if(g>=0&&g<1200) el.innerHTML=`<div class="restbar">${I.timer}<span>Rest</span><b>${fmtDur(g)}</b><span class="dim sm">since your last set</span></div>`;
    else{el.innerHTML='';clearInterval(restInt)}
  };
  tick();restInt=setInterval(tick,1000);
}

/* ================= sheets, dialogs, toast ================= */
function sheet(html,o={}){
  closeSheet();
  const ov=document.createElement('div');
  ov.className='overlay'+(o.full?' full':'');ov.id='ov';
  ov.innerHTML=`<div class="sheet" role="dialog">${html}</div>`;
  ov.addEventListener('click',e=>{if(e.target===ov) closeSheet()});
  document.body.appendChild(ov);
  if(o.mount) o.mount(ov);
}
function closeSheet(){const o=$('#ov');if(o) o.remove()}
const sheetHead=(title,act,id)=>`<div class="grab"></div><div class="sh-h"><button class="icon-btn" data-a="closeSheet" aria-label="Close">${I.x}</button><div class="title">${title}</div><button class="icon-btn greenbg" data-a="${act}" data-id="${id||''}" aria-label="Save">${I.check}</button></div>`;
function confirmBox(msg,ok='Delete',danger=true){
  return new Promise(res=>{
    const d=document.createElement('div');d.className='modal';
    d.innerHTML=`<div class="dlg"><p>${esc(msg)}</p><div class="dlg-b"><button data-r="0">Cancel</button><button data-r="1" class="${danger?'danger':'ok'}">${esc(ok)}</button></div></div>`;
    d.addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(b||e.target===d){e.stopPropagation();d.remove();res(!!b&&b.dataset.r==='1')}});
    document.body.appendChild(d);
  });
}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('on'),1700)}
let MENU=[];
function menu(items){
  MENU=items;
  sheet(`<div class="grab"></div>${items.map((it,i)=>`<button class="mbtn ${it.danger?'red':''}" data-a="menuPick" data-i="${i}">${it.label}</button>`).join('')}<button class="mbtn dim" data-a="closeSheet">Cancel</button>`);
}
const catPick=(active,grp)=>S.categories.map(c=>`<button class="chip ${c.id===active?'on':''}" style="--c:${c.color}" data-a="pickChip" data-grp="${grp}" data-val="${c.id}"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</button>`).join('');

/* ---------- log a set ---------- */
function openLog(exId,rid,pre){
  const ex=exById(exId);if(!ex) return;
  const m=M(ex),a=exSets(exId),p=a[a.length-1]||{reps:8,weight:0,duration:60,distance:1};
  const s1=+S.settings.step1||1,s2=+S.settings.step2||5;
  let h=`<div class="grab"></div><div class="lg-title">${esc(ex.name)}</div>`;
  if(m.rounds){
    const cap=(pre&&pre.capMin)||(ex.circuit&&ex.circuit.minutes)||p.capMin||10;
    const r0=pre&&pre.rounds!=null?pre.rounds:(p.rounds||0);
    h+=`<div class="lg-f"><label style="color:#ff9f7a" for="lg-rounds">Full rounds completed</label><div class="stp"><button data-a="stp" data-f="lg-rounds" data-d="-1">−</button><input id="lg-rounds" type="number" inputmode="numeric" value="${r0}"><button data-a="stp" data-f="lg-rounds" data-d="1">+</button></div></div>
    <div class="lg-f"><label for="lg-extra">Extra reps into the next round</label><div class="stp"><button data-a="stp" data-f="lg-extra" data-d="-1">−</button><input id="lg-extra" type="number" inputmode="numeric" value="${pre&&pre.extra||0}"><button data-a="stp" data-f="lg-extra" data-d="1">+</button></div></div>
    <div class="lg-f"><label for="lg-cap">Time cap (minutes)</label><div class="stp"><input id="lg-cap" type="number" inputmode="decimal" step="any" value="${cap}"></div></div>`;
  }
  if(m.reps) h+=`<div class="lg-f"><label class="green" for="lg-reps">Reps</label><div class="stp"><button data-a="stp" data-f="lg-reps" data-d="-1">−</button><input id="lg-reps" type="number" inputmode="numeric" value="${p.reps!=null?p.reps:''}"><button data-a="stp" data-f="lg-reps" data-d="1">+</button></div></div>`;
  if(m.weight) h+=`<div class="lg-f"><label class="orange" for="lg-w">Weight (${U()})</label><div class="stp"><button data-a="stp" data-f="lg-w" data-d="-${s2}">−${s2}</button><button data-a="stp" data-f="lg-w" data-d="-${s1}">−${s1}</button><input id="lg-w" type="number" inputmode="decimal" step="any" value="${p.weight!=null?p.weight:''}"><button data-a="stp" data-f="lg-w" data-d="${s1}">+${s1}</button><button data-a="stp" data-f="lg-w" data-d="${s2}">+${s2}</button></div></div>`;
  if(m.duration){const d=p.duration||0;h+=`<div class="lg-f"><label class="teal">Duration</label><div class="stp"><input id="lg-min" type="number" inputmode="numeric" value="${Math.floor(d/60)}"><span>min</span><input id="lg-sec" type="number" inputmode="numeric" value="${Math.round(d%60)}"><span>sec</span></div></div>`}
  if(m.distance) h+=`<div class="lg-f"><label class="pink" for="lg-dist">Distance (km)</label><div class="stp"><button data-a="stp" data-f="lg-dist" data-d="-0.5">−0.5</button><input id="lg-dist" type="number" inputmode="decimal" step="any" value="${p.distance!=null?p.distance:''}"><button data-a="stp" data-f="lg-dist" data-d="0.5">+0.5</button></div></div>`;
  h+=`<div class="chips" id="lg-lbl" data-val="">${[['','No label'],...Object.entries(LABELS)].map(([k,l])=>`<button class="chip ${k===''?'on':''}" data-a="pickChip" data-grp="lg-lbl" data-val="${k}">${l}</button>`).join('')}</div>`;
  h+=`<div class="lg-row"><input id="lg-note" type="text" placeholder="Add note for this set" autocomplete="off"></div><div class="lg-row mt"><span class="dim grow">When</span><input id="lg-dt" type="datetime-local" value="${toLocalInput(Date.now())}" data-ch="touch" aria-label="Date and time"></div>`;
  h+=`<button class="savebtn" data-a="lgSave" data-id="${exId}" data-rid="${rid||''}" aria-label="Save set">${I.check}</button>`;
  sheet(h);
}

/* ---------- picker (add/remove exercises) ---------- */
let PK={mode:'mine',rid:null};
function openPicker(mode,rid){
  sheet(`<div class="pk-top"><div class="search">${I.search}<input id="pk-q" placeholder="${mode==='routine'?'Add or remove':'Search or add'}" autocomplete="off" autocorrect="off" autocapitalize="words" enterkeyhint="done"></div><button class="icon-btn" data-a="closeSheet" aria-label="Close">${I.x}</button></div><div id="pk-list"></div>`,
  {full:true,mount(){
    PK={mode,rid};
    const q=$('#pk-q');
    q.addEventListener('input',drawPicker);
    q.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();pkEnter()}});
    drawPicker();setTimeout(()=>q.focus(),60);
  }});
}
function pkRow(e,inR){
  if(PK.mode==='routine') return `<div class="row tap" data-a="pkToggle" data-id="${e.id}"><span class="pkic ${inR?'on':''}">${inR?I.check:I.plus}</span><span class="grow">${esc(e.name)}</span><button class="chevbtn" data-a="pkOpen" data-id="${e.id}" aria-label="Open">${I.chev}</button></div>`;
  const ld=lastDone(e.id);
  return `<div class="row tap" data-a="pkOpen" data-id="${e.id}"><span class="grow">${esc(e.name)}</span><span class="ago">${ld?ago(ld):''}</span>${I.chev}</div>`;
}
function drawPicker(){
  const box=$('#pk-list');if(!box) return;
  const q=($('#pk-q').value||'').trim(),ql=q.toLowerCase(),r=PK.mode==='routine'?rtById(PK.rid):null;
  const match=n=>!ql||n.toLowerCase().includes(ql);
  const mine=S.exercises.filter(e=>match(e.name)).sort(byName);
  const mineNames=new Set(S.exercises.map(e=>e.name.toLowerCase()));
  const lib=LIB.filter(n=>!mineNames.has(n.toLowerCase())&&match(n)).sort();
  const exact=mineNames.has(ql)||LIB.some(n=>n.toLowerCase()===ql);
  let h='';
  h+=`<div class="card"><div class="row tap" data-a="newCircuit" data-name="${esc(q)}"><span class="pkic" style="color:#ff9f7a">${I.circuit}</span><div class="grow"><div>Create a circuit${q?` “${esc(q)}”`:''}</div><div class="sub">Rounds completed in a fixed time</div></div></div></div>`;
  if(q&&!exact) h+=`<div class="card"><div class="row tap green" data-a="pkNew"><span class="pkic">${I.plus}</span><span class="grow">Create “${esc(q)}”</span><span class="dim sm">or press Enter</span></div></div>`;
  if(r){
    const inR=r.exerciseIds.map(exById).filter(e=>e&&match(e.name));
    if(inR.length) h+=`<div class="sect">In this routine</div><div class="card">${inR.map(e=>pkRow(e,true)).join('')}</div>`;
    const others=mine.filter(e=>!r.exerciseIds.includes(e.id));
    if(others.length) h+=`<div class="sect">My exercises</div><div class="card">${others.map(e=>pkRow(e,false)).join('')}</div>`;
  }else if(mine.length) h+=`<div class="sect">My exercises</div><div class="card">${mine.map(e=>pkRow(e,false)).join('')}</div>`;
  if(lib.length) h+=`<div class="sect">Exercise library</div><div class="card">${lib.map(n=>`<div class="row tap" data-a="pkLib" data-name="${esc(n)}"><span class="pkic">${I.plus}</span><span class="grow">${esc(n)}</span></div>`).join('')}</div>`;
  box.innerHTML=h||empty('No matches','');
}
function pkEnter(){
  const inp=$('#pk-q');const q=(inp&&inp.value||'').trim();if(!q) return;
  const ex=S.exercises.find(e=>e.name.toLowerCase()===q.toLowerCase());
  if(ex){
    if(PK.mode==='routine'){A.pkToggle({dataset:{id:ex.id}});inp.value='';drawPicker()}
    else A.pkOpen({dataset:{id:ex.id}});
    return;
  }
  const lib=LIB.find(n=>n.toLowerCase()===q.toLowerCase());
  pkAdd(lib||q);
}
function pkAdd(name){
  const e=makeEx(name);S.exercises.push(e);
  if(PK.mode==='routine'){
    const r=rtById(PK.rid);if(r) r.exerciseIds.push(e.id);
    IX=null;save();render();
    const q=$('#pk-q');if(q) q.value='';
    drawPicker();toast(`Added ${name}`);
  }else{IX=null;save();closeSheet();push({v:'ex',id:e.id,tab:'sets'})}
}

/* ---------- other sheets ---------- */
function openRoutineEdit(id){
  const r=id?rtById(id):{name:'',subtitle:'',categoryId:S.settings.defaultCat,days:[],exerciseIds:[]};
  if(!r) return;
  sheet(`${sheetHead(id?'Edit Routine':'New Routine','saveRoutine',id)}
  <div class="card"><div class="row"><input id="re-name" class="tinput left grow big" placeholder="Name, e.g. Push" value="${esc(r.name)}" autocapitalize="words"></div><div class="row"><input id="re-sub" class="tinput left grow" placeholder="Description, e.g. Chest focus" value="${esc(r.subtitle||'')}"></div></div>
  <div class="sect">Category</div><div class="chips" id="re-cat" data-val="${r.categoryId}">${catPick(r.categoryId,'re-cat')}</div>
  <div class="sect">Days of the week</div><div class="daypick" id="re-days">${WEEK.map(d=>`<button class="dp ${r.days.includes(d)?'on':''}" data-a="toggleOn" data-d="${d}">${DOW[d].slice(0,2)}</button>`).join('')}</div>
  <div class="foot mt">The Overview page shows this routine on the days you pick.</div>
  ${id?`<div class="card mt"><div class="row tap red" data-a="delRoutine" data-id="${id}"><span class="ic">${I.trash}</span><span>Delete routine</span></div></div>`:''}`,
  {mount(){if(!id) setTimeout(()=>{const n=$('#re-name');if(n) n.focus()},80)}});
}
function openProps(id){
  const ex=exById(id),m=M(ex);
  const rows=[['duration','Duration',I.timer],['reps','Repetitions',I.hash],['weight','Weight',I.kettle],['distance','Distance',I.ruler]];
  sheet(`${sheetHead(`Properties<div class="dim">${esc(ex.name)}</div>`,'saveProps',id)}
  <div class="sect">Tracked metrics</div><div class="card" id="props">${rows.map(([k,l,ic])=>`<div class="row tap" data-a="tog" data-k="${k}"><span class="ic green">${ic}</span><span class="grow">${l}</span><span class="tog ${m[k]?'on':''}"></span></div>`).join('')}</div>
  <div class="foot">Only the metrics you enable are captured when recording sets, and they shape what's shown in this exercise's history and analytics.</div>`);
}
function openInfo(id){
  const ex=exById(id);
  sheet(`${sheetHead('Edit Exercise','saveInfo',id)}
  <div class="card"><div class="row"><input id="in-name" class="tinput left grow big" value="${esc(ex.name)}" placeholder="Name"></div></div>
  <div class="sect">Notes</div><div class="card"><textarea id="in-notes" rows="4" placeholder="Machine settings, cues, seat height…">${esc(ex.notes||'')}</textarea></div>
  <div class="foot">Notes appear in smaller text under the exercise name in every list.</div>`);
}
function openAddTo(id){
  const ex=exById(id);
  if(!S.routines.length){toast('Create a routine first');return}
  sheet(`${sheetHead('Add to Routine','saveAddTo',id)}<div class="card" id="addto">${S.routines.map(r=>`<div class="row tap" data-a="tog" data-k="${r.id}"><span class="grow">${esc(r.name)}</span><span class="tog ${r.exerciseIds.includes(ex.id)?'on':''}"></span></div>`).join('')}</div>`);
}
function openAssign(d){
  if(!S.routines.length){sheet(`<div class="grab"></div><div class="empty"><b>No routines yet</b>Create a routine first, then assign it to ${DOWL[d]}.</div><button class="mbtn green" data-a="newRoutine">New Routine…</button>`);return}
  sheet(`${sheetHead(DOWL[d],'saveAssign',d)}<div class="card" id="assign">${S.routines.map(r=>`<div class="row tap" data-a="tog" data-k="${r.id}"><span class="ic" style="color:${catById(r.categoryId).color}">${I.book}</span><span class="grow">${esc(r.name)}</span><span class="tog ${r.days.includes(+d)?'on':''}"></span></div>`).join('')}</div><div class="foot">Leave everything off to make it a rest day.</div>`);
}

/* ================= actions ================= */
const A={
  back:()=>goBack(),
  closeSheet:()=>closeSheet(),
  tab:el=>{const t=el.dataset.t;closeSheet();if(CTX.client&&t==='coach'){Coach.exit();return}if(t===tab){HIST=HIST.filter(e=>!(e.t==='push'&&e.tab===t));stacks[t].length=1;if(t==='calendar') stacks[t][0].d=dkey(Date.now());render('push')}else switchTab(t)},
  push:el=>push({v:el.dataset.v,id:el.dataset.id}),
  toggleEdit:()=>{cur().edit=!cur().edit;render()},
  moveR:el=>{const i=S.routines.findIndex(r=>r.id===el.dataset.id),j=i+(+el.dataset.d);if(j<0||j>=S.routines.length) return;[S.routines[i],S.routines[j]]=[S.routines[j],S.routines[i]];commit()},
  newRoutine:()=>openRoutineEdit(null),
  editRoutine:el=>openRoutineEdit(el.dataset.id),
  saveRoutine:el=>{
    const name=$('#re-name').value.trim();if(!name){toast('Give the routine a name');return}
    const days=$$('#re-days .dp.on').map(b=>+b.dataset.d),cat=$('#re-cat').dataset.val,sub=$('#re-sub').value.trim();
    let r;
    if(el.dataset.id){r=rtById(el.dataset.id);Object.assign(r,{name,subtitle:sub,categoryId:cat,days})}
    else{r={id:uid(),name,subtitle:sub,categoryId:cat,days,exerciseIds:[]};S.routines.push(r)}
    closeSheet();IX=null;save();
    if(!el.dataset.id){if(tab!=='workouts') switchTab('workouts');push({v:'routine',id:r.id})}else{render();toast('Routine saved')}
  },
  delRoutine:async el=>{
    const r=rtById(el.dataset.id);if(!r) return;
    if(!await confirmBox(`Delete the routine “${r.name}”? Your exercises and logged sets are kept.`)) return;
    S.routines=S.routines.filter(x=>x!==r);closeSheet();IX=null;save();
    if(cur().v==='routine'&&cur().id===r.id) pop();else render();
    toast('Routine deleted');
  },
  toggleOn:el=>el.classList.toggle('on'),
  tog:el=>{const t=el.classList.contains('tog')?el:el.querySelector('.tog');if(t) t.classList.toggle('on')},
  pickChip:el=>{const g=$('#'+el.dataset.grp);g.dataset.val=el.dataset.val;$$('.on',g).forEach(x=>x.classList.remove('on'));el.classList.add('on')},
  assignDay:el=>openAssign(el.dataset.d),
  saveAssign:el=>{const d=+el.dataset.id;$$('#assign .row').forEach(row=>{const r=rtById(row.dataset.k),on=row.querySelector('.tog').classList.contains('on');r.days=r.days.filter(x=>x!==d);if(on) r.days.push(d)});closeSheet();commit()},
  openEx:el=>push({v:'ex',id:el.dataset.id,tab:'sets',rid:el.dataset.rid||null}),
  record:el=>openLog(el.dataset.id,el.dataset.rid||null),
  log:el=>openLog(el.dataset.id,el.dataset.rid||null),
  rmFromRoutine:el=>{const r=rtById(el.dataset.rid);if(!r) return;r.exerciseIds=r.exerciseIds.filter(x=>x!==el.dataset.id);commit();toast('Removed from routine')},
  delEx:async el=>{
    const id=el.dataset.id,ex=exById(id);if(!ex) return;
    const n=exSets(id).length;
    if(!await confirmBox(`Delete “${ex.name}”${n?` and its ${n} logged ${n>1?'sets':'set'}`:''}? This can't be undone.`)){closeOpen();return}
    const sids=new Set(S.sets.filter(s=>s.exerciseId===id).map(s=>s.sessionId));
    S.sets=S.sets.filter(s=>s.exerciseId!==id);S.exercises=S.exercises.filter(e=>e.id!==id);
    S.routines.forEach(r=>r.exerciseIds=r.exerciseIds.filter(x=>x!==id));
    sids.forEach(refreshSession);IX=null;save();
    if(cur().v==='ex'&&cur().id===id) pop();else render();
    toast('Exercise deleted');
  },
  exTab:el=>{cur().tab=el.dataset.t;render()},
  exMenu:el=>{const id=el.dataset.id;menu([
    {label:'Edit name and notes',fn:()=>openInfo(id)},
    isCircuit(exById(id))?{label:'Edit circuit',fn:()=>openCircuit(id)}:{label:'Tracked metrics',fn:()=>openProps(id)},
    {label:'Add to routine',fn:()=>openAddTo(id)},
    {label:'Delete exercise',danger:1,fn:()=>A.delEx({dataset:{id}})}])},
  menuPick:el=>{const it=MENU[+el.dataset.i];closeSheet();if(it) setTimeout(it.fn,0)},
  editInfo:el=>openInfo(el.dataset.id),
  saveInfo:el=>{const ex=exById(el.dataset.id),name=$('#in-name').value.trim();if(!name){toast('Name can\'t be empty');return}ex.name=name;ex.notes=$('#in-notes').value.trim();closeSheet();commit()},
  saveProps:el=>{const ex=exById(el.dataset.id),m={};$$('#props .row').forEach(r=>{if(r.querySelector('.tog').classList.contains('on')) m[r.dataset.k]=true});if(!Object.keys(m).length){toast('Track at least one metric');return}ex.metrics=m;closeSheet();commit()},
  saveAddTo:el=>{const id=el.dataset.id;$$('#addto .row').forEach(row=>{const r=rtById(row.dataset.k),on=row.querySelector('.tog').classList.contains('on');r.exerciseIds=r.exerciseIds.filter(x=>x!==id);if(on) r.exerciseIds.push(id)});closeSheet();commit();toast('Routines updated')},
  stp:el=>{const i=$('#'+el.dataset.f);i.value=Math.max(0,round2((parseFloat(i.value)||0)+(+el.dataset.d)))},
  lgSave:el=>{
    const id=el.dataset.id,ex=exById(id),m=M(ex),g=x=>{const i=$('#'+x);return i?parseFloat(i.value):NaN};
    const s={id:uid(),exerciseId:id,note:$('#lg-note').value.trim(),label:$('#lg-lbl').dataset.val||'',ts:Date.now()};
    if(m.rounds){s.rounds=Math.max(0,Math.round(g('lg-rounds')||0));s.extra=Math.max(0,Math.round(g('lg-extra')||0));s.capMin=Math.max(0,round2(g('lg-cap')||0))}
    if(m.reps) s.reps=Math.max(0,Math.round(g('lg-reps')||0));
    if(m.weight) s.weight=Math.max(0,round2(g('lg-w')||0));
    if(m.duration) s.duration=Math.max(0,(g('lg-min')||0)*60+(g('lg-sec')||0));
    if(m.distance) s.distance=Math.max(0,round2(g('lg-dist')||0));
    const dt=$('#lg-dt');if(dt&&dt.dataset.touched&&dt.value){const t=new Date(dt.value).getTime();if(!isNaN(t)) s.ts=t}
    if(m.reps&&!s.reps&&!(m.duration&&s.duration)){toast('Enter the number of reps');return}
    attach(s,el.dataset.rid||null);S.sets.push(s);closeSheet();commit();toast('Set logged');
  },
  repeatSet:el=>{
    const s=S.sets.find(x=>x.id===el.dataset.id);if(!s) return;
    const n=Object.assign({},s,{id:uid(),ts:Date.now()});delete n.sessionId;
    attach(n,cur().rid||null);S.sets.push(n);commit();toast('Set repeated');
  },
  delSet:async el=>{
    const s=S.sets.find(x=>x.id===el.dataset.id);if(!s) return;
    if(!await confirmBox('Delete this set?')){closeOpen();return}
    S.sets=S.sets.filter(x=>x!==s);refreshSession(s.sessionId);IX=null;save();
    if(el.dataset.pop) pop();else render();
    toast('Set deleted');
  },
  editSet:el=>push({v:'set',id:el.dataset.id}),
  saveSet:el=>{
    const s=S.sets.find(x=>x.id===el.dataset.id);if(!s){pop();return}
    const g=x=>{const i=$('#'+x);return i?parseFloat(i.value):undefined};
    if($('#se-reps')) s.reps=Math.max(0,Math.round(g('se-reps')||0));
    if($('#se-w')) s.weight=Math.max(0,round2(g('se-w')||0));
    if($('#se-dur')) s.duration=Math.max(0,g('se-dur')||0);
    if($('#se-dist')) s.distance=Math.max(0,round2(g('se-dist')||0));
    s.note=$('#se-note').value.trim();s.label=$('#se-lbl').value;s.exerciseId=$('#se-ex').value;
    let tm=$('#se-time').value||'00:00:00';if(tm.length===5) tm+=':00';
    const t=new Date($('#se-date').value+'T'+tm).getTime(),old=s.sessionId;
    if(!isNaN(t)&&t!==s.ts){s.ts=t;attach(s,null);if(old!==s.sessionId) refreshSession(old)}
    refreshSession(s.sessionId);IX=null;save();pop();toast('Set saved');
  },
  gset:el=>{S.settings.graph[el.dataset.k]=el.dataset.val;save();render()},
  gser:el=>{const g=S.settings.graph.series;g[el.dataset.k]=!g[el.dataset.k];save();render()},
  ormToggle:()=>{const ex=exById(cur().id);ex.orm=ex.orm||{formula:'brzycki'};ex.orm.on=!ex.orm.on;commit()},
  ormOpen:()=>{cur().fopen=!cur().fopen;render()},
  ormF:el=>{const ex=exById(cur().id);ex.orm=ex.orm||{on:false};ex.orm.formula=el.dataset.f;commit()},
  goDay:el=>push({v:'day',d:el.dataset.d}),
  setDay:el=>{cur().d=el.dataset.d;render()},
  dayShift:el=>{const d=new Date(fromKey(cur().d||dkey(Date.now())));d.setDate(d.getDate()+(+el.dataset.n));cur().d=dkey(d.getTime());render()},
  calPick:el=>{const k=el.dataset.d,st=stack(),below=st[st.length-2];if(below&&below.v==='day'){below.d=k;goBack()}else{st[st.length-1]={v:'day',d:k};render('push')}},
  calToday:()=>{const c=$('#calcur');if(c) $('#main').scrollTo({top:c.offsetTop-90,behavior:'smooth'})},
  setFilter:el=>{S.settings[el.dataset.k]=el.dataset.val;save();render()},
  addCat:()=>{const i=S.categories.length%PALETTE.length;sheet(`${sheetHead('New Category','saveCat','')}<div class="card"><div class="row"><input id="cat-name" class="tinput left grow big" placeholder="e.g. Running, BJJ, Yoga" autocapitalize="words"></div></div><div class="sect">Colour</div><div class="chips" id="cat-col" data-val="${PALETTE[i]}">${PALETTE.map((c,j)=>`<button class="swatch ${j===i?'on':''}" style="background:${c}" data-a="pickChip" data-grp="cat-col" data-val="${c}" aria-label="Colour ${c}"></button>`).join('')}</div>`,{mount(){setTimeout(()=>{const n=$('#cat-name');if(n) n.focus()},80)}})},
  saveCat:()=>{const name=$('#cat-name').value.trim();if(!name){toast('Give the category a name');return}S.categories.push({id:uid(),name,color:$('#cat-col').dataset.val});closeSheet();commit();toast('Category added')},
  delCat:async el=>{
    if(S.categories.length<=1){toast('You need at least one category');return}
    const c=S.categories.find(x=>x.id===el.dataset.id);if(!c) return;
    const fb=S.categories.find(x=>x.id!==c.id);
    if(!await confirmBox(`Delete “${c.name}”? Its sessions and routines move to “${fb.name}”.`)) return;
    S.categories=S.categories.filter(x=>x!==c);
    S.sessions.forEach(s=>{if(s.categoryId===c.id) s.categoryId=fb.id});
    S.routines.forEach(r=>{if(r.categoryId===c.id) r.categoryId=fb.id});
    ['defaultCat'].forEach(k=>{if(S.settings[k]===c.id) S.settings[k]=fb.id});
    ['sessFilter','calFilter'].forEach(k=>{if(S.settings[k]===c.id) S.settings[k]='all'});
    commit();
  },
  newSession:()=>{
    const sel=$('#ns-cat'),cat=sel?sel.value:S.settings.defaultCat;
    sheet(`${sheetHead('New Session','saveNewSession','')}
    <div class="sect">Category</div><div class="chips" id="ns-c" data-val="${cat}">${catPick(cat,'ns-c')}</div>
    <div class="card"><div class="row"><input id="ns-name" class="tinput left grow" placeholder="Name (optional), e.g. 5k run"></div>
    <div class="row"><span class="grow">Start</span><input id="ns-dt" type="datetime-local" value="${toLocalInput(Date.now())}"></div>
    <div class="row"><span class="grow">Duration (min)</span><input id="ns-dur" class="tinput num" type="number" inputmode="numeric" placeholder="45"></div></div>
    <div class="sect">Notes</div><div class="card"><textarea id="ns-notes" rows="3" placeholder="How did it go?"></textarea></div>
    <div class="foot">Strength sessions are created automatically as you log sets. Use this for runs, classes, sparring and anything else.</div>`);
  },
  saveNewSession:()=>{
    const t=new Date($('#ns-dt').value).getTime(),start=isNaN(t)?Date.now():t,dur=Math.max(0,parseFloat($('#ns-dur').value)||0)*60;
    S.sessions.push({id:uid(),manual:true,start,end:start+dur*1000,duration:dur,categoryId:$('#ns-c').dataset.val,name:$('#ns-name').value.trim(),notes:$('#ns-notes').value.trim(),routineId:null});
    closeSheet();commit();toast('Session added');
  },
  delSession:async el=>{
    const s=sesById(el.dataset.id);if(!s) return;const n=sesSets(s).length;
    if(!await confirmBox(`Delete this session${n?` and its ${n} ${n>1?'sets':'set'}`:''}?`)) return;
    S.sets=S.sets.filter(x=>x.sessionId!==s.id);S.sessions=S.sessions.filter(x=>x!==s);IX=null;save();pop();toast('Session deleted');
  },
  picker:el=>openPicker(el.dataset.mode,el.dataset.id||null),
  pkToggle:el=>{const r=rtById(PK.rid);if(!r) return;const id=el.dataset.id;if(r.exerciseIds.includes(id)) r.exerciseIds=r.exerciseIds.filter(x=>x!==id);else r.exerciseIds.push(id);IX=null;save();render();drawPicker()},
  pkLib:el=>pkAdd(el.dataset.name),
  pkNew:()=>pkEnter(),
  pkOpen:el=>{const rid=PK.mode==='routine'?PK.rid:null;closeSheet();push({v:'ex',id:el.dataset.id,tab:'sets',rid})},
  setUnit:el=>{S.settings.unit=el.dataset.u;commit()},
  exportData:async()=>{
    const txt=JSON.stringify(S),name=`trainingtracker-backup-${dkey(Date.now())}.json`;
    try{const file=new File([txt],name,{type:'application/json'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Training Tracker backup'});return}
    }catch(e){if(e&&e.name==='AbortError') return}
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'application/json'}));a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
  },
  demo:async()=>{if(S.sets.length){toast('Demo data only loads into an empty account');return}if(!await confirmBox('Add sample routines and 3 months of sample workouts to your account? You can delete them later with “Delete all my training data”.','Add demo',false)) return;loadDemo();IX=null;save();resetNav();tab='home';render('push');toast('Demo data loaded')},
  wipe:async()=>{
    if(!await confirmBox('Delete ALL your exercises, sets, sessions and routines from your account, on every device? This can\'t be undone.','Delete everything')) return;
    if(!await confirmBox('Are you sure? Consider exporting a backup first.','Yes, delete')) return;
    for(const c of ['exercises','sets','sessions','routines']) S[c]=[];
    IX=null;save();resetNav();tab='home';render('push');toast('All training data deleted');
  },
  /* ---- accounts, sync, notifications ---- */
  authGo:el=>showAuth(el.dataset.m,{username:($('#main [name=username]')||{}).value||''}),
  authSignOutHard:()=>{Store.setAuth(null);Auth.state=null;showAuth('login')},
  logout:()=>Auth.logout(),
  changePassword:()=>{AV.forced=false;sheet(`${sheetHead('Change password','closeSheet','')}<form data-form="authChange" class="aform insheet">${fieldP('current','Current password','current-password')}${fieldP('next','New password','new-password')}${fieldP('confirm','Confirm new password','new-password')}<button class="savebtn" type="submit">${I.check}</button></form>`)},
  syncNow:async()=>{toast('Syncing…');await Sync.run();render();toast(Sync.status==='ok'?'Up to date':Sync.error||'Offline')},
  adminGoResets:()=>{if(tab!=='coach') switchTab('coach');push({v:'adminResets'})},
  notifGo:el=>{const k=el.dataset.k,id=el.dataset.id;
    if(k==='routine'&&rtById(id)) push({v:'routine',id});
    else if(k==='exercise'&&exById(id)) push({v:'ex',id,tab:'sets'});
    else if(k==='session'&&sesById(id)) push({v:'session',id});
    else toast('That item is no longer there')},
  linkRespond:async el=>{try{await API.post('/api/links/respond',{coachId:el.dataset.id,accept:!!el.dataset.ok});toast(el.dataset.ok?'Coach accepted':'Invite declined');await Auth.refreshMe();if(cur().v==='notifs') loadNotifs();render()}catch(e){toast(e.message)}},
  linkRemove:async el=>{if(!await confirmBox(`Stop sharing your training with ${el.dataset.name}? They won't be able to see or change it.`,'Remove')) return;try{await API.post('/api/links/remove',{coachId:el.dataset.id});await Auth.refreshMe();render();toast('Coach removed')}catch(e){toast(e.message)}},
  /* ---- coach notes ---- */
  editCoachNote:el=>{const n=coachNote(el.dataset.t,el.dataset.id);
    sheet(`${sheetHead('Coach note','saveCoachNote','')}<div class="dim sm mb">${esc(el.dataset.name)}</div><div class="card"><textarea id="cn-text" rows="5" placeholder="Cues, form notes, targets. Your client sees this.">${esc(n?n.text:'')}</textarea></div><div class="foot">Leave it empty to remove the note.</div><input type="hidden" id="cn-t" value="${el.dataset.t}"><input type="hidden" id="cn-id" value="${el.dataset.id}"><input type="hidden" id="cn-name" value="${esc(el.dataset.name)}">`,{mount(){setTimeout(()=>{const x=$('#cn-text');if(x) x.focus()},80)}})},
  saveCoachNote:()=>{const target=$('#cn-t').value,targetId=$('#cn-id').value,id=noteId(target,targetId),text=$('#cn-text').value.trim();
    let n=S.coachNotes.find(x=>x.id===id);
    if(!n){n={id,target,targetId};S.coachNotes.push(n)}
    Object.assign(n,{text,targetName:$('#cn-name').value,author:Auth.user().username});
    closeSheet();commit();toast(text?'Note saved':'Note removed')},
  /* ---- circuits ---- */
  newCircuit:el=>{const name=el.dataset.name||'';closeSheet();openCircuit(null,name,PK.mode==='routine'?PK.rid:null)},
  editCircuit:el=>openCircuit(el.dataset.id),
  saveCircuit:el=>{const name=$('#ci-name').value.trim();if(!name){toast('Give the circuit a name');return}
    const minutes=Math.max(1,round2(parseFloat($('#ci-min').value)||10)),items=$('#ci-items').value.split('\n').map(x=>x.trim()).filter(Boolean);
    let ex=el.dataset.id&&exById(el.dataset.id);
    if(ex){Object.assign(ex,{name,circuit:{minutes,items}});closeSheet();commit();return}
    ex=Object.assign(makeEx(name),{kind:'circuit',circuit:{minutes,items},metrics:{rounds:true}});S.exercises.push(ex);
    const r=el.dataset.rid&&rtById(el.dataset.rid);if(r) r.exerciseIds.push(ex.id);
    closeSheet();IX=null;save();push({v:'ex',id:ex.id,tab:'sets',rid:el.dataset.rid||null});toast('Circuit created')},
  timerStart:el=>CT.start(el.dataset.id),
  tRound:()=>CT.round(1),tUndo:()=>CT.round(-1),tPause:()=>CT.pause(),tFinish:()=>CT.finish(true),
  tClose:async()=>{if(CT.rounds&&!await confirmBox('Stop the timer without logging?','Stop')) return;CT.stop();closeSheet()}
};

/* change handlers */
const C={
  touch:el=>{el.dataset.touched='1'},
  setting:el=>{const k=el.dataset.k;let v=el.value;if(['step1','step2','gapMin'].includes(k)){v=parseFloat(v);if(!(v>0)) v=defaults().settings[k]}S.settings[k]=v;commit()},
  catColor:el=>{const c=S.categories.find(x=>x.id===el.dataset.id);if(c){c.color=el.value;commit()}},
  catName:el=>{const c=S.categories.find(x=>x.id===el.dataset.id);if(c&&el.value.trim()){c.name=el.value.trim();commit()}},
  sesCat:el=>{sesById(el.dataset.id).categoryId=el.value;commit()},
  sesRoutine:el=>{const s=sesById(el.dataset.id);s.routineId=el.value||null;const r=rtById(s.routineId);if(r&&r.categoryId) s.categoryId=r.categoryId;commit()},
  sesName:el=>{sesById(el.dataset.id).name=el.value.trim();commit()},
  sesNotes:el=>{sesById(el.dataset.id).notes=el.value.trim();save()},
  sesDurMin:el=>{const s=sesById(el.dataset.id);s.duration=Math.max(0,parseFloat(el.value)||0)*60;s.end=s.start+s.duration*1000;commit()},
  importData:el=>{
    const f=el.files&&el.files[0];if(!f) return;
    const rd=new FileReader();
    rd.onload=async()=>{
      try{
        const d=JSON.parse(rd.result);
        if(!Array.isArray(d.exercises)||!Array.isArray(d.sets)) throw new Error('bad');
        if(!await confirmBox(`Add the ${d.sets.length} sets in this backup to your account? Nothing is deleted.`,'Import',false)) return;
        const n=mergeBackup(d);Sync.schedule(100);resetNav();tab='home';render('push');toast(`Imported ${n} items`);
      }catch(e){toast('That file isn\'t a Training Tracker backup')}
      el.value='';
    };
    rd.readAsText(f);
  }
};

/* ================= gestures ================= */
let SW=null,swiped=false;
function suppress(){swiped=true;clearTimeout(suppress.t);suppress.t=setTimeout(()=>swiped=false,380)}
function closeOpen(){if(OPEN){OPEN.style.transform='';OPEN.dataset.off='0';OPEN=null}}
document.addEventListener('pointerdown',e=>{
  if(e.target.closest('.sw-bg')) return;
  const f=e.target.closest('.sw-front');
  if(OPEN&&OPEN!==f){closeOpen();suppress();return}
  if(!f) return;
  SW={f,x:e.clientX,y:e.clientY,base:f===OPEN?parseFloat(f.dataset.off||0):0,off:0,act:false,id:e.pointerId};
},{passive:true});
document.addEventListener('pointermove',e=>{
  if(!SW||e.pointerId!==SW.id) return;
  const dx=e.clientX-SW.x,dy=e.clientY-SW.y;
  if(!SW.act){
    if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.3){SW.act=true;SW.f.style.transition='none';try{SW.f.setPointerCapture(e.pointerId)}catch(_){}}
    else if(Math.abs(dy)>12){SW=null;return}
    else return;
  }
  SW.off=Math.max(-230,Math.min(230,SW.base+dx));
  SW.f.style.transform=`translateX(${SW.off}px)`;
},{passive:true});
function endSw(){
  if(!SW) return;const s=SW;SW=null;
  if(!s.act){if(s.f===OPEN){closeOpen();suppress()}return}
  suppress();s.f.style.transition='';
  const off=s.off,wrap=s.f.parentElement;
  const fire=sel=>{s.f.style.transform='';s.f.dataset.off='0';OPEN=null;const b=wrap.querySelector(sel);if(b) run(b)};
  if(off>150) fire('.sw-bg.l');
  else if(off<-150) fire('.sw-bg.r');
  else if(off>60){s.f.style.transform='translateX(112px)';s.f.dataset.off='112';OPEN=s.f}
  else if(off<-60){s.f.style.transform='translateX(-112px)';s.f.dataset.off='-112';OPEN=s.f}
  else{s.f.style.transform='';s.f.dataset.off='0';if(OPEN===s.f) OPEN=null}
}
document.addEventListener('pointerup',endSw);
document.addEventListener('pointercancel',endSw);
function run(el){const fn=A[el.dataset.a];if(fn) fn(el)}
document.addEventListener('click',e=>{
  if(swiped&&e.target.closest('#main')&&!e.target.closest('.sw-bg')){e.preventDefault();e.stopPropagation();return}
  const el=e.target.closest('[data-a]');
  if(!el||!el.dataset.a||!A[el.dataset.a]) return;
  e.preventDefault();
  const inBg=el.classList.contains('sw-bg');
  run(el);
  if(inBg) closeOpen();
},true);
document.addEventListener('change',e=>{const el=e.target.closest('[data-ch]');if(el&&C[el.dataset.ch]) C[el.dataset.ch](el)});
window.addEventListener('resize',()=>{const v=cur();if(v.v==='ex'&&v.tab==='analyze') drawChart()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#ov')) render()});

/* ================= demo data ================= */
function loadDemo(){
  const specs=[
    ['Cable Rope Overhead Tricep Extension','Height 8',18,1.2,[5,8],0],
    ['Machine Preacher Curl','Pull with pinkies\nHands a bit closer than max',50,3,[5,8],0],
    ['Hammer Curl','',16,1,[8,12],0],
    ['Rear Delt Fly Machine','',52,4,[6,10],0],
    ['Lat Pulldown','',60,3,[6,10],0],
    ['Smith Machine Incline Bench Press','Hands at ridges',60,2.5,[6,9],1],
    ['Leg Press','',140,10,[8,12],1],
    ['Machine Fly (Pec Deck)','Height 5, straight arms',55,3,[8,12],1],
    ['Tricep Pushdown (Bar)','Keep arms by side',35,2,[8,12],1],
    ['Weighted Dip','Cue: press the dumbbells with your chest',15,2.5,[5,8],2],
    ['Face Pull','Height 16\nHold at top for a sec',25,1.5,[10,15],2],
    ['Cable Lateral Raise','Height 5',7,.5,[10,15],2]
  ];
  const cat=S.categories[0].id;
  const R=[['Upper 1','Pull focus',[2]],['Upper 2 + Legs','Press focus',[4]],['Upper 3','Dip focus',[0]]].map(([name,subtitle,days])=>{const r={id:uid(),name,subtitle,categoryId:cat,days,exerciseIds:[]};S.routines.push(r);return r});
  const exs=specs.map(sp=>{const e=makeEx(sp[0]);e.notes=sp[1];S.exercises.push(e);R[sp[5]].exerciseIds.push(e.id);return {e,sp}});
  const today=new Date();today.setHours(0,0,0,0);
  for(let w=12;w>=0;w--){
    R.forEach((r,ri)=>{
      const d=new Date(today);d.setDate(d.getDate()-w*7-((today.getDay()-r.days[0]+7)%7));
      if(d>=today||Math.random()<.12) return;
      d.setHours(19+ri,Math.floor(Math.random()*40),0,0);let ts=d.getTime();
      for(const {e,sp} of exs.filter(x=>x.sp[5]===ri)){
        const wt=Math.round((sp[2]+sp[3]*(12-w)/4)*2)/2,n=2+(Math.random()<.4?1:0);
        for(let i=0;i<n;i++){
          const reps=sp[4][0]+Math.floor(Math.random()*(sp[4][1]-sp[4][0]+1));
          const set={id:uid(),exerciseId:e.id,reps:Math.max(1,reps-i),weight:wt,note:'',label:'',ts};
          attach(set,r.id);S.sets.push(set);ts+=(90+Math.random()*120)*1000;
        }
        ts+=120000;
      }
    });
  }
  const c2=S.categories[1]||S.categories[0];
  for(let w=1;w<=6;w++){const d=new Date(today);d.setDate(d.getDate()-w*7+2);if(d>=today) continue;d.setHours(8,0,0,0);S.sessions.push({id:uid(),manual:true,start:d.getTime(),end:d.getTime()+1800000,duration:1800,categoryId:c2.id,name:'Easy run',notes:'',routineId:null})}
}


/* ================= edge swipe back (iPhone home-screen app) =================
   Safari in a browser tab already has its own swipe-back, which fires popstate above.
   A home-screen web app has none, so we draw our own: drag from the left edge. */
const EDGE_SWIPE=navigator.standalone===true||window.__edgeSwipe===true;
let ES=null;
function buildUnder(p){
  const u=document.createElement('div');u.id='under';u.dataset.v=p.view.v;
  const saved=CH;
  try{u.innerHTML=(V[p.view.v]||vHome)(p.view)}catch(_){u.innerHTML=''}
  CH=saved;
  $('#main').before(u);u.scrollTop=p.view._y||0;
  return u;
}
document.addEventListener('touchstart',e=>{
  if(!EDGE_SWIPE||e.touches.length!==1) return;
  const x=e.touches[0].clientX;
  if(x>28||$('#ov')||$('.modal')) return;
  const p=peekBack();if(!p) return;
  ES={x,y:e.touches[0].clientY,dx:0,act:false,p,t0:Date.now(),u:null};
},{passive:true});
document.addEventListener('touchmove',e=>{
  if(!ES) return;
  const dx=e.touches[0].clientX-ES.x,dy=e.touches[0].clientY-ES.y;
  if(!ES.act){
    if(dx>8&&dx>Math.abs(dy)){ES.act=true;ES.u=buildUnder(ES.p);$('#main').classList.add('edging');SW=null}
    else if(Math.abs(dy)>10||dx<-8){ES=null;return}
    else return;
  }
  e.preventDefault();
  const W=innerWidth;ES.dx=Math.max(0,Math.min(W,dx));
  $('#main').style.transform=`translateX(${ES.dx}px)`;
  ES.u.style.transform=`translateX(${(ES.dx-W)*0.3}px)`;
  ES.u.style.opacity=String(.55+.45*ES.dx/W);
},{passive:false});
function edgeEnd(){
  if(!ES) return;const s=ES;ES=null;if(!s.act) return;
  const main=$('#main'),W=innerWidth,v=s.dx/Math.max(1,Date.now()-s.t0);
  const go=s.dx>W*0.33||(v>0.45&&s.dx>50);
  main.style.transition=s.u.style.transition='transform .22s ease-out, opacity .22s ease-out';
  main.style.transform=go?`translateX(${W}px)`:'translateX(0)';
  s.u.style.transform=go?'translateX(0)':`translateX(${-W*0.3}px)`;s.u.style.opacity=go?'1':'.55';
  setTimeout(()=>{
    s.u.remove();main.style.transition='';main.style.transform='';main.classList.remove('edging');
    if(go) goBack();
  },230);
}
document.addEventListener('touchend',edgeEnd);
document.addEventListener('touchcancel',edgeEnd);

const APP_VERSION=(window.TRAININGTRACKER_CONFIG&&TRAININGTRACKER_CONFIG.appVersion)||'3.0';
async function serverHealth(){try{const r=await fetch('/api/health',{cache:'no-store'});return r.ok?await r.json():null}catch(e){return null}}
async function loadNotifs(){
  try{NOTIFS=(await API.get('/api/notifications')).notifications;if(Sync.unread){await API.post('/api/notifications/read');Sync.unread=0}}catch(e){NOTIFS=NOTIFS||[];toast(e.message)}
  if(cur().v==='notifs'&&!$('#ov')) render();
}

/* Tabs depend on role: PTs and the super admin get a Coach tab. */
function buildTabs(){
  const tabs=[['home','Home',I.home],['workouts','Workouts',I.dumbbell],['sessions','Sessions',I.timer],['calendar','Calendar',I.cal]];
  if(Auth.isCoach()) tabs.push(['coach','Coach',I.people]);
  if(tab==='coach'&&!Auth.isCoach()) tab='home';
  $('#tabbar').innerHTML=tabs.map(([t,l,ic])=>`<button class="tab ${t===tab?'on':''}" data-a="tab" data-t="${t}">${ic}<span>${l}</span>${t==='coach'?'<i class="nb" id="coachbadge" hidden></i>':''}</button>`).join('');
  $('#tabbar').classList.toggle('five',tabs.length===5);
  updateBadges();
}
function updateBadges(){
  const b=$('#bellbadge');if(b){b.hidden=!Sync.unread;b.textContent=Sync.unread>9?'9+':Sync.unread||''}
  const c=$('#coachbadge');if(c){const n=Auth.isAdmin()?(Auth.me.resetsOpen||0):0;c.hidden=!n;c.textContent=n}
}

/* ================= circuit timer ================= */
const CT={
  exId:null,total:0,left:0,endAt:0,paused:false,rounds:0,int:null,ac:null,wake:null,
  start(exId){
    const ex=exById(exId);if(!ex) return;
    this.stop();this.exId=exId;this.total=Math.round(((ex.circuit&&ex.circuit.minutes)||10)*60);this.left=this.total;this.rounds=0;this.paused=false;this.endAt=Date.now()+this.total*1000;
    try{this.ac=this.ac||new (window.AudioContext||window.webkitAudioContext)();this.ac.resume()}catch(e){}
    try{if(navigator.wakeLock) navigator.wakeLock.request('screen').then(w=>this.wake=w).catch(()=>{})}catch(e){}
    const items=(ex.circuit&&ex.circuit.items)||[];
    sheet(`<div class="timer"><div class="t-top"><button class="icon-btn" data-a="tClose" aria-label="Close">${I.x}</button><div class="title">${esc(ex.name)}</div><div class="sp44"></div></div>
      <div class="t-clock" id="tclock">${fmtDur(this.total)}</div>
      <div class="t-rounds"><span>Rounds</span><b id="trounds">0</b></div>
      <button class="t-big" data-a="tRound">+1 round</button>
      <div class="t-row"><button data-a="tUndo">−1</button><button data-a="tPause" id="tpause">Pause</button><button data-a="tFinish">Finish</button></div>
      ${items.length?`<ol class="circ-items t-items">${items.map(i=>`<li>${esc(i)}</li>`).join('')}</ol>`:''}</div>`,{full:true});
    this.int=setInterval(()=>this.tick(),250);
  },
  tick(){
    if(this.paused) return;
    this.left=Math.max(0,(this.endAt-Date.now())/1000);
    const el=$('#tclock');if(el){el.textContent=fmtDur(Math.ceil(this.left));el.classList.toggle('low',this.left<=10)}
    if(this.left<=0) this.finish(false);
  },
  round(d){this.rounds=Math.max(0,this.rounds+d);const el=$('#trounds');if(el) el.textContent=this.rounds;if(d>0) this.beep(880,.08)},
  pause(){
    this.paused=!this.paused;
    if(!this.paused) this.endAt=Date.now()+this.left*1000;
    const b=$('#tpause');if(b) b.textContent=this.paused?'Resume':'Pause';
  },
  beep(f,len){try{const a=this.ac;if(!a) return;const o=a.createOscillator(),g=a.createGain();o.frequency.value=f;o.connect(g);g.connect(a.destination);g.gain.value=.25;o.start();o.stop(a.currentTime+len)}catch(e){}},
  finish(early){
    const exId=this.exId,rounds=this.rounds,ex=exById(exId),cap=ex&&ex.circuit?ex.circuit.minutes:null;
    if(!early){[0,350,700].forEach(ms=>setTimeout(()=>this.beep(1200,.25),ms));try{navigator.vibrate&&navigator.vibrate([300,150,300])}catch(e){}}
    this.stop();closeSheet();
    openLog(exId,cur().rid||null,{rounds,capMin:cap});
    toast(early?'Timer stopped':'Time!');
  },
  stop(){clearInterval(this.int);this.int=null;try{this.wake&&this.wake.release()}catch(e){}this.wake=null}
};
function openCircuit(id,name,rid){
  const ex=id?exById(id):null,c=ex?ex.circuit:{minutes:10,items:[]};
  sheet(`${sheetHead(ex?'Edit circuit':'New circuit','saveCircuit',id)}
    <div class="card"><div class="row"><input id="ci-name" class="tinput left grow big" placeholder="Name, e.g. Conditioning A" value="${esc(ex?ex.name:(name||''))}"></div>
    <div class="row"><span class="grow">Time cap (minutes)</span><input id="ci-min" class="tinput num" type="number" inputmode="decimal" step="any" value="${c.minutes}"></div></div>
    <div class="sect">Movements, one per line</div><div class="card"><textarea id="ci-items" rows="6" placeholder="10 Burpees&#10;15 Kettlebell swings&#10;200m Row">${esc((c.items||[]).join('\n'))}</textarea></div>
    <div class="foot">You'll track how many full rounds (plus extra reps) you complete within the time cap. Use the built-in timer to count rounds as you go.</div>`);
  const b=$('#ov [data-a=saveCircuit]');if(b&&rid) b.dataset.rid=rid;
}

/* ================= init ================= */
document.addEventListener('DOMContentLoaded',function init(){
  try{history.replaceState({ll:0},'')}catch(_){}
  boot();
  if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))) navigator.serviceWorker.register('/sw.js').catch(()=>{});
});
