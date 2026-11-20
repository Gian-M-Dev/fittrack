/* FitTrack 2.0 — rein lokal, keine API-Keys, keine Drittanbieter-Bibliotheken.
 * Kompatibel mit FitTrack 1: automatischer Import nur beim ersten Start.
 * Das alte lokale Backup bleibt unter fittrack-local-v1 unangetastet.
 */
'use strict';
const KEY='fittrack-local-v2', OLD_KEY='fittrack-local-v1';
const GROUPS=['Brust','Rücken','Schultern','Beine','Po','Bizeps','Trizeps','Waden','Core','Ganzkörper','Andere'];
const RAW_CATALOG={
 'Brust':['Bankdrücken','Kurzhantel-Bankdrücken','Schrägbankdrücken','Schrägbankdrücken (Kurzhantel)','Brustpresse','Butterfly','Kabel-Flys','Liegestütze','Dips (Brust)','Kabeldrücken für Brust','Brustpresse schräg','Kurzhantel-Flys'],
 'Rücken':['Latziehen','Klimmzüge','Kabelrudern','Langhantelrudern','Rudern brustgestützt','Kurzhantelrudern einarmig','T-Bar-Rudern','Hyperextensions','Latziehen im Neutralgriff','Überzüge am Kabel','Rudern an der Maschine'],
 'Schultern':['Schulterdrücken','Schulterdrücken (Kurzhantel)','Arnold Press','Seitheben','Seitheben am Kabel','Reverse Flys','Face Pulls','Frontheben','Schulterpresse an der Maschine','Y-Raises'],
 'Beine':['Kniebeugen','Frontkniebeugen','Beinpresse','Hackenschmidt-Kniebeugen','Beinstrecker','Beinbeuger','Rumänisches Kreuzheben','Kreuzheben','Bulgarische Kniebeugen','Ausfallschritte','Nordic Hamstring Curl','Goblet Squats','Smith-Kniebeugen','Adduktorenmaschine','Good Mornings'],
 'Po':['Hip Thrust','Glute Bridge','Abduktorenmaschine','Kabel-Kickbacks','Step-Ups','Einbeiniger Hip Thrust','Kabel-Pull-Throughs'],
 'Bizeps':['Bizepscurls','Hammer Curls','Kabelcurls','Scottcurls','Konzentrationscurls','Schrägbank-Curls','Zottman Curls'],
 'Trizeps':['Trizepsdrücken','Trizepsdrücken über Kopf','Skull Crushers','Enges Bankdrücken','Dips (Trizeps)','Trizepsdrücken am Seil','Trizeps-Kickbacks'],
 'Waden':['Wadenheben stehend','Wadenheben sitzend','Wadenpresse','Donkey Calf Raises'],
 'Core':['Bauchmaschine','Kabelcrunches','Crunches','Hängendes Beinheben','Plank','Ab Wheel','Pallof Press','Seitstütz','Russian Twist'],
 'Ganzkörper':['Farmer’s Walk','Kettlebell Swing','Burpees','Schlitten schieben']
};
const GROUP_ABBR={'Brust':'BR','Rücken':'RÜ','Schultern':'SC','Beine':'BE','Po':'PO','Bizeps':'BI','Trizeps':'TR','Waden':'WA','Core':'CO','Ganzkörper':'GK','Andere':'AN'};
const slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const BUILTINS=Object.entries(RAW_CATALOG).flatMap(([group,names])=>names.map(name=>({id:'b-'+slug(name),name,group,custom:false})));
const LEGACY_ALIASES={'Bulgarian Split Squat':'Bulgarische Kniebeugen','Schrägbankdrücken':'Schrägbankdrücken','Trizepsdrücken':'Trizepsdrücken'};
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const pad=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const nowTime=()=>{const d=new Date();return `${pad(d.getHours())}:${pad(d.getMinutes())}`;};
const parseDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))?new Date(`${s}T12:00:00`):new Date(NaN);
const validDate=s=>Number.isFinite(parseDate(s).getTime())&&parseDate(s).toISOString().slice(0,10)===s; // midday avoids DST midnight edges
const dateShift=(date,n)=>{const d=parseDate(date);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const dateText=s=>validDate(s)?`${s.slice(8,10)}.${s.slice(5,7)}.${s.slice(0,4)}`:'–';
const num=x=>(x===null||x===undefined||String(x).trim()==='')?NaN:Number(String(x).replace(',','.'));
const bounded=(x,min,max,fallback)=>{const n=num(x);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
const fmt=(x,dec=0)=>Number(x).toLocaleString('de-DE',{maximumFractionDigits:dec});
const html=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeId=x=>String(x||uid()).slice(0,90);
const timeOK=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
const defaultDraft=()=>({id:uid(),date:today(),startTime:nowTime(),endTime:'',notes:'',entries:[],editingId:null});
const defaultTimer=()=>({seconds:90,remaining:90,running:false,endAt:null,expired:false,sound:true});
const blankState=()=>({version:2,sessions:[],weights:[],foods:[],targets:{calories:2400,protein:180,carbs:240,fat:80},customExercises:[],draft:defaultDraft(),timer:defaultTimer()});
function lookup(name,custom=[]){const search=LEGACY_ALIASES[name]||name;return [...BUILTINS,...custom].find(e=>e.name.toLowerCase()===String(search).toLowerCase());}
function catalog(){return [...BUILTINS,...state.customExercises];}
function exerciseById(id){return catalog().find(x=>x.id===id);}
function cleanSet(x){if(!x||typeof x!=='object')return null;const weight=num(x.weight),reps=num(x.reps),rir=num(x.rir);
  if(!Number.isFinite(weight)||weight<0||weight>1500||!Number.isFinite(reps)||reps<1||reps>200)return null;
  return {id:safeId(x.id),weight,reps,rir:Number.isFinite(rir)&&rir>=0&&rir<=10?rir:null};}
function cleanEntries(arr){if(!Array.isArray(arr))return [];
  return arr.slice(0,50).filter(e=>e&&typeof e==='object').map(e=>({id:safeId(e.id),exerciseId:String(e.exerciseId||'').slice(0,90),name:String(e.name||'Übung').slice(0,90),group:GROUPS.includes(e.group)?e.group:'Andere',sets:(Array.isArray(e.sets)?e.sets:[]).slice(0,30).map(cleanSet).filter(Boolean)})).filter(e=>e.sets.length);}
function cleanDraftEntries(arr){if(!Array.isArray(arr))return [];
  return arr.slice(0,50).filter(e=>e&&typeof e==='object').map(e=>({id:safeId(e.id),exerciseId:String(e.exerciseId||'').slice(0,90),name:String(e.name||'Übung').slice(0,90),group:GROUPS.includes(e.group)?e.group:'Andere',sets:(Array.isArray(e.sets)?e.sets:[]).slice(0,20).map(s=>({id:safeId(s?.id),weight:String(s?.weight??'').slice(0,15),reps:String(s?.reps??'').slice(0,8),rir:String(s?.rir??'').slice(0,4),done:Boolean(s?.done)}))}));}
function normalState(raw){if(!raw||typeof raw!=='object'||!Array.isArray(raw.sessions)||!Array.isArray(raw.weights)||!Array.isArray(raw.foods))throw Error('Ungültiges Backup');
  const s=blankState();s.customExercises=(Array.isArray(raw.customExercises)?raw.customExercises:[]).slice(0,400).filter(e=>e&&typeof e.name==='string'&&e.name.trim()).map(e=>({id:safeId(e.id),name:e.name.trim().slice(0,90),group:GROUPS.includes(e.group)?e.group:'Andere',custom:true}));
  s.sessions=raw.sessions.slice(-4000).filter(x=>x&&validDate(x.date)).map(x=>({id:safeId(x.id),date:x.date, startTime:timeOK(x.startTime)?x.startTime:'',endTime:timeOK(x.endTime)?x.endTime:'',duration:Number.isFinite(num(x.duration))&&num(x.duration)>=0?Math.min(1440,num(x.duration)):null,notes:String(x.notes||'').slice(0,500),label:String(x.label||'').slice(0,80),entries:cleanEntries(x.entries)}));
  s.weights=raw.weights.slice(-3000).filter(x=>x&&validDate(x.date)&&num(x.kg)>0&&num(x.kg)<400).map(x=>({id:safeId(x.id),date:x.date,kg:num(x.kg)}));
  s.foods=raw.foods.slice(-8000).filter(x=>x&&validDate(x.date)&&Number.isFinite(num(x.calories))&&Number.isFinite(num(x.protein))).map(x=>({id:safeId(x.id),date:x.date,name:String(x.name||'Mahlzeit').slice(0,90),calories:bounded(x.calories,0,15000,0),protein:bounded(x.protein,0,1000,0),carbs:x.carbs==null?null:bounded(x.carbs,0,1500,null),fat:x.fat==null?null:bounded(x.fat,0,1500,null)}));
  if(raw.targets)s.targets={calories:bounded(raw.targets.calories,500,8000,2400),protein:bounded(raw.targets.protein,0,600,180),carbs:bounded(raw.targets.carbs,0,1000,240),fat:bounded(raw.targets.fat,0,500,80)};
  if(raw.draft&&typeof raw.draft==='object')s.draft={id:safeId(raw.draft.id),date:validDate(raw.draft.date)?raw.draft.date:today(),startTime:timeOK(raw.draft.startTime)?raw.draft.startTime:nowTime(),endTime:timeOK(raw.draft.endTime)?raw.draft.endTime:'',notes:String(raw.draft.notes||'').slice(0,500),entries:cleanDraftEntries(raw.draft.entries),editingId:raw.draft.editingId?String(raw.draft.editingId).slice(0,90):null};
  if(raw.timer&&typeof raw.timer==='object')s.timer={seconds:bounded(raw.timer.seconds,10,1800,90),remaining:bounded(raw.timer.remaining,0,1800,90),running:Boolean(raw.timer.running)&&Number.isFinite(num(raw.timer.endAt))&&num(raw.timer.endAt)>0,endAt:Number.isFinite(num(raw.timer.endAt))?num(raw.timer.endAt):null,expired:Boolean(raw.timer.expired),sound:raw.timer.sound!==false};
  return s;}
function fromLegacy(raw){if(!raw||!raw.plans||!Array.isArray(raw.sessions)||!Array.isArray(raw.weights)||!Array.isArray(raw.foods))throw Error('Kein FitTrack-1-Backup');
  const s=blankState();const customMap=new Map();
  function exByName(name){const found=lookup(name,[]);if(found)return found;const id='legacy-'+slug(name)+'-'+String(customMap.size);if(!customMap.has(name))customMap.set(name,{id,name:String(name).slice(0,90),group:'Andere',custom:true});return customMap.get(name);}
  for(const session of raw.sessions.slice(-4000)){
    if(!session||!validDate(session.date)||!Array.isArray(session.exercises))continue;
    const entries=session.exercises.filter(e=>e&&typeof e.name==='string'&&Array.isArray(e.sets)).map(e=>{const found=exByName(e.name);return {id:uid(),exerciseId:found.id,name:found.name,group:found.group,sets:e.sets.map(x=>cleanSet({...x,id:uid()})).filter(Boolean)}}).filter(e=>e.sets.length);
    s.sessions.push({id:safeId(session.id),date:session.date,startTime:'',endTime:'',duration:null,notes:'',label:session.plan?`Alt: Plan ${String(session.plan).slice(0,2)}`:'Alt',entries});
  }
  // Selbst angelegte Übungen aus den alten A/B/C-Plänen auch ohne frühere Sätze behalten.
  for(const plan of ['A','B','C'])for(const x of (Array.isArray(raw.plans[plan])?raw.plans[plan]:[]))if(x&&typeof x.name==='string'&&x.name.trim())exByName(x.name);
  s.customExercises=[...customMap.values()];
  // Falls in V1 noch eine begonnene Einheit gespeichert ist: als freien Entwurf retten.
  let best=[];
  for(const plan of ['A','B','C']){
    const oldPlan=Array.isArray(raw.plans[plan])?raw.plans[plan]:[];
    const drafts=raw.drafts?.[plan];if(!drafts||typeof drafts!=='object')continue;
    const collected=[];
    for(const oldEx of oldPlan){const records=drafts[oldEx.id];if(!Array.isArray(records))continue;
      if(!records.some(r=>r&&(r.done||String(r.weight??'').trim()||String(r.reps??'').trim())))continue;
      const exercise=exByName(oldEx.name);
      collected.push({id:uid(),exerciseId:exercise.id,name:exercise.name,group:exercise.group,sets:records.slice(0,20).map(r=>({id:uid(),weight:String(r?.weight??''),reps:String(r?.reps??''),rir:'',done:Boolean(r?.done)}))});
    }
    if(collected.length>best.length)best=collected;
  }
  if(best.length)s.draft.entries=best;
  s.weights=raw.weights.filter(x=>x&&validDate(x.date)&&num(x.kg)>0&&num(x.kg)<400).map(x=>({id:safeId(x.id),date:x.date,kg:num(x.kg)}));
  s.foods=raw.foods.filter(x=>x&&validDate(x.date)&&Number.isFinite(num(x.calories))&&Number.isFinite(num(x.protein))).map(x=>({id:safeId(x.id),date:x.date,name:String(x.name||'Mahlzeit').slice(0,90),calories:bounded(x.calories,0,15000,0),protein:bounded(x.protein,0,1000,0),carbs:null,fat:null}));
  if(raw.targets){s.targets.calories=bounded(raw.targets.calories,500,8000,2400);s.targets.protein=bounded(raw.targets.protein,0,600,180);}
  return s;
}
let state,migrated=false,recovered=false;
try{
  const current=localStorage.getItem(KEY);
  if(current)state=normalState(JSON.parse(current));
  else {const old=localStorage.getItem(OLD_KEY);if(old){state=fromLegacy(JSON.parse(old));migrated=true;}else state=blankState();}
}catch(err){console.warn('FitTrack Speicherproblem',err);state=blankState();recovered=true;}
let tab='training',groupFilter='Alle',searchValue='',statsDays=28,statsExerciseId='',foodDate=today(),toastHandle=null,webAudio=null;
const $=id=>document.getElementById(id);
function store(){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch(err){console.error(err);notify('Speichern fehlgeschlagen – bitte Speicher prüfen.');return false;}}
function notify(message){const t=$('toast');if(!t)return;t.textContent=message;t.classList.add('visible');clearTimeout(toastHandle);toastHandle=setTimeout(()=>t.classList.remove('visible'),3500);}
function latestEntry(exId){return state.sessions.slice().sort((a,b)=>b.date.localeCompare(a.date)).flatMap(s=>s.entries).find(e=>e.exerciseId===exId&&e.sets.length);}
function entryName(e){return e.name||exerciseById(e.exerciseId)?.name||'Übung';}
function durationOf(date,start,end){if(!validDate(date)||!timeOK(start)||!timeOK(end))return null;const mins=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));let result=mins(end)-mins(start);if(result<0)result+=1440;return result;}
function sessionSets(s){return s.entries.reduce((acc,e)=>acc+e.sets.length,0);}
function sessionLoad(s){return s.entries.reduce((acc,e)=>acc+e.sets.reduce((a,set)=>a+set.weight*set.reps,0),0);}
function groupLabel(name){return GROUPS.includes(name)?name:'Andere';}
function migrateNotice(){if(migrated){migrated=false;setTimeout(()=>notify('Alte Trainingseinträge aus Version 1 übernommen ✓'),200);}if(recovered){recovered=false;setTimeout(()=>notify('Alte Daten konnten nicht gelesen werden; bitte Backup importieren.'),300);}}
function render(){
  document.querySelectorAll('[data-nav]').forEach(b=>{b.classList.toggle('active',b.dataset.nav===tab);b.setAttribute('aria-current',b.dataset.nav===tab?'page':'false');});
  $('app').innerHTML={training:renderTraining,library:renderLibrary,stats:renderStats,food:renderFood,settings:renderSettings}[tab]();
  tickTimer();migrateNotice();
}
function switchTab(next){tab=next;window.scrollTo({top:0,behavior:'instant'});render();}
function renderTimer(){
 const t=state.timer,remaining=timerRemaining(),d=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
 return `<section class="panel" id="timerPanel"><div class="row between"><h3 class="panel-title" style="margin:0">⏱️ Pausentimer</h3><span class="badge ${t.expired?'alt':''}" id="timerStatus">${t.running?'Läuft':t.expired?'Abgelaufen':'Bereit'}</span></div>
 <div class="row between"><div class="timer-clock" id="timerClock">${d}</div><button class="mini-btn" id="testSound">♪ Ton testen</button></div>
 <div class="timer-presets">${[60,90,120,180].map(secs=>`<button class="chip ${secs===t.seconds?'active':''}" data-timer-preset="${secs}">${secs<120?secs+' s':secs/60+' min'}</button>`).join('')}</div>
 <div class="form-grid mt8"><div><label class="form-label" for="customTimer">Eigene Dauer (Sekunden)</label><input id="customTimer" class="field" type="number" min="10" max="1800" step="5" value="${t.seconds}"></div><div><label class="form-label" for="soundToggle">Tonsignal</label><select id="soundToggle" class="field"><option value="on" ${t.sound?'selected':''}>Ein</option><option value="off" ${!t.sound?'selected':''}>Aus</option></select></div></div>
 <div class="action-row"><button class="${t.running?'secondary':'primary'}" data-timer-toggle>${t.running?'Pause':(t.remaining!==t.seconds&&t.remaining>0?'Fortsetzen':'Starten')}</button><button class="secondary" data-timer-add="30">+30 s</button><button class="secondary" data-timer-reset>↺ Reset</button></div>
 <p class="note">Der Ton funktioniert verlässlich nur bei geöffneter, aktiver App. Bei gesperrtem iPhone kann iOS den Alarm unterdrücken.</p></section>`;
}
function renderTraining(){
 const d=state.draft,done=d.entries.reduce((sum,e)=>sum+e.sets.filter(s=>s.done).length,0),edit=Boolean(d.editingId);
 return `<div class="eyebrow">DEIN TRAINING, DEINE AUSWAHL</div><h1 class="page-title">Workout<span class="accent">.</span></h1><p class="sub">Stelle jede Einheit neu zusammen. Übungen und Sätze bleiben als Entwurf lokal gespeichert.</p>
 <section class="hero"><div class="eyebrow">${edit?'GESPEICHERTES TRAINING BEARBEITEN':'AKTUELLE EINHEIT'}</div><h2>${d.entries.length} Übungen · ${done} abgeschlossene Sätze</h2><p>Ohne feste Trainingstage: Wähle genau die Übungen aus, die du heute machst.</p><div class="hero-metrics"><div class="hero-metric"><strong>${state.sessions.length}</strong><span>Gespeicherte Einheiten</span></div><div class="hero-metric"><strong>${state.sessions.length?dateText([...state.sessions].sort((a,b)=>b.date.localeCompare(a.date))[0].date):'–'}</strong><span>Zuletzt trainiert</span></div></div></section>
 <section class="panel"><h3 class="panel-title">Datum und Trainingszeit</h3><div class="form-grid time-grid"><div class="date-field"><label class="form-label" for="workoutDate">Datum</label><input id="workoutDate" type="date" class="field" value="${html(d.date)}"></div><div><label class="form-label" for="workoutStart">Start</label><input id="workoutStart" type="time" class="field" value="${html(d.startTime)}"><button class="mini-btn" data-now="start">Jetzt</button></div><div><label class="form-label" for="workoutEnd">Ende</label><input id="workoutEnd" type="time" class="field" value="${html(d.endTime)}"><button class="mini-btn" data-now="end">Jetzt</button></div></div>
 <p class="hint" id="durationPreview">${durationPreview()}</p><label class="form-label" for="workoutNotes">Notizen (optional)</label><textarea id="workoutNotes" class="field" maxlength="500" placeholder="Energie, Technik, Gefühl …">${html(d.notes)}</textarea></section>
 ${renderTimer()}
 <div class="section-row"><h2>Deine Übungen</h2><button class="secondary" data-open-library>＋ Übung wählen</button></div>
 ${d.entries.length?d.entries.map((e,i)=>renderDraftExercise(e,i)).join(''):`<div class="empty"><strong>Dein Training ist noch leer</strong>Wähle Übungen nach Muskelgruppe aus der Bibliothek.<div class="action-row"><button class="primary w100" data-open-library>＋ Übungen hinzufügen</button></div></div>`}
 <div class="action-row"><button class="primary" data-save-workout>${edit?'Änderungen speichern':'Training abschließen & speichern'}</button>${d.entries.length||edit?'<button class="secondary" data-clear-draft>Neues Training</button>':''}</div>
 <p class="note">Zum Speichern mindestens einen Satz mit ✓ markieren. Datum, Start- und Endzeit können auch rückwirkend eingetragen werden.</p>`;
}
function durationPreview(){const d=state.draft;if(!timeOK(d.startTime)||!timeOK(d.endTime))return 'Trage beide Uhrzeiten ein oder tippe bei „Ende“ auf „Jetzt“.';
 const n=durationOf(d.date,d.startTime,d.endTime);return `Trainingsdauer: ${fmt(n)} Minuten${d.endTime<d.startTime?' · Ende am Folgetag':''}`;}
