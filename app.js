/* FitTrack – kostenloser, lokaler iPhone-Trainings-Tracker.
   Daten werden ausschließlich in diesem Browser/Web-App-Speicher abgelegt. */
'use strict';
const KEY = 'fittrack-local-v1';
const DEFAULT_PLANS = {
  A: [
    ['Kniebeugen',3,'6–8 Wdh.'], ['Bankdrücken',3,'6–8 Wdh.'],
    ['Latziehen',3,'8–12 Wdh.'], ['Rumänisches Kreuzheben',2,'8–10 Wdh.'],
    ['Seitheben',3,'12–15 Wdh.'], ['Bauchmaschine',2,'12–15 Wdh.']
  ],
  B: [
    ['Beinpresse',3,'8–12 Wdh.'], ['Schulterdrücken',3,'6–10 Wdh.'],
    ['Kabelrudern',3,'8–12 Wdh.'], ['Beinbeuger',3,'10–15 Wdh.'],
    ['Brustpresse',2,'8–12 Wdh.'], ['Bizepscurls',2,'10–15 Wdh.']
  ],
  C: [
    ['Bulgarian Split Squat',3,'8–10 Wdh.'], ['Schrägbankdrücken',3,'8–10 Wdh.'],
    ['Rudern brustgestützt',3,'8–12 Wdh.'], ['Beinstrecker',2,'12–15 Wdh.'],
    ['Trizepsdrücken',2,'10–15 Wdh.'], ['Bauchmaschine',3,'10–15 Wdh.']
  ]
};
const uid = () => (globalThis.crypto?.randomUUID?.() || Date.now()+'-'+Math.random().toString(36).slice(2));
const today = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const escapeHtml = (value) => String(value??'').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const number = (value) => { if(value===null||value===undefined||String(value).trim()==='')return NaN; return Number(String(value).replace(',','.')); };
const fmt = (n, digits=0) => Number(n).toLocaleString('de-DE',{maximumFractionDigits:digits});
const dateDisplay = (s) => {const parts=String(s).slice(0,10).split('-'); return parts.length===3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : s;};
const freshState=()=>({version:1,plans:Object.fromEntries(Object.entries(DEFAULT_PLANS).map(([key,items])=>[key,items.map(([name,count,goal])=>({id:uid(),name,goal,count}))])),sessions:[],drafts:{},weights:[],foods:[],targets:{calories:2400,protein:180}});
function validateState(raw, includeDrafts=false){
  if(!raw||typeof raw!=='object'||!raw.plans||!Array.isArray(raw.sessions)||!Array.isArray(raw.weights)||!Array.isArray(raw.foods))throw Error('Ungültige Sicherungsdatei');
  const s=freshState();
  for(const k of ['A','B','C']) if(Array.isArray(raw.plans[k]))s.plans[k]=raw.plans[k].filter(x=>typeof x.name==='string'&&x.name.trim()).slice(0,45).map(x=>({id:String(x.id||uid()),name:x.name.slice(0,80),count:Math.max(1,Math.min(8,Number(x.count)||3)),goal:String(x.goal||'Eigene Übung').slice(0,40)}));
  s.sessions=raw.sessions.filter(x=>x && Array.isArray(x.exercises)&&typeof x.date==='string').slice(-2500).map(x=>({id:String(x.id||uid()),date:x.date.slice(0,10),plan:['A','B','C'].includes(x.plan)?x.plan:'A',exercises:x.exercises.filter(e=>e&&typeof e.name==='string'&&Array.isArray(e.sets)).map(e=>({name:e.name.slice(0,80),sets:e.sets.filter(a=>Number.isFinite(number(a.weight))&&Number.isFinite(number(a.reps))).slice(0,30).map(a=>({weight:number(a.weight),reps:number(a.reps)}))}))}));
  s.weights=raw.weights.filter(x=>x&&typeof x.date==='string'&&Number.isFinite(number(x.kg))&&number(x.kg)>0).slice(-2000).map(x=>({id:String(x.id||uid()),date:x.date.slice(0,10),kg:number(x.kg)}));
  s.foods=raw.foods.filter(x=>x&&typeof x.date==='string'&&Number.isFinite(number(x.calories))&&Number.isFinite(number(x.protein))).slice(-5000).map(x=>({id:String(x.id||uid()),date:x.date.slice(0,10),name:String(x.name||'Mahlzeit').slice(0,80),calories:number(x.calories),protein:number(x.protein)}));
  if(raw.targets)s.targets={calories:Math.max(500,Math.min(8000,number(raw.targets.calories)||2400)),protein:Math.max(0,Math.min(600,number(raw.targets.protein)||180))};
  // Lokale, laufende Eingaben nach einem Neustart wiederherstellen.
  // Importierte Backups übernehmen absichtlich keine unfertigen Sätze.
  if(includeDrafts && raw.drafts && typeof raw.drafts === 'object') {
    for(const plan of ['A','B','C']) {
      const planDraft=raw.drafts[plan];
      if(!planDraft || typeof planDraft!=='object')continue;
      s.drafts[plan]={};
      for(const ex of s.plans[plan]) {
        if(!Array.isArray(planDraft[ex.id]))continue;
        s.drafts[plan][ex.id]=planDraft[ex.id].slice(0,12).map(v=>({
          weight: Number.isFinite(number(v.weight)) ? v.weight : '',
          reps: Number.isFinite(number(v.reps)) ? v.reps : '',
          done:Boolean(v.done)
        }));
      }
    }
  }
  return s;
}
let state;
try {const saved=localStorage.getItem(KEY);state=saved?validateState(JSON.parse(saved),true):freshState();}catch(error){console.warn('Speicher nicht lesbar',error);state=freshState();}
let tab='training', selectedPlan='A', selectedExercise='', progressDate=today(), foodDate=today(), toastTimer=null;
const $=id=>document.getElementById(id);
function store(){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch(e){console.error(e);notify('Speichern fehlgeschlagen. Bitte Backup erstellen.');return false;}}
function notify(message){let el=$('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3300);}
function latestSessionFor(name){return [...state.sessions].reverse().find(s=>s.exercises.some(e=>e.name===name&&e.sets.length));}
function draftFor(plan){
  if(!state.drafts[plan])state.drafts[plan]={};
  for(const ex of state.plans[plan])if(!state.drafts[plan][ex.id]){
    const session=latestSessionFor(ex.name);
    const last=session?.exercises.find(e=>e.name===ex.name)?.sets||[];
    state.drafts[plan][ex.id]=Array.from({length:ex.count},(_,i)=>({weight:last[i]?.weight??'',reps:last[i]?.reps??'',done:false}));
  }
  return state.drafts[plan];
}
function render(){
  document.querySelectorAll('[data-nav]').forEach(b=>{b.classList.toggle('active',b.dataset.nav===tab);b.setAttribute('aria-current',b.dataset.nav===tab?'page':'false')});
  $('app').innerHTML=tab==='training'?renderTraining():tab==='progress'?renderProgress():tab==='food'?renderFood():renderSettings();
}
function renderTraining(){
  const drafts=draftFor(selectedPlan);
  const totalSessions=state.sessions.length;
  const last=state.sessions.at(-1);
  return `<div class="eyebrow">DREI TAGE. DEIN TEMPO.</div><h1 class="page-title">Dein Training<span class="accent">.</span></h1>
    <p class="sub">Trage deine Sätze ein und erkenne, wie du stärker wirst.</p>
    <section class="hero"><div class="eyebrow">DEIN WORKOUT</div><h2>Ganzkörper ${selectedPlan}</h2><p>Trainiere kontrolliert und steigere dich, sobald du dein Wiederholungsziel schaffst.</p>
    <div class="hero-stats"><div class="hero-stat"><strong>${totalSessions}</strong><span>Einheiten gespeichert</span></div><div class="hero-stat"><strong>${last?dateDisplay(last.date):'–'}</strong><span>Letztes Training</span></div></div></section>
    <div class="section-row"><h2>Trainingsplan</h2><span class="small-muted">3× pro Woche</span></div>
    <div class="picker">${['A','B','C'].map(p=>`<button data-plan="${p}" class="${p===selectedPlan?'active':''}">Tag ${p}</button>`).join('')}</div>
    ${state.plans[selectedPlan].map(ex=>{
      const lastEx=latestSessionFor(ex.name)?.exercises.find(x=>x.name===ex.name);
      const lastText=lastEx?.sets.length ? lastEx.sets.map(x=>`${fmt(x.weight,1)} kg × ${fmt(x.reps)}`).join(' · ') : '';
      const sets=drafts[ex.id]||[];
      return `<article class="exercise" data-exercise="${escapeHtml(ex.id)}"><div class="exercise-head"><div><h3>${escapeHtml(ex.name)}</h3><span class="meta">${escapeHtml(ex.goal)}</span></div><button class="mini-btn danger" data-remove-ex="${escapeHtml(ex.id)}" aria-label="Übung entfernen">Entfernen</button></div>
      ${lastText?`<div class="last">Letztes Mal: ${escapeHtml(lastText)}</div>`:''}
      <div class="sets-header"><span>SATZ</span><span>KG</span><span>WDH.</span><span>✓</span></div>
      ${sets.map((s,i)=>`<div class="set-line"><span class="set-num">${i+1}</span><input class="small-input" data-weight data-i="${i}" inputmode="decimal" aria-label="Gewicht Satz ${i+1} für ${escapeHtml(ex.name)}" placeholder="0" value="${escapeHtml(s.weight)}"><input class="small-input" data-reps data-i="${i}" inputmode="numeric" type="number" min="0" max="200" aria-label="Wiederholungen Satz ${i+1} für ${escapeHtml(ex.name)}" placeholder="0" value="${escapeHtml(s.reps)}"><input class="done-check" type="checkbox" data-done data-i="${i}" aria-label="Satz ${i+1} erledigt" ${s.done?'checked':''}></div>`).join('')}
      <div class="exercise-footer"><button class="mini-btn" data-add-set="${escapeHtml(ex.id)}">+ Satz hinzufügen</button>${sets.length>1?`<button class="mini-btn danger" data-remove-set="${escapeHtml(ex.id)}">Letzten Satz löschen</button>`:''}</div></article>`;
    }).join('')}
    <button id="saveWorkout" class="primary">✓ Training speichern</button>
    <section class="panel"><h3 class="panel-title">Eigene Übung hinzufügen</h3><p class="panel-sub">Ergänze deinen Plan ${selectedPlan} nach Bedarf.</p><form id="addExercise" class="inline-form"><input class="field" name="exercise" maxlength="80" required placeholder="z. B. Klimmzüge" autocomplete="off"><button class="secondary" type="submit">Hinzufügen</button></form></section>`;
}
function exerciseList(){return [...new Set(state.sessions.flatMap(s=>s.exercises.map(e=>e.name)))].sort((a,b)=>a.localeCompare(b,'de'));}
function exercisePoints(name){
  return state.sessions.filter(s=>s.exercises.some(e=>e.name===name&&e.sets.length)).map(s=>{
    const sets=s.exercises.filter(e=>e.name===name).flatMap(e=>e.sets);
    return {date:s.date,max:Math.max(...sets.map(x=>x.weight)),volume:sets.reduce((a,x)=>a+x.weight*x.reps,0)};
  }).sort((a,b)=>a.date.localeCompare(b.date));
}
function lineChart(points,field='value',suffix=''){if(!points.length)return `<div class="empty">Noch keine Daten vorhanden.</div>`;
  const xs=points.map(x=>Number(x[field])), mn=Math.min(...xs),mx=Math.max(...xs),range=Math.max(mx-mn,1), left=25,top=20,w=310,h=132;
  const xy=xs.map((n,i)=>({x:left+(xs.length===1?w/2:i*w/(xs.length-1)),y:top+h-(n-mn)/range*(h-12)-6}));
  const path=xy.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 360 185" class="chart" role="img" aria-label="Fortschrittsdiagramm von ${fmt(xs[0],1)} zu ${fmt(xs.at(-1),1)} ${escapeHtml(suffix)}">
    ${[0,1,2,3].map(i=>`<line x1="25" x2="335" y1="${20+i*44}" y2="${20+i*44}" stroke="#34445b" stroke-dasharray="3 5"/>`).join('')}
    <path d="${path}" stroke="#67f1c2" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${xy.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#67f1c2" stroke="#132537" stroke-width="2"/>`).join('')}
    <text x="26" y="177" font-size="11" fill="#98abc1">${escapeHtml(dateDisplay(points[0].date))}</text>
    <text x="335" y="177" font-size="11" fill="#98abc1" text-anchor="end">${escapeHtml(dateDisplay(points.at(-1).date))}</text></svg>`;
}
function renderProgress(){
  const choices=exerciseList(); if(!choices.includes(selectedExercise))selectedExercise=choices[0]||'';
  const pts=selectedExercise?exercisePoints(selectedExercise):[];
  const start=pts[0]?.max||0,last=pts.at(-1)?.max||0;
  const diff=last-start;
  const weights=[...state.weights].sort((a,b)=>a.date.localeCompare(b.date));
  return `<div class="eyebrow">DEINE ENTWICKLUNG</div><h1 class="page-title">Fortschritt<span class="accent">.</span></h1><p class="sub">Sieh, ob du beim Training stärker wirst und wie sich dein Körpergewicht verändert.</p>
    <div class="metric-grid"><div class="metric"><span>Absolvierte Trainings</span><strong>${state.sessions.length}</strong></div><div class="metric"><span>Erfasste Körpergewichte</span><strong>${state.weights.length}</strong></div></div>
    <section class="panel"><h3 class="panel-title">Kraftentwicklung</h3><label class="form-label" for="exerciseSelect">Übung auswählen</label>
    ${choices.length?`<select class="field" id="exerciseSelect">${choices.map(n=>`<option value="${escapeHtml(n)}" ${n===selectedExercise?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select>
    <div class="metric-grid tight"><div class="metric"><span>Letztes Bestgewicht</span><strong>${fmt(last,1)} <small>kg</small></strong></div><div class="metric"><span>Seit erster Erfassung</span><strong class="${diff>=0?'accent':''}">${diff>0?'+':''}${fmt(diff,1)} <small>kg</small></strong></div></div>${lineChart(pts.map(p=>({date:p.date,value:p.max})),'value','kg')}<p class="note">Gezeigt wird das höchste absolvierte Gewicht pro Einheit. Mehr Wiederholungen mit demselben Gewicht zählen ebenfalls als Fortschritt.</p>`:
    `<div class="empty"><strong>Dein erster Eintrag fehlt noch</strong>Speichere ein Training mit Gewichten und Wiederholungen, um deine Fortschritte zu sehen.</div>`}</section>
    <section class="panel"><h3 class="panel-title">Körpergewicht</h3><p class="panel-sub">Für den Fettabbau ist der Trend über mehrere Wochen aussagekräftiger als ein einzelner Tag.</p>
    ${weights.length?lineChart(weights.map(x=>({date:x.date,value:x.kg})),'value','kg'):'<div class="empty">Noch keine Gewichtseinträge.</div>'}
    <form id="addWeight"><div class="form-grid"><div><label class="form-label">Datum</label><input class="field" type="date" name="date" value="${progressDate}" required></div><div><label class="form-label">Gewicht (kg)</label><input class="field" name="kg" type="text" inputmode="decimal" required placeholder="z. B. 86,0"></div></div><button class="primary" type="submit">Gewicht eintragen</button></form>
    ${weights.length?`<div class="divider"></div>${weights.slice(-5).reverse().map(w=>`<div class="history-item row-between"><div><strong>${fmt(w.kg,1)} kg</strong><span>${dateDisplay(w.date)}</span></div><button class="mini-btn danger" data-delete-weight="${escapeHtml(w.id)}">Löschen</button></div>`).join('')}`:''}</section>
    <section class="panel"><h3 class="panel-title">Letzte Trainingseinheiten</h3>
    ${state.sessions.length?state.sessions.slice(-10).reverse().map(s=>`<div class="history-item row-between"><div><strong>Ganzkörper ${s.plan}</strong><span>${dateDisplay(s.date)} · ${s.exercises.length} Übungen · ${s.exercises.reduce((n,e)=>n+e.sets.length,0)} Sätze</span></div><button class="mini-btn danger" data-delete-session="${escapeHtml(s.id)}">Löschen</button></div>`).join(''):'<div class="empty">Noch kein Training gespeichert.</div>'}</section>`;
}
function renderFood(){
  const entries=state.foods.filter(x=>x.date===foodDate);const totalCal=entries.reduce((x,e)=>x+e.calories,0),totalProt=entries.reduce((x,e)=>x+e.protein,0);
  const percent=(value,target)=>Math.round(value/target*100);
  return `<div class="eyebrow">ERNÄHRUNG</div><h1 class="page-title">Gut essen<span class="accent">.</span></h1><p class="sub">Behalte Kalorien und Eiweiß für Fettabbau und Muskelaufbau im Blick.</p>
    <section class="panel"><label class="form-label" for="foodDate">Tag auswählen</label><input id="foodDate" class="field" type="date" value="${foodDate}">
      <div class="food-metric"><div class="row-between"><span class="small-muted">Kalorien</span><strong>${fmt(totalCal)} / ${fmt(state.targets.calories)} kcal</strong></div><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100,percent(totalCal,state.targets.calories))}%"></div></div></div>
      <div class="food-metric"><div class="row-between"><span class="small-muted">Eiweiß</span><strong>${fmt(totalProt,1)} / ${fmt(state.targets.protein)} g</strong></div><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100,percent(totalProt,state.targets.protein))}%"></div></div></div>
      <p class="note">Noch offen: ${fmt(Math.max(0,state.targets.calories-totalCal))} kcal und ${fmt(Math.max(0,state.targets.protein-totalProt),1)} g Eiweiß.</p></section>
    <section class="panel"><h3 class="panel-title">Mahlzeit hinzufügen</h3><p class="panel-sub">Trage geschätzte oder abgewogene Werte ein. Fotos werden in Version 1 noch nicht automatisch ausgewertet.</p>
      <form id="addFood"><label class="form-label">Name</label><input class="field" name="name" required maxlength="80" placeholder="z. B. Reis mit Hähnchen">
      <div class="form-grid"><div><label class="form-label">Kalorien (kcal)</label><input class="field" name="calories" inputmode="decimal" required placeholder="z. B. 650"></div><div><label class="form-label">Eiweiß (g)</label><input class="field" name="protein" inputmode="decimal" required placeholder="z. B. 45"></div></div><button class="primary" type="submit">Mahlzeit speichern</button></form></section>
    <section class="panel"><h3 class="panel-title">Mahlzeiten am ${dateDisplay(foodDate)}</h3>
    ${entries.length?entries.slice().reverse().map(e=>`<div class="history-item row-between"><div><strong>${escapeHtml(e.name)}</strong><span>${fmt(e.calories)} kcal · ${fmt(e.protein,1)} g Eiweiß</span></div><button class="mini-btn danger" data-delete-food="${escapeHtml(e.id)}">Löschen</button></div>`).join(''):'<div class="empty">Noch keine Mahlzeit erfasst.</div>'}</section>`;
}
function renderSettings(){return `<div class="eyebrow">EINSTELLUNGEN</div><h1 class="page-title">Deine App<span class="accent">.</span></h1><p class="sub">Deine Daten gehören dir. Die App sendet keine Trainings- oder Essensdaten an einen Server.</p>
  <section class="panel"><h3 class="panel-title">Deine Ernährungsziele</h3><form id="targets"><div class="form-grid"><div><label class="form-label">Kalorien / Tag</label><input class="field" name="calories" type="number" min="500" max="8000" value="${state.targets.calories}" required></div><div><label class="form-label">Eiweiß / Tag (g)</label><input class="field" name="protein" type="number" min="0" max="600" value="${state.targets.protein}" required></div></div><button class="primary" type="submit">Ziele speichern</button></form></section>
  <section class="panel"><h3 class="panel-title">Backup deiner Daten</h3><p class="panel-sub">Wichtig: Die Einträge werden nur auf diesem Gerät in dieser App gespeichert. Exportiere regelmäßig ein Backup, damit du bei Gerätewechsel oder gelöschten Browserdaten nichts verlierst.</p>
    <button class="primary" id="exportData">⬇ Backup als JSON speichern</button>
    <label class="file-label">⬆ Backup importieren <input type="file" id="importData" accept=".json,application/json"></label><p class="note">Beim Import werden alle bisherigen Daten dieser App ersetzt.</p></section>
  <section class="panel"><h3 class="panel-title">Zum iPhone-Home-Bildschirm</h3><p class="panel-sub">Veröffentliche diese Dateien als HTTPS-Webseite, öffne sie in Safari und wähle <strong>Teilen → Zum Home-Bildschirm</strong>. Die App startet anschließend ohne normale Browserleiste.</p><p class="note">Wenn du die App installiert hast, nutze möglichst immer dasselbe Home-Bildschirm-Symbol. Safari und die installierte Web-App können getrennte lokale Speicher haben.</p></section>
  <section class="panel"><h3 class="panel-title">Über FitTrack</h3><p class="panel-sub">Version 1.0 · Kostenlos · Funktioniert nach dem ersten vollständigen Laden auch offline. Keine Registrierung, keine Werbung und keine externen Bibliotheken.</p><div class="warning">⚠️ Diese App hat keine Cloud-Synchronisierung. Regelmäßige Backups sind wichtig. Du kannst alle Übungen im Trainingstab ergänzen oder entfernen.</div></section>`;}
function saveWorkout(){
  const dr=draftFor(selectedPlan);const exercises=state.plans[selectedPlan].map(ex=>{
    const sets=(dr[ex.id]||[]).filter(s=>s.done&&Number.isFinite(number(s.weight))&&Number.isFinite(number(s.reps))&&number(s.weight)>=0&&number(s.reps)>0&&number(s.reps)<=200).map(s=>({weight:number(s.weight),reps:number(s.reps)}));
    return {name:ex.name,sets};
  }).filter(e=>e.sets.length);
  if(!exercises.length){notify('Trage mindestens einen Satz ein und setze ✓.');return;}
  const hasInvalid=Object.values(dr).some(sets=>sets.some(s=>s.done&&(!Number.isFinite(number(s.weight))||!Number.isFinite(number(s.reps))||number(s.weight)<0||number(s.reps)<=0||number(s.reps)>200)));
  if(hasInvalid){notify('Bitte markierte Sätze korrigieren (kg und Wdh.).');return;}
  state.sessions.push({id:uid(),date:today(),plan:selectedPlan,exercises});state.drafts[selectedPlan]={};store();render();notify('Training gespeichert – stark! 💪');
}
function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function handleClick(e){
  const nav=e.target.closest('[data-nav]');if(nav){tab=nav.dataset.nav;window.scrollTo(0,0);render();return;}
  const p=e.target.closest('[data-plan]');if(p){selectedPlan=p.dataset.plan;render();return;}
  const add=e.target.closest('[data-add-set]');if(add){const arr=draftFor(selectedPlan)[add.dataset.addSet];if(arr.length>=12){notify('Maximal 12 Sätze pro Übung.');return;}arr.push({weight:'',reps:'',done:false});store();render();return;}
  const rmset=e.target.closest('[data-remove-set]');if(rmset){draftFor(selectedPlan)[rmset.dataset.removeSet].pop();store();render();return;}
  const rm=e.target.closest('[data-remove-ex]');if(rm){if(!confirm('Diese Übung aus Plan '+selectedPlan+' entfernen? Bisherige Trainings bleiben erhalten.'))return;state.plans[selectedPlan]=state.plans[selectedPlan].filter(x=>x.id!==rm.dataset.removeEx);delete state.drafts[selectedPlan]?.[rm.dataset.removeEx];store();render();return;}
  if(e.target.closest('#saveWorkout')){saveWorkout();return;}
  if(e.target.closest('#exportData')){download(`FitTrack-Backup-${today()}.json`,JSON.stringify(state,null,2),'application/json');notify('Backup exportiert – bitte sicher ablegen.');return;}
  const delS=e.target.closest('[data-delete-session]');if(delS){if(!confirm('Training wirklich löschen?'))return;state.sessions=state.sessions.filter(s=>s.id!==delS.dataset.deleteSession);store();render();return;}
  const delW=e.target.closest('[data-delete-weight]');if(delW){state.weights=state.weights.filter(s=>s.id!==delW.dataset.deleteWeight);store();render();return;}
  const delF=e.target.closest('[data-delete-food]');if(delF){state.foods=state.foods.filter(s=>s.id!==delF.dataset.deleteFood);store();render();return;}
}
function handleInput(e){
  const ex=e.target.closest('[data-exercise]');if(ex && (e.target.matches('[data-weight]')||e.target.matches('[data-reps]'))){
    const i=Number(e.target.dataset.i), d=draftFor(selectedPlan)[ex.dataset.exercise][i];if(!d)return;
    d[e.target.matches('[data-weight]')?'weight':'reps']=e.target.value;
    if(!d.done&&String(d.weight).trim()!==''&&String(d.reps).trim()!==''){d.done=true;const check=ex.querySelector(`[data-done][data-i="${i}"]`);if(check)check.checked=true;}
    store();
  }
}
function handleChange(e){
  const ex=e.target.closest('[data-exercise]');if(ex&&e.target.matches('[data-done]')){const d=draftFor(selectedPlan)[ex.dataset.exercise]?.[Number(e.target.dataset.i)];if(d)d.done=e.target.checked;store();return;}
  if(e.target.id==='exerciseSelect'){selectedExercise=e.target.value;render();return;}
  if(e.target.id==='foodDate'){foodDate=e.target.value||today();render();return;}
  if(e.target.id==='importData'){
    const file=e.target.files?.[0];if(!file)return;
    file.text().then(txt=>{const next=validateState(JSON.parse(txt));if(!confirm('Alle aktuellen App-Daten durch dieses Backup ersetzen?'))return;state=next;selectedExercise='';store();render();notify('Backup erfolgreich importiert.');}).catch(error=>{console.error(error);notify('Import fehlgeschlagen: ungültige Datei.');});
  }
}
function handleSubmit(e){
  if(!['addExercise','addWeight','addFood','targets'].includes(e.target.id))return;e.preventDefault();const form=e.target;const data=new FormData(form);
  if(form.id==='addExercise'){
    const name=String(data.get('exercise')||'').trim().slice(0,80);if(!name){notify('Bitte einen Namen eingeben.');return;}if(state.plans[selectedPlan].some(x=>x.name.toLowerCase()===name.toLowerCase())){notify('Die Übung ist schon im Plan.');return;}
    if(state.plans[selectedPlan].length>=45){notify('Zu viele Übungen in diesem Plan.');return;}
    state.plans[selectedPlan].push({id:uid(),name,count:3,goal:'Deine eigene Übung'});store();render();notify('Übung hinzugefügt.');
  }
  if(form.id==='addWeight'){
    const kg=number(data.get('kg')),date=String(data.get('date')||today());if(!Number.isFinite(kg)||kg<20||kg>400){notify('Bitte ein realistisches Gewicht eingeben.');return;}
    progressDate=date;state.weights.push({id:uid(),date,kg});store();render();notify('Gewicht gespeichert.');
  }
  if(form.id==='addFood'){
    const name=String(data.get('name')||'').trim().slice(0,80),calories=number(data.get('calories')),protein=number(data.get('protein'));
    if(!name||!Number.isFinite(calories)||calories<0||calories>20000||!Number.isFinite(protein)||protein<0||protein>1000){notify('Bitte gültige Nährwerte eingeben.');return;}
    state.foods.push({id:uid(),date:foodDate,name,calories,protein});store();render();notify('Mahlzeit gespeichert.');
  }
  if(form.id==='targets'){
    const calories=number(data.get('calories')),protein=number(data.get('protein'));
    if(!Number.isFinite(calories)||calories<500||calories>8000||!Number.isFinite(protein)||protein<0||protein>600){notify('Bitte gültige Ziele eingeben.');return;}
    state.targets={calories,protein};store();render();notify('Ziele aktualisiert.');
  }
}
document.addEventListener('click',handleClick);document.addEventListener('input',handleInput);document.addEventListener('change',handleChange);document.addEventListener('submit',handleSubmit);
store();render();
if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Offline-Modus nicht aktiviert:',err));
