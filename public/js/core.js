'use strict';
/* ================= helpers ================= */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const DAY=86400000;
const pad=n=>String(n).padStart(2,'0');
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DOWL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONL=['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEK=[1,2,3,4,5,6,0];
const COL={green:'#5fd46a',orange:'#f39a3d',blue:'#4a9cff',purple:'#c54ae6',teal:'#56c9d6',pink:'#ff8ad8',yellow:'#f5d24b',red:'#ff5b52'};
const PALETTE=['#5fd46a','#4a9cff','#ff5b52','#f39a3d','#c54ae6','#f5d24b','#56c9d6','#ff8ad8','#a2845e','#8e8e93'];
const LABELS={warmup:'Warm-up',drop:'Drop set',failure:'Failure',paused:'Paused'};
const FN={epley:'Epley',brzycki:'Brzycki',lander:'Lander',oconnor:"O'Connor",average:'Average'};
const RANGES=[['2s','Last 2'],['1m','1M'],['3m','3M'],['6m','6M'],['1y','1Y'],['all','All']];

const dkey=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const fromKey=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).getTime()};
const startOfDay=ts=>{const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime()};
const fmtDay=ts=>{const d=new Date(ts);return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`};
const fmtShort=ts=>{const d=new Date(ts);return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`};
const fmtTime=ts=>{const d=new Date(ts);return pad(d.getHours())+':'+pad(d.getMinutes())};
const fmtTimeS=ts=>{const d=new Date(ts);return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())};
const fmtDur=sec=>{sec=Math.max(0,Math.round(sec||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h}:${pad(m)}:${pad(s)}`:`${m}:${pad(s)}`};
const fmtHM=sec=>{const m=Math.round((sec||0)/60);return pad(Math.floor(m/60))+':'+pad(m%60)};
const num=n=>(n==null||isNaN(n))?'–':String(Math.round(n*10)/10);
const round2=n=>Math.round(n*100)/100;
const toLocalInput=ts=>{const d=new Date(ts);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`};
const byName=(a,b)=>a.name.localeCompare(b.name);
function ago(ts){
  if(!ts) return '';
  const d=Math.round((startOfDay(Date.now())-startOfDay(ts))/DAY);
  if(d<=0) return 'Today'; if(d===1) return 'Yesterday';
  if(d<7) return d+'d ago'; if(d<30) return Math.floor(d/7)+'w ago';
  if(d<365) return Math.floor(d/30)+'mo ago'; return Math.floor(d/365)+'y ago';
}

/* ================= icons ================= */
const sv=(p,a='fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')=>`<svg viewBox="0 0 24 24" width="22" height="22" ${a}>${p}</svg>`;
const I={
  back:sv('<path d="M15 5l-7 7 7 7"/>','fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'),
  chev:'<svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  more:sv('<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>','fill="currentColor"'),
  plus:sv('<path d="M12 5v14M5 12h14"/>','fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"'),
  check:sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>','fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'),
  x:sv('<path d="M6 6l12 12M18 6L6 18"/>','fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"'),
  gear:sv('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/><circle cx="12" cy="12" r="7"/>'),
  home:sv('<path d="M3.5 10.5L12 3.5l8.5 7V20a1 1 0 01-1 1H15v-6H9v6H4.5a1 1 0 01-1-1z"/>'),
  dumbbell:sv('<rect x="1" y="9" width="3" height="6" rx="1.2"/><rect x="4.5" y="5.5" width="3.8" height="13" rx="1.6"/><rect x="8" y="10.8" width="8" height="2.4" rx="1"/><rect x="15.7" y="5.5" width="3.8" height="13" rx="1.6"/><rect x="20" y="9" width="3" height="6" rx="1.2"/>','fill="currentColor"'),
  timer:sv('<circle cx="12" cy="13.5" r="8"/><path d="M12 13.5V9.5M10 2.5h4M18.5 6.5l1.5-1.5"/>'),
  cal:sv('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  trophy:sv('<path d="M7 3h10v2h3v3a4 4 0 01-4 4h-.4A5 5 0 0113 14.9V17h3v3.5H8V17h3v-2.1A5 5 0 018.4 12H8a4 4 0 01-4-4V5h3zM6 7v1a2 2 0 002 2V7zm12 0h-2v3a2 2 0 002-2z"/>','fill="currentColor"'),
  chart:sv('<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-6"/>','fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"'),
  gauge:sv('<circle cx="12" cy="13" r="7"/><path d="M12 13l3.5-3.5M12 2.5v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4"/>','fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"'),
  list:sv('<path d="M4 10a5 5 0 015-5h6a5 5 0 015 5v1H4zM4 12.8h16V16a3 3 0 01-3 3H7a3 3 0 01-3-3z"/>','fill="currentColor"'),
  repeat:sv('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 014-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 01-4 4H4"/>'),
  trash:sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M9 7V4h6v3"/>'),
  search:sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>','fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"'),
  book:sv('<path d="M6 3h12v15H7.5A1.5 1.5 0 006 19.5zM6 19.5A1.5 1.5 0 007.5 21H18"/>'),
  books:sv('<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9" y="4" width="5" height="16" rx="1"/><path d="M15.5 5.5l4-1 2 15-4 1z"/>'),
  kettle:sv('<path d="M9 8V6a3 3 0 016 0v2"/><path d="M5 9h14l1.5 11h-17z"/>'),
  hash:sv('<path d="M5 9h15M4 15h15M10 3L8 21M16 3l-2 18"/>'),
  ruler:sv('<path d="M3 12h18M7 9v6M12 9v6M17 9v6"/>'),
  tag:sv('<path d="M3 12V4a1 1 0 011-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>')
};

/* ================= state ================= */
/* Data model is sync-ready: every record has a stable id and an updatedAt time,
   deletions are remembered as tombstones, and each device has its own id. A future
   server can then merge changes from several devices record by record. */
const KEY=Store.KEY;
const SCHEMA=2;
const COLLS=['exercises','sets','sessions','routines','categories'];
function defaults(){
  return {v:1,schema:SCHEMA,deviceId:uid(),tombstones:[],settingsUpdatedAt:0,lastSyncAt:0,
    exercises:[],sets:[],sessions:[],routines:[],
    categories:[{id:'strength',name:'Strength Training',color:'#5fd46a'},{id:'cardio',name:'Cardio',color:'#4a9cff'},{id:'combat',name:'Combat Sports',color:'#ff5b52'}],
    settings:{unit:'kg',step1:1,step2:5,gapMin:90,defaultCat:'strength',sessFilter:'all',calFilter:'all',
      graph:{range:'3m',mode:'sets',series:{reps:true,weight:true,volume:false,e1rm:false,duration:true,distance:true}}}};
}
let S=Store.load()||defaults();
let memOnly=!Store.ok;
function migrate(){
  const d=defaults();
  for(const k of ['exercises','sets','sessions','routines','categories']) if(!Array.isArray(S[k])) S[k]=d[k];
  if(!S.categories.length) S.categories=d.categories;
  if(!Array.isArray(S.tombstones)) S.tombstones=[];
  if(!S.deviceId) S.deviceId=uid();
  S.schema=SCHEMA;
  S.settings=Object.assign({},d.settings,S.settings||{});
  const g=S.settings.graph||{};
  S.settings.graph=Object.assign({},d.settings.graph,g,{series:Object.assign({},d.settings.graph.series,g.series||{})});
  S.routines.forEach(r=>{r.days=r.days||[];r.exerciseIds=r.exerciseIds||[]});
  S.exercises.forEach(e=>{e.metrics=e.metrics||{reps:true,weight:true};e.orm=e.orm||{on:false,formula:'brzycki'}});
  // give older records a sensible updatedAt so a future merge has something to compare
  for(const c of COLLS) for(const r of S[c]) if(!r.updatedAt) r.updatedAt=r.ts||r.start||r.created||1;
  // forget very old tombstones
  const cutoff=Date.now()-400*DAY;S.tombstones=S.tombstones.filter(x=>x.at>cutoff);
}
migrate();

/* ---- change tracking: stamps updatedAt on changed records, records deletions ---- */
let SNAP=null;
const recKey=r=>{const o=Object.assign({},r);delete o.updatedAt;return JSON.stringify(o)};
function takeSnap(){
  SNAP={settings:JSON.stringify(S.settings)};
  for(const c of COLLS){const m=new Map();for(const r of S[c]) m.set(r.id,recKey(r));SNAP[c]=m}
}
function stampChanges(){
  if(!SNAP){takeSnap();return}
  const now=Date.now();
  for(const c of COLLS){
    const old=SNAP[c],seen=new Set();
    for(const r of S[c]){
      seen.add(r.id);const k=recKey(r);
      if(old.get(r.id)!==k){r.updatedAt=now;old.set(r.id,k)}
    }
    for(const id of [...old.keys()]) if(!seen.has(id)){S.tombstones.push({kind:c,id,at:now});old.delete(id)}
  }
  const st=JSON.stringify(S.settings);
  if(st!==SNAP.settings){S.settingsUpdatedAt=now;SNAP.settings=st}
}
takeSnap();
/* Replace all data without treating it as edits (import, restore, erase this device). */
function replaceData(d){S=d;migrate();takeSnap();IX=null;Store.save(S)}
function save(){stampChanges();if(!Store.save(S)) memOnly=true;if(window.Sync) Sync.schedule()}
var IX=null;
function ix(){
  if(IX) return IX;
  const m={};
  for(const s of S.sets)(m[s.exerciseId]||(m[s.exerciseId]=[])).push(s);
  for(const k in m) m[k].sort((a,b)=>a.ts-b.ts);
  return IX=m;
}
function commit(){IX=null;save();render()}

/* ================= lookups ================= */
const exById=id=>S.exercises.find(e=>e.id===id);
const rtById=id=>S.routines.find(r=>r.id===id);
const sesById=id=>S.sessions.find(s=>s.id===id);
const catById=id=>S.categories.find(c=>c.id===id)||{id:'',name:'Uncategorised',color:'#8e8e93'};
const exSets=id=>ix()[id]||[];
const lastDone=id=>{const a=exSets(id);return a.length?a[a.length-1].ts:0};
const U=()=>S.settings.unit;
const M=ex=>(ex&&ex.metrics)||{reps:true,weight:true};
const onDay=dow=>S.routines.filter(r=>(r.days||[]).includes(dow));
const daysTxt=days=>WEEK.filter(d=>(days||[]).includes(d)).map(d=>DOW[d]).join(', ');
function sortByLast(list){
  return [...list].sort((a,b)=>{
    const la=lastDone(a.id),lb=lastDone(b.id);
    if(!la&&!lb) return (b.created||0)-(a.created||0);
    if(!la) return -1; if(!lb) return 1; return lb-la;
  });
}
function makeEx(name){return {id:uid(),name,notes:'',metrics:metricsFor(name),orm:{on:false,formula:'brzycki'},created:Date.now()}}

/* ================= set maths ================= */
const F={
  epley:(w,r)=>w*(1+r/30),
  brzycki:(w,r)=>r>=37?NaN:w*36/(37-r),
  lander:(w,r)=>{const d=101.3-2.67123*r;return d<=0?NaN:100*w/d},
  oconnor:(w,r)=>w*(1+.025*r)
};
F.average=(w,r)=>{const v=['epley','brzycki','lander','oconnor'].map(k=>F[k](w,r)).filter(isFinite);return v.reduce((a,b)=>a+b,0)/v.length};
function e1rm(s,ex){
  if(!s||!s.weight||!s.reps) return 0;
  if(s.reps===1) return s.weight;
  const v=(F[(ex&&ex.orm&&ex.orm.formula)||'brzycki']||F.brzycki)(s.weight,s.reps);
  return isFinite(v)&&v>0?v:0;
}
function vol(s,ex){const m=M(ex);
  if(m.reps&&m.weight) return (s.reps||0)*(s.weight||0);
  if(m.reps) return s.reps||0; if(m.weight) return s.weight||0;
  if(m.duration) return s.duration||0; return s.distance||0;
}
const kgVol=(s,ex)=>{const m=M(ex);return m.reps&&m.weight?(s.reps||0)*(s.weight||0):0};
function vals(s,ex){
  const m=M(ex);let h='';
  if(m.duration) h+=`<span class="v dur">${fmtDur(s.duration)}</span>`;
  if(m.distance) h+=`<span class="v dist">${num(s.distance||0)}<small> km</small></span>`;
  if(m.reps) h+=`<span class="v reps">${s.reps||0}<small> rep</small></span>`;
  if(m.weight) h+=`<span class="v wt">${num(s.weight||0)}<small> ${U()}</small></span>`;
  return h;
}
function txtSet(s,ex){
  const m=M(ex),p=[];
  if(m.duration) p.push(fmtDur(s.duration));
  if(m.distance) p.push(num(s.distance||0)+' km');
  if(m.reps) p.push((s.reps||0)+' rep');
  if(m.weight) p.push(num(s.weight||0)+' '+U());
  return p.join(' ');
}
function bestSet(a,ex){
  const m=M(ex);
  const f=m.weight?s=>(s.weight||0)*1000+(s.reps||0):m.reps?s=>s.reps||0:m.duration?s=>s.duration||0:s=>s.distance||0;
  return a.reduce((b,s)=>!b||f(s)>f(b)?s:b,null);
}
function prInfo(ex){
  const a=exSets(ex.id),m=M(ex),prs=new Set(),volDays=new Set();
  if(!a.length) return {prs,volDays};
  const first=dkey(a[0].ts),prev=[];
  for(const s of a){
    if(s.label==='warmup') continue;
    let isPr;
    if(m.reps&&m.weight) isPr=!prev.some(p=>(p.weight||0)>=(s.weight||0)&&(p.reps||0)>=(s.reps||0));
    else{const f=m.reps?'reps':m.weight?'weight':m.duration?'duration':'distance';isPr=!prev.some(p=>(p[f]||0)>=(s[f]||0))}
    if(isPr&&dkey(s.ts)!==first) prs.add(s.id);
    prev.push(s);
  }
  const dv={};
  for(const s of a){if(s.label==='warmup') continue;const k=dkey(s.ts);dv[k]=(dv[k]||0)+vol(s,ex)}
  let best=null;
  for(const k of Object.keys(dv).sort()){if(best!==null&&dv[k]>best) volDays.add(k);best=best===null?dv[k]:Math.max(best,dv[k])}
  return {prs,volDays};
}

/* ================= sessions ================= */
const sesSets=s=>S.sets.filter(x=>x.sessionId===s.id).sort((a,b)=>a.ts-b.ts);
function sesName(s){const r=s.routineId&&rtById(s.routineId);return s.name||(r&&r.name)||catById(s.categoryId).name}
const sesDur=s=>s.manual?(s.duration||0):Math.max(0,((s.end||s.start)-s.start)/1000);
function refreshSession(id){
  const s=sesById(id);if(!s||s.manual) return;
  const a=S.sets.filter(x=>x.sessionId===id);
  if(!a.length){S.sessions=S.sessions.filter(x=>x.id!==id);return}
  s.start=Math.min(...a.map(x=>x.ts));s.end=Math.max(...a.map(x=>x.ts));
}
function attach(set,rid){
  const gap=(+S.settings.gapMin||90)*60000,k=dkey(set.ts);
  let r=rid?rtById(rid):null;
  if(!r){const dow=new Date(set.ts).getDay();r=S.routines.find(x=>(x.days||[]).includes(dow)&&x.exerciseIds.includes(set.exerciseId))||null}
  let s=S.sessions.find(x=>!x.manual&&dkey(x.start)===k&&set.ts>=x.start-gap&&set.ts<=(x.end||x.start)+gap);
  if(!s){
    s={id:uid(),start:set.ts,end:set.ts,categoryId:(r&&r.categoryId)||S.settings.defaultCat,routineId:r?r.id:null,name:''};
    S.sessions.push(s);
  }else{
    s.start=Math.min(s.start,set.ts);s.end=Math.max(s.end||s.start,set.ts);
    if(!s.routineId&&r){s.routineId=r.id;s.categoryId=r.categoryId||s.categoryId}
  }
  set.sessionId=s.id;
}
function dayColorMap(f){
  const map={};
  for(const s of S.sessions){
    if(f&&f!=='all'&&s.categoryId!==f) continue;
    const k=dkey(s.start),c=catById(s.categoryId).color;
    (map[k]||(map[k]=[])); if(!map[k].includes(c)) map[k].push(c);
  }
  return map;
}
