/* Insights: things worth noticing in someone's training.
   Used on the user's own Overview and on the coach dashboard, so both see the same picture.
   Each insight: { level: 'warn' | 'info' | 'good', title, detail, exId?, day? } */

/* Run a function against another person's data (e.g. a coach looking at a client). */
function withData(d, fn) { const s0 = S, ix0 = IX; S = d; IX = null; try { return fn(); } finally { S = s0; IX = ix0; } }

const INJURY_WORDS = /\b(injur\w*|pain\w*|hurt\w*|tweak\w*|strain\w*|sprain\w*|niggl\w*|pulled|twinge\w*|ache\w*)\b/i;

function computeInsights(nowTs) {
  const now = nowTs || Date.now(), today = startOfDay(now), out = [];
  const sessions = [...S.sessions].filter(s => s.start <= now).sort((a, b) => a.start - b.start);
  const realSessions = sessions.filter(s => s.manual || S.sets.some(x => x.sessionId === s.id));
  const dayKeys = new Set(realSessions.map(s => dkey(s.start)));
  if (!realSessions.length && !S.sets.length) return out;

  // 1. Gap since last session
  const last = realSessions[realSessions.length - 1];
  if (last) {
    const gap = Math.round((today - startOfDay(last.start)) / DAY);
    if (gap >= 7) out.push({ level: 'warn', title: `No training for ${gap} days`, detail: `Last session was ${fmtDay(last.start)}.` });
  }

  // 2. Adherence to the weekly schedule (last 4 weeks, not counting today)
  const scheduled = S.routines.filter(r => (r.days || []).length);
  if (scheduled.length) {
    let planned = 0, done = 0; const missedDays = [];
    for (let i = 1; i <= 28; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const k = dkey(d.getTime()), dow = d.getDay();
      for (const r of scheduled) {
        if (!r.days.includes(dow)) continue;
        planned++;
        const hit = realSessions.some(s => dkey(s.start) === k && (s.routineId === r.id || !s.routineId));
        if (hit) done++; else missedDays.push(`${DOW[dow]} ${d.getDate()} ${MON[d.getMonth()]}`);
      }
    }
    if (planned >= 3) {
      const pct = Math.round(done / planned * 100);
      if (pct < 75) out.push({ level: 'warn', title: `Missed ${planned - done} of ${planned} planned sessions`, detail: `${pct}% of the weekly plan done in the last 4 weeks. Most recent missed: ${missedDays.slice(0, 3).join(', ')}.` });
      else if (pct >= 90) out.push({ level: 'good', title: `${done} of ${planned} planned sessions done`, detail: `${pct}% consistency over the last 4 weeks.` });
    }
  }

  // 3. Training frequency dropping
  const inRange = (a, b) => realSessions.filter(s => s.start >= today - a * DAY && s.start < today - b * DAY + DAY).length;
  const recent = inRange(14, 0), before = inRange(28, 14);
  if (before >= 3 && recent <= before * 0.6) {
    out.push({ level: 'warn', title: 'Training less often', detail: `${recent} session${recent === 1 ? '' : 's'} in the last 2 weeks, down from ${before} in the 2 weeks before.` });
  }

  // 4. Strength / rep / circuit trends per exercise (last 120 days)
  const ups = [], downs = [], flats = [];
  for (const ex of S.exercises) {
    const m = M(ex);
    const a = exSets(ex.id).filter(s => s.label !== 'warmup' && s.ts >= now - 120 * DAY);
    if (!a.length) continue;
    let score, unit, label;
    if (m.rounds) { score = roundsScore; unit = 'rounds'; label = 'rounds'; }
    else if (m.reps && m.weight) { score = s => e1rm(s, ex); unit = U(); label = 'est. 1RM'; }
    else if (m.reps) { score = s => s.reps || 0; unit = 'reps'; label = 'best reps'; }
    else continue;
    const byDay = new Map();
    for (const s of a) { const k = dkey(s.ts), v = score(s); if (v > 0) byDay.set(k, Math.max(byDay.get(k) || 0, v)); }
    const pts = [...byDay.entries()].sort((x, y) => x[0] < y[0] ? -1 : 1).map(x => ({ k: x[0], v: x[1] }));
    if (pts.length < 4) continue;
    const avg = arr => arr.reduce((t, p) => t + p.v, 0) / arr.length;
    const rec = avg(pts.slice(-2)), prev = avg(pts.slice(-5, -2));
    if (!prev) continue;
    const pct = (rec - prev) / prev * 100;
    const fmt = v => m.rounds ? num(v) : num(v);
    if (pct >= 4) ups.push({ ex, pct, txt: `${label} ${fmt(prev)} → ${fmt(rec)} ${unit}` });
    else if (pct <= -5) downs.push({ ex, pct, txt: `${label} ${fmt(prev)} → ${fmt(rec)} ${unit}` });
    else {
      const l4 = pts.slice(-4), lo = Math.min(...l4.map(p => p.v)), hi = Math.max(...l4.map(p => p.v));
      const span = (fromKey(l4[3].k) - fromKey(l4[0].k)) / DAY;
      if (span >= 21 && (hi - lo) / hi <= 0.02) flats.push({ ex, txt: `${label} steady around ${fmt(hi)} ${unit} for 4 sessions` });
    }
  }
  downs.sort((x, y) => x.pct - y.pct).slice(0, 4).forEach(d => out.push({ level: 'warn', title: `${d.ex.name} down ${Math.abs(Math.round(d.pct))}%`, detail: `Recent ${d.txt}.`, exId: d.ex.id }));
  flats.slice(0, 2).forEach(f => out.push({ level: 'info', title: `Plateau on ${f.ex.name}`, detail: `${f.txt[0].toUpperCase() + f.txt.slice(1)}. Consider changing reps, load or variation.`, exId: f.ex.id }));
  ups.sort((x, y) => y.pct - x.pct).slice(0, 3).forEach(u => out.push({ level: 'good', title: `${u.ex.name} up ${Math.round(u.pct)}%`, detail: `Recent ${u.txt}.`, exId: u.ex.id }));

  // 5. New personal records this week
  const prNames = [];
  for (const ex of S.exercises) {
    const { prs } = prInfo(ex);
    if (exSets(ex.id).some(s => prs.has(s.id) && s.ts >= now - 7 * DAY)) prNames.push(ex.name);
  }
  if (prNames.length) out.push({ level: 'good', title: `${prNames.length} new PR${prNames.length > 1 ? 's' : ''} this week`, detail: prNames.slice(0, 4).join(', ') + (prNames.length > 4 ? ` and ${prNames.length - 4} more` : '') + '.' });

  // 6. Possible injury mentioned in notes (last 14 days)
  const flagged = [];
  for (const s of realSessions) if (s.start >= now - 14 * DAY && INJURY_WORDS.test(s.notes || '')) flagged.push({ ts: s.start, text: s.notes });
  for (const x of S.sets) if (x.ts >= now - 14 * DAY && INJURY_WORDS.test(x.note || '')) { const ex = exById(x.exerciseId); flagged.push({ ts: x.ts, text: (ex ? ex.name + ': ' : '') + x.note }); }
  flagged.sort((a, b) => b.ts - a.ts);
  if (flagged.length) out.push({ level: 'warn', title: 'Possible injury mentioned', detail: `“${flagged[0].text.slice(0, 120)}” on ${fmtDay(flagged[0].ts)}${flagged.length > 1 ? ` (+${flagged.length - 1} more note${flagged.length > 2 ? 's' : ''})` : ''}.`, day: dkey(flagged[0].ts) });

  // 7. Unusually short session (last 14 days)
  const durs = realSessions.filter(s => !s.manual).map(sesDur).filter(d => d > 300).sort((a, b) => a - b);
  if (durs.length >= 5) {
    const med = durs[Math.floor(durs.length / 2)];
    const short = realSessions.filter(s => !s.manual && s.start >= now - 14 * DAY && sesDur(s) > 0 && sesDur(s) < med * 0.5).pop();
    if (short) out.push({ level: 'info', title: 'Short session', detail: `${fmtDay(short.start)}: ${Math.round(sesDur(short) / 60)} min vs a usual ${Math.round(med / 60)} min.${short.notes ? ` Note: “${short.notes.slice(0, 80)}”` : ''}`, day: dkey(short.start) });
  }

  const order = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/* Small summary used on coach dashboard cards. */
function trainingSummary(nowTs) {
  const now = nowTs || Date.now(), today = startOfDay(now);
  const real = S.sessions.filter(s => s.start <= now && (s.manual || S.sets.some(x => x.sessionId === s.id)));
  const last = real.reduce((m, s) => Math.max(m, s.start), 0);
  const d = new Date(today), mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
  const thisWeek = new Set(real.filter(s => s.start >= mon).map(s => dkey(s.start))).size;
  const plannedWeek = S.routines.reduce((t, r) => t + (r.days || []).length, 0);
  const last28 = real.filter(s => s.start >= today - 28 * DAY).length;
  return { last, thisWeek, plannedWeek, last28 };
}

const insightIcon = l => l === 'warn' ? '!' : l === 'good' ? '↑' : 'i';
function insightRows(list, max, clientId) {
  return list.slice(0, max || list.length).map(i => {
    const act = !clientId
      ? (i.exId ? `data-a="openEx" data-id="${i.exId}"` : i.day ? `data-a="goDay" data-d="${i.day}"` : '')
      : (i.exId ? `data-a="coachOpenEx" data-c="${clientId}" data-id="${i.exId}"` : i.day ? `data-a="coachOpenDay" data-c="${clientId}" data-d="${i.day}"` : '');
    return `<div class="row ins ${i.level} ${act ? 'tap' : ''}" ${act}>
    <span class="insic">${insightIcon(i.level)}</span><div class="grow"><div class="ins-t">${esc(i.title)}</div><div class="sub">${esc(i.detail)}</div></div>${act ? I.chev : ''}</div>`;
  }).join('');
}