function renderDraftExercise(e,i){
  const prev=latestEntry(e.exerciseId),previous=prev?.sets.map(s=>`${fmt(s.weight,1)} kg × ${fmt(s.reps)}`).join(' · ');
  return `<article class="exercise-card" data-entry="${html(e.id)}"><div class="exercise-head"><div><h3>${i+1}. ${html(entryName(e))}</h3><span class="meta">${html(groupLabel(e.group))}</span></div><button class="mini-btn danger" data-remove-entry="${html(e.id)}">Entfernen</button></div>
  ${previous?`<div class="last">Letztes Mal: ${html(previous)}</div>`:''}
  <div class="sets-header"><span>#</span><span>kg</span><span>Wdh.</span><span>RIR</span><span>✓</span><span>–</span></div>
  ${e.sets.map((s,idx)=>`<div class="set-line" data-set="${html(s.id)}"><span class="set-num">${idx+1}</span><input aria-label="Gewicht Satz ${idx+1}" class="small-input" data-set-input="weight" inputmode="decimal" placeholder="kg" value="${html(s.weight)}"><input aria-label="Wiederholungen Satz ${idx+1}" class="small-input" data-set-input="reps" inputmode="numeric" placeholder="Wdh" value="${html(s.reps)}"><input aria-label="RIR Satz ${idx+1}" class="small-input" data-set-input="rir" inputmode="decimal" placeholder="–" value="${html(s.rir)}"><input aria-label="Satz ${idx+1} abgeschlossen" type="checkbox" class="done-check" data-set-done ${s.done?'checked':''}><button class="set-remove" type="button" data-remove-set title="Satz entfernen" aria-label="Satz ${idx+1} entfernen">×</button></div>`).join('')}
  <div class="exercise-footer"><button class="mini-btn" data-add-set="${html(e.id)}">＋ Satz hinzufügen</button><span class="small-muted">RIR = Wdh. in Reserve</span></div></article>`;
}
function renderLibrary(){
 const available=catalog(),shown=available.filter(x=>(groupFilter==='Alle'||x.group===groupFilter)&&(!searchValue||x.name.toLowerCase().includes(searchValue.toLowerCase())));
 const inDraft=new Set(state.draft.entries.map(e=>e.exerciseId));
 return `<div class="eyebrow">ÜBUNGSBIBLIOTHEK</div><h1 class="page-title">Übungen<span class="accent">.</span></h1><p class="sub">Nach Muskelgruppe suchen, antippen und deinem aktuellen Workout hinzufügen. Eigene Übungen bleiben nur bei dir gespeichert.</p>
 <section class="panel"><label class="form-label" for="exerciseSearch">Übung suchen</label><input id="exerciseSearch" class="field" type="search" placeholder="z. B. Bankdrücken, Rudern, Squat …" value="${html(searchValue)}" autocomplete="off"><div class="chip-row" style="margin-top:12px">${['Alle',...GROUPS].map(g=>`<button class="chip ${g===groupFilter?'active':''}" data-group="${html(g)}">${html(g)}</button>`).join('')}</div><p class="small-muted" id="catalogCount">${shown.length} Übungen angezeigt</p><div id="catalogItems">${shown.map(e=>renderCatalogItem(e,inDraft)).join('')||'<div class="empty">Keine passende Übung gefunden.</div>'}</div></section>
 <section class="panel"><h3 class="panel-title">Eigene Übung erstellen</h3><p class="panel-sub">Fehlt etwas? Du kannst den Namen und die primäre Muskelgruppe selbst festlegen.</p><form id="newExercise"><label class="form-label">Name der Übung</label><input class="field" name="name" placeholder="z. B. Schrägbank Kabelzug" required maxlength="90"><label class="form-label">Primäre Muskelgruppe</label><select class="field" name="group">${GROUPS.map(g=>`<option value="${html(g)}">${html(g)}</option>`).join('')}</select><label class="row" style="margin:12px 0;font-size:13px"><input type="checkbox" name="addNow" checked> Direkt zum Training hinzufügen</label><button type="submit" class="primary w100">Eigene Übung speichern</button></form></section>
 <button class="secondary w100" data-go-training>← Zurück zum Training (${state.draft.entries.length} Übungen)</button>`;
}
function renderCatalogItem(e,inDraft){return `<div class="catalog-item" data-catalog-item data-search="${html(e.name.toLowerCase())}"><div><strong>${html(e.name)}</strong><small>${html(e.group)}${e.custom?' · Eigene Übung':''}</small>${e.custom?`<button class="mini-btn danger" data-delete-custom="${html(e.id)}">Löschen</button>`:''}</div><button class="${inDraft.has(e.id)?'secondary':'primary'}" data-pick-exercise="${html(e.id)}">${inDraft.has(e.id)?'✓ Im Training':'＋ Hinzufügen'}</button></div>`;}
function addExercise(id){const ex=exerciseById(id);if(!ex){notify('Übung nicht gefunden.');return;}
 if(state.draft.entries.some(e=>e.exerciseId===id)){notify('Die Übung ist bereits im Training.');return;}
 const last=latestEntry(id),seed=last?.sets||[];
 state.draft.entries.push({id:uid(),exerciseId:ex.id,name:ex.name,group:ex.group,sets:Array.from({length:Math.min(Math.max(seed.length,3),8)},(_,idx)=>({id:uid(),weight:seed[idx]?.weight??'',reps:seed[idx]?.reps??'',rir:'',done:false}))});
 store();notify(`${ex.name} hinzugefügt ✓`);render();
}
function sortSessions(arr){return arr.slice().sort((a,b)=>(a.date+' '+(a.startTime||'')).localeCompare(b.date+' '+(b.startTime||'')));}
function lastNDays(n){return dateShift(today(),1-n);}
function trainingWindows(){const all=sortSessions(state.sessions),recent=all.filter(s=>s.date>=lastNDays(statsDays)&&s.date<=today());return {all,recent};}
function metric(label,value,subtitle=''){return `<div class="metric"><span>${html(label)}</span><strong>${html(value)}</strong>${subtitle?`<small>${html(subtitle)}</small>`:''}</div>`;}
function lineChart(pairs,label,suffix='',dec=1){const data=pairs.filter(d=>Number.isFinite(d.y)).slice(-60);if(!data.length)return '<div class="empty">Noch keine Daten für diesen Verlauf.</div>';
 const W=360,H=180,padX=20,padY=21,values=data.map(p=>p.y),min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,1),lo=min-range*.18,hi=max+range*.18,
 x=i=>padX+(W-2*padX)*(data.length===1?.5:i/(data.length-1)),y=v=>H-padY-(H-padY*2)*(v-lo)/(hi-lo),coord=data.map((p,i)=>`${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
 return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${html(label)}: ${data.length} Messpunkte von ${fmt(data[0].y,dec)} bis ${fmt(data.at(-1).y,dec)} ${html(suffix)}">
 <line x1="${padX}" x2="${W-padX}" y1="${H-padY}" y2="${H-padY}" stroke="#476078" stroke-width="1"/><line x1="${padX}" x2="${W-padX}" y1="${padY}" y2="${padY}" stroke="#294358" stroke-dasharray="4 6"/>
 <polyline fill="none" stroke="#76ecc5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${coord}"/>${data.map((p,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="${i===data.length-1?4.5:2.8}" fill="${i===data.length-1?'#fff':'#76ecc5'}"/>`).join('')}
 <text x="${padX}" y="13" fill="#b1c9d2" font-size="11">${fmt(max,dec)} ${html(suffix)}</text><text x="${padX}" y="${H-3}" fill="#a3b9c9" font-size="10">${html(dateText(data[0].date))}</text><text x="${W-padX}" text-anchor="end" y="${H-3}" fill="#a3b9c9" font-size="10">${html(dateText(data.at(-1).date))}</text></svg>`;
}
function estimation(set){return set.weight>0&&set.reps>=1&&set.reps<=10?set.weight*(1+set.reps/30):null;}
function selectedExerciseSeries(all,id){return all.flatMap(s=>{const relevant=s.entries.filter(e=>e.exerciseId===id).flatMap(e=>e.sets),estimations=relevant.map(estimation).filter(Number.isFinite);return estimations.length?[{date:s.date,y:Math.max(...estimations),sets:relevant}]:[];});}
function weekStart(date){const d=parseDate(date),weekday=(d.getDay()+6)%7;d.setDate(d.getDate()-weekday);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function weekBars(all){const current=weekStart(today()),keys=Array.from({length:8},(_,i)=>dateShift(current,(i-7)*7));const counts=keys.map(key=>all.filter(s=>weekStart(s.date)===key).length),max=Math.max(4,...counts);
 return `<div class="week-bars">${keys.map((key,i)=>`<div class="week-col"><strong>${counts[i]}</strong><div class="bar ${counts[i]?'':'zero'}" style="height:${Math.max(2,counts[i]/max*90)}px"></div><small>${key.slice(8,10)}.${key.slice(5,7)}</small></div>`).join('')}</div><p class="chart-caption">Einheiten je Kalenderwoche (Montagsbeginn), rechts die laufende Woche · Wunschziel: 3 Einheiten/Woche</p>`;}
function muscleChart(recent){const groups=GROUPS.filter(g=>g!=='Andere'),count=new Map(GROUPS.map(g=>[g,0]));for(const s of recent)for(const e of s.entries)count.set(groupLabel(e.group),(count.get(groupLabel(e.group))||0)+e.sets.length);
 const max=Math.max(1,...count.values());return `<div class="bar-list">${groups.filter(g=>count.get(g)>0).map(g=>`<div><div class="bar-label"><span>${html(g)}</span><strong>${fmt(count.get(g)/4,1)} Sätze/Woche</strong></div><div class="progress-track"><div class="progress-fill" style="width:${(count.get(g)/max*100).toFixed(2)}%"></div></div></div>`).join('')||'<div class="empty">Noch keine Sätze in den vergangenen 28 Tagen.</div>'}${count.get('Andere')?`<p class="small-muted">Andere: ${fmt(count.get('Andere')/4,1)} Sätze/Woche</p>`:''}</div>
 <p class="chart-caption">Durchschnitt der letzten 28 Tage (÷ 4). Nur der primären Muskelgruppe zugeordnete absolvierte Sätze; indirekte Belastung durch Mehrgelenksübungen wird nicht berücksichtigt. Keine automatische Trainingsbewertung.</p>`;
}
function renderExerciseTrend(all){
 const chosen=all.flatMap(s=>s.entries).filter(e=>e.sets.some(s=>s.weight>0)).reduce((map,e)=>map.has(e.exerciseId)?map:map.set(e.exerciseId,e.name),new Map());
 const options=[...chosen.entries()].sort((a,b)=>a[1].localeCompare(b[1],'de'));
 if(!options.length)return `<section class="panel"><h3 class="panel-title">📈 Kraftentwicklung je Übung</h3><div class="empty">Logge Gewicht und Wiederholungen, um Krafttrends zu sehen.</div></section>`;
 if(!options.some(([id])=>id===statsExerciseId))statsExerciseId=options[0][0];
 const name=chosen.get(statsExerciseId),series=selectedExerciseSeries(all,statsExerciseId),first=series[0]?.y,last=series.at(-1)?.y,diff=series.length>=2&&first&&last?(last/first-1)*100:null,allSets=all.flatMap(s=>s.entries.filter(e=>e.exerciseId===statsExerciseId).flatMap(e=>e.sets)),maxWeight=Math.max(0,...allSets.map(s=>s.weight));
 return `<section class="panel"><h3 class="panel-title">📈 Kraftentwicklung je Übung</h3><label class="form-label" for="statsExercise">Übung auswählen</label><select id="statsExercise" class="field">${options.map(([id,title])=>`<option value="${html(id)}" ${id===statsExerciseId?'selected':''}>${html(title)}</option>`).join('')}</select>
 <div class="metric-grid mt8">${metric('Bestes geschätztes 1RM',series.length?`${fmt(Math.max(...series.map(e=>e.y)),1)} kg`:'–','Epley-Formel · 1–10 Wdh.')}${metric('Maximales Arbeitsgewicht',`${fmt(maxWeight,1)} kg`,'über alle gespeicherten Sätze')}${metric('Trend seit erster Aufzeichnung',diff==null?'–':`${diff>=0?'+':''}${fmt(diff,1)} %`,`${series.length} Einheiten mit gültigem 1RM`)}${metric('Gespeicherte Sätze',fmt(allSets.length),'für diese Übung')}</div>
 <p class="panel-sub mt8">Geschätztes 1RM von <strong>${html(name)}</strong> über die Zeit</p>${lineChart(series,'Geschätztes 1RM '+name,'kg')}
 <p class="note">Schätzung nach Epley (Gewicht × [1 + Wdh./30]), nur für positive Zusatzlast und 1–10 Wdh. Vergleiche nur dieselbe Übung und möglichst ähnliche Technik. Keine Messung deiner echten Maximalkraft, kein Beweis für Muskelwachstum.</p></section>`;
}
function renderWeightStats(){const all=state.weights.slice().sort((a,b)=>a.date.localeCompare(b.date)),last=all.at(-1),recent=all.filter(x=>x.date>=lastNDays(90));
 const grouped=[...new Set(recent.map(e=>e.date))].map(day=>({date:day,y:recent.filter(w=>w.date===day).reduce((acc,w)=>acc+w.kg,0)/recent.filter(w=>w.date===day).length}));
 const rolling=grouped.map((x,i)=>({date:x.date,y:grouped.slice(Math.max(0,i-6),i+1).reduce((a,b)=>a+b.y,0)/Math.min(7,i+1)}));
 return `<section class="panel"><h3 class="panel-title">⚖️ Körpergewicht & Trend</h3><div class="row between"><div><span class="small-muted">Letzte Eintragung</span><div style="font-weight:850;font-size:25px">${last?`${fmt(last.kg,1)} kg`:'–'}</div></div><div class="right"><span class="small-muted">Trend (bis 7 Messungen)</span><div style="font-weight:800">${rolling.length>1?`${rolling.at(-1).y>=rolling[0].y?'+':''}${fmt(rolling.at(-1).y-rolling[0].y,1)} kg`:'–'}</div></div></div>
 ${lineChart(rolling,'Gewichtstrend der letzten 90 Tage','kg')}
 <p class="note">Geglätteter Trend aus bis zu sieben aufeinanderfolgenden Messungen; nicht sieben Kalendertagen. Wiege dich möglichst unter ähnlichen Bedingungen. Einzelne Gewichtsschwankungen zeigen oft Wasser und Glykogen.</p>
 <form id="addWeight"><div class="form-grid"><div><label class="form-label">Datum</label><input class="field" type="date" name="date" value="${today()}" required></div><div><label class="form-label">Gewicht in kg</label><input class="field" name="kg" type="number" step="0.1" min="20" max="400" placeholder="86,0" required></div></div><button class="secondary w100 mt8" type="submit">Gewicht speichern</button></form>
 ${last?`<div class="history-item"><div><strong>${dateText(last.date)} · ${fmt(last.kg,1)} kg</strong></div><button class="mini-btn danger" data-delete-weight="${html(last.id)}">Löschen</button></div>`:''}</section>`;
}
function renderNutritionStats(){const recent=state.foods.filter(f=>f.date>=lastNDays(14)&&f.date<=today()),days=[...new Set(recent.map(f=>f.date))],totCal=recent.reduce((a,b)=>a+b.calories,0),totPro=recent.reduce((a,b)=>a+b.protein,0);
 return `<section class="panel"><h3 class="panel-title">🥗 Ernährung: letzte 14 Tage</h3><div class="metric-grid">${metric('Ø kcal je protokolliertem Tag',days.length?`${fmt(totCal/days.length)} kcal`:'–',`${days.length} von 14 Tagen mit Einträgen`)}${metric('Ø Protein je protokolliertem Tag',days.length?`${fmt(totPro/days.length)} g`:'–',`Dein Ziel: ${fmt(state.targets.protein)} g`)}</div><p class="note">Unvollständig erfasste Tage können die Mittelwerte stark verfälschen. Nur dokumentierte Mahlzeiten werden gerechnet; kein automatisches Ernährungstagebuch.</p></section>`;
}
function renderStats(){const {all,recent}=trainingWindows(),sets=recent.reduce((acc,s)=>acc+sessionSets(s),0),loads=recent.reduce((acc,s)=>acc+sessionLoad(s),0),mins=recent.filter(s=>s.duration!==null).reduce((acc,s)=>acc+s.duration,0),withTimes=recent.filter(s=>s.duration!==null).length;
 const rirs=recent.flatMap(s=>s.entries.flatMap(e=>e.sets.map(x=>x.rir).filter(x=>x!==null)));
 const idsOfWeeks=[...new Set(recent.map(s=>weekStart(s.date)))];
 return `<div class="eyebrow">DATEN STATT BAUCHGEFÜHL</div><h1 class="page-title">Statistik<span class="accent">.</span></h1><p class="sub">Verfolge Kraft, Trainingsroutine und Körpergewicht. Die Analysen basieren auf deinen tatsächlich eingetragenen Daten.</p>
 <div class="chip-row">${[[7,'7 Tage'],[28,'28 Tage'],[90,'90 Tage'],[365,'1 Jahr']].map(([n,t])=>`<button class="chip ${statsDays===n?'active':''}" data-stats-days="${n}">${t}</button>`).join('')}</div>
 <div class="metric-grid">${metric('Trainingseinheiten',fmt(recent.length),`Ø ${fmt(recent.length/(statsDays/7),1)} pro Woche`)}${metric('Abgeschlossene Sätze',fmt(sets),`Ø ${recent.length?fmt(sets/recent.length,1):0} je Einheit`)}${metric('Bewegte Last',`${fmt(loads/1000,1)} t`,'kg × Wdh.; nur eingetragenes Zusatzgewicht')}${metric('Trainingszeit',withTimes?`${fmt(mins/60,1)} h`:'–',`${withTimes} Einheiten mit Zeitangabe`)}</div>
 <section class="panel"><h3 class="panel-title">📆 Trainingskonstanz</h3>${weekBars(all)}<p class="note">Eine höhere Wochenzahl heißt nicht automatisch besseres Training. Ziel ist eine langfristig machbare Routine.</p></section>
 ${renderExerciseTrend(all)}
 <section class="panel"><h3 class="panel-title">💪 Sätze nach Muskelgruppen</h3><p class="panel-sub">Primäre Zielmuskelgruppen der letzten vier Wochen, unabhängig vom oben gewählten Zeitraum.</p>${muscleChart(all.filter(s=>s.date>=lastNDays(28)&&s.date<=today()))}</section>
 <section class="panel"><h3 class="panel-title">🎯 Belastungssteuerung (RIR)</h3><div class="metric-grid">${metric('Ø Wiederholungen in Reserve',rirs.length?fmt(rirs.reduce((a,b)=>a+b,0)/rirs.length,1):'–',`${rirs.length} Sätze mit RIR-Eintrag`)}${metric('Sätze mit RIR 0–3',rirs.length?`${fmt(rirs.filter(x=>x<=3).length/rirs.length*100)} %`:'–','nur Sätze mit dokumentiertem RIR')}</div><p class="note">RIR ist deine subjektive Schätzung, wie viele saubere Wiederholungen noch möglich gewesen wären. Die Verteilung ist eine Orientierung, kein Muss; bis zum völligen Muskelversagen zu trainieren ist nicht bei jedem Satz nötig.</p></section>
 ${renderWeightStats()}${renderNutritionStats()}
 <section class="panel"><h3 class="panel-title">📚 Trainingshistorie</h3>${all.length?all.slice().reverse().slice(0,25).map(s=>`<div class="history-item"><div><strong>${dateText(s.date)}${s.startTime?' · '+html(s.startTime):''}${s.endTime?'–'+html(s.endTime):''}</strong><span>${s.entries.length} Übungen · ${sessionSets(s)} Sätze${s.duration!==null?' · '+fmt(s.duration)+' min':''}${s.label?' · '+html(s.label):''}</span></div><div class="history-actions"><button class="mini-btn" data-edit-session="${html(s.id)}">Bearbeiten</button><button class="mini-btn danger" data-delete-session="${html(s.id)}">×</button></div></div>`).join(''):'<div class="empty">Noch kein Training gespeichert. Dein erster Eintrag startet die Auswertungen.</div>'}<p class="note">Bearbeiten lädt ein gespeichertes Training in den Editor. Beim Speichern wird der alte Eintrag ersetzt, nicht doppelt gezählt.</p></section>
 <section class="panel"><h3 class="panel-title">🔎 Was die Daten wirklich sagen</h3><p class="panel-sub">Sinnvolle Indikatoren für dein Ziel, Fett zu verlieren und Muskeln aufzubauen:</p><div class="bar-list"><div>✅ <strong>Krafttrend:</strong> ähnliche Technik und steigende geschätzte Maximalkraft sprechen für Leistungsentwicklung.</div><div>✅ <strong>Konstanz:</strong> regelmäßige Einheiten sind aussagekräftiger als einzelne Höchstleistungen.</div><div>✅ <strong>Körpergewicht:</strong> mehrere Wochen Trend statt Tageswerte betrachten.</div><div>✅ <strong>Trainingsvolumen:</strong> Satzanzahl pro Muskel grob über mehrere Wochen vergleichen, statt eine bestimmte Zahl blind anzustreben.</div></div><p class="note">Diese App diagnostiziert keinen Muskelaufbau und ersetzt weder medizinische Beratung noch professionelle Leistungsdiagnostik.</p></section>`;
}
function renderFood(){const meals=state.foods.filter(f=>f.date===foodDate),sum=k=>meals.reduce((a,b)=>a+(Number.isFinite(b[k])?b[k]:0),0),cal=sum('calories'),pro=sum('protein'),carb=sum('carbs'),fat=sum('fat'),hasCarbs=meals.some(x=>x.carbs!==null),hasFat=meals.some(x=>x.fat!==null);
 return `<div class="eyebrow">ERNÄHRUNG & MAKROS</div><h1 class="page-title">Ernährung<span class="accent">.</span></h1><p class="sub">Kalorien und Eiweiß für dein Ziel im Blick. Die Einträge bleiben lokal gespeichert.</p>
 <section class="panel"><label class="form-label" for="foodDate">Tag auswählen</label><input id="foodDate" type="date" class="field" value="${foodDate}"><div class="metric-grid mt8">${metric('Kalorien',`${fmt(cal)} / ${fmt(state.targets.calories)}`,'kcal')}${metric('Eiweiß',`${fmt(pro,1)} / ${fmt(state.targets.protein)}`,'Gramm')}${metric('Kohlenhydrate',hasCarbs?`${fmt(carb,1)} / ${fmt(state.targets.carbs)}`:'–','Gramm · optional')}${metric('Fett',hasFat?`${fmt(fat,1)} / ${fmt(state.targets.fat)}`:'–','Gramm · optional')}</div>
 <p class="note">Die Tageswerte sind nur so vollständig wie deine Einträge. Foto-KI ist noch nicht integriert.</p></section>
 <section class="panel"><h3 class="panel-title">Mahlzeit hinzufügen</h3><form id="addFood"><label class="form-label">Bezeichnung</label><input class="field" name="name" required maxlength="90" placeholder="z. B. Skyr mit Beeren"><div class="form-grid"><div><label class="form-label">Kalorien (kcal)</label><input class="field" name="calories" type="number" min="0" max="15000" step="1" required placeholder="350"></div><div><label class="form-label">Eiweiß (g)</label><input class="field" name="protein" type="number" min="0" max="1000" step="0.1" required placeholder="35"></div><div><label class="form-label">Kohlenhydrate (g, optional)</label><input class="field" name="carbs" type="number" min="0" max="1500" step="0.1" placeholder="35"></div><div><label class="form-label">Fett (g, optional)</label><input class="field" name="fat" type="number" min="0" max="1500" step="0.1" placeholder="9"></div></div><button class="primary w100 mt8" type="submit">Mahlzeit speichern</button></form></section>
 <section class="panel"><h3 class="panel-title">Einträge am ${dateText(foodDate)}</h3>${meals.length?meals.slice().reverse().map(e=>`<div class="history-item"><div><strong>${html(e.name)}</strong><span>${fmt(e.calories)} kcal · ${fmt(e.protein,1)} g Eiweiß${e.carbs!==null?' · '+fmt(e.carbs,1)+' g KH':''}${e.fat!==null?' · '+fmt(e.fat,1)+' g Fett':''}</span></div><button class="mini-btn danger" data-delete-food="${html(e.id)}">Löschen</button></div>`).join(''):'<div class="empty">Noch keine Mahlzeiten für diesen Tag.</div>'}</section>`;
}
function renderSettings(){return `<div class="eyebrow">EINSTELLUNGEN & BACKUP</div><h1 class="page-title">Mehr<span class="accent">.</span></h1><p class="sub">Alle Trainingseinträge bleiben auf diesem Gerät. Keine Anmeldung, keine versteckten API-Kosten.</p>
 <section class="panel"><h3 class="panel-title">Deine Ernährungsziele</h3><form id="targets"><div class="form-grid"><div><label class="form-label">Kalorien/Tag</label><input class="field" name="calories" type="number" min="500" max="8000" required value="${state.targets.calories}"></div><div><label class="form-label">Eiweiß (g)</label><input class="field" name="protein" type="number" min="0" max="600" required value="${state.targets.protein}"></div><div><label class="form-label">Kohlenhydrate (g)</label><input class="field" name="carbs" type="number" min="0" max="1000" required value="${state.targets.carbs}"></div><div><label class="form-label">Fett (g)</label><input class="field" name="fat" type="number" min="0" max="500" required value="${state.targets.fat}"></div></div><button class="primary w100 mt8" type="submit">Ziele speichern</button></form></section>
 <section class="panel"><h3 class="panel-title">Deine Daten sichern</h3><p class="panel-sub">Erstelle vor App-Updates ein Backup! Das JSON enthält persönliche Trainingseinträge und sollte <strong>niemals ins öffentliche GitHub-Repository</strong> hochgeladen werden.</p>
 <button class="primary w100" id="exportData">↓ Backup herunterladen (JSON)</button><label class="file-label mt8">↑ Backup importieren<input type="file" id="importData" accept=".json,application/json"></label><p class="note">Import unterstützt FitTrack 1 und 2. Der Import ersetzt alle bestehenden Einträge dieser App nach Bestätigung.</p></section>
 <section class="panel"><h3 class="panel-title">App aktualisieren</h3><p class="panel-sub">Ersetze die App-Dateien im GitHub-Repository; beim nächsten Online-Start lädt die App die neue Version. Dein lokaler Speicher wird nicht durch den Code-Upload gelöscht.</p><button class="secondary w100" id="checkUpdate">↻ Auf neue Version prüfen</button><p class="note">Bei iOS kann eine alte Offline-Version zwischengespeichert bleiben. Im Zweifel App schließen, erneut über den Home-Bildschirm öffnen und diesen Knopf drücken.</p></section>
 <section class="panel"><h3 class="panel-title">Datenschutz & Grenzen</h3><p class="panel-sub">FitTrack 2.0 · Offlinetaugliche PWA · Keine Cookies von Drittanbietern · Keine Analytics · Keine externen Skripte · Keine API-Schlüssel.</p><div class="warning">⚠️ Trainingsdaten und Mahlzeiten liegen im lokalen Web-App-Speicher und sind nicht Ende-zu-Ende-verschlüsselt. Safari und installierte Web-App können unterschiedliche Speicher verwenden. Regelmäßige JSON-Backups sind wichtig. Bei Geräteverlust oder gelöschten App-Daten kann sonst alles verloren gehen.</div>
 <p class="note">Beim ersten Start von Version 2 werden Trainingshistorie, Gewicht und Ernährung aus dem lokalen FitTrack-1-Speicher übernommen, sofern derselbe Web-App-Speicher verwendet wird. Die alte Version-1-Datenablage bleibt unverändert.</p></section>`;}
function timerRemaining(){const t=state.timer;return t.running?Math.max(0,Math.ceil((t.endAt-Date.now())/1000)):Math.max(0,Math.ceil(t.remaining));}
function clockText(secs){return `${pad(Math.floor(secs/60))}:${pad(secs%60)}`;}
function initAudio(){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;webAudio=webAudio||new AC();if(webAudio.state==='suspended')webAudio.resume().catch(()=>{});}catch(err){console.warn('Audio nicht verfügbar',err);}}
function beep(){if(!state.timer.sound)return;try{initAudio();if(!webAudio)return;const start=webAudio.currentTime;[0,.19,.38].forEach((offset)=>{const osc=webAudio.createOscillator(),gain=webAudio.createGain();osc.type='sine';osc.frequency.value=offset===.38?970:785;gain.gain.setValueAtTime(.0001,start+offset);gain.gain.exponentialRampToValueAtTime(.12,start+offset+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+offset+.15);osc.connect(gain).connect(webAudio.destination);osc.start(start+offset);osc.stop(start+offset+.16);});}catch(err){console.warn('Ton nicht verfügbar',err);}}
function tickTimer(){const t=state.timer,remaining=timerRemaining();if(t.running&&remaining<=0){t.running=false;t.endAt=null;t.remaining=0;t.expired=true;store();if(document.visibilityState==='visible'){beep();notify('Pausenzeit abgelaufen! 🔔');}if(tab==='training')render();}
 const time=clockText(remaining),el=$('timerClock');if(el)el.textContent=time;
 const badge=$('timerStatus');if(badge)badge.textContent=t.running?'Läuft':t.expired?'Abgelaufen':'Bereit';
 const dock=$('timerDock');if(dock){dock.classList.toggle('hidden',!t.running&&!t.expired);dock.innerHTML=t.running||t.expired?`<span>${t.expired?'🔔 Timer abgelaufen':'⏱️ Pausentimer'}</span><strong>${time}</strong><button type="button" data-open-timer>${t.expired?'Reset':'Öffnen'}</button>`:'';}
}
function resetTimer(){state.timer.running=false;state.timer.endAt=null;state.timer.remaining=state.timer.seconds;state.timer.expired=false;store();render();}
function saveWorkout(){const d=state.draft;
 if(!validDate(d.date)){notify('Bitte gültiges Trainingsdatum eingeben.');return;}
 if(!timeOK(d.startTime)||!timeOK(d.endTime)){notify('Bitte Start- und Endzeit festlegen.');return;}
 const entries=[];for(const e of d.entries){const sets=[];for(const set of e.sets){if(!set.done)continue;const weight=num(set.weight),reps=num(set.reps),rir=num(set.rir);
 if(!Number.isFinite(weight)||weight<0||weight>1500||!Number.isFinite(reps)||reps<1||reps>200){notify(`Satz bei ${entryName(e)} korrigieren (kg/Wdh.).`);return;}
 if(String(set.rir).trim()!==''&&(!Number.isFinite(rir)||rir<0||rir>10)){notify('RIR muss zwischen 0 und 10 liegen.');return;}
 sets.push({id:set.id,weight,reps,rir:Number.isFinite(rir)?rir:null});}
 if(sets.length)entries.push({id:e.id,exerciseId:e.exerciseId,name:e.name,group:e.group,sets});}
 if(!entries.length){notify('Markiere mindestens einen ausgefüllten Satz mit ✓.');return;}
 const obj={id:d.editingId||uid(),date:d.date,startTime:d.startTime,endTime:d.endTime,duration:durationOf(d.date,d.startTime,d.endTime),notes:d.notes.slice(0,500),label:'',entries};
 if(d.editingId){const index=state.sessions.findIndex(s=>s.id===d.editingId);if(index<0){notify('Ursprüngliches Training nicht gefunden.');return;}obj.label=state.sessions[index].label||'';state.sessions[index]=obj;}else state.sessions.push(obj);
 state.draft=defaultDraft();store();switchTab('stats');notify(d.editingId?'Training aktualisiert ✓':'Training gespeichert ✓');
}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);}
function handleClick(ev){
 const e=ev.target;
 const nav=e.closest('[data-nav]');if(nav){switchTab(nav.dataset.nav);return;}
 if(e.closest('[data-open-library]')){groupFilter='Alle';searchValue='';switchTab('library');return;}
 if(e.closest('[data-go-training]')){switchTab('training');return;}
 const group=e.closest('[data-group]');if(group){groupFilter=group.dataset.group;render();return;}
 const pick=e.closest('[data-pick-exercise]');if(pick){addExercise(pick.dataset.pickExercise);return;}
 const delCustom=e.closest('[data-delete-custom]');if(delCustom){const id=delCustom.dataset.deleteCustom;const ex=state.customExercises.find(x=>x.id===id);if(!ex)return;if(!confirm(`Eigene Übung „${ex.name}“ löschen? Bereits gespeicherte Trainings bleiben erhalten.`))return;
 state.customExercises=state.customExercises.filter(x=>x.id!==id);store();render();notify('Eigene Übung entfernt.');return;}
 const addSet=e.closest('[data-add-set]');if(addSet){const entry=state.draft.entries.find(x=>x.id===addSet.dataset.addSet);if(!entry)return;if(entry.sets.length>=20){notify('Maximal 20 Sätze pro Übung.');return;}
 const last=entry.sets.at(-1);entry.sets.push({id:uid(),weight:last?.weight??'',reps:last?.reps??'',rir:'',done:false});store();render();return;}
 const removeSet=e.closest('[data-remove-set]');if(removeSet){const entry=e.closest('[data-entry]'),set=e.closest('[data-set]');const ex=state.draft.entries.find(x=>x.id===entry?.dataset.entry);if(!ex||!set)return;
 ex.sets=ex.sets.filter(x=>x.id!==set.dataset.set);store();render();return;}
 const removeEntry=e.closest('[data-remove-entry]');if(removeEntry){state.draft.entries=state.draft.entries.filter(x=>x.id!==removeEntry.dataset.removeEntry);store();render();return;}
 const now=e.closest('[data-now]');if(now){if(now.dataset.now==='start')state.draft.startTime=nowTime();else state.draft.endTime=nowTime();store();render();return;}
 if(e.closest('[data-save-workout]')){saveWorkout();return;}
 if(e.closest('[data-clear-draft]')){if(!confirm('Neues leeres Training starten? Ungespeicherte Eingaben des aktuellen Trainings gehen verloren.'))return;state.draft=defaultDraft();store();render();return;}
 const preset=e.closest('[data-timer-preset]');if(preset){const seconds=Number(preset.dataset.timerPreset);state.timer.seconds=seconds;state.timer.remaining=seconds;state.timer.running=false;state.timer.endAt=null;state.timer.expired=false;store();render();return;}
 if(e.closest('[data-timer-toggle]')){const timer=state.timer;initAudio();if(timer.running){timer.remaining=timerRemaining();timer.running=false;timer.endAt=null;}else{timer.remaining=timer.remaining>0?timer.remaining:timer.seconds;timer.running=true;timer.endAt=Date.now()+timer.remaining*1000;timer.expired=false;}store();render();return;}
 if(e.closest('[data-timer-reset]')){resetTimer();return;}
 const timerPlus=e.closest('[data-timer-add]');if(timerPlus){const t=state.timer,plus=Number(timerPlus.dataset.timerAdd);if(t.running){t.endAt+=plus*1000;t.remaining=timerRemaining();}else t.remaining=Math.min(1800,t.remaining+plus);t.expired=false;store();render();return;}
 if(e.closest('#testSound')){initAudio();beep();return;}
 if(e.closest('[data-open-timer]')){if(state.timer.expired)resetTimer();switchTab('training');$('timerPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
 const days=e.closest('[data-stats-days]');if(days){statsDays=Number(days.dataset.statsDays);render();return;}
 const edit=e.closest('[data-edit-session]');if(edit){const session=state.sessions.find(s=>s.id===edit.dataset.editSession);if(!session)return;
 const hasDraft=state.draft.entries.some(x=>x.sets.some(s=>s.done||s.weight||s.reps));if(hasDraft&&!confirm('Dein aktueller Trainingsentwurf wird ersetzt. Vorher speichern oder trotzdem bearbeiten?'))return;
 state.draft={id:uid(),date:session.date,startTime:session.startTime||nowTime(),endTime:session.endTime||'',notes:session.notes||'',editingId:session.id,entries:session.entries.map(ent=>({id:uid(),exerciseId:ent.exerciseId,name:ent.name,group:ent.group,sets:ent.sets.map(set=>({id:uid(),weight:String(set.weight),reps:String(set.reps),rir:set.rir==null?'':String(set.rir),done:true}))}))};store();switchTab('training');notify('Historisches Training geladen.');return;}
 const delS=e.closest('[data-delete-session]');if(delS){if(!confirm('Dieses gespeicherte Training endgültig löschen?'))return;state.sessions=state.sessions.filter(s=>s.id!==delS.dataset.deleteSession);store();render();return;}
 const delW=e.closest('[data-delete-weight]');if(delW){if(!confirm('Gewichtseintrag löschen?'))return;state.weights=state.weights.filter(w=>w.id!==delW.dataset.deleteWeight);store();render();return;}
 const delF=e.closest('[data-delete-food]');if(delF){state.foods=state.foods.filter(f=>f.id!==delF.dataset.deleteFood);store();render();return;}
 if(e.closest('#exportData')){download(`FitTrack-Backup-v2-${today()}.json`,JSON.stringify(state,null,2),'application/json');notify('Backup heruntergeladen. Sicher ablegen!');return;}
 if(e.closest('#checkUpdate')){if('serviceWorker' in navigator)navigator.serviceWorker.getRegistration().then(reg=>reg?.update()).then(()=>notify('Update geprüft. App ggf. schließen und neu öffnen.')).catch(()=>notify('Bitte mit Internet verbinden und erneut versuchen.'));else notify('Bitte Seite in Safari neu laden.');return;}
}
function handleInput(ev){const el=ev.target;
 if(el.id==='exerciseSearch'){searchValue=el.value;const items=[...document.querySelectorAll('[data-catalog-item]')];let shown=0;items.forEach(row=>{const match=row.dataset.search.includes(searchValue.trim().toLowerCase());row.classList.toggle('hidden',!match);shown+=Number(match);});const count=$('catalogCount');if(count)count.textContent=`${shown} Übungen angezeigt`;return;}
 const entry=el.closest('[data-entry]'),setEl=el.closest('[data-set]');if(entry&&setEl&&el.matches('[data-set-input]')){
 const ex=state.draft.entries.find(x=>x.id===entry.dataset.entry),set=ex?.sets.find(x=>x.id===setEl.dataset.set);if(!set)return;set[el.dataset.setInput]=el.value;store();return;}
 if(el.id==='workoutNotes'){state.draft.notes=el.value;store();return;}
}
function handleChange(ev){const el=ev.target;
 if(el.matches('[data-set-done]')){const entry=el.closest('[data-entry]'),setEl=el.closest('[data-set]'),ex=state.draft.entries.find(x=>x.id===entry?.dataset.entry),set=ex?.sets.find(x=>x.id===setEl?.dataset.set);if(set){if(el.checked&&(!Number.isFinite(num(set.weight))||!Number.isFinite(num(set.reps))||num(set.reps)<1||num(set.weight)<0)){notify('Bitte zuerst Gewicht und Wiederholungen eintragen.');el.checked=false;return;}set.done=el.checked;store();}return;}
 if(el.id==='workoutDate'){state.draft.date=el.value;store();return;}
 if(el.id==='workoutStart'){state.draft.startTime=el.value;store();const prev=$('durationPreview');if(prev)prev.textContent=durationPreview();return;}
 if(el.id==='workoutEnd'){state.draft.endTime=el.value;store();const prev=$('durationPreview');if(prev)prev.textContent=durationPreview();return;}
 if(el.id==='customTimer'){const sec=num(el.value);if(!Number.isInteger(sec)||sec<10||sec>1800){notify('Timer: 10 bis 1800 Sekunden.');return;}state.timer.seconds=sec;state.timer.remaining=sec;state.timer.running=false;state.timer.endAt=null;state.timer.expired=false;store();render();return;}
 if(el.id==='soundToggle'){state.timer.sound=el.value==='on';store();return;}
 if(el.id==='statsExercise'){statsExerciseId=el.value;render();return;}
 if(el.id==='foodDate'){foodDate=validDate(el.value)?el.value:today();render();return;}
 if(el.id==='importData'){const file=el.files?.[0];if(!file)return;if(file.size>12*1024*1024){notify('Backup zu groß.');return;}
 file.text().then(str=>{const raw=JSON.parse(str);const next=raw.version===2?normalState(raw):fromLegacy(raw);
 if(!confirm('Dieses Backup ersetzt alle Daten dieser FitTrack-App. Fortfahren?'))return;
 state=next;statsExerciseId='';searchValue='';store();render();notify('Backup erfolgreich importiert ✓');}).catch(err=>{console.warn(err);notify('Import fehlgeschlagen: Datei ungültig.');});return;}
}
function handleSubmit(ev){if(!['newExercise','addWeight','addFood','targets'].includes(ev.target.id))return;ev.preventDefault();const data=new FormData(ev.target);
 if(ev.target.id==='newExercise'){
 const name=String(data.get('name')||'').trim().slice(0,90),group=String(data.get('group')||'Andere');
 if(!name){notify('Bitte Übungsnamen eingeben.');return;}if(!GROUPS.includes(group)){notify('Ungültige Muskelgruppe.');return;}
 if(catalog().some(x=>x.name.toLowerCase()===name.toLowerCase())){notify('Diese Übung gibt es bereits.');return;}
 if(state.customExercises.length>=400){notify('Maximal 400 eigene Übungen.');return;}
 const ex={id:'c-'+uid(),name,group,custom:true};state.customExercises.push(ex);if(data.has('addNow')){state.draft.entries.push({id:uid(),exerciseId:ex.id,name:ex.name,group:ex.group,sets:Array.from({length:3},()=>({id:uid(),weight:'',reps:'',rir:'',done:false}))});}
 store();render();notify('Eigene Übung gespeichert ✓');return;
 }
 if(ev.target.id==='addWeight'){const kg=num(data.get('kg')),date=String(data.get('date'));if(!validDate(date)||!Number.isFinite(kg)||kg<20||kg>400){notify('Bitte gültiges Datum und Gewicht eingeben.');return;}
 state.weights.push({id:uid(),date,kg});store();render();notify('Gewicht gespeichert ✓');return;}
 if(ev.target.id==='addFood'){const name=String(data.get('name')||'').trim().slice(0,90),calories=num(data.get('calories')),protein=num(data.get('protein')),cVal=String(data.get('carbs')||'').trim(),fVal=String(data.get('fat')||'').trim(),carbs=cVal===''?null:num(cVal),fat=fVal===''?null:num(fVal);
 if(!name||!Number.isFinite(calories)||calories<0||calories>15000||!Number.isFinite(protein)||protein<0||protein>1000||carbs!==null&&(!Number.isFinite(carbs)||carbs<0||carbs>1500)||fat!==null&&(!Number.isFinite(fat)||fat<0||fat>1500)){notify('Bitte gültige Nährwerte eingeben.');return;}
 state.foods.push({id:uid(),date:foodDate,name,calories,protein,carbs,fat});store();render();notify('Mahlzeit gespeichert ✓');return;}
 if(ev.target.id==='targets'){const calories=num(data.get('calories')),protein=num(data.get('protein')),carbs=num(data.get('carbs')),fat=num(data.get('fat'));
 if(![calories,protein,carbs,fat].every(Number.isFinite)||calories<500||calories>8000||protein<0||protein>600||carbs<0||carbs>1000||fat<0||fat>500){notify('Bitte gültige Zielwerte eingeben.');return;}
 state.targets={calories,protein,carbs,fat};store();render();notify('Ziele gespeichert ✓');}
}
document.addEventListener('click',handleClick);document.addEventListener('input',handleInput);document.addEventListener('change',handleChange);document.addEventListener('submit',handleSubmit);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tickTimer();});
if(!recovered)store();render();setInterval(tickTimer,250);
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(err=>console.warn('Offline-Modus nicht aktiviert',err));
