import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { STARTERS } from '../starter.js';
import { art, guessArt as guessKind } from '../art.js?v=11';
import { parseRecipeText, ingTextToGroups, groupsToIngText, stepTextToSections, sectionsToStepText, splitIngredient, guessSection, SECTIONS, prettyFractions, addQty, BULLET, ingParts, ingReplacePart, maybeSame, scaleQty, scaleLine, scaleYield, yieldCount } from './parse.js?v=29';

const $ = s => document.querySelector(s);
const app = $('#app');
// Phantom check on the first step: shows twice per recipe per visit to the site, then stops
const stepHinted = new Set(), stepHintT = {}, stepHintSeen = new Set(); let stepHintObs = null;
let tabHintAt = 0, tabHintT = null, tabsHtml = ''; // the Shopping list tab pulses after ingredients are added somewhere else
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = s => esc(prettyFractions(String(s == null ? '' : s).replace(/^\s*[•◦▪▫●‣∙]\s*/, ''))).replace(/([½¼¾⅓⅔⅛⅜⅝⅞])/g, '<span class="fr">$1</span>');
const clone = o => JSON.parse(JSON.stringify(o == null ? {} : o));
const rid = () => Math.random().toString(36).slice(2, 10);
const ARTS = ['pie','lasagna','cakepops','cake','cookies','bread','soup','pasta','bowl'];
const ART_NAMES = {pie:'Pie',lasagna:'Lasagna',cakepops:'Cake pops',cake:'Layer cake',cookies:'Cookies',bread:'Bread',soup:'Soup',pasta:'Pasta',bowl:'Mixing bowl'};
const LISTCOL = ['#0072B2','#D55E00','#00866A','#B0457F','#9A7300','#6A4FB0'];
let slotMap = {};
function listColors(ids){ for(const k of Object.keys(slotMap)) if(!ids.includes(k)) delete slotMap[k];
  for(const id of ids) if(!(id in slotMap)){ const used = new Set(Object.values(slotMap)); let s = 0; while(used.has(s)) s++; slotMap[id] = s; }
  return id => id in slotMap ? LISTCOL[slotMap[id] % LISTCOL.length] : '#6E6259'; }
const PALETTE = ['#4B57A8','#D9772B','#D9487A','#3F7A55','#8A5BC2','#B7862F','#2F8A9B','#C8553D'];

/* ---------------- state ---------------- */
let sb = null, session = null, user = null;
let authView = {mode:'signin', msg:'', err:'', busy:false};
let recovering = false;
let landing = true, hadAcct = false; try{ if(localStorage.getItem('mb-had-account')){ landing = false; hadAcct = true; } }catch(e){}
const landingOn = r => !user && !recovering && landing && !inviteToken() && !giftToken() && !['privacy','terms','feedback','invite','gift'].includes(r.v);
let recipes = [];            // rows: {id, sort, data}
let kitchen = blankKitchen();
let loaded = false, channel = null;
let ui = {filter:'all', sec:'Other'};
try { ui = Object.assign(ui, JSON.parse(localStorage.getItem('kn-ui') || '{}')); } catch(e) {}
const saveUi = () => { try { localStorage.setItem('kn-ui', JSON.stringify(ui)); } catch(e) {} };

function blankKitchen(){ return {shopping:{sections:SECTIONS.slice(), items:[]}, progress:{shop:{}, active:{}, cook:{}}}; }
function normalize(row){
  const k = blankKitchen();
  if(row){
    if(row.shopping && Array.isArray(row.shopping.items)) k.shopping = {sections: row.shopping.sections && row.shopping.sections.length ? row.shopping.sections : SECTIONS.slice(), items: row.shopping.items};
    if(row.progress) k.progress = Object.assign(k.progress, clone(row.progress));
    ['shop','active','cook'].forEach(x => { if(!k.progress[x] || typeof k.progress[x] !== 'object') k.progress[x] = {}; });
  }
  return k;
}

let statusNow = {kind:'', text:''};
function setStatus(kind, text){ statusNow = {kind, text}; const el = $('#status'); if(!el) return; el.className = 'status ' + kind; el.querySelector('span').textContent = text; }
let toastT; function toast(t, undo, label){ if(/^Couldn.t|^Could not/.test(t)) logErr('shown', t); const el = $('#toast'); el.textContent = t; if(undo){ const b = document.createElement('button'); b.className = 'tundo'; b.textContent = label || 'Undo'; b.onclick = () => { el.classList.remove('show'); undo(); }; el.appendChild(b); } el.classList.add('show'); el.dataset.until = Date.now() + 8000; clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), undo ? (label ? 6000 : 4000) : 2500); }
// While you scroll, a toast stays on screen (fixed at the bottom) instead of timing out mid-scroll. It still goes away within 8 seconds.
window.addEventListener('scroll', () => { const el = document.getElementById('toast'); if(!el || !el.classList.contains('show')) return; const left = +el.dataset.until - Date.now(); if(left <= 0) return; clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), Math.min(1800, left)); }, {passive: true});

/* ---------------- error log ---------------- */
// Problems members run into go to the error_log table and show on the Admin page. Never stores passwords.
// Recipe text is never stored, except a single ingredient line whose amount couldn't be added up (logAmt, when LOG_AMT is on).
let errN = 0, errLast = '', errPend = [];
function logErr(kind, msg, detail){
  try{
    msg = String(msg || '').slice(0, 300);
    if(!msg || /ResizeObserver loop|^Script error\.?$/.test(msg) || errN >= 20 || msg === errLast) return;
    errN++; errLast = msg;
    const sv = document.querySelector('script[src*="app.js"]'), ver = sv ? ((sv.getAttribute('src').match(/v=(\w+)/) || [])[1] || '') : '';
    errPend.push({kind, msg, detail: String(detail || '').slice(0, 1500), page: (location.pathname + location.hash).slice(0, 200), ua: navigator.userAgent.slice(0, 300), ver: ver.slice(0, 20)});
    flushErr();
  }catch(_){}
}
// Ingredient lines whose amount Butter Math couldn't read, so the math can be fixed. The privacy page explains this (Helping us fix the math).
const LOG_AMT = true;
const amtSeen = new Set(), amtPend = [];
function amtUnread(line){ try{ const {qty, name, key} = splitIngredient(line); if(!key) return false;
  // a total that can't be added up, a number left in the name ("13.5 oz can coconut milk", but a percent like "2% milk" is part of the name), or a name starting with a stray unit ("-inch piece", "x 400g tins")
  if(qty) return addQty(qty, qty) === qty + ' + ' + qty || /\d/.test(name.replace(/\d+(?:\.\d+)?\s*%/g, '')) || /^(?:[-–x×]|[a-z]\b|heaping|scant|level|rounded)/i.test(name); return /^\s*[\d½¼¾⅓⅔⅛⅜⅝⅞]/.test(String(line).replace(BULLET, '')); }catch(_){ return false; } }
function logAmt(line){
  try{ line = String(line || '').trim().slice(0, 250); if(!LOG_AMT || !line || amtSeen.has(line) || amtSeen.size >= 15 || !amtUnread(line)) return; amtSeen.add(line);
    const sv = document.querySelector('script[src*="app.js"]'), ver = sv ? ((sv.getAttribute('src').match(/v=(\w+)/) || [])[1] || '') : '';
    amtPend.push({kind:'amount', msg:'Amount not understood: ' + line, detail:'', page:(location.pathname + location.hash).slice(0, 200), ua:navigator.userAgent.slice(0, 300), ver:ver.slice(0, 20)}); flushAmt(); }catch(_){}
}
// sent on their own so a refused row can't take real errors down with it; if the table doesn't take kind 'amount', it's sent as an error
function flushAmt(){ if(!sb || !amtPend.length) return; const rows = amtPend.splice(0); try{ sb.from('error_log').insert(rows).then(r => { if(r && r.error) sb.from('error_log').insert(rows.map(x => Object.assign({}, x, {kind:'error'}))).then(() => {}, () => {}); }, () => {}); }catch(_){} }
function flushErr(){ if(!sb || !errPend.length) return; const rows = errPend.splice(0); try{ sb.from('error_log').insert(rows).then(() => {}, () => {}); }catch(_){} }
window.addEventListener('error', e => logErr('crash', e.message, (e.error && e.error.stack) || ((e.filename || '') + ':' + (e.lineno || ''))));
window.addEventListener('unhandledrejection', e => { const r = e.reason || {}; logErr('crash', r.message || String(r), r.stack || ''); });
{ const ce = console.error.bind(console); console.error = (...a) => { ce(...a); const x = a[0]; let m = x && x.message; if(!m){ try{ m = typeof x === 'string' ? x : JSON.stringify(x); }catch(_){ m = String(x); } } logErr('error', m, (x && (x.stack || [x.details, x.hint, x.code].filter(Boolean).join(' · '))) || ''); }; }

/* ------------- saving the kitchen row (shopping + progress) -------------
   Each change is a small function. It runs on the local copy right away, and on save
   it runs again on the freshest copy from the server, so two devices don't overwrite each other. */
let queue = [], flushing = false, flushT = null;
function mutate(fn, quiet){
  fn(kitchen); if(!quiet) render();
  queue.push(fn); clearTimeout(flushT); flushT = setTimeout(flush, 400); setStatus('busy', 'Saving…');
}
async function flush(){
  clearTimeout(flushT);
  if(flushing || !queue.length || !user) return;
  flushing = true; const fns = queue; queue = [];
  try{
    const {data, error} = await sb.from('kitchens').select('*').eq('user_id', user.id).maybeSingle();
    if(error) throw error;
    const fresh = normalize(data);
    fns.forEach(f => f(fresh));
    const {error: e2} = await sb.from('kitchens').upsert({user_id: user.id, shopping: fresh.shopping, progress: fresh.progress, updated_at: new Date().toISOString()});
    if(e2) throw e2;
    const same = JSON.stringify({s: fresh.shopping, p: fresh.progress}) === JSON.stringify({s: kitchen.shopping, p: kitchen.progress});
    kitchen = fresh; queue.forEach(f => f(kitchen));
    flushing = false;
    if(queue.length) flush(); else { setStatus('ok', 'Saved'); if(!same) render(); } // skip the redraw when the saved copy matches the screen (avoids a flash)
  }catch(e){
    console.error(e); queue = fns.concat(queue); flushing = false;
    setStatus('err', 'Not saved — retrying'); flushT = setTimeout(flush, 4000);
  }
}
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') flush(); else { reWake(); if(user && !queue.length && !flushing) loadAll(true); checkNewVersion(); } });
// A phone that keeps Butter Math open never reloads it, so it could stay on an old version for days. When the app comes back
// on screen, check (at most every 5 minutes) whether a newer version is live, and refresh unless something is being typed or saved.
let verCheckAt = 0;
async function checkNewVersion(){
  if(Date.now() - verCheckAt < 5 * 60e3) return; verCheckAt = Date.now();
  try{
    const sc = document.querySelector('script[src*="app.js"]'), cur = sc && (sc.getAttribute('src').match(/v=(\w+)/) || [])[1];
    const html = await (await fetch(location.pathname.replace(/[^/]*$/, '') + 'index.html', {cache: 'no-store'})).text(), live = (html.match(/app\.js\?v=(\w+)/) || [])[1];
    if(!cur || !live || cur === live) return;
    const busy = /^#(add|edit-)/.test(location.hash) || document.querySelector('.asksheet') || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) || queue.length || flushing;
    if(!busy) location.reload();
  }catch(e){}
}
// Keyboard: Escape closes an open sheet, and focus moves into a sheet when it opens (keyboard users only).
let kbUser = false, lastSheet = null;
document.addEventListener('pointerdown', () => { kbUser = false; }, true);
document.addEventListener('keydown', e => {
  if(e.key === 'Tab') kbUser = true;
  if(e.key === 'Escape'){ const bg = [...document.querySelectorAll('.sheetbg[data-act]')].pop(); if(bg){ e.preventDefault(); bg.click(); return; } }
});
new MutationObserver(() => { const sh = [...document.querySelectorAll('.asksheet[role="dialog"]')].pop() || null;
  if(sh && !lastSheet && kbUser && !sh.contains(document.activeElement)){ const f = sh.querySelector('input:not([type=hidden]):not([disabled]), textarea, select, button:not([disabled]), [tabindex="0"]'); if(f) f.focus({preventScroll: true}); }
  lastSheet = sh; }).observe(document.body, {childList: true, subtree: true});
window.addEventListener('pagehide', flush);

/* ---------------- boot & auth ---------------- */
async function boot(){
  if(!SUPABASE_URL || /YOUR_/.test(SUPABASE_URL) || !SUPABASE_ANON_KEY || /YOUR_/.test(SUPABASE_ANON_KEY)){
    app.innerHTML = `<div class="card panel" style="max-width:520px;margin:30px auto"><h3>Almost there</h3><p class="muted">This site isn't connected to its database yet. Add your Supabase project URL and anon key to <b>config.js</b> (see README).</p></div>`;
    return;
  }
  const mod = window.__mockSupabase || await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  flushErr(); flushAmt();
  sb.auth.onAuthStateChange((event, s) => {
    if(event === 'PASSWORD_RECOVERY'){ recovering = true; session = s; user = s && s.user; render(); return; }
    const was = user && user.id;
    session = s; user = s ? s.user : null;
    if(user && user.id !== was) startUser();
    if(!user){ stopUser(); gate = 'gate'; try{ sessionStorage.removeItem('mb-in'); }catch(e){} render(); }
  });
  const {data} = await sb.auth.getSession();
  session = data.session; user = session ? session.user : null;
  if(user) startUser(); else render();
}
function stopUser(){ autoDone = false; isAdmin = false; adminData = null; if(channel){ try{ sb.removeChannel(channel); }catch(e){} channel = null; } recipes = []; kitchen = blankKitchen(); loaded = false; queue = []; }
let startRun = 0;
async function startUser(){
  const run = ++startRun;
  stopUser(); render();
  await loadAll();
  if(run !== startRun || !user) return;
  loadFriends(true).then(afterInviteLogin).then(claimGift);
  try{
    sb.getChannels().filter(c => c.topic === 'realtime:kitchen-' + user.id).forEach(c => sb.removeChannel(c));
    channel = sb.channel('kitchen-' + user.id)
      .on('postgres_changes', {event:'*', schema:'public', table:'kitchens', filter:'user_id=eq.' + user.id}, p => { if(!queue.length && !flushing && p.new && p.new.user_id){ kitchen = normalize(p.new); render(); } })
      .on('postgres_changes', {event:'*', schema:'public', table:'recipes'}, () => loadRecipes())
      .subscribe();
  }catch(e){ console.warn('realtime off', e); }
}
async function loadRecipes(){
  const {data, error} = await sb.from('recipes').select('id, sort, data').eq('user_id', user.id).order('sort', {ascending:true});
  if(!error){ recipes = notPending(data || []).map(tidyRec); render(); }
}
async function loadAll(quiet){
  if(!quiet) setStatus('busy', 'Loading…');
  try{
    const [r, k] = await Promise.all([
      sb.from('recipes').select('id, sort, data').eq('user_id', user.id).order('sort', {ascending:true}),
      sb.from('kitchens').select('*').eq('user_id', user.id).maybeSingle()
    ]);
    if(r.error) throw r.error; if(k.error) throw k.error;
    recipes = notPending(r.data || []).map(tidyRec);
    if(!queue.length && !flushing) kitchen = normalize(k.data);
    if(!k.data){ await sb.from('kitchens').upsert({user_id: user.id, shopping: kitchen.shopping, progress: kitchen.progress}); }
    loaded = true; setStatus('ok', 'Saved'); repairQtys();
    sb.rpc('is_admin').then(({data}) => { const v = data === true; if(v !== isAdmin){ isAdmin = v; render(); } }, () => {});
  }catch(e){ console.error(e); setStatus('err', "Can't reach your kitchen"); loaded = true; }
  render();
}

function renderLanding(member){
  const bowl = POT_ART.replace('class="pot"', 'class="lp-bowl"').replace(/\n\s*<g class="drops">.*<\/g>(?=\n)/, '');
  const tag = (t, c, bg) => `<span class="lp-tag" style="color:${c};background:${bg}">${t}</span>`;
  const pie = tag('Blueberry pie', '#0072B2', '#E6F1F8'), bars = tag('Lemon bars', '#B34E00', '#FBEFE6');
  const card = (h, p) => `<div class="lp-card"><h3>${h}</h3><p>${p}</p></div>`;
  // How it works steps (Nov 19, 2026): number and title on one line, then the text, then the screenshot in a same-size frame, so the three line up on computers.
  const step = (n, h, p, img, alt) => `<li><div class="lp-sh"><span class="lp-num">${n}</span><h3>${h}</h3></div><p>${p}</p>${img ? `<figure class="lp-shot lp-shot-${n}"><img src="/landing/${img}" alt="${alt}" loading="lazy" decoding="async" onerror="this.parentNode.remove()"></figure>` : ''}</li>`;
  const feat = (ico, h, p) => `<div class="lp-card lp-feat"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true">${ico}</svg><h3>${h}</h3><p>${p}</p></div>`;
  const card2 = (h, p, ico) => `<div class="lp-card lp-mini">${ico ? `<svg class="bi" viewBox="0 0 24 24" aria-hidden="true">${ico}</svg>` : ''}<h3>${h}</h3><p>${p}</p></div>`;
  // Lucide icons for the landing cards (Nov 19, 2026): ways to bring recipes in, and the math cards.
  const I_LINK = '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    I_CAM = '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    I_CLIP = '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h5"/>',
    I_PEN = '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    I_RULER = '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
    I_SHIELD = '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    I_LAYERS = '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    I_EYE = '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>';
  return `<div class="lp">
  <section class="lp-hero">
    <div class="lp-copy">
      <span class="lp-eyebrow">For home cooks and bakers</span>
      <h2 class="lp-h1">Butter Math does the <span>ingredient math</span> for you.</h2>
      <p class="lp-lede">Get your recipes onto one shopping list. Butter Math sorts the list by grocery aisle and organizes your ingredients with accurate measurements.${member ? '' : " It's free."}</p>
      <div class="lp-ctas">${member ? `<button class="btn primary lp-red" data-act="go" data-h="recipes">Recipe box</button><button class="btn" data-act="go" data-h="shopping">Shopping list</button>` : `<button class="btn primary lp-red" data-act="authmode" data-m="signup">Create your kitchen</button><button class="btn" data-act="authmode" data-m="signin">Sign in</button>`}</div>
    </div>
    <div class="lp-phone lp-anim" role="img" aria-label="A Butter Math shopping list adding up butter from two recipes: half a cup plus three quarters of a cup is 2 sticks plus 4 tablespoons">
      <div class="lp-ph-top"><span class="lp-ph-logo">Butter <span>Math</span></span><span class="lp-ph-k">Mom's Kitchen</span></div>
      <div class="lp-ph-body">
        <span class="lp-lbl">Shopping for</span>
        <div class="lp-chips"><span class="lp-chip" style="--c:#0072B2;background:#E6F1F8"><i></i>Blueberry pie</span><span class="lp-chip" style="--c:#D55E00;background:#FBEFE6"><i></i>Lemon bars</span></div>
        <span class="lp-aisle">Dairy &amp; eggs</span>
        <div class="lp-items">
          <div class="lp-item"><span class="lp-ck"></span><div><b>Unsalted butter</b><small>2 sticks + 4 Tbsp</small>
            <div class="lp-math"><span class="lp-mrow"><b>½ cup</b><em><i style="--c:#0072B2"></i>Blueberry pie</em></span><span class="lp-mrow"><b>¾ cup</b><em><i style="--c:#D55E00"></i>Lemon bars</em></span><span class="lp-mrow lp-tot"><em>Total</em><b>2 sticks + 4 Tbsp</b></span></div></div></div>
          <div class="lp-item done"><span class="lp-ck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span><div><b>Eggs</b><small>5 large</small></div></div>
        </div>
      </div>
    </div>
  </section>
  <section class="lp-sec lp-white">
    <span class="lp-eyebrow">Your recipes</span>
    <h2 class="lp-h2">Bring your recipes in wherever they live now.</h2>
    <div class="lp-three lp-four lp-ways">
      ${card2('Enter a link', 'From a recipe site.', I_LINK)}
      ${card2('Upload a screenshot', 'Of a cookbook page or a recipe you saw online.', I_CAM)}
      ${card2('Paste the text', 'From a post, a note, or an email.', I_CLIP)}
      ${card2('Type it in', "Like Grandma's card from the drawer.", I_PEN)}
    </div>
  </section>
  <section class="lp-sec">
    <span class="lp-eyebrow">The math</span>
    <h2 class="lp-h2">Real kitchen math, not guesses.</h2>
    <div class="lp-three lp-four">
      ${card2('Standard measures', 'The same kitchen measures you already use: 3&nbsp;tsp is 1&nbsp;Tbsp, and 16&nbsp;Tbsp is 1&nbsp;cup.', I_RULER)}
      ${card2('Math you can trust', 'Every update to Butter Math has to pass hundreds of math checks behind the scenes before it reaches your kitchen.', I_SHIELD)}
      ${card2('Halve, double, or triple', 'Pick serving sizes from as small as ½&nbsp;the recipe to 3×&nbsp;the recipe.', I_LAYERS)}
      ${card2('No guessing', "If Butter Math can't read an amount, it shows it as written instead of guessing.", I_EYE)}
    </div>
  </section>
  <section class="lp-sec lp-white">
    <span class="lp-eyebrow">How it works</span>
    <h2 class="lp-h2">From recipe to dinner in four steps.</h2>
    <ol class="lp-three lp-four lp-steps">
      ${step(1, 'Save', 'Add a recipe from a link, a photo, or by typing it in.', 'step-1-save.webp', 'The Add a recipe form, with a box for a recipe link and a Chocolate Chip Cookies recipe filled in')}
      ${step(2, 'Select', 'Tap <b>Shop for ingredients</b> on each recipe you\'re making.', 'step-2-select-2.webp', 'A Blueberry Pie recipe with the Add to your shopping list sheet open')}
      ${step(3, 'Shop', 'Check things off your shopping list at the store.', 'step-3-shop.webp', 'A shopping list sorted by aisle, with blueberries, lemon juice, and lemon zest checked off')}
      ${step(4, 'Cook', 'Follow along with a checklist to cook your recipe.', 'step-4-cook.webp', 'A pie recipe in cooking mode, with the first steps checked off')}
    </ol>
  </section>
  <section class="lp-sec">
    <span class="lp-eyebrow">Made for sharing</span>
    <h2 class="lp-h2">Cook with the people you love.</h2>
    <div class="lp-three lp-four">
      ${feat('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', 'Share recipes', "See friends' and family's recipes, and save a copy of the best ones to your own recipe box.")}
      ${feat('<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>', 'Tag your recipes', 'Make your own tags, like birthday, holiday, or soup.')}
      ${feat('<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>', 'Send recipes', "Send Mom the pie recipe straight to her kitchen. You'll see when a friend saves one of your recipes.")}
      ${feat('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>', 'Save your recipes', 'Download all of your recipes and photos any time. If you ever leave, every recipe goes with you.')}
    </div>
  </section>
  <section class="lp-final">
    ${bowl}
    ${member ? '' : `<h2 class="lp-h2">Your next grocery run, already added up.</h2>
    <p>It's free.</p>`}
    ${member ? `<button class="btn primary" data-act="go" data-h="recipes">Go to my recipe box</button>` : `<button class="btn primary" data-act="authmode" data-m="signup">Create your kitchen</button>
    <p class="lp-small">Already have one? <button class="linkbtn" data-act="authmode" data-m="signin">Sign in</button></p>`}
    <a class="lp-ig" href="https://www.instagram.com/buttermath.app/" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>Follow on Instagram</a>
  </section>
</div>`;
}
function renderAuth(){
  const v = authView, m = v.mode;
  if(recovering){
    return `<div class="authwrap"><div class="card panel auth"><h2>Set a new password</h2>
      <form data-form="newpass"><input class="tin" type="password" id="np" placeholder="New password (6+ characters)" minlength="6" required autocomplete="new-password">
      <button class="btn primary big" type="submit">${v.busy ? 'Saving…' : 'Save password'}</button></form>
      ${v.err ? `<div class="err">${esc(v.err)}</div>` : ''}</div></div>`;
  }
  const inv = inviteToken() && inviteInfo && inviteInfo.name && inviteInfo.name !== '__self' ? inviteInfo.name : '';
  const gift = !inv && giftToken() && giftInfo && giftInfo.name && giftInfo.name !== '__self' ? giftInfo : null;
  const title = inv && m === 'signup' ? `Join ${esc(inv)} on Butter Math` : inv && m === 'signin' ? 'Welcome back' : m === 'signup' ? 'Create your kitchen' : m === 'forgot' ? 'Reset your password' : 'Welcome to <span style="white-space:nowrap">Butter Math!</span>';
  return `<div class="authwrap">${inv || gift ? '' : '<button class="linkbtn lp-back" data-act="landing">' + ICON_BACK + 'About Butter Math</button>'}
    <div class="authhero">${AUTH_ART}</div>
    <div class="card panel auth">${inv && m !== 'forgot' ? `<div class="invhead">${avatar(inviteInfo.t, inv)}<span>${esc(inv)} invited you</span></div>` : gift && m !== 'forgot' ? `<div class="invhead">${avatar(giftInfo.t, gift.name)}<span>${esc(gift.name)} sent you ${esc(gift.title || 'a recipe')}</span></div>` : ''}<h2>${title}</h2>
    <p class="muted" style="margin:4px 0 14px">${gift && m === 'signup' ? `Create a free account and ${esc(gift.title || 'the recipe')} will be waiting for you.` : gift && m === 'signin' ? `Sign in to get ${esc(gift.title || 'the recipe')}.` : inv && m === 'signup' ? `Create a free account, then accept ${esc(inv)}'s friend request.` : inv && m === 'signin' ? `Sign in to see ${esc(inv)}'s friend request.` : m === 'signup' ? 'Save recipes, build a shopping list, and follow along step by step on any device.' : m === 'forgot' ? "Enter your email and we'll send you a link." : 'Sign in to view your recipes and shopping list.'}</p>
    <form data-form="${m}">
      ${m === 'signup' ? `<input class="tin" id="au-name" data-keep placeholder="First name" maxlength="40" required autocomplete="given-name">` : ''}
      <input class="tin" id="au-email" data-keep type="email" placeholder="Email" required autocomplete="email">
      ${m !== 'forgot' ? `<input class="tin" id="au-pass" type="password" placeholder="Password${m === 'signup' ? ' (6+ characters)' : ''}" minlength="6" required autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}">` : ''}
      <button class="btn primary big" type="submit" ${v.busy ? 'disabled' : ''}>${v.busy ? 'One sec…' : m === 'signup' ? 'Create account' : m === 'forgot' ? 'Send reset link' : 'Sign in'}</button>
    </form>
    ${m === 'signup' ? `<div class="fine">By creating an account, you confirm you're 13 or older and agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy</a> notice.</div>` : ''}
    ${v.err ? `<div class="err">${esc(v.err)}</div>` : ''}${v.msg ? `<div class="ok">${esc(v.msg)}</div>` : ''}
    <div class="authlinks">
      ${m !== 'signin' ? `<button class="linkbtn" data-act="authmode" data-m="signin">${inv ? 'Sign in' : 'Sign in'}</button>` : `<button class="linkbtn" data-act="authmode" data-m="signup">Create account</button><button class="linkbtn" data-act="authmode" data-m="forgot">Forgot password</button>`}
    </div></div></div>`;
}
async function handleAuthForm(kind){
  const email = ($('#au-email') || {}).value, pass = ($('#au-pass') || {}).value, newPass = ($('#np') || {}).value || '';
  authView.err = ''; authView.msg = ''; authView.busy = true; render();
  try{
    if(kind === 'signin'){
      const {error} = await sb.auth.signInWithPassword({email, password: pass}); if(error) throw error;
    } else if(kind === 'signup'){
      const name = ($('#au-name') || {}).value.trim();
      const {data, error} = await sb.auth.signUp({email, password: pass, options:{data:{name}, emailRedirectTo: location.origin + location.pathname}});
      if(error) throw error;
      if(!data.session){ authView.mode = 'signin'; authView.msg = 'Check your email for a confirmation link, then sign in here.'; }
    } else if(kind === 'forgot'){
      const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname}); if(error) throw error;
      authView.msg = 'If that email has an account, a reset link is on its way.';
    } else if(kind === 'newpass'){
      const {error} = await sb.auth.updateUser({password: newPass}); if(error) throw error;
      recovering = false; toast('Password updated'); if(user) startUser();
    }
  }catch(e){
    const msg = (e && e.message) || 'Something went wrong.';
    authView.err = /invalid login/i.test(msg) ? "That email and password don't match." : /already registered/i.test(msg) ? 'That email already has an account. Try signing in.' : /rate limit/i.test(msg) ? 'Too many emails sent recently. Wait a bit and try again.' : msg;
  }
  authView.busy = false; render();
}

/* ---------------- helpers ---------------- */
const R = id => recipes.find(r => r.id === id);
const D = r => (r && r.data) || {};
// A step needs words. Lines that are only a link, a stray number or bullet, or an invisible character aren't steps,
// and a heading left with no steps goes too. Recipes are tidied as they load, and again when saved (Nov 20, 2026).
const realStep = st => { const t = String((st && st.text) || '').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').trim().replace(/^(step\s*)?\d+\s*[.):-]?$/i, ''); return /[\p{L}\p{N}]/u.test(t) && !/^(https?:\/\/|www\.)\S+$/i.test(t); };
function tidySteps(secs){ if(!Array.isArray(secs)) return secs; return secs.map(x => !x || typeof x === 'string' ? x : {...x, items: (x.items || []).filter(realStep)}).filter(x => typeof x === 'string' ? realStep({text: x}) : x && x.items.length); }
function tidyRec(r){ const d = r && r.data; if(!d || !Array.isArray(d.steps)) return r;
  const t = tidySteps(d.steps); if(JSON.stringify(t) === JSON.stringify(d.steps)) return r;
  // A link that was sitting in the steps moves to the recipe's links if the recipe doesn't have one yet.
  const urls = d.steps.flatMap(x => x && typeof x === 'object' ? (x.items || []).map(st => String(st.text || '').trim()) : []).filter(u => /^https?:\/\/\S+$/i.test(u));
  if(urls.length && !(d.links || []).some(l => /^https?:\/\//i.test(l.url || ''))) d.links = [{label: 'Original recipe', url: urls[0]}].concat(d.links || []);
  d.steps = t; return r; }
const P = () => kitchen.progress;
const isArch = id => !!(P().archived || {})[id];
const isActive = id => P().active[id] !== false && !isArch(id);
// Recipe size (½×, 2×, a new serving size). scaleDef is the size a recipe opens at ("Save as default"); scale is "just this time"
// and goes back to the default when the recipe is finished. Both are kept with the kitchen, never in the recipe, so the recipe's own amounts never change.
const scaleDef = id => +((P().scaleDef || {})[id]) || 1;
const scaleOf = id => { const s = (P().scale || {})[id]; return s ? +s : scaleDef(id); };
const near1 = (a, b) => Math.abs(a - b) < 1e-9;
// Steps show the amount from the ingredient list ("add butter" -> "add 3 Tbsp butter"). Display only: the recipe text is never changed.
// To stay accurate it only fills in an amount when the match is clear: the ingredient is listed once, it's named in exactly one step,
// once, right after a plain word like "add", "the", or "with", and not inside another ingredient's name ("sugar" in "brown sugar").
const amtCache = new WeakMap();
const AMT_BEFORE = /(?:^|[\s(])(?:add|adding|the|in|into|with|and|or|stir|whisk|mix|combine|fold|beat|cream|melt|pour|sprinkle|toss|then|plus|use|place|put|heat|warm|drizzle|season|top|spread)\s+$|(?:^|[.!?:;,(]\s*)$/i;
function stepAmounts(d){
  if(amtCache.has(d)) return amtCache.get(d);
  const out = new Map(), byKey = new Map();
  (d.ingredients || []).flatMap(g => g.items || []).flatMap(ingParts).forEach(l => { const p = splitIngredient(l); if(!p.key) return; byKey.set(p.key, byKey.has(p.key) ? null : (p.qty ? p : null)); });
  const ings = [...byKey.entries()].filter(([, p]) => p).map(([key, p]) => ({key, q: p.qty.replace(/\btbsps?\b\.?/gi, 'Tbsp'), terms: [...new Set([p.name.toLowerCase(), key, key + 's', key + 'es'])].filter(t => t.length >= 3)}));
  const found = [];
  stepList(d).forEach(({key: sk, st}) => { const t = String(st.text || '');
    const ms = []; ings.forEach(ing => ing.terms.forEach(term => { const re = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'); let m; while((m = re.exec(t))) ms.push({sk, t, ing, s: m.index, e: m.index + m[0].length}); }));
    ms.sort((a, b) => (b.e - b.s) - (a.e - a.s)); const kept = [];
    ms.forEach(m => { if(kept.some(k => m.s < k.e && k.s < m.e)) return; kept.push(m); });
    found.push(...kept); });
  ings.forEach(ing => { const hs = found.filter(h => h.ing === ing); if(hs.length !== 1) return; const h = hs[0];
    const before = h.t.slice(0, h.s); if(!AMT_BEFORE.test(before) || /[\d½¼¾⅓⅔⅛⅜⅝⅞]\s*\S*\s*$/.test(before)) return;
    if(!out.has(h.sk)) out.set(h.sk, []); out.get(h.sk).push({s: h.s, q: ing.q, k: ing.key}); });
  amtCache.set(d, out); return out;
}
function fmtStep(d, sk, text, f = 1){
  const ins = (stepAmounts(d).get(sk) || []).slice().sort((a, b) => a.s - b.s); if(!ins.length) return fmt(text);
  let html = '', at = 0; const t = String(text || '');
  ins.forEach(x => { const q = near1(f, 1) ? x.q : scaleQty(x.q, f, {key: x.k}); if(q == null) return; html += fmt(t.slice(at, x.s)) + `<b class="amt">${fmt(q)}</b> `; at = x.s; });
  return html + fmt(t.slice(at));
}
function stepList(d){ const out = []; (d.steps || []).forEach((sec, si) => (sec.items || []).forEach((st, k) => out.push({key: si + '-' + k, st}))); return out; }
function cookOf(id){ const c = P().cook[id] || {}; return {i: c.i || {}, s: c.s || {}}; }
function progressOf(r){ const all = stepList(D(r)); const c = cookOf(r.id); const done = all.filter(x => c.s[x.key]).length; return {total: all.length, done, cur: all.findIndex(x => !c.s[x.key]), all}; }
const allItems = () => kitchen.shopping.items || [];
const onList = id => isActive(id) && !(P().done || {})[id] && allItems().some(i => (i.recipes || []).includes(id));
const visibleItems = () => allItems().filter(it => !it.recipes || !it.recipes.length || it.recipes.some(x => R(x) ? isActive(x) : false) || (it.custom && !it.recipes.some(x => R(x))));
const firstName = () => ((user && user.user_metadata && user.user_metadata.name) || '').trim();
const artText = d => [d.title || ''].concat((d.ingredients || []).flatMap(g => g.items || [])).join('\n');
const kindOf = d => { const k = guessArt(d.title || ''); return k !== 'bowl' ? k : (d.art || 'bowl'); };
// A photo can be zoomed and positioned to fit the card frame (saved as data.photoPos {x, y, z}).
const posStyle = pp => pp ? ` style="object-position:${+pp.x}% ${+pp.y}%;transform:scale(${+pp.z || 1});transform-origin:${+pp.x}% ${+pp.y}%"` : '';
const pic = d => d.photo ? `<img src="${esc(d.photo)}" alt="" loading="lazy"${posStyle(d.photoPos)}>` : art(kindOf(d), artText(d));

// On the shopping list, a long recipe name is written out in full and wraps, instead of the automatic short name that was cut off with "…"
const listName = d => d.short && !/…$/.test(d.short) ? d.short : (d.title || d.short || '');
// the size picked on a recipe, shown after its name on the shopping list ("Pumpkin Pie (3)" = 3 times the recipe); nothing at 1×
function sizeTag(id){ const f = scaleOf(id); if(near1(f, 1)) return '';
  const w = Math.floor(f + 1e-9), fr = ({0: '', .25: '¼', .5: '½', .75: '¾'})[Math.round((f - w) * 4) / 4], x = Math.abs(f * 4 - Math.round(f * 4)) < .02 && fr !== undefined ? (w || fr ? (w ? w : '') + fr : '0') : String(+f.toFixed(1));
  return ` <span class="sz">(${x})</span>`; }
// An item's keys: its own, plus any it was combined with ("Combine" on the shopping list), so all of them add up on that one line.
const ikeys = it => [it.key || splitIngredient(it.name).key, ...(it.also || [])];
const ihas = (it, key) => ikeys(it).includes(key);
function addIngredientsTo(k, recipeId, groups){
  const items = k.shopping.items; const touched = new Set();
  (groups || []).forEach(g => (g.items || []).flatMap(ingParts).forEach(line => {
    const {qty, name, key} = splitIngredient(line); if(!key) return; logAmt(line);
    let it = items.find(i => ihas(i, key));
    if(it){
      const linked = (it.recipes || []).includes(recipeId);
      if(linked && !touched.has(it.id)) return;
      if(!linked) it.recipes = (it.recipes || []).concat(recipeId);
      delete it.qtyEdit;
      if(qty) it.qty = addQty(it.qty, qty);
      fixItem(it); touched.add(it.id);
    } else {
      const id = 'i-' + recipeId.slice(0, 8) + '-' + key.replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      items.push({id, name, qty, key, section: guessSection(name, qty), recipes:[recipeId]});
      fixItem(items[items.length - 1]); touched.add(id);
    }
  }));
}
function removeRecipeFrom(k, recipeId){
  k.shopping.items = k.shopping.items.map(it => Object.assign(it, {recipes: (it.recipes || []).filter(x => x !== recipeId)})).filter(it => it.custom || it.recipes.length);
  delete k.progress.cook[recipeId]; delete k.progress.active[recipeId]; if(k.progress.done) delete k.progress.done[recipeId];
}

/* ---- cooking rounds: made count, fresh list adds ---- */
const legacyDone = id => { const r = R(id); if(!r) return false; const all = stepList(D(r)); const o = P().cook[id] || {}; return all.length > 0 && !o.counted && all.every(x => (o.s || {})[x.key]); };
const madeOf = id => { const m = ((P().made || {})[id]) || {n:0}; return legacyDone(id) ? Object.assign({}, m, {n: (m.n || 0) + 1}) : m; };
function bankLegacy(k, id){ const r = R(id); if(!r) return; const all = stepList(D(r)); const o = k.progress.cook[id] || {}; if(all.length && !o.counted && all.every(x => (o.s || {})[x.key])){ const m = k.progress.made = k.progress.made || {}; const c = m[id] || {n:0}; m[id] = {n: (c.n || 0) + 1, last: c.last || ''}; } }
function syncMade(k, id){
  const r = R(id); if(!r) return; const all = stepList(D(r)); const o = k.progress.cook[id] = k.progress.cook[id] || {};
  const full = all.length > 0 && all.every(x => (o.s || {})[x.key]);
  const m = k.progress.made = k.progress.made || {};
  if(full && !o.counted){ o.counted = true; if(k.progress.scale) delete k.progress.scale[id]; const c = m[id] || {n:0}; m[id] = {n: (c.n || 0) + 1, last: new Date().toISOString().slice(0, 10)}; }
  else if(!full && o.counted){ o.counted = false; const c = m[id] || {n:0}; m[id] = Object.assign({}, c, {n: Math.max(0, (c.n || 0) - 1)}); }
}
const ingLines = d => (d.ingredients || []).flatMap(g => g.items || []).flatMap(ingParts).filter(l => splitIngredient(l).key);
// Each thing to buy in a recipe, with where it sits: a line like "2 heirloom tomatoes + 4 roma tomatoes" gives two (pi 0 and 1).
const eachPart = (d, fn) => (d.ingredients || []).forEach((g, gi) => (g.items || []).forEach((l, li) => ingParts(l).forEach((p, pi) => fn(p, gi, li, pi, l))));
const pqKey = (rid, gi, li, pi) => rid + '|' + gi + '|' + li + (pi ? '|' + pi : '');
// An item's amount is always the sum of its recipes' lines, so taking a recipe off and adding it back never doubles it.
// Only recipes still on the list count toward an item. Finished or archived ones stay linked (so a past trip can be restored) but add nothing.
const onListRid = x => isActive(x) && !(P().done || {})[x];
function qtyFromRecipes(it){
  let rs = it.recipes || []; if(!rs.length || rs.some(x => !R(x))) return null;
  const live = rs.filter(onListRid); if(live.length) rs = live;
  const key = it.key || splitIngredient(it.name).key, ks = ikeys(it); let q = '';
  rs.forEach(x => eachPart(D(R(x)), (l, gi, li, pi) => { const p = splitIngredient(l); if(!p.key || !ks.includes(p.key)) return;
    const o = (it.pq || {})[pqKey(x, gi, li, pi)], sq = p.qty ? scaleQty(p.qty, scaleOf(x), {key: p.key}) : '', v = o && o.base === l ? o.q : sq == null ? p.qty : sq; if(v && !isZeroQ(v)) q = addQty(q, v, {key}); }));
  return q;
}
// "0 eggs" adds nothing, so it never shows up as an amount
const isZeroQ = q => /^0+(?:\.0*)?(?:\s|$)/.test(String(q || '').trim());
// A plain count ("6", "1½") as a number; null for anything with a unit ("2 cups", "1 stick + 3 Tbsp")
const CFRAC = {'½': .5, '¼': .25, '¾': .75, '⅓': 1/3, '⅔': 2/3, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875};
const countOf = q => { const m = String(q || '').trim().match(/^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔⅛⅜⅝⅞])?$/); return m && (m[1] || m[2]) ? (+m[1] || 0) + (CFRAC[m[2]] || 0) : null; };
// "Egg" to "Eggs", "Cherry" to "Cherries", "Bay leaf" to "Bay leaves". Only used when the new name reads as the same item.
function plural(name){ const n = /[^aeiou]y$/i.test(name) ? name.slice(0, -1) + 'ies' : /(?:lea|loa)f$/i.test(name) ? name.slice(0, -1) + 'ves' : /[^aeiou]o$/i.test(name) ? name + 'es' : /(?:s|x|z|ch|sh)$/i.test(name) || !/[a-z]$/i.test(name) ? name : name + 's';
  return splitIngredient('2 ' + n).key === splitIngredient('2 ' + name).key ? n : name; }
// The name on the list follows the recipe lines: a line with an amount names it ("Salt", not "Salt to taste"),
// and a plain count reads one or many ("Eggs 6", "Egg 1"). A name you typed yourself is never changed.
function nameFromRecipes(it, q){
  const key = it.key || splitIngredient(it.name).key, lines = [];
  (it.recipes || []).forEach(x => { const r = R(x); if(r) eachPart(D(r), l => { const p = splitIngredient(l); if(p.key === key) lines.push({name: p.name.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim(), q: p.qty}); }); });
  const cur = String(it.name || '').toLowerCase(); if(!lines.some(l => l.name.toLowerCase() === cur)) return null;
  const withQ = lines.filter(l => l.q && !isZeroQ(l.q)), pool = withQ.length ? withQ : lines, t = countOf(q);
  const fits = l => t == null || (countOf(l.q) != null && (countOf(l.q) > 1) === (t > 1));
  const keep = pool.find(l => l.name.toLowerCase() === cur && fits(l)); if(keep) return it.name;
  const other = pool.find(fits); if(other) return other.name;
  return t > 1 ? plural(pool[0].name) : pool[0].name;
}
// A list-only change to one recipe's amount ("Just this list"). It's kept with the recipe line it replaced, and dropped if that line changes.
const partQ = (it, x) => { const o = (it.pq || {})[pqKey(x.rid, x.gi, x.li, x.pi)]; return o && o.base === x.l ? o.q : splitIngredient(x.l).qty; };
// "1 cup (200g)" changed to "3 cups": the amount in parentheses is worked out for you, "3 cups (600g)".
// Only when both amounts use the same unit and the parentheses hold a single weight or volume.
function scaleParen(oldQ, newQ){
  const PR = /^(.*?)\s*\(\s*((?:~|about |approx\.? )?)(\d+(?:\.\d+)?)(\s*)(g|grams?|kg|ml|l|oz|ounces?)\s*\)\s*$/i;
  const o = String(oldQ || '').match(PR), nn = String(newQ || '').trim(); if(!o || !nn) return newQ;
  let main = nn; const m = nn.match(PR);
  if(m){ if(m[3] !== o[3] || m[5].toLowerCase() !== o[5].toLowerCase()) return newQ; main = m[1]; } else if(/[()]/.test(nn)) return newQ;
  const F = {'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875,'⅙':1/6,'⅚':5/6};
  const lead = t => { const x = String(t).trim().match(/^(\d+\s*[½¼¾⅓⅔⅛⅜⅝⅞⅙⅚]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞⅙⅚])\s*([A-Za-z.]*)/); if(!x) return null;
    const a = x[1].trim(); let n; let y;
    if((y = a.match(/^(\d+)\s*([½¼¾⅓⅔⅛⅜⅝⅞⅙⅚])$/))) n = +y[1] + F[y[2]]; else if(F[a]) n = F[a]; else if((y = a.match(/^(\d+)\s+(\d+)\/(\d+)$/))) n = +y[1] + y[2] / y[3]; else if((y = a.match(/^(\d+)\/(\d+)$/))) n = y[1] / y[2]; else n = +a;
    const u0 = x[2].toLowerCase().replace(/\.$/, ''), u = ({c:'cup', cups:'cup', tablespoon:'tbsp', tablespoons:'tbsp', tbs:'tbsp', tbsps:'tbsp', teaspoon:'tsp', teaspoons:'tsp', tsps:'tsp', sticks:'stick', ounces:'oz', ounce:'oz', lbs:'lb', pounds:'lb', pound:'lb'})[u0] || u0;
    return {n, u, raw: x[2]}; };
  const a = lead(o[1]), b = lead(main); if(!a || !b || !a.n || !b.n || a.u !== b.u || Math.abs(a.n - b.n) < 1e-9) return newQ;
  const v = +o[3] * b.n / a.n, r = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  let mm = main.trim(); if(b.n > 1 && /^cup$/i.test(b.raw)) mm = mm.replace(/\bcup\b/i, 'cups'); else if(b.n <= 1 && /^cups$/i.test(b.raw)) mm = mm.replace(/\bcups\b/i, 'cup');
  return `${mm} (${o[2]}${r}${o[4]}${o[5]})`;
}
// You can't buy half a can or half an egg: the list says what to buy (rounded up) and, under it, what the recipes use.
// Only for things you count (cans, jars, packages, eggs, lemons); cups, spoons and pounds stay as they are.
const BUYC = /^(?:cans?|jars?|packages?|pkgs?|bags?|tins?|packets?|blocks?|bricks?|box|boxes|bottles?|containers?|cartons?|tubs?|envelopes?|heads?|bunch|bunches|sticks?)$/i;
function buyOf(q){
  const m = String(q || '').match(/^(\d*)([½¼¾⅓⅔⅛⅜⅝⅞⅙⅚]?)((?: \([^)]*\))?)((?: (?:extra[- ])?(?:large|medium|small|jumbo|whole))?)((?: \([^)]*\))?)(?: ([A-Za-z]+))?$/);
  if(!m || !m[2] || /\+|–/.test(q)) return null; const unit = m[6] || '';
  if(unit && !BUYC.test(unit)) return null;
  const n = Math.ceil((m[1] ? +m[1] : 0) + ({'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875,'⅙':1/6,'⅚':5/6})[m[2]]);
  const u = !unit ? '' : n > 1 ? (/(ch|sh|x)$/i.test(unit.replace(/e?s$/, '')) ? unit.replace(/(es)?$/, '').replace(/$/, 'es') : unit.replace(/s?$/, 's')) : unit.replace(/(?<=(?:ch|sh|x))es$|s$/i, '');
  return n + m[3] + m[4] + m[5] + (u ? ' ' + u : '');
}
function qtyLine(it){ const b = buyOf(it.qty); if(!b) return `<div class="qty">${fmt(it.qty)}</div>`;
  const many = (it.recipes || []).filter(x => R(x) && onListRid(x)).length > 1;
  return `<div class="qty">${fmt(b)}</div><div class="uses">${many ? 'Recipes use' : 'Recipe uses'} ${fmt(it.qty)}</div>`; }
let mathOpen = new Set();
function mathOf(it, colOf){
  const rs = (it.recipes || []).filter(x => R(x) && onListRid(x)); if(rs.length < 2 || !it.qty) return '';
  const parts = rs.map(x => [x, qtyFromRecipes(Object.assign({}, it, {recipes: [x]})) || '']); if(parts.filter(p => p[1]).length < 2) return '';
  const open = mathOpen.has(it.id);
  return `<button class="mathbtn" data-act="math" data-id="${esc(it.id)}" aria-expanded="${open}">${open ? 'Hide the math' : 'Show the math'}</button>${open ? `<div class="math">${parts.map(([x, q]) => `<div class="mrow"><b>${q ? fmt(q) : 'Amount not listed'}</b><span class="msrc"><span class="mdot" style="--c:${colOf(x)}"></span>${esc(D(R(x)).short || D(R(x)).title)}</span></div>`).join('')}<div class="mrow tot"><span class="msrc">Total</span><b>${fmt(it.qty)}</b></div><a class="mreport" href="${reportHref(it)}">Report a wrong amount</a></div>` : ''}`;
}
// "Report a wrong amount": opens the person's email app with the item, its total and each recipe's amount filled in.
// Nothing is sent unless they send the email themselves.
function reportHref(it){
  const rs = (it.recipes || []).filter(x => R(x));
  const lines = rs.map(x => `- ${D(R(x)).title}: ${qtyFromRecipes(Object.assign({}, it, {recipes: [x]})) || 'no amount'}`);
  const body = [`Item: ${it.name}`, `On my list: ${it.qty || 'no amount'}`].concat(lines.length ? ['From:'].concat(lines) : []).concat(['', 'What looks wrong:', '']).join('\n');
  return `mailto:${FB_EMAIL}?subject=${encodeURIComponent('Wrong amount: ' + it.name)}&body=${encodeURIComponent(body)}`;
}
function fixItem(it){ let ch = false; const q = it.qtyEdit ? null : qtyFromRecipes(it); if(q !== null && q !== (it.qty || '')){ it.qty = q; ch = true; }
  const nn = q === null ? null : nameFromRecipes(it, q); if(nn && nn !== it.name){ it.name = nn; ch = true; }
  const n = String(it.name || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim(); if(n && n !== it.name){ it.name = n; ch = true; } return ch; }
// A recipe that's finished or archived no longer counts toward items it shares with recipes still on the list.
function pruneDone(k){ const pr = k.progress, on = x => pr.active[x] !== false && !(pr.done || {})[x] && !(pr.archived || {})[x]; let ch = false;
  k.shopping.items.forEach(i => { const rs = i.recipes || []; if(rs.some(on) && rs.some(x => !on(x))){ i.recipes = rs.filter(on); ch = true; } }); return ch; }
// Older imports read "1 and ⅔ cups flour" as an item named "And ⅔ cups flour". Rename those (or merge into the matching item) so amounts add up again.
function fixBullets(k){ let ch = false; const items = k.shopping.items;
  for(const it of items.slice()){ if(!BULLET.test(it.name || '')) continue;
    const p = splitIngredient(it.name); if(!p.key) continue;
    const dup = items.find(x => x !== it && ihas(x, p.key));
    if(dup){ dup.recipes = [...new Set([...(dup.recipes || []), ...(it.recipes || [])])]; fixItem(dup); items.splice(items.indexOf(it), 1); }
    else { it.name = p.name; it.key = p.key; if(!it.qty && p.qty && !(it.recipes || []).length) it.qty = p.qty; fixItem(it); }
    ch = true; }
  return ch; }
// Lists saved before "2 heirloom tomatoes + 4 roma tomatoes" was split have one item for both. It's replaced by one item per ingredient,
// added up again from the recipes, and a checked-off item stays checked off.
function fixSplit(k){ let ch = false; const items = k.shopping.items, marks = k.progress.shop = k.progress.shop || {};
  for(const it of items.slice()){ if(it.custom || !(it.recipes || []).length) continue;
    const ps = ingParts((it.qty ? it.qty + ' ' : '') + it.name); if(ps.length < 2) continue;
    const keys = new Set(ps.map(x => splitIngredient(x).key)), rids = (it.recipes || []).filter(x => R(x)), mark = marks[it.id];
    items.splice(items.indexOf(it), 1); delete marks[it.id];
    rids.forEach(rid => addIngredientsTo(k, rid, [{items: ingLines(D(R(rid))).filter(l => keys.has(splitIngredient(l).key))}]));
    items.forEach(x => { if(ikeys(x).some(kk => keys.has(kk)) && rids.some(r => (x.recipes || []).includes(r))){ fixItem(x); if(mark && !marks[x.id]) marks[x.id] = mark; } });
    ch = true; }
  return ch; }
// Lists saved before prep words at the end of a name were dropped ("Chickpeas drained" is now "Chickpeas") keep the old name.
// It's renamed (or merged into the same item already there) so its amount still adds up from the recipes.
// Lists saved before 2% milk, whole milk and plain milk were told apart have one Milk item for all of them. The 2% (or 1%) and whole milk lines go back on as their own items,
// Milk is added up again from what's left, and a checked-off item stays checked off.
function fixPct(k){ let ch = false; const items = k.shopping.items, marks = k.progress.shop = k.progress.shop || {};
  for(const it of items.slice()){ if(it.custom || !(it.recipes || []).length) continue; const ok = it.key || splitIngredient(it.name).key;
    const rids = it.recipes.filter(x => R(x)), lines = rid => ingLines(D(R(rid))), moved = rid => lines(rid).filter(l => { const p = splitIngredient(l).key; return p !== ok && p.replace(/^pct[a-jx]+ /, '').replace(/\bwholemilk\b/, 'milk') === ok; });
    if(!rids.some(rid => moved(rid).length)) continue;
    const stays = rids.some(rid => lines(rid).some(l => splitIngredient(l).key === ok)), mark = marks[it.id];
    if(!stays){ items.splice(items.indexOf(it), 1); delete marks[it.id]; }
    rids.forEach(rid => { const m = moved(rid); if(m.length) addIngredientsTo(k, rid, [{items: m}]); });
    const nk = new Set(rids.flatMap(rid => moved(rid).map(l => splitIngredient(l).key)));
    items.forEach(x => { if(nk.has(x.key || splitIngredient(x.name).key) && rids.some(r => (x.recipes || []).includes(r))){ fixItem(x); if(mark && !marks[x.id]) marks[x.id] = mark; } });
    if(stays) fixItem(it); ch = true; }
  return ch; }
function fixPrep(k){ let ch = false; const items = k.shopping.items;
  for(const it of items.slice()){ if(it.custom || !(it.recipes || []).length) continue;
    // also tried with an amount in front: an item saved as "Garlic cloves" is now Garlic, counted in cloves
    const ok = it.key || '', rids = it.recipes.filter(x => R(x)), has = key => rids.some(rid => ingLines(D(R(rid))).some(l => splitIngredient(l).key === key));
    if(has(ok)) continue;
    const p = [splitIngredient(it.name), splitIngredient('1 ' + it.name)].find(x => x.key && x.key !== ok && has(x.key)); if(!p) continue;
    const dup = items.find(x => x !== it && ihas(x, p.key));
    if(dup){ dup.recipes = [...new Set([...(dup.recipes || []), ...it.recipes])]; items.splice(items.indexOf(it), 1); fixItem(dup); }
    else { it.name = p.name; it.key = p.key; fixItem(it); }
    ch = true; }
  return ch; }
function fixAnd(k){ let ch = false; const items = k.shopping.items;
  for(const it of items.slice()){ if(!/^and\s+(?:[\d½¼¾⅓⅔⅛⅜⅝⅞]|a\s+half|half)/i.test(it.name || '')) continue;
    const p = splitIngredient('1 ' + it.name); if(!p.qty || p.key === (it.key || '')) continue;
    const dup = items.find(x => x !== it && ihas(x, p.key));
    if(dup){ dup.recipes = [...new Set([...(dup.recipes || []), ...(it.recipes || [])])]; items.splice(items.indexOf(it), 1); }
    else { it.name = p.name; it.key = p.key; }
    ch = true; }
  return ch; }
// Lists saved before "1 cup plus 2 tablespoons flour" was read as one amount have an item named "Plus 2 tablespoons flour".
// It's renamed to the ingredient ("Flour", merged with any Flour already there) and its amount is added up again from the recipes.
function fixPlus(k){ let ch = false; const items = k.shopping.items;
  for(const it of items.slice()){ if(!/^(plus\s+(?:[\d½¼¾⅓⅔⅛⅜⅝⅞]|more\b)|\d.*\bplus more\b)/i.test(it.name || '')) continue;
    const p = splitIngredient(String(it.name).replace(/^plus\s+/i, '')); if(!p.key || p.key === (it.key || '')) continue;
    const dup = items.find(x => x !== it && ihas(x, p.key));
    if(dup){ dup.recipes = [...new Set([...(dup.recipes || []), ...(it.recipes || [])])]; items.splice(items.indexOf(it), 1); }
    else { it.name = p.name; it.key = p.key; }
    ch = true; }
  return ch; }
function repairQtys(){ if(!loaded) return; const c = JSON.parse(JSON.stringify(kitchen)); const a = pruneDone(c), a1 = fixBullets(c), a2 = fixAnd(c) | fixPlus(c) | fixSplit(c) | fixPrep(c) | fixPct(c), b = c.shopping.items.map(fixItem).some(Boolean); if(!a && !a1 && !a2 && !b) return;
  mutate(k => { pruneDone(k); fixBullets(k); fixAnd(k); fixPlus(k); fixSplit(k); fixPrep(k); fixPct(k); k.shopping.items.forEach(fixItem); }, true); }
function unlinkRecipe(k, id, keys){
  const marks = k.progress.shop = k.progress.shop || {};
  k.shopping.items = k.shopping.items.filter(i => {
    if(!(i.recipes || []).includes(id)) return true;
    if(keys && !ikeys(i).some(kk => keys.has(kk))) return true;
    i.recipes = i.recipes.filter(x => x !== id);
    if(i.recipes.length){ fixItem(i); return true; } if(i.custom) return true;
    delete marks[i.id]; return false;
  });
}
function addFresh(k, id, lines, keepCart){
  tabHintAt = Date.now();
  if(!(k.progress.active[id] !== false && !(k.progress.archived || {})[id] && !(k.progress.done || {})[id])) unlinkRecipe(k, id);
  addIngredientsTo(k, id, [{items: lines}]);
  const keys = new Set(lines.flatMap(ingParts).map(l => splitIngredient(l).key));
  const marks = k.progress.shop = k.progress.shop || {};
  if(!keepCart) k.shopping.items.forEach(i => { if((i.recipes || []).includes(id) && ikeys(i).some(kk => keys.has(kk))) delete marks[i.id]; });
  k.progress.active[id] = true; if(k.progress.done) delete k.progress.done[id];
  if(k.progress.archived) delete k.progress.archived[id];
}
const ingListed = (id, line) => ingParts(line).some(pl => { const key = splitIngredient(pl).key; return allItems().some(i => (i.recipes || []).includes(id) && ihas(i, key) && !P().shop[i.id]); }) && isActive(id) && !(P().done || {})[id];
let addSheet = null, choosing = null, chooseSnap = null, chosenN = 0, moreOpen = false, shopQ = '', pickSheet = null, shopAdd = false;
// At home mode: a separate pass for marking what's already in the kitchen, so the list itself has one thing to tap per row.
let homeMode = false, editItem = null;
const srcCredit = srcs => srcs.length ? `<div class="srcline">Recipe from <a href="${esc(srcs[0].url)}" target="_blank" rel="noopener">${esc(hostOf(srcs[0].url))}</a></div>` : '';
const hostOf = u => { try{ return new URL(u).hostname.replace(/^www\./, ''); }catch(e){ return 'website'; } };
const ICON_RESTART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
const ICON_PEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';

/* ---------------- render ---------------- */
// Cook a Meal is switched off for now (Hayley, Nov 18). Set to true to bring it back; nothing about it was deleted.
const MEAL_ON = false;
// Add to home screen: an "Add to home screen" item in the account menu, plus one quiet tip from the third visit on.
// Android and computer Chrome get a real Install button; iPhone gets the Share steps (Apple doesn't allow an install button).
// Never shown inside the installed app. The tip's "seen" state lives on this device only.
let installEvt = null;
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const lsGet = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };
const bmVisits = (() => { let n = +(lsGet('bm_visits') || 0); try{ if(!sessionStorage.getItem('bm_v')){ sessionStorage.setItem('bm_v', '1'); n++; lsSet('bm_visits', String(n)); } }catch(e){} return n; })();
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; lsSet('bm_a2hs', 'done'); render(); });
const ICON_SHARE = '<svg class="xi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></svg>';
const ICON_PHONE = '<svg viewBox="0 0 24 24"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>';
function installTip(){
  if(isStandalone() || bmVisits < 3 || lsGet('bm_a2hs')) return '';
  return `<div class="a2hs" role="status"><span class="a2hs-i">${ICON_PHONE}</span><div><b>Get Butter Math on your home screen</b><span>It opens like an app, with one tap.</span></div><button class="btn dark sm" data-act="installopen">Show me how</button><button class="a2hsx" data-act="installtipx" aria-label="Close">${ICON_X}</button></div>`;
}
function showInstall(){
  let body;
  if(isStandalone()) body = `<p class="muted">You're already using the Butter Math app. Nice!</p><div class="row"><button class="btn primary" data-act="mclose">Done</button></div>`;
  else if(installEvt) body = `<p class="muted">Install Butter Math, and it opens like an app from your home screen, with no browser bar.</p><div class="row"><button class="btn quiet" data-act="mclose">Not now</button><button class="btn primary" data-act="installgo">Install</button></div>`;
  else if(isIOS()) body = `<p class="muted">Butter Math isn't in the App Store yet, but you can add it to your home screen. It opens like an app.</p>
    <ol class="a2hs-steps"><li><i>1</i><span>Open <b>buttermath.app</b> in <b>Safari</b>.</span></li><li><i>2</i><span>Tap the <b>Share</b> button ${ICON_SHARE} at the bottom of the screen.</span></li><li><i>3</i><span>Scroll down and tap <b>Add to Home Screen</b>, then tap <b>Add</b>.</span></li></ol><div class="row"><button class="btn primary" data-act="mclose">Got it</button></div>`;
  else body = `<p class="muted">Butter Math isn't in the app stores yet, but you can add it to your home screen. It opens like an app.</p>
    <ol class="a2hs-steps"><li><i>1</i><span>Open <b>buttermath.app</b> in <b>Chrome</b>.</span></li><li><i>2</i><span>Tap the <b>⋮</b> menu at the top right.</span></li><li><i>3</i><span>Tap <b>Install app</b> or <b>Add to Home screen</b>, then tap <b>Install</b>.</span></li></ol><div class="row"><button class="btn primary" data-act="mclose">Got it</button></div>`;
  $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card a2hs-card" data-stop><div class="mhead"><h3>Add to home screen</h3><button class="ibtn mx" data-act="mclose" aria-label="Close">${ICON_X}</button></div>${body}</div></div>`;
}
// Back links return to the main tab you were last on (Recipes, Shopping list, or Friends) and name it.
let lastTab = 'recipes';
const TAB_NAMES = {recipes: 'Recipes', shopping: 'Shopping list', friends: 'Friends'};
const backBtn = () => `<button class="back" data-act="go" data-h="${lastTab}">${ICON_BACK}${TAB_NAMES[lastTab]}</button>`;
function route(){
  const h = (location.hash || '').slice(1);
  if(h.startsWith('r-')) return {v:'recipe', id:h.slice(2)};
  if(h.startsWith('fr-')) return {v:'frecipe', id:h.slice(3)};
  if(h.startsWith('f-')) return {v:'fbook', id:h.slice(2)};
  if(h.startsWith('invite-')) return {v:'invite', id:h.slice(7)};
  if(h.startsWith('gift-')) return {v:'gift', id:h.slice(5)};
  if(h.startsWith('edit-')) return {v:'form', id:h.slice(5)};
  if(h === 'add') return {v:'form'};
  if(h === 'meal' && !MEAL_ON) return {v:'recipes'};
  if(['recipes','friends','account','settings','privacy','trips','admin','terms','feedback','help','about','meal'].includes(h)) return {v:h};
  // New members with nothing saved yet start on Recipes, since adding a recipe comes first.
  return loaded && !recipes.length && !allItems().length ? {v:'recipes'} : {v:'shopping'};
}
// ---------- friends & shared cookbooks ----------
let fSavedOnly = false, fCat = [], fCatOpen = false, fSortOpen = false, fSortK = 'recent';
const FSORTS = {recent:'Recent', az:'A–Z'};
let sendLink = null;
let friends = null, inbox = [], saves = [], friendsAt = 0, addFriendOpen = false, frSent = null, sendSheet = null, fbook = {}, fQ = '', inviteInfo = null;
const ICON_ADDF = '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>';
const ICON_LINK = '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
const ICON_LOCK = '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const ICON_PLUS2 = '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
const ICON_OK = '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>';
const ICON_RIGHT = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const AVC = ['#C8553D', '#4B57A8', '#3F7A55', '#B5142B', '#D9772B', '#6E4FA8'];
const avColor = () => '#3F7A55';
const avatar = (id, name, cls = '') => `<span class="av ${cls}" style="--a:${avColor(id)}">${esc((name || '?').trim().charAt(0).toUpperCase())}</span>`;
const kitchenOf = n => `${n}'s Kitchen`;
const isPriv = id => !!(P().private || {})[id];
const friendBy = id => (friends || []).find(f => f.friend_id === id);
const savedFrom = f => recipes.filter(r => { const s = D(r).savedFrom; return s && (s.owner === f.friend_id || (!s.owner && s.name === f.name)); });
const savedCopy = (fid, rid) => recipes.find(r => (D(r).savedFrom || {}).id === rid);
const friendsNew = () => (friends || []).filter(f => f.status === 'pending' && f.incoming).length + inbox.length + saves.length;

async function loadFriends(force){
  if(!user || (!force && Date.now() - friendsAt < 20000)) return;
  friendsAt = Date.now();
  const [f, i, sv] = await Promise.all([sb.rpc('my_friends'), sb.rpc('my_inbox'), sb.rpc('my_save_notices')]);
  if(!f.error) friends = f.data || []; else if(friends === null) friends = [];
  if(!i.error) inbox = i.data || [];
  if(!sv.error) saves = sv.data || [];
  render();
}
async function loadFbook(fid){
  fbook[fid] = {loading: true, rows: (fbook[fid] || {}).rows || []}; render();
  const {data, error} = await sb.rpc('friend_recipes', {friend: fid});
  fbook[fid] = {loading: false, rows: (data || []).map(tidyRec), err: !!error}; render();
}

function renderFriends(){
  if(friends === null){ loadFriends(true); return `<div class="grid"><div class="skeleton"></div><div class="skeleton"></div></div>`; }
  const inc = friends.filter(f => f.status === 'pending' && f.incoming), acc = friends.filter(f => f.status === 'accepted'), out = friends.filter(f => f.status === 'pending' && !f.incoming);
  const n = inc.length + inbox.length;
  const isEmpty = !acc.length && !n && !out.length && !saves.length;
  const head = `<div class="fr-h"><h2>Friends</h2>${isEmpty ? '' : `<button class="btn primary sm" data-act="addfriend">${ICON_ADDF}Add friend</button>`}</div>`;
  const reqs = inc.map(f => `<div class="fcard"><div class="frow">${avatar(f.friend_id, f.name)}<div class="ftx"><b>${esc(f.name)} wants to share recipes</b><span>You'll be able to see each other's recipes</span></div></div>
    <div class="fbtns"><button class="btn dark" data-act="fraccept" data-id="${esc(f.friend_id)}">Accept</button><button class="btn outline" data-act="frdecline" data-id="${esc(f.friend_id)}">Decline</button></div></div>`).join('');
  const shares = inbox.map(s => `<div class="fcard"><div class="frow"><span class="thumb" style="--c:${esc(s.data.color || '#888')}">${pic(s.data)}</span><div class="ftx"><span>${esc(s.sender_name)} sent you a recipe</span><b>${esc(s.data.title || 'A recipe')}</b></div></div>
    ${s.note ? `<div class="note">“${esc(s.note)}”</div>` : ''}
    <div class="fbtns"><button class="btn dark" data-act="shsave" data-id="${esc(s.id)}">${ICON_PLUS2}Save recipe</button><button class="btn outline" data-act="shdismiss" data-id="${esc(s.id)}">Dismiss</button></div></div>`).join('');
  const saved = saves.map(s => `<div class="savebar" role="status"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></svg><span><b>${esc(s.saver_name)}</b> saved your recipe <b>${esc(s.title)}</b>!</span><button data-act="svdismiss" data-id="${esc(s.id)}" aria-label="Dismiss"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>`).join('');
  const books = acc.map(f => `<div class="cbk crow" role="link" tabindex="0" data-act="go" data-h="f-${esc(f.friend_id)}" aria-label="Open ${esc(kitchenOf(f.name))}">${avatar(f.friend_id, f.name)}<span class="ftx"><b>${esc(kitchenOf(f.name))}</b><span>${f.recipes} recipe${f.recipes == 1 ? '' : 's'}</span></span><button class="rmfr2" data-act="frremove" data-id="${esc(f.friend_id)}" aria-label="Remove ${esc(f.name)} as a friend" title="Remove friend"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" x2="16" y1="11" y2="11"/></svg></button></div>`).join('');
  const waiting = out.map(f => `<div class="cbk wait">${avatar(f.friend_id, f.name)}<span class="ftx"><b>${esc(f.name)}</b><span>Waiting for them to accept</span></span><button class="linkbtn" data-act="frcancel" data-id="${esc(f.friend_id)}">Cancel</button></div>`).join('');
  const empty = isEmpty ? `<div class="card empty frempty"><b>Share recipes with friends and family</b><span>When they accept, you can browse each other's recipes and save their recipes to your recipe box.</span><button class="btn primary" data-act="addfriend">${ICON_ADDF}Add friend</button></div>` : '';
  return head + saved + (n ? `<div class="fr-sec">New <span class="dotn">${n}</span></div>${reqs}${shares}` : '')
    + (acc.length ? `<div class="fr-sec">Friends</div>${books}` : '') + (out.length ? `<div class="fr-sec">Sent requests</div>${waiting}` : '') + empty
    + (addFriendOpen ? renderAddFriend() : '');
}
async function inviteMail(to){
  const {data, error} = await sb.rpc('create_invite_link'); if(error || !data) return null;
  const url = location.origin + location.pathname + '#invite-' + data, me = firstName();
  const subj = `${me || 'A friend'} invited you to Butter Math`;
  const body = `Hi!\n\nI've been saving my recipes on Butter Math, a free site that keeps all your recipes in one place and turns them into one shopping list. Join me so we can share recipes:\n\n${url}\n\n${me || ''}`.trim();
  const E = encodeURIComponent;
  return {url, mail: 'mailto:' + E(to).replace(/%40/g, '@') + '?subject=' + E(subj) + '&body=' + E(body), gmail: 'https://mail.google.com/mail/?view=cm&fs=1&to=' + E(to) + '&su=' + E(subj) + '&body=' + E(body)};
}
function renderAddFriend(){
  if(frSent) return `<div class="sheetbg" data-act="addfriendclose"></div><div class="asksheet frsheet" role="dialog" aria-label="${frSent.invited ? 'User not found' : 'Friend request sent'}">${frSent.invited ? `<div class="pickhead"><div class="askt">User not found</div><button class="ibtn" data-act="addfriendclose" aria-label="Close">${ICON_X}</button></div>
    <p class="frsent">We couldn't find a Butter Math account for <b>${esc(frSent.em)}</b>. They might not be on Butter Math yet.</p>
    <p class="frsent">Send them an invite and they'll receive your friend request when they log in for the first time.</p>
    ${frSent.mail ? `<a class="btn primary bigbtn" href="${esc(frSent.mail.mail)}" data-act="frmailed">` : `<button class="btn primary bigbtn" data-act="frmail">`}<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>Email them an invite${frSent.mail ? '</a>' : '</button>'}${frSent.mail ? `<p class="frmore">If this did not open an email, <button class="linkbtn" data-act="frcopy">copy the invite link</button> so you can email or text the sign up link to a friend.</p>` : ''}` : `<div class="pickhead"><div class="askt">Request sent</div><button class="ibtn" data-act="addfriendclose" aria-label="Close">${ICON_X}</button></div>
    <p class="frsent">If <b>${esc(frSent.em)}</b> has an account, they'll see your friend request when they log in to Butter Math.</p>`}</div>`;
  return `<div class="sheetbg" data-act="addfriendclose"></div><div class="asksheet frsheet" role="dialog" aria-label="Add friend"><div class="pickhead"><div class="askt">Add friend</div><button class="ibtn" data-act="addfriendclose" aria-label="Close">${ICON_X}</button></div>
    <form class="emrow" data-form="frsend"><input class="tin" id="fr-email" data-keep type="email" inputmode="email" autocomplete="off" placeholder="Enter friend's email" aria-label="Enter friend's email" required><button class="btn primary" type="submit">Send</button></form>
    <p class="frinvl">Not on Butter Math? Copy an invite link and send them a text</p>
    <div class="emrow"><input class="tin frinv" id="fr-inv" readonly value="${esc(myInvite || '')}" placeholder="Making your invite link…" aria-label="Your invite link"><button class="btn" type="button" data-act="frinvcopy">Copy</button></div>
  </div>`;
}
function fTile(fid, row){
  const d = row.data || {}, saved = savedCopy(fid, row.id), tt = autoTags(d).slice(0, 3);
  return `<div class="tile" role="link" tabindex="0" style="--c:${esc(d.color || '#888')}" data-act="go" data-h="fr-${esc(fid)}~${esc(row.id)}" data-q="${esc((d.title + ' ' + autoTags(d).join(' ')).toLowerCase())}">
    <span class="art">${pic(d)}</span>${saved ? `<button class="savebtn done" data-act="funsave" data-f="${esc(fid)}" data-id="${esc(row.id)}" aria-label="Saved. Tap to remove from your recipe box" title="Tap to unsave">${ICON_OK}Saved</button>` : `<button class="savebtn" data-act="fsave" data-f="${esc(fid)}" data-id="${esc(row.id)}">${ICON_PLUS2}Save</button>`}
    <span class="body">${tt.length ? `<span class="ttags">${tt.map(t => `<i>${esc(t)}</i>`).join('')}</span>` : ''}<h2>${esc(d.title)}</h2><span class="meta">${d.yield ? `<span>${ICON_SERV}${esc(d.yield)}</span>` : ''}${d.total ? `<span>${ICON_TIME}${esc(d.total)}</span>` : ''}</span></span></div>`;
}
function renderFbook(fid){
  const f = friendBy(fid);
  if(friends === null){ loadFriends(true); return `<div class="grid"><div class="skeleton"></div></div>`; }
  if(!f || f.status !== 'accepted') return `<button class="back" data-act="go" data-h="friends">${ICON_BACK}Friends</button><div class="card empty">These recipes aren't shared with you.</div>`;
  const b = fbook[fid]; if(!b) { setTimeout(() => loadFbook(fid)); }
  const rows = (b && b.rows) || [];
  return `<button class="back" data-act="go" data-h="friends">${ICON_BACK}Friends</button>
    <div class="fbanner">${avatar(fid, f.name)}<span class="ftx"><b>${esc(kitchenOf(f.name))}</b><span>${rows.length || f.recipes} recipe${(rows.length || f.recipes) == 1 ? '' : 's'}</span></span></div>
    ${rows.length ? `<div class="rsearch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg><input id="fsearch" data-keep type="search" placeholder="Search ${esc(f.name)}'s recipes" autocomplete="off"></div>` : ''}
    ${rows.length > 1 ? fFilterBar(rows, fid) : ''}
    ${!b || b.loading && !rows.length ? `<div class="grid"><div class="skeleton"></div><div class="skeleton"></div></div>` : b.err ? `<div class="card empty">Couldn't load these recipes. Try again in a moment.</div>` : rows.length ? fGrid(fid, rows) : `<div class="card empty">${esc(f.name)} hasn't shared any recipes yet.</div>`}`;
}
function fFilterBar(rows, fid){
  const nSaved = rows.filter(r => savedCopy(fid, r.id)).length; if(!nSaved) fSavedOnly = false;
  const counts = {}; rows.forEach(r => autoTags(r.data || {}).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const cats = Object.keys(counts).sort((x, y) => x.localeCompare(y)); fCat = fCat.filter(t => counts[t]);
  const on = fCat.length > 0, hasAll = (r, list) => { const tg = autoTags(r.data || {}); return list.every(t => tg.includes(t)); };
  return `<div class="fbar2"><div class="fwrap"><button class="fpill ${on ? 'act' : ''}" data-act="fcatmenu" aria-haspopup="true" aria-expanded="${fCatOpen}">Category${on ? `<span class="fcount">${fCat.length}</span>` : ''}${ICON_CHEV}</button>
    ${fCatOpen ? `<div class="fmenu" role="group" aria-label="Categories"><button class="fall ${!on ? 'on' : ''}" data-act="fcatclear">All categories <span>${rows.length}</span></button>${cats.map(t => { const o = fCat.includes(t); const n = o ? rows.filter(r => hasAll(r, fCat)).length : rows.filter(r => hasAll(r, fCat.concat(t))).length; return `<button class="fck ${o ? 'on' : ''} ${!o && !n ? 'dim' : ''}" data-act="fcatpick" data-t="${esc(t)}" role="checkbox" aria-checked="${o}"><i class="cb">${o ? CHECK : ''}</i><b>${esc(t)}</b><span>${o ? '' : n}</span></button>`; }).join('')}</div>` : ''}</div>
    ${nSaved ? `<button class="fpill savedp ${fSavedOnly ? 'on' : ''}" data-act="fsavedtog" aria-pressed="${fSavedOnly}">Saved<span class="fcount">${nSaved}</span></button>` : ''}
    <div class="fwrap fright"><button class="fpill sortp" data-act="fsortmenu" aria-haspopup="menu" aria-expanded="${fSortOpen}" aria-label="Sort: ${FSORTS[fSortK]}">${ICON_SORT}${FSORTS[fSortK]}</button>
    ${fSortOpen ? `<div class="fmenu right" role="menu">${Object.entries(FSORTS).map(([k, l]) => `<button role="menuitem" class="${k === fSortK ? 'on' : ''}" data-act="fsortpick" data-k="${k}">${l}${k === fSortK ? '<span>✓</span>' : ''}</button>`).join('')}</div>` : ''}</div></div>
    ${on ? `<div class="selchips">${fCat.map(t => `<span class="selchip">${esc(t)}<button data-act="fcatpick" data-t="${esc(t)}" aria-label="Remove ${esc(t)} filter">${ICON_X}</button></span>`).join('')}${fCat.length > 1 ? `<button class="clearall" data-act="fcatclear">Clear all</button>` : ''}</div>${fCat.length > 1 ? `<div class="fnote">Showing recipes with ${fCat.length === 2 ? 'both' : 'all ' + fCat.length} tags</div>` : ''}` : ''}`;
}
function fGrid(fid, rows){
  const tg = r => autoTags(r.data || {});
  let shown = rows.filter(r => fCat.every(t => tg(r).includes(t)) && (!fSavedOnly || savedCopy(fid, r.id)));
  if(fSortK === 'az') shown = shown.slice().sort((a, b) => (a.data.title || '').localeCompare(b.data.title || ''));
  return `<div class="grid" id="fgrid">${shown.map(r => fTile(fid, r)).join('')}</div><div class="card empty" id="fnone" ${shown.length ? 'hidden' : ''}>No recipes match.</div>`;
}
function fActRow(fid, rid){
  const saved = savedCopy(fid, rid);
  return saved ? `<button class="savebtn done inl" data-act="funsave" data-f="${esc(fid)}" data-id="${esc(rid)}" aria-label="Saved. Tap to remove from your recipe box" title="Tap to unsave">${ICON_OK}Saved</button><button class="golink" data-act="openmine" data-id="${esc(saved.id)}">Go to your recipe box →</button>`
    : `<button class="btn primary grow" data-act="fsave" data-f="${esc(fid)}" data-id="${esc(rid)}" data-open="1">${ICON_PLUS2}Save to my recipe box</button>`;
}
const BOOK_ART = `<svg class="book" viewBox="0 0 160 96" aria-hidden="true"><ellipse cx="80" cy="90" rx="66" ry="4" fill="#141414" opacity=".12"/><rect x="8" y="76" width="144" height="9" rx="4" fill="#D7263D" stroke="#141414" stroke-width="2.5"/><path d="M14 76 L14 70 Q46 60 80 72 L80 76 Z" fill="#fff" stroke="#141414" stroke-width="2.5" stroke-linejoin="round"/><path d="M146 76 L146 70 Q114 60 80 72 L80 76 Z" fill="#fff" stroke="#141414" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 73 Q47 64 78 74M142 73 Q113 64 82 74" fill="none" stroke="#CFC8B6" stroke-width="1.5"/><g fill="none" stroke="#141414" stroke-width="2.5" stroke-linecap="round"><path class="pg p1" d="M80 73 Q112 60 144 68"/><path class="pg p2" d="M80 73 Q112 60 144 68"/><path class="pg p3" d="M80 73 Q112 60 144 68"/></g></svg>`;
// After you save a friend's recipe, going back to your recipe box shows a recipe card dropping into a red recipe tin.
const TIN_ART = `<svg class="tin" viewBox="0 0 160 150" aria-hidden="true"><rect x="34" y="40" width="92" height="16" rx="4" fill="#fff" stroke="#141414" stroke-width="3" transform="rotate(-14 34 56)"/><g class="tincw"><g class="tinc"><rect x="46" y="44" width="68" height="46" rx="4" fill="#fff" stroke="#141414" stroke-width="3"/><line x1="46" y1="56" x2="114" y2="56" stroke="#D7263D" stroke-width="3"/><line x1="54" y1="66" x2="104" y2="66" stroke="#B4B2A9" stroke-width="2"/><line x1="54" y1="74" x2="96" y2="74" stroke="#B4B2A9" stroke-width="2"/><line x1="54" y1="82" x2="100" y2="82" stroke="#B4B2A9" stroke-width="2"/></g></g><rect x="30" y="78" width="100" height="56" rx="8" fill="#D7263D" stroke="#141414" stroke-width="4"/><rect x="64" y="96" width="32" height="14" rx="3" fill="#FBF6EC" stroke="#141414" stroke-width="3"/><rect x="72" y="100" width="16" height="6" rx="1" fill="#F7D774"/></svg>`;
let filedNew = false;
function tinLoad(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const o = document.createElement('div'); o.className = 'bookload'; o.setAttribute('role', 'status');
  o.innerHTML = `<div class="loader">${TIN_ART}<div class="ltext">Loading<span class="dots"><i>.</i><i>.</i><i>.</i></span></div></div>`;
  document.body.appendChild(o);
  setTimeout(() => { o.classList.add('out'); setTimeout(() => o.remove(), 380); }, 1900);
}
// Going from a friend's recipe to your saved copy shows the recipe tin, the same as going back to your recipe box (Nov 20, 2026).
function openMine(id){
  filedNew = false;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){ location.hash = 'r-' + id; return; }
  const o = document.createElement('div'); o.className = 'bookload'; o.setAttribute('role', 'status');
  o.innerHTML = `<div class="loader">${TIN_ART}<div class="ltext">Loading<span class="dots"><i>.</i><i>.</i><i>.</i></span></div></div>`;
  document.body.appendChild(o);
  setTimeout(() => { location.hash = 'r-' + id; }, 1650);
  setTimeout(() => { o.classList.add('out'); setTimeout(() => o.remove(), 380); }, 1850);
}
function renderFrecipe(key){
  const [fid, rid] = key.split('~'), f = friendBy(fid), b = fbook[fid];
  if(friends === null){ loadFriends(true); return `<div class="grid"><div class="skeleton"></div></div>`; }
  if(!b){ setTimeout(() => loadFbook(fid)); return `<div class="grid"><div class="skeleton"></div></div>`; }
  const row = (b.rows || []).find(r => r.id === rid);
  if(!f || !row) return `<button class="back" data-act="go" data-h="${f ? 'f-' + esc(fid) : 'friends'}">${ICON_BACK}${f ? esc(kitchenOf(f.name)) : 'Friends'}</button><div class="card empty">${b.loading ? 'Loading…' : "This recipe isn't shared anymore."}</div>`;
  const d = row.data;
  const ings = (d.ingredients || []).map(g => (g.group ? `<div class="grp">${esc(g.group)}</div>` : '') + (g.items || []).map(t => `<div class="ing ro"><span>${fmt(t)}</span></div>`).join('')).join('');
  let n = 0;
  const steps = (d.steps || []).map(sec => (sec.section ? `<div class="stephead">${esc(sec.section)}</div>` : '') + (sec.items || []).map(st => { n++; return `<div class="step ro"><span class="num">${n}</span><span class="tx">${st.title ? `<div class="tt">${esc(st.title)}</div>` : ''}<p>${fmt(st.text)}</p></span></div>`; }).join('')).join('');
  const srcs = (d.links || []).filter(l => /^https?:\/\//i.test(l.url || ''));
  const more = srcs.slice(1).filter(l => hostOf(l.url) !== hostOf(srcs[0].url));
  const notes = (d.notes && d.notes.length) || more.length ? `<div class="card panel extras">${d.notes && d.notes.length ? `<h4>Good to know</h4><ul>${d.notes.map(x => `<li>${fmt(x)}</li>`).join('')}</ul>` : ''}${more.map(l => `<a class="olink" href="${esc(l.url)}" target="_blank" rel="noopener"><span><b>${esc(l.label || 'View on ' + hostOf(l.url))}</b><small>${esc(hostOf(l.url))}</small></span>${ICON_EXT}</a>`).join('')}</div>` : '';
  return `<button class="back" data-act="go" data-h="f-${esc(fid)}">${ICON_BACK}${esc(kitchenOf(f.name))}</button>
  <div class="card hero"><div class="art ${d.photo ? 'photo' : 'drawn'}">${d.photo ? pic(d) : `<div class="artbg">${art(kindOf(d), artText(d))}</div><div class="artfg">${art(kindOf(d), artText(d)).replace('xMidYMid slice', 'xMidYMid meet')}</div>`}</div><div class="body">
    <div class="ttlrow"><h2>${esc(d.title)}</h2></div>
    ${srcCredit(srcs)}<div class="byl">${avatar(fid, f.name, 'xs')}From ${esc(kitchenOf(f.name))}</div>
    <div class="meta">${d.yield ? `<span>${ICON_SERV}${esc(d.yield)}</span>` : ''}${d.total ? `<span>${ICON_TIME}${esc(d.total)}</span>` : d.cook ? `<span>${ICON_TIME}${esc(d.cook)}</span>` : ''}</div>
    ${autoTags(d).length ? `<div class="rtags">${autoTags(d).map(t => `<span class="rtag ro">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="actrow factrow">${fActRow(fid, rid)}</div>
  </div></div>
  <div class="layout">
    <div class="card panel ing-col"><div class="inghead"><h3>Ingredients</h3></div>${ings || '<div class="muted">No ingredients listed.</div>'}</div>
    <div><h3 style="font-size:20px;margin:0 4px 10px">Steps</h3>${steps || '<div class="card empty">No steps listed.</div>'}${notes}</div>
  </div>`;
}
function renderSendSheet(r){
  const acc = (friends || []).filter(f => f.status === 'accepted');
  return `<div class="sheetbg" data-act="sendclose"></div><div class="asksheet frsheet" role="dialog" aria-label="Send to friends"><div class="pickhead"><div class="askt">Send ${esc(D(r).title)}</div><button class="ibtn" data-act="sendclose" aria-label="Close">${ICON_X}</button></div>
    ${acc.length ? `<div class="sendlist">${acc.map(f => `<label class="sendrow">${avatar(f.friend_id, f.name, 'sm')}<span>${esc(f.name)}</span><input type="checkbox" class="sendck" value="${esc(f.friend_id)}" ${acc.length === 1 ? 'checked' : ''}></label>`).join('')}</div>
    <textarea class="tin" id="send-note" data-keep rows="2" maxlength="280" placeholder="Add a note (optional)"></textarea>
    <button class="btn primary bigbtn" id="send-go" data-act="sendgo" data-id="${esc(r.id)}"${acc.length === 1 ? '' : ' disabled'}>${acc.length === 1 ? 'Send' : 'Pick a friend'}</button>`
    : `<p class="frp">Add friends first, then you can send them recipes.</p><button class="btn primary bigbtn" data-act="go" data-h="friends">${ICON_ADDF}Add friend</button>`}
    <div class="ordiv">or</div>
    <button class="btn outline bigbtn" data-act="reccopy" data-id="${esc(r.id)}">${ICON_LINK}Copy recipe</button>
    <div class="frhint">For friends who aren't on Butter Math yet. ${!near1(scaleOf(r.id), 1) ? 'Copies the ingredients and steps at the size you picked, plus a link' : srcOf(D(r)) ? 'Copies a link' : 'Copies the ingredients and steps, plus a link'} to save it in their own free Butter Math recipe box.</div></div>`;
}
const srcOf = d => ((d.links || []).find(l => /^https?:\/\//i.test(l.url || '')) || {}).url || '';
function shareText(d, link, f = 1){
  const plain = x => prettyFractions(String(x || '')).replace(/<[^>]+>/g, '').trim();
  const bm = `Save it to your own free Butter Math recipe box: ${link || 'https://buttermath.app'}`;
  const sized = !near1(f, 1), size = ({0.5: '½×', 1.5: '1½×', 2: '2×', 3: '3×'})[f] || (d.yield ? scaleYield(d.yield, f) : '') || 'new size', title = (plain(d.title) || 'Recipe') + (sized ? ` (${size})` : ''), src = srcOf(d);
  // Recipes from a website: just the name and the Butter Math link (decided Nov 19, 2026), so the text shows the Butter Math link preview card.
  // The original link only stays in if the Butter Math link couldn't be made, so the friend still gets the recipe.
  if(src && !sized) return link ? `${title}\n\n${bm}` : `${title}\n${src}\n\n${bm}`;
  const out = [title];
  if(d.yield || d.total) out.push([sized ? scaleYield(d.yield, f) : d.yield, d.total].filter(Boolean).map(plain).join(' · '));
  const one = i => { if(!sized) return '• ' + plain(i); const x = scaleLine(plain(i), f); return '• ' + (x == null ? plain(i) + ' (not scaled)' : x); };
  const ings = (d.ingredients || []).flatMap(g => typeof g === 'string' ? [one(g)] : [...(g.group ? ['', plain(g.group) + ':'] : []), ...(g.items || []).map(one)]);
  if(ings.length) out.push('', 'INGREDIENTS', ...ings);
  let n = 0; const steps = (d.steps || []).flatMap(sec => typeof sec === 'string' ? [`${++n}. ${plain(sec)}`] : [...(sec.section ? ['', plain(sec.section) + ':'] : []), ...(sec.items || []).map(st => `${++n}. ${st.title ? plain(st.title) + ': ' : ''}${plain(st.text)}`)]);
  if(steps.length) out.push('', 'STEPS', ...(sized && (d.steps || []).some(sec => (sec.items || []).some(st => stepHasAmount(st.text))) ? ['(Amounts written in the steps are for the original size.)'] : []), ...steps);
  if(d.notes && d.notes.length) out.push('', 'GOOD TO KNOW', ...d.notes.map(x => '• ' + plain(x)));
  out.push('', bm);
  return out.join('\n');
}

async function saveCopy(data, from){
  const d = JSON.parse(JSON.stringify(data || {})); d.savedFrom = from; delete d.photoPath;
  const id = crypto.randomUUID(), src = d.photo;
  const {data: row, error} = await sb.from('recipes').insert({id, user_id: user.id, sort: Date.now(), data: d}).select('id, sort, data').single();
  if(error) throw error;
  mutate(k => { k.progress.active[id] = false; });
  if(src) (async () => { try{
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    const blob = await (await fetch(src, {signal: ctl.signal})).blob(); clearTimeout(t);
    const up = await uploadPhoto(id, blob); const nd = Object.assign({}, row.data, {photo: up.url, photoPath: up.path});
    const {error: e2} = await sb.from('recipes').update({data: nd}).eq('id', id).eq('user_id', user.id);
    if(!e2) row.data = nd; else sb.storage.from('photos').remove([up.path]).catch(() => {});
  }catch(e){ console.warn('photo copy skipped', e); } })();
  recipes.push(row); return row;
}
let myInvite = null;
function getInvite(){ if(myInvite) return Promise.resolve(myInvite); return sb.rpc('create_invite_link').then(({data}) => { if(data) myInvite = location.origin + location.pathname + '#invite-' + data; return myInvite; }, () => null); }
// After copying, the button itself says "Copied!" in green for a couple of seconds, so you can see it worked.
function flashCopied(el){ if(!el || el.classList.contains('copied')) return; const html = el.innerHTML; el.classList.add('copied'); el.innerHTML = '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Copied!';
  setTimeout(() => { if(el.isConnected){ el.innerHTML = html; el.classList.remove('copied'); } }, 2000); }
async function copyInviteLink(){
  const {data, error} = await sb.rpc('create_invite_link');
  if(error || !data){ toast("Couldn't make a link. Try again."); return; }
  const url = location.origin + location.pathname + '#invite-' + data;
  const text = `${firstName() || 'I'} invited you to share recipes on Butter Math`;
  if(navigator.share && matchMedia('(pointer: coarse)').matches){ try{ await navigator.share({title: 'Butter Math', text, url}); return; }catch(e){ if(e && e.name === 'AbortError') return; } }
  try{ await navigator.clipboard.writeText(url); toast('Invite link copied. Send it to your friend.'); }catch(e){ prompt('Copy this invite link', url); }
}
// invite links: remember the token through sign-up / email confirmation
function inviteToken(){ try{ return localStorage.getItem('mb_invite'); }catch(e){ return null; } }
function rememberInvite(t){ try{ localStorage.setItem('mb_invite', t); }catch(e){} if(!inviteInfo || inviteInfo.t !== t){ inviteInfo = {t, name: null}; sb.rpc('invite_link_info', {t}).then(({data}) => { inviteInfo = {t, name: data || null, bad: !data}; render(); }); } }
function forgetInvite(){ try{ localStorage.removeItem('mb_invite'); }catch(e){} }
// recipe links: someone without an account gets a recipe once they sign in
let giftInfo = null;
function giftToken(){ try{ return localStorage.getItem('mb_gift'); }catch(e){ return null; } }
function rememberGift(t){ try{ localStorage.setItem('mb_gift', t); }catch(e){} if(!giftInfo || giftInfo.t !== t){ giftInfo = {t, name: null}; sb.rpc('recipe_link_info', {t}).then(({data}) => { giftInfo = Object.assign({t, bad: !data}, data || {}); render(); }); } }
function forgetGift(){ try{ localStorage.removeItem('mb_gift'); }catch(e){} giftInfo = null; }
let claiming = false;
async function claimGift(){
  const t = giftToken(); if(!t || !user || claiming) return; claiming = true;
  try{ await claimGift0(t); } finally { claiming = false; }
}
async function claimGift0(t){
  const {data, error} = await sb.rpc('accept_recipe_link', {t}); forgetGift();
  if(error || !data){ toast("Couldn't open that recipe link. Ask your friend to send a new one."); return; }
  if(data.self){ toast("That's your own recipe link. Send it to a friend."); return; }
  await loadFriends(true);
  const sh = data.share && inbox.find(x => x.id === data.share);
  if(sh){ try{
      const row = await saveCopy(sh.data, {name: sh.sender_name});
      await sb.rpc('dismiss_share', {share: sh.id}); inbox = inbox.filter(x => x.id !== sh.id);
      toast(`${data.name} sent you ${data.title || 'a recipe'}. It's in your recipes.`); location.hash = 'r-' + row.id; return;
    }catch(e){} }
  toast(data.again ? `You already have ${data.title || 'this recipe'} from ${data.name}` : `${data.name} sent you ${data.title || 'a recipe'}`);
  if(location.hash !== '#friends') location.hash = 'friends'; else render();
}
async function recipeLink(id){
  const {data, error} = await sb.rpc('create_recipe_link', {rid: id}); if(error || !data) return null;
  return location.origin + location.pathname + '#gift-' + data;
}
function renderInviteCard(){
  if(!inviteInfo || inviteInfo.bad) return '';
  if(inviteInfo.name === '__self'){ setTimeout(() => { forgetInvite(); inviteInfo = null; toast("That's your own invite link. Share it with a friend."); render(); }); return ''; }
  return `<div class="modal"><div class="card mcard" data-stop>${avatar(inviteInfo.t, inviteInfo.name || '?', 'big')}<h3>${esc(inviteInfo.name || 'Someone')} wants to share recipes</h3><p>You'll be able to see each other's recipes and save copies.</p>
    <button class="btn primary bigbtn" data-act="invaccept">Accept</button><button class="btn outline bigbtn" data-act="invno">Decline</button></div></div>`;
}

let lastView = '';
// List pages (Recipes, Shopping list, Friends, a friend's recipes, Past trips) reopen where you left them, however you come back.
// Other pages start at the top, except a recipe you return to from its edit form. Tap the tab you're on to jump to the top.
const scrollMem = {};
window.addEventListener('hashchange', () => { if(lastView) scrollMem[lastView] = window.scrollY; });
const rowsSaved = fid => ((fbook[fid] || {}).rows || []).filter(r => savedCopy(fid, r.id)).length;
function fadeSwap(id){ document.querySelectorAll(`.factrow > *, .tile [data-act="fsave"][data-id="${id}"], .tile [data-act="funsave"][data-id="${id}"]`).forEach(x => x.classList.add('fadein')); }
function syncFbar(fid){ const r = route(), bar = document.querySelector('.fbar2'), rows = (fbook[fid] || {}).rows || []; if(r.v === 'fbook' && bar){ const sc = document.querySelector('.selchips'), fn = document.querySelector('.fnote'); if(sc) sc.remove(); if(fn) fn.remove(); bar.outerHTML = fFilterBar(rows, fid); } if(r.v === 'fbook' || r.v === 'frecipe') app.__h = viewKey(r.v === 'fbook' ? renderFbook(r.id) : renderFrecipe(r.id)); }
const viewKey = h => h.replace(/([#"])a\d+-/g, '$1a-');
/* Keep pictures that didn't change across a re-draw, so photos and drawings don't flash. */
function render(){
  const old = {}; document.querySelectorAll('#app .art').forEach(el => { const k = viewKey(el.outerHTML); (old[k] = old[k] || []).push(el); });
  render0(); pageHeading();
  document.querySelectorAll('#app .art').forEach(el => { const q = old[viewKey(el.outerHTML)]; if(q && q.length){ const o = q.shift(); if(o !== el) el.replaceWith(o); } });
  evenTiles();
}
// Screen readers move around a page by its headings, so no level should be skipped after the logo (h1).
// Pages whose own title is a small heading (h3) have it read as the page heading. Other pages that start at a small heading get a hidden page name first.
const PAGE_NAMES = {shopping: 'Shopping list', recipes: 'Recipes', friends: 'Friends', help: 'Good to know', trips: 'Past trips', admin: 'Admin', meal: 'Cook a meal'};
const TITLED_PAGES = ['form', 'account', 'settings', 'privacy', 'terms', 'feedback'];
function pageHeading(){ const first = app.querySelector('h2, h3, h4'); if(!first || first.tagName === 'H2' || first.hasAttribute('aria-level')) return; const r = route();
  if(TITLED_PAGES.includes(r.v) && first.tagName === 'H3'){ first.setAttribute('aria-level', '2'); return; }
  first.closest('#app > *').insertAdjacentHTML('beforebegin', `<h2 class="vh">${esc(PAGE_NAMES[r.v] || 'Butter Math')}</h2>`); }
// Every recipe card in a grid is as tall as the tallest one, so the grid reads as even rows (titles get up to 3 lines).
function evenTiles(){ document.querySelectorAll('.grid').forEach(g => { const ts = [...g.querySelectorAll(':scope > .tile:not(.addtile)')]; if(!ts.length) return; ts.forEach(t => { t.style.minHeight = ''; }); const h = Math.max(...ts.map(t => t.offsetHeight)); if(h) ts.forEach(t => { t.style.minHeight = h + 'px'; }); }); }
window.addEventListener('resize', () => { clearTimeout(evenTiles.t); evenTiles.t = setTimeout(evenTiles, 120); });
if(document.fonts && document.fonts.ready) document.fonts.ready.then(evenTiles);
function render0(){
  const kept = {}; document.querySelectorAll('[data-keep]').forEach(el => { if(el.id) kept[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
  const icol = document.querySelector('.ing-col'), icolTop = icol ? icol.scrollTop : 0, mlEl = document.getElementById('mlanes'), mlX = mlEl ? mlEl.scrollLeft : 0;
  const ae = document.activeElement && document.activeElement.id && document.activeElement.hasAttribute('data-keep') ? document.activeElement : null;
  let sel = null; try{ sel = ae && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null; }catch(e){}
  let r = route();
  if(TAB_NAMES[r.v]) lastTab = r.v;
  if(r.v !== 'form') shopAdd = false;
  if(r.v === 'gift' && sb){ rememberGift(r.id); if(!user && !authView.giftSet){ authView = {mode:'signup', msg:'', err:'', busy:false, giftSet:true}; } if(user){ history.replaceState(null, '', '#friends'); r = route(); setTimeout(claimGift); } }
  if(r.v === 'invite' && sb){ rememberInvite(r.id); if(!user && authView.mode === 'signin' && !authView.invSet){ authView = {mode:'signup', msg:'', err:'', busy:false, invSet:true}; } if(user){ history.replaceState(null, '', '#friends'); r = route(); } }
  if(!(user && !recovering && gate !== 'in')) delete app.dataset.gate;
  if(user && !recovering && !hadAcct){ hadAcct = true; landing = false; try{ localStorage.setItem('mb-had-account', '1'); }catch(e){} }
  // The header is part of index.html and is always there while the page is open. If it's gone (the page is being closed or replaced
  // when a late answer from the server arrives), there's nothing to draw into, so stop quietly instead of crashing.
  const hdrEl = $('#hdr'); if(!hdrEl) return;
  hdrEl.innerHTML = renderHeader(r);
  if(!sb){ return; }
  if(!user && r.v === 'privacy'){ app.innerHTML = renderPrivacy(); $('#tabs').innerHTML = ''; }
  else if(!user && r.v === 'terms'){ app.innerHTML = renderTerms(); $('#tabs').innerHTML = ''; }
  else if(!user && r.v === 'feedback'){ app.innerHTML = renderFeedback(); $('#tabs').innerHTML = ''; }
  else if(!user || recovering){ app.innerHTML = landingOn(r) ? renderLanding() : renderAuth(); $('#tabs').innerHTML = ''; }
  // The "Enter my kitchen" welcome shows only the very first time someone signs in. Everyone else goes straight to their kitchen.
  else if(gate === 'gate' && !autoDone){ autoEnter(); return; }
  else if(gate === 'gate' && loaded && !firstVisit()){ gate = 'in'; render(); return; }
  else if(gate !== 'in' && (gate === 'loading' || loaded)){ const g = renderGate(); if(app.dataset.gate !== g){ app.innerHTML = g; app.dataset.gate = g; } $('#tabs').innerHTML = ''; }
  else if(!loaded){ app.innerHTML = `<div class="grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`; }
  else {
    renderTabs(r);
    if(r.v !== 'fbook' && r.v !== 'frecipe') app.__h = null;
    if(r.v === 'shopping') app.innerHTML = renderShopping();
    else if(r.v === 'recipes') app.innerHTML = renderRecipes();
    else if(r.v === 'friends') app.innerHTML = renderFriends() + (inviteToken() ? renderInviteCard() : '');
    else if(r.v === 'fbook' || r.v === 'frecipe'){ const h = r.v === 'fbook' ? renderFbook(r.id) : renderFrecipe(r.id), hk = viewKey(h); if(app.__h !== hk){ app.innerHTML = h; app.__h = hk; } }
    else if(r.v === 'form') app.innerHTML = renderForm(r.id);
    else if(r.v === 'account') app.innerHTML = renderAccount();
    else if(r.v === 'settings') app.innerHTML = renderSettings();
    else if(r.v === 'privacy') app.innerHTML = renderPrivacy();
    else if(r.v === 'terms') app.innerHTML = renderTerms();
    else if(r.v === 'feedback') app.innerHTML = renderFeedback();
    else if(r.v === 'help') app.innerHTML = renderHelp();
    else if(r.v === 'trips') app.innerHTML = renderTrips();
    else if(r.v === 'admin') app.innerHTML = renderAdmin();
    else if(r.v === 'about') app.innerHTML = renderLanding(true);
    else if(r.v === 'meal') app.innerHTML = renderMeal();
    else app.innerHTML = renderRecipe(r.id);
    if(mealPick) app.insertAdjacentHTML('beforeend', renderMealPick());
    maybeTour();
  }
  const sameView = (r.v + (r.id || '')) === lastView;
  if(sameView && mlX){ const ml = document.getElementById('mlanes'); if(ml){ ml.scrollLeft = mlX; mealScrollTab(); } }
  if(r.v === 'meal' && !mealTick) mealTick = setInterval(() => { if(route().v !== 'meal'){ clearInterval(mealTick); mealTick = null; return; } if(!mealShop && !mealPick && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) render(); }, 60000);
  if(sameView && icolTop){ const ic = document.querySelector('.ing-col'); if(ic) ic.scrollTop = icolTop; }
  setTimeout(() => { stepPreview(); onNavScroll(); armStepHint(); }, 0);
  if(sameView) document.querySelectorAll('[data-keep]').forEach(el => { if(el.id && kept[el.id] != null && el.type !== 'file'){ if(el.type === 'checkbox') el.checked = kept[el.id]; else el.value = kept[el.id]; } });
  { const fp = $('#f-paste'), fb = $('#f-parsebtn'); if(fp && fb) fb.disabled = !fp.value.trim(); }
  if(ae && sameView){ const el = document.getElementById(ae.id); if(el){ el.focus({preventScroll:true}); if(sel && el.setSelectionRange) try{ el.setSelectionRange(sel[0], sel[1]); }catch(e){} } }
  const key = r.v + (r.id || '');
  if(key !== lastView){
    const keep = ['recipes', 'shopping', 'friends', 'fbook', 'trips'].includes(r.v) || (r.v === 'recipe' && lastView === 'form' + r.id);
    const y = keep ? scrollMem[key] || 0 : 0;
    // when coming back mid-page, load the recipe photos right away so they don't blink in after the jump
    if(y) document.querySelectorAll('#app img[loading="lazy"]').forEach(i => { i.loading = 'eager'; });
    window.scrollTo(0, y); if(y) requestAnimationFrame(() => window.scrollTo(0, y));
    lastView = key;
  }
  renderFab(r);
}
function renderHeader(r){
  const n = firstName();
  const kn = user && n && !recovering ? `<span class="kname">${esc(n)}'s Kitchen</span>` : '';
  return `<div class="bwrap"><h1><a class="logolink" href="#about" data-act="logo" aria-label="Butter Math home">Butter <span>Math</span></a></h1>${kn}</div><div class="hright">${landingOn(r) ? `<div class="lp-nav"><button class="btn lp-signin" data-act="authmode" data-m="signin">Sign in</button></div>` : ''}${user && !recovering ? `<div id="status" class="status ${statusNow.kind}"><i class="dot"></i><span>${esc(statusNow.text)}</span></div><button class="avatar" data-act="menu" aria-label="Your menu" aria-expanded="${menuOpen}">${esc((n || (user.email || '?'))[0].toUpperCase())}</button>${menuOpen ? renderMenu() : ''}` : ''}</div>`;
}
function renderTabs(r){
  const left = visibleItems().filter(it => !P().shop[it.id]).length;
  const hint = r.v !== 'shopping' && Date.now() - tabHintAt < 6200;
  if(hint && !tabHintT) tabHintT = setTimeout(() => { tabHintT = null; renderTabs(route()); }, 6300 - (Date.now() - tabHintAt));
  const h = `<button class="tab ${!['shopping','account','friends','fbook','frecipe'].includes(r.v) ? 'on' : ''}" data-act="go" data-h="recipes">Recipes${recipes.filter(r => !isArch(r.id)).length ? `<span class="n">(${recipes.filter(r => !isArch(r.id)).length})</span>` : ''}</button>
  <button class="tab ${r.v === 'shopping' ? 'on' : ''} ${hint ? 'tabhint' : ''}" data-act="go" data-h="shopping">Shopping list${left ? `<span class="n">(${left})</span>` : ''}</button>
  <button class="tab ${['friends','fbook','frecipe'].includes(r.v) ? 'on' : ''}" data-act="go" data-h="friends">Friends${friendsNew() ? '<span class="rdot" aria-label="New"></span>' : ''}</button>`;
  if(h !== tabsHtml || !$('#tabs').innerHTML){ tabsHtml = h; $('#tabs').innerHTML = h; }
}

function renderShopping(){
  const items = visibleItems(), all = allItems(), shop = P().shop, f = homeMode ? 'all' : ui.filter;
  const done = items.filter(it => shop[it.id]).length;
  const allHome = items.length > 0 && items.every(it => shop[it.id] === 'have');
  // Two items that might be the same thing ("Olive oil" and "Extra virgin olive oil"): ask once whether to put them on one line.
  const apart = new Set(kitchen.shopping.apart || []), cand = items.filter(i => !i.custom && (i.recipes || []).length && !i.qtyEdit && !shop[i.id]);
  let ask = null; for(let x = 0; x < cand.length && !ask; x++) for(let y = x + 1; y < cand.length && !ask; y++){ const A = cand[x], B = cand[y], kb = ikeys(B);
    if(ikeys(A).some(ka => kb.some(k2 => maybeSame(ka, k2)))){ const pk = [ikeys(A)[0], kb[0]].sort().join('|'); if(!apart.has(pk)) ask = {A, B, pk}; } }
  const pct = items.length ? Math.round(done / items.length * 100) : 0;
  const chipRecipes = recipes.filter(r => !(P().done || {})[r.id] && !isArch(r.id) && all.some(i => (i.recipes || []).includes(r.id)));
  const colOf = listColors(chipRecipes.map(r => r.id));
  const chips = chipRecipes.map(r => { const on = isActive(r.id), nm = esc(listName(D(r)));
    return `<span class="chipw"><button class="chip ${on ? 'on' : ''}" style="--c:${colOf(r.id)}" data-act="active" data-drag="1" data-id="${esc(r.id)}" aria-pressed="${on}" title="${on ? 'Tap to hide its ingredients' : 'Tap to show its ingredients'}"><i class="sw"></i>${nm}${sizeTag(r.id)}</button><button class="chipx" data-act="chiprm" data-id="${esc(r.id)}" aria-label="Remove ${nm} from your list" title="Remove from your list">${ICON_X}</button></span>`; }).join(' ');
  const Q = shopQ.trim().toLowerCase();
  const pool = Q ? all.filter(i => i.name.toLowerCase().includes(Q) && (items.includes(i) || shop[i.id])) : f === 'have' ? all : items;
  const keep = i => { const st = shop[i.id] || ''; return Q || f === 'all' || (f === 'need' && !st) || (f === 'cart' && st === 'bought') || (f === 'have' && st === 'have'); };
  const cnt = {all: items.length, need: items.filter(i => !shop[i.id]).length, cart: items.filter(i => shop[i.id] === 'bought').length, have: all.filter(i => shop[i.id] === 'have').length};
  const fbtn = (k, l) => `<button class="${f === k ? 'on' : ''}" aria-pressed="${f === k}" data-act="filter" data-f="${k}">${l} <span class="fc">${cnt[k]}</span></button>`;
  const order = [...new Set(kitchen.shopping.sections.concat(all.map(i => i.section || 'Other')))];
  let secs = '';
  order.forEach(sec => {
    let list = pool.filter(i => (i.section || 'Other') === sec); if(!list.length) return;
    const left = list.filter(i => !shop[i.id]).length;
    list = list.filter(keep);
    if(!list.length) return;
    const sub = Q ? list.length + (list.length === 1 ? ' match' : ' matches') : f === 'have' ? list.length + ' at home' : f === 'cart' ? list.length + ' in cart' : (left ? left + ' to get' : 'all set ✓');
    secs += `<div class="section" data-sec="${esc(sec)}"><h3>${esc(sec)} <small>${sub}</small><span class="secmv"><button class="grip" data-act="aisles" data-s="${esc(sec)}" aria-label="Reorder aisles" title="Reorder aisles"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg></button></span></h3><div class="card items">` + list.map(it => {
      const st = shop[it.id] || '';
      const tags = (it.custom ? `<span class="tag" style="--c:#6E6259">Added by you</span>` : '') + ((it.recipes || []).some(onListRid) ? it.recipes.filter(onListRid) : (it.recipes || [])).map(x => { const rr = R(x); return !rr ? '' : homeMode ? `<span class="tag" style="--c:${colOf(x)}">${esc(listName(D(rr)))}${sizeTag(x)}</span>` : `<button class="tag tago" style="--c:${colOf(x)}" data-act="go" data-h="r-${esc(x)}" aria-label="Open ${esc(D(rr).title)}">${esc(listName(D(rr)))}${sizeTag(x)}</button>`; }).join('');
      // (While checking off the pantry, each whole row is one button, so the tags there are plain labels: a button can't sit inside a button.)
      const info = `<div class="info"><div class="name">${Q ? esc(it.name).replace(new RegExp('(' + esc(Q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i'), '<mark>$1</mark>') : esc(it.name)}</div>${it.qty ? qtyLine(it) : ''}${homeMode ? '' : mathOf(it, colOf)}<div class="tags">${tags}</div></div>`;
      if(homeMode) return `<button class="item homerow ${st === 'have' ? 'have' : ''}" data-act="have" data-id="${esc(it.id)}" aria-pressed="${st === 'have'}"><span class="homeck">${ICON_HOME}</span>${info}<span class="homelbl">${st === 'have' ? 'At home' : ''}</span></button>`;
      const lead = st === 'have' ? `<button class="check homeon" data-act="have" data-id="${esc(it.id)}" aria-label="At home. Tap to put it back on your list" title="At home. Tap to put it back on your list">${ICON_HOME}</button>` : `<button class="check" data-act="bought" data-id="${esc(it.id)}" aria-label="In my cart">${CHECK}</button>`;
      return `<div class="item ${st}">${lead}
      ${info}
      <button class="edit" data-act="itemedit" data-id="${esc(it.id)}" aria-label="Edit ${esc(it.name)}">${ICON_EDIT}</button><button class="del" data-act="delitem" data-id="${esc(it.id)}" aria-label="Remove ${esc(it.name)}">${ICON_X}</button></div>`;
    }).join('') + `</div></div>`;
  });
  const secOpts = kitchen.shopping.sections;
  return `${installTip()}${shopBack && mealIds().length ? `<button class="back" data-act="go" data-h="meal">${ICON_BACK}Back to your meal</button>` : ''}${chipRecipes.length || items.length ? `<div class="card shop-head"><button class="copyic" data-act="copy" aria-label="Copy my list" title="Copy what I still need"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
    ${chipRecipes.length ? `<div class="lbl">Shopping for</div><div class="row">${chips}</div><div class="draghint">Tap recipe names to hide their ingredients from list.<br>Drag recipes to Past trips when done shopping for them.</div>` : ''}
    ${items.length ? `<div class="cartline"><button class="cl-cart ${f === 'cart' ? 'on' : ''}" data-act="filter" data-tg="1" data-f="cart" aria-pressed="${f === 'cart'}"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18"/><path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25"/><circle cx="18" cy="20" r="2"/><circle cx="8" cy="20" r="2"/></svg><span><b>${cnt.cart}</b> in your cart</span></button><button class="cl-need ${f === 'need' ? 'on' : ''}" data-act="filter" data-tg="1" data-f="need" aria-pressed="${f === 'need'}"><span><b>${cnt.need}</b> still needed</span></button>${cnt.have ? `<button class="cl-home ${f === 'have' ? 'on' : ''}" data-act="filter" data-tg="1" data-f="have" aria-pressed="${f === 'have'}" aria-label="Show the ${cnt.have} item${cnt.have === 1 ? '' : 's'} you have at home">${ICON_HOME}<span><b>${cnt.have}</b> at home</span></button>` : ''}</div>
    <div class="bar"><i style="width:${pct}%"></i></div>` : ''}
  </div>` : ''}
  ${all.length ? `<div class="shopsearch ${Q ? 'on' : ''}" role="search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg><input id="shopq" data-keep type="search" enterkeyhint="search" autocomplete="off" placeholder="Search your list" value="${esc(shopQ)}" aria-label="Search your list">${Q ? '<button class="sclear" data-act="sclear" aria-label="Clear search">' + ICON_X + '</button>' : ''}</div>` : ''}
  ${Q ? `<div class="qnote" aria-live="polite">${pool.length ? `${pool.length} match${pool.length === 1 ? '' : 'es'} across Need, In cart, and At home` : `Nothing on your list matches “${esc(shopQ.trim())}”`}</div>` : ''}
  ${!Q && !homeMode && (all.length || (P().trips || []).length) ? `<div class="seg" role="group" aria-label="Show">${fbtn('all','All')}${fbtn('need','Need')}${fbtn('cart','In cart')}${fbtn('have','At home')}</div>` : ''}
  ${homeMode ? `<div class="homebar" role="status"><div><b>What do you already have?</b><span>Tap anything that's already in your kitchen. It moves to At home, so you can skip it at the store.</span></div><button class="btn dark" data-act="homedone">Done</button></div>` : ''}
  ${Q || homeMode ? '' : ui.addOpen ? `<form class="card addcard addf" data-form="additem" autocomplete="off">
      <input id="addName" data-keep placeholder="Blueberries" aria-label="Item" maxlength="80" required>
      <input id="addQty" data-keep placeholder="Amount" aria-label="Amount (optional)" maxlength="60">
      <select id="addSec" data-keep aria-label="Section">${secOpts.map(s => `<option ${s === ui.sec ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select id="addFor" data-keep aria-label="Which recipe is it for?"><option value="">No recipe</option>${recipes.map(r => `<option value="${esc(r.id)}">For ${esc(D(r).short || D(r).title)}</option>`).join('')}</select>
      <button class="btn dark" type="submit">Add</button>
      <button class="btn" type="button" data-act="addclose">Done</button>
    </form>` : items.length || chipRecipes.length ? `<div class="addbtns"><button class="btn primary" data-act="pickopen">Add from recipe</button><button class="btn" data-act="addopen">Add an item</button>${SHOP_PHOTO_BTN}</div>` : ''}
  ${!items.length && !chipRecipes.length && !Q && f !== 'have' ? `<section class="shopstart"><h3>Your list is currently empty</h3><p class="muted">Add ingredients from your recipe(s) or add individual ingredients.</p>
    <ol><li><i>1</i><span>Add a recipe from your recipe box.</span></li><li><i>2</i><span>The recipe ingredients land here, sorted by aisle and added up across recipes.</span></li><li><i>3</i><span>Check things off as you shop.</span></li></ol>
    <button class="btn primary" data-act="pickopen">${ICON_BOOKADD}Add from recipe</button>${ui.addOpen ? '' : '<button class="btn" data-act="addopen">Add an item</button>'}${SHOP_PHOTO_BTN}</section>
    <p class="muted shophint">You can also tap <b>Shop for ingredients</b> while you are on any recipe page.</p>` : ''}
  ${!Q && !homeMode && items.length ? `<button class="homelink" data-act="homemode">${ICON_HOME}Check off pantry</button>` : ''}
  ${ask && !Q && !homeMode ? `<div class="mergeask" role="status"><p>Are these items the same? <b>${esc(ask.A.name)}</b> and <b>${esc(ask.B.name)}</b>.</p><div class="mergebtns"><button class="btn dark sm" data-act="mergeyes" data-a="${esc(ask.A.id)}" data-b="${esc(ask.B.id)}">Combine</button><button class="btn quiet sm" data-act="mergeno" data-p="${esc(ask.pk)}">Keep separate</button></div></div>` : ''}
  <div class="f-${f}">${allHome && f === 'all' && !Q && !homeMode ? '<div class="card empty">Everything on your list is at home.</div>' : ''}${secs || (Q || (!items.length && !chipRecipes.length && f !== 'have') ? '' : `<div class="card empty">${!items.length && f !== 'have' ? 'Every recipe above is hidden. Tap one to show its ingredients.' : f === 'have' ? 'Nothing marked “At home” yet.' : f === 'cart' ? 'Nothing in your cart yet.' : allHome ? 'Everything on your list is at home.' : "All set — time to cook! 🎉"}</div>`)}</div>
  ${!homeMode && (all.length || (P().trips || []).length) ? `${all.length && !Q ? `<section class="tripend"><h3>Back from the store?</h3><p class="muted">Tap <b>Finish</b> to move everything on your list to <b>Past trips</b> and start a fresh list.</p><div class="te-btns"><button class="btn dark" data-act="resetshop">Finish</button><button class="btn" data-act="go" data-h="trips">Past trips (${tripDays()})</button></div></section>` : ''}${all.length && !Q ? '' : `<div class="tf2-links"><button class="tf-link" data-act="go" data-h="trips">Past trips (${tripDays()})</button></div>`}` : ''}
  ${chipRecipes.length ? `<div id="tripDrop" class="dropzone" aria-hidden="true"><svg class="bi" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>Drop here to move to Past trips</div>` : ''}
  ${pickSheet ? renderPickSheet(all) : ''}${editItem ? renderEditItem() : ''}`;
}
// Editing a list item. If it came from one recipe, offer to make the same change in that recipe (recommended), so the list and recipe agree next time.
// Amount check (Nov 19): before a changed amount is saved, it's checked for things that look wrong, and you're asked before it's kept.
//  - it has numbers but doesn't read as an amount ("2 cupz", "1/0 cup")
//  - the amount in parentheses doesn't match the main amount ("2 cups (250g)" when the recipe says 1 cup is 200g, or "8 oz (100g)")
//  - it's 8 or more times bigger or smaller than before (a likely typo)
const AMT_VOL = {tsp:1, tbsp:3, cup:48, stick:24, floz:6, ml:0.202884, l:202.884, pint:96, quart:192, gallon:768};
const AMT_WT = {g:1, kg:1000, oz:28.3495, lb:453.592};
const AMT_UNIT = {c:'cup', cups:'cup', cup:'cup', tablespoon:'tbsp', tablespoons:'tbsp', tbsp:'tbsp', tbsps:'tbsp', tbs:'tbsp', tbl:'tbsp', teaspoon:'tsp', teaspoons:'tsp', tsp:'tsp', tsps:'tsp', stick:'stick', sticks:'stick', g:'g', gram:'g', grams:'g', kg:'kg', kilogram:'kg', kilograms:'kg', oz:'oz', ounce:'oz', ounces:'oz', lb:'lb', lbs:'lb', pound:'lb', pounds:'lb', ml:'ml', milliliter:'ml', milliliters:'ml', millilitre:'ml', millilitres:'ml', l:'l', liter:'l', liters:'l', litre:'l', litres:'l', pint:'pint', pints:'pint', quart:'quart', quarts:'quart', gallon:'gallon', gallons:'gallon'};
function amtParse(q){
  const F = {'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875,'⅙':1/6,'⅚':5/6};
  const numOf = a => { a = a.trim(); let y; if((y = a.match(/^(\d+)\s*([½¼¾⅓⅔⅛⅜⅝⅞⅙⅚])$/))) return +y[1] + F[y[2]]; if(F[a] != null) return F[a]; if((y = a.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +y[3] ? +y[1] + y[2] / y[3] : NaN; if((y = a.match(/^(\d+)\/(\d+)$/))) return +y[2] ? y[1] / y[2] : NaN; return +a; };
  const one = t => { t = String(t).trim().replace(/^(about|approx\.?|approximately|~)\s*/i, '');
    const x = t.match(/^(\d+\s*[½¼¾⅓⅔⅛⅜⅝⅞⅙⅚]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞⅙⅚])\s*(fl\.?\s*oz\.?|[A-Za-z]+\.?)?(.*)$/); if(!x) return null;
    const n = numOf(x[1]); let u = (x[2] || '').toLowerCase().replace(/\.$/, '').replace(/\s+/g, ''); u = /^fl\.?oz/.test(u) ? 'floz' : (AMT_UNIT[u] || '');
    return {n, u, word: x[2] || '', rest: x[3] || ''}; };
  const s0 = String(q || '').trim(), pm = s0.match(/^(.*?)\s*\(([^)]*)\)\s*(.*)$/);
  return {main: one(pm ? pm[1] + ' ' + pm[3] : s0), paren: pm ? one(pm[2]) : null, mainText: (pm ? pm[1] : s0).trim()};
}
const amtBase = a => a && a.u && AMT_VOL[a.u] ? {fam: 'v', v: a.n * AMT_VOL[a.u]} : a && a.u && AMT_WT[a.u] ? {fam: 'w', v: a.n * AMT_WT[a.u]} : null;
function amtRound(v, u){ const r = u === 'g' || u === 'ml' ? (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) : Math.round(v * 100) / 100; return r; }
function checkAmt(oldQ, newQ){
  const nq = String(newQ || '').trim(); if(!nq || nq === String(oldQ || '').trim() || !/\d/.test(nq)) return null;
  if(/\d\s*(-|–|to)\s*\d/.test(nq) || /\+/.test(nq)) return null;
  const sp = /\(\s*[\d.]+\s+[A-Za-z]/.test(nq) ? ' ' : '';
  const N = amtParse(nq);
  if(!N.main || !isFinite(N.main.n) || N.main.n <= 0) return {msg: `“${nq}” doesn't read as an amount. Start with a number, like 2 cups.`};
  if(N.main.word && !N.main.u && /^[a-z]{2,}$/i.test(N.main.word) && /^(cu|tb|ts|ta|te|gr|ou|po|li|mi|sti|pi|qu|ga)/i.test(N.main.word) && !/^(clove|can|pinch|dash|large|medium|small|whole|head|bunch|slice|piece|sprig|package|pkg|jar|bag|box|bottle|egg)/i.test(N.main.word)) return {msg: `“${N.main.word}” isn't a unit Butter Math knows. Did you mean cups, Tbsp, tsp, grams, or ounces?`};
  const mb = amtBase(N.main), pr = N.paren, pb = amtBase(pr);
  // parentheses and main amount are both weights, or both volumes: they must agree
  if(mb && pb && mb.fam === pb.fam){ const want = mb.v / (pb.fam === 'v' ? AMT_VOL[pr.u] : AMT_WT[pr.u]);
    if(Math.abs(want - pr.n) / want > 0.08){ const r = amtRound(want, pr.u); return {msg: `${N.mainText} is about ${r}${sp}${pr.word}, not ${pr.n}${sp}${pr.word}.`, fix: `${N.mainText} (${r}${sp}${pr.word})`}; } }
  const O = amtParse(oldQ), ob = /\+/.test(String(oldQ || '')) ? null : amtBase(O.main), opb = amtBase(O.paren);
  // the recipe's own conversion (1 cup = 200g) says what the new parentheses should be
  if(mb && pb && ob && opb && ob.fam === mb.fam && opb.fam === pb.fam && mb.fam !== pb.fam && ob.v){
    const per = opb.v / ob.v, want = mb.v * per / (pb.fam === 'v' ? AMT_VOL[pr.u] : AMT_WT[pr.u]);
    if(Math.abs(want - pr.n) / want > 0.08){ const r = amtRound(want, pr.u); return {msg: `The recipe has ${O.mainText} as ${O.paren.n}${sp}${O.paren.word}, so ${N.mainText} is about ${r}${sp}${pr.word}, not ${pr.n}${sp}${pr.word}.`, fix: `${N.mainText} (${r}${sp}${pr.word})`}; } }
  // a big jump is usually a typo
  if(mb && ob && mb.fam === ob.fam && ob.v){ const k = mb.v / ob.v;
    if(k >= 8 || k <= 1 / 8){ return {msg: k >= 8 ? `That's ${Math.round(k)} times more than before (${String(oldQ).trim()}). Check that it's right.` : `That's ${Math.round(1 / k)} times less than before (${String(oldQ).trim()}). Check that it's right.`}; } }
  return null;
}
// A recipe shown at another size: an amount changed on the list can't go back into the recipe as-is, so it's a list-only change.
const itemScaled = it => (it.recipes || []).some(x => R(x) && !near1(scaleOf(x), 1));
function itemRecipeLine(it){
  const rs = (it.recipes || []).filter(x => R(x)); if(it.custom || rs.length !== 1) return null;
  const r = R(rs[0]), key = it.key || splitIngredient(it.name).key;
  const hits = []; eachPart(D(r), (l, gi, li, pi) => { if(ihas(it, splitIngredient(l).key)) hits.push({gi, li, pi, l}); });
  return hits.length === 1 ? Object.assign({rid: rs[0]}, hits[0]) : null;
}
function rebuildLine(line, name, qty){
  const p = splitIngredient(line);
  const s = prettyFractions(String(line).trim()).replace(/^(\d+)\s+and\s+(\d+\/\d+|[½¼¾⅓⅔⅛⅜⅝⅞])/i, (m, w, f) => w + (/\d/.test(f) ? ' ' : '') + f).replace(/^(\d+)\s+and\s+(?:a\s+)?half\b/i, '$1½');
  if(p.qty && !s.startsWith(p.qty)) return null;
  let rest = p.qty ? s.slice(p.qty.length).trimStart() : s;
  if(name.toLowerCase() !== p.name.toLowerCase()){ const i = rest.toLowerCase().indexOf(p.name.toLowerCase()); if(i < 0) return null; rest = rest.slice(0, i) + name.charAt(0).toLowerCase() + name.slice(1) + rest.slice(i + p.name.length); }
  return ((qty ? qty + ' ' : '') + rest).trim();
}
// An item added up from 2+ recipes: each recipe's own line, so each amount can be edited on its own.
// Also used when one recipe lists the ingredient twice (say, butter in the crust and in the filling).
function itemRecipeParts(it){
  const rs = (it.recipes || []).filter(x => R(x)); if(it.custom || !rs.length) return null;
  const key = it.key || splitIngredient(it.name).key, parts = [];
  for(const rid of rs){ const hits = []; eachPart(D(R(rid)), (l, gi, li, pi) => { if(ihas(it, splitIngredient(l).key)) hits.push({rid, gi, li, pi, l}); });
    if(!hits.length) return null; hits.forEach((h, n) => { h.many = hits.length > 1; h.n = n + 1; }); parts.push(...hits); }
  return parts.length > 1 ? parts : null;
}
// "Blueberry Pie", or "Blueberry Pie · Crust" when that recipe lists it more than once
function partLabel(x){ const d = D(R(x.rid)), nm = d.short || d.title; if(!x.many) return nm; const g = ((d.ingredients || [])[x.gi] || {}).group; return nm + ' · ' + (g ? g : 'line ' + x.n); }
const joinNames = nm => nm.length < 3 ? nm.join(' and ') : nm.slice(0, -1).join(', ') + ', and ' + nm[nm.length - 1];
function renderEditItem(){
  const it = allItems().find(i => i.id === editItem.id); if(!it){ editItem = null; return ''; }
  const head = t => `<div class="sheetbg" data-act="itemeditclose"></div><div class="asksheet" role="dialog" aria-label="${t}"><div class="pickhead"><div class="askt">${t}</div><button class="ibtn" data-act="itemeditclose" aria-label="Close">${ICON_X}</button></div>`;
  if(editItem.step === 'warn'){ const w = editItem.warns, fx = w.filter(x => x.fix);
    return head('Check this amount') + w.map(x => `<p class="frp amtwarn">${x.label ? `<b>${esc(x.label)}:</b> ` : ''}${esc(x.msg)}</p>`).join('') +
      (fx.length ? `<button class="askopt main" data-act="amtfix"><b>Use ${fx.map(x => esc(x.fix)).join(', ')}</b><span>Recommended</span></button>` : '') +
      `<button class="askopt${fx.length ? '' : ' main'}" data-act="amtback"><b>Change the amount</b></button><button class="askopt" data-act="amtkeep"><b>Keep what I typed</b></button></div>`; }
  if(editItem.step === 'askmulti'){ const it0 = allItems().find(i => i.id === editItem.id), renamed = it0 && editItem.name !== it0.name, ch = editItem.parts.filter(x => x.nq !== x.oq), rids = [...new Set((renamed ? editItem.parts : ch).map(x => x.rid))], many = rids.length > 1, nm = joinNames(rids.map(x => `<b>${esc(D(R(x)).short || D(R(x)).title)}</b>`));
    return head(many ? 'Update the recipes too?' : 'Update the recipe too?') + `<p class="frp">${[...(renamed ? [`Name: <b>${esc(it0.name)}</b> → <b>${esc(editItem.name)}</b>`] : []), ...ch.map(x => `${esc(partLabel(x))}: <b>${esc(x.oq || 'no amount')}</b> → <b>${esc(x.nq || 'no amount')}</b>`)].join('<br>')}</p><p class="frp">Make the same change in ${nm}, so ${many ? 'they are' : 'it is'} right next time?</p>
    <button class="askopt main" data-act="itemsave" data-to="recipe"><b>${many ? 'Update the recipes too' : 'Update the recipe too'}</b><span>Recommended</span></button><button class="askopt" data-act="itemsave" data-to="list"><b>Just this list</b><span>${many ? 'The recipes stay' : 'The recipe stays'} as ${many ? 'they are' : 'it is'}</span></button></div>`; }
  if(editItem.step === 'ask'){ const r = R(editItem.rid);
    return head('Update the recipe too?') + (editItem.nameOnly ? `<p class="frp">Call it <b>${esc(editItem.name)}</b> in <b>${esc(D(r).title)}</b> too, so it's right next time? The recipe's amount stays as it is, because your list is at a different size.</p>` : `<p class="frp">Your list now says <b>${esc((editItem.qty ? editItem.qty + ' ' : '') + editItem.name.charAt(0).toLowerCase() + editItem.name.slice(1))}</b>. Make the same change in <b>${esc(D(r).title)}</b>, so it's right next time?</p>`) + `
    <button class="askopt main" data-act="itemsave" data-to="recipe"><b>Update the recipe too</b><span>Recommended</span></button><button class="askopt" data-act="itemsave" data-to="list"><b>Just this list</b><span>The recipe stays as it is</span></button></div>`; }
  const parts = itemScaled(it) ? null : itemRecipeParts(it);
  if(parts) return head('Edit item') + `<form class="editform" data-form="itemedit" autocomplete="off"><label class="lab" for="ed-name">Item</label><input class="tin" id="ed-name" data-keep maxlength="80" required value="${esc(editItem.draft ? editItem.draft.name : it.name)}"><p class="frhint">Your list adds this up from ${new Set(parts.map(x => x.rid)).size > 1 ? `${new Set(parts.map(x => x.rid)).size} recipes` : `${parts.length} lines in the recipe`}${it.qty ? ` (<b>${fmt(it.qty)}</b> in all)` : ''}. Change each amount:</p>${parts.map((x, i) => `<label class="lab" for="ed-q${i}">${esc(partLabel(x))}</label><input class="tin" id="ed-q${i}" data-keep maxlength="60" value="${esc(editItem.draft ? editItem.draft.qs[i] : partQ(it, x))}">`).join('')}<button class="btn primary bigbtn" type="submit">Save</button><a class="mreport" href="${reportHref(it)}">Report a wrong amount</a></form></div>`;
  const rs = (it.recipes || []).filter(x => R(x)), n = rs.length, names = joinNames(rs.map(x => esc(D(R(x)).short || D(R(x)).title)));
  return head('Edit item') + `<form class="editform" data-form="itemedit" autocomplete="off"><label class="lab" for="ed-name">Item</label><input class="tin" id="ed-name" data-keep maxlength="80" required value="${esc(editItem.draft ? editItem.draft.name : it.name)}"><label class="lab" for="ed-qty">Amount</label><input class="tin" id="ed-qty" data-keep maxlength="60" placeholder="2 cups" value="${esc(editItem.draft ? editItem.draft.qty : it.qty || '')}">${n > 1 ? `<p class="frhint">This amount is added up from ${n} recipes: ${names}. Your change only updates your shopping list. The recipes stay the same.</p>` : ''}<button class="btn primary bigbtn" type="submit">Save</button><a class="mreport" href="${reportHref(it)}">Report a wrong amount</a></form></div>`;
}
function saveItemList(id, name, qty, msg){
  mutate(k => { const x = k.shopping.items.find(i => i.id === id); if(!x) return; x.name = name; if(qty !== (x.qty || '')){ x.qty = qty; if((x.recipes || []).length) x.qtyEdit = true; } });
  editItem = null; render(); toast(msg || 'Updated your list');
}
// After the amount check: the same steps as before (offer to update the recipe, or save to the list).
// Any change to an item from a recipe, a new amount or a new name, asks whether to change the recipe too (Nov 20, 2026).
// If the recipe's line can't be matched, only the list changes, and the toast says so.
const NO_MATCH = "Updated your list. Couldn't match this to the recipe's wording, so the recipe stays the same.";
const partFix = (x, name, renamed) => rebuildLine(x.l, renamed ? name : splitIngredient(x.l).name, x.nq !== x.oq ? x.nq : splitIngredient(x.l).qty);
function itemEditGo(it, name, qty, ps){
  if(ps){ const ch = ps.filter(x => x.nq !== x.oq), renamed = name !== it.name, touch = renamed ? ps : ch;
    if(!touch.length){ editItem = null; render(); return; }
    if(touch.every(x => partFix(x, name, renamed))){ editItem = {id: it.id, step: 'askmulti', name, parts: ps}; render(); return; }
    editItem = {id: it.id, name, parts: ps}; saveItemParts(false, NO_MATCH); return; }
  if(name === it.name && qty === (it.qty || '')){ editItem = null; render(); return; }
  const scaled = itemScaled(it), renamed = name !== it.name;
  if(scaled && !renamed){ saveItemList(it.id, name, qty); return; }
  const hit = itemRecipeLine(it);
  if(hit && rebuildLine(hit.l, name, scaled ? splitIngredient(hit.l).qty : qty)){ editItem = {id: it.id, step: 'ask', name, qty, rid: hit.rid, nameOnly: scaled}; render(); return; }
  saveItemList(it.id, name, qty, (it.recipes || []).some(x => R(x)) && !it.custom ? NO_MATCH : null);
}
async function saveItemParts(toRecipes, msg){
  const {id, name, parts} = editItem, it = allItems().find(i => i.id === id); if(!it) return;
  const key = it.key || splitIngredient(it.name).key, ch = parts.filter(x => x.nq !== x.oq), renamed = name !== it.name;
  if(!toRecipes){ mutate(k => { const y = k.shopping.items.find(i => i.id === id); if(!y) return; y.name = name; const pq = y.pq = y.pq || {};
      parts.forEach(x => { if(x.nq === x.oq) return; const kk = pqKey(x.rid, x.gi, x.li, x.pi); if(x.nq === splitIngredient(x.l).qty) delete pq[kk]; else pq[kk] = {q: x.nq, base: x.l}; });
      delete y.qtyEdit; fixItem(y); });
    editItem = null; render(); toast(msg || 'Updated your list'); return; }
  const done = [];
  for(const x of (renamed ? parts : ch)){ const r = R(x.rid); if(!r) continue; const nl = partFix(x, name, renamed); if(!nl) continue;
    const data = JSON.parse(JSON.stringify(D(r))); data.ingredients[x.gi].items[x.li] = ingReplacePart(data.ingredients[x.gi].items[x.li], x.pi, nl);
    const {error} = await sb.from('recipes').update({data}).eq('id', x.rid); if(error){ toast("Couldn't update the recipe. Try again."); return; }
    r.data = data; const dn = D(r).short || D(r).title; if(!done.includes(dn)) done.push(dn); }
  mutate(k => { const y = k.shopping.items.find(i => i.id === id); if(!y) return; y.name = name; if(renamed) y.key = splitIngredient(name).key; delete y.qtyEdit; if(y.pq) ch.forEach(x => { delete y.pq[pqKey(x.rid, x.gi, x.li, x.pi)]; }); fixItem(y); });
  editItem = null; render(); toast(`Updated ${joinNames(done)} and your list`);
}
async function saveItemRecipe(id, name, qty, nameOnly){
  const it = allItems().find(i => i.id === id), hit = it && itemRecipeLine(it); if(!hit){ saveItemList(id, name, qty, NO_MATCH); return; }
  const nl = rebuildLine(hit.l, name, nameOnly ? splitIngredient(hit.l).qty : qty); if(!nl){ saveItemList(id, name, qty, NO_MATCH); return; }
  const r = R(hit.rid), data = JSON.parse(JSON.stringify(D(r))); data.ingredients[hit.gi].items[hit.li] = ingReplacePart(data.ingredients[hit.gi].items[hit.li], hit.pi, nl);
  const {error} = await sb.from('recipes').update({data}).eq('id', hit.rid); if(error){ toast("Couldn't update the recipe. Try again."); return; }
  r.data = data; const nk = splitIngredient(nl).key;
  mutate(k => { const x = k.shopping.items.find(i => i.id === id); if(!x) return; x.name = name; x.key = nk; if(nameOnly && qty !== (x.qty || '')){ x.qty = qty; x.qtyEdit = true; } else delete x.qtyEdit; fixItem(x); });
  editItem = null; render(); toast(`Updated ${D(r).short || D(r).title} and your list`);
}
const ICON_BOOKADD = '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="M9 10h6"/></svg>';
function renderPickSheet(all){
  // Recipes already on the list show as "Already on your list" (open the recipe itself to add more of it).
  const onList = id => P().active[id] === true && !(P().done || {})[id] && all.some(i => (i.recipes || []).includes(id));
  const list = recipes.filter(r => !isArch(r.id)).slice().sort((a, b) => (onList(a.id) - onList(b.id)) || String(D(a).title || '').localeCompare(String(D(b).title || '')));
  const n = Object.keys(pickSheet.sel).length;
  return `<div class="sheetbg" data-act="pickclose"></div><div class="asksheet picksheet" role="dialog" aria-label="Add from recipe">
    <div class="pickhead"><div class="askt">Add from recipe</div><button class="ibtn" data-act="pickclose" aria-label="Close">${ICON_X}</button></div>
    <p class="muted pickp">Select which recipe(s) you're cooking. All ingredients will be added to your shopping list.</p>
    ${list.length > 6 ? `<input id="pickq" class="tin" data-keep type="search" autocomplete="off" placeholder="Search your recipe box" aria-label="Search your recipe box">` : ''}
    <div class="picklist"><button class="pickrow picknew" data-act="picknew"><span class="pt"><b>+ Add a new recipe</b><small>From a link, pasted text, or screenshot</small></span><span class="pplus" aria-hidden="true">+</span></button>${list.length ? list.map(r => { const d = D(r), on = onList(r.id), sel = !!pickSheet.sel[r.id], cnt = ingLines(d).length;
      return `<button class="pickrow ${sel ? 'sel' : ''} ${on ? 'on' : ''}" data-act="picktog" data-id="${esc(r.id)}" data-s="${esc(String(d.title || '').toLowerCase())}" ${on ? 'disabled' : ''} aria-pressed="${sel}"><span class="pt"><b>${esc(d.title || 'Untitled recipe')}</b><small>${on ? 'Already on your list' : cnt + ' ingredient' + (cnt === 1 ? '' : 's')}</small></span><span class="pbox">${sel || on ? CHECK : ''}</span></button>`; }).join('') : `<div class="muted pickempty">No recipes yet. Add one above and its ingredients go straight to your list.</div>`}</div>
    ${list.length ? `<button class="btn primary pickgo" data-act="pickgo" ${n ? '' : 'disabled'}>${n ? `Add ingredients from ${n} recipe${n === 1 ? '' : 's'}` : 'Pick a recipe'}</button>` : `<button class="btn primary pickgo" data-act="picknew">Add a new recipe</button>`}
  </div>`;
}

/* ---------------- Cook a Meal (beta) ---------------- */
// Pick a few recipes, see when to start each one so they finish together, follow every recipe side by side, and shop for all of it at once.
// Start times come only from the time each recipe lists. Nothing is guessed: a recipe with no usable time says so.
let mealPick = null, mealShop = null, mealBack = null, mealTick = null, shopBack = false;
const MEAL_MAX = 5;
const ICON_MEAL = '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h20"/><path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="m4 8 16-4"/><path d="m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8"/></svg>';
const FRAC = {'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3};
function durMin(s){
  s = String(s || '').toLowerCase().replace(/\band\b/g, ' ').trim(); if(!s || /overnight/.test(s)) return null;
  const iso = s.match(/^pt(?:(\d+)h)?(?:(\d+)m)?$/); if(iso){ const v = (+iso[1] || 0) * 60 + (+iso[2] || 0); return v || null; }
  const rx = /(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+)|\s*([½¼¾⅓⅔]))?(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(days?|d\b|hours?|hrs?|hr\b|h\b|minutes?|mins?|min\b|m\b)/g;
  let t = 0, hit = false, m;
  while((m = rx.exec(s))){ let v = m[5] ? +m[5] : +m[1]; if(m[2]) v += +m[2] / +m[3]; if(m[4]) v += FRAC[m[4]];
    const u = m[6]; t += /^d/.test(u) ? v * 1440 : /^h/.test(u) ? v * 60 : v; hit = true; }
  return hit && t > 0 ? Math.round(t) : null;
}
// Total time if the recipe lists one, otherwise prep + cook when both are listed.
function mealTime(d){ const t = durMin(d.total); if(t) return {min: t, from: 'total'}; const p = durMin(d.prep), c = durMin(d.cook); if(p && c) return {min: p + c, from: 'prep + cook'}; return null; }
function fmtDur(n){ const d = Math.floor(n / 1440), h = Math.floor(n % 1440 / 60), m = n % 60; return [d ? d + ' day' + (d > 1 ? 's' : '') : '', h ? h + ' hr' : '', m ? m + ' min' : ''].filter(Boolean).join(' '); }
function clock(eat, before){ const [h, m] = String(eat || '18:00').split(':').map(Number); const t = h * 60 + m - before; const day = Math.floor(t / 1440), x = ((t % 1440) + 1440) % 1440;
  const hh = Math.floor(x / 60), mm = x % 60; const s = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
  return day === 0 ? s : day === -1 ? s + ' the day before' : s + ` ${-day} days before`; }
// Minutes from now until a recipe should start, using this device's own clock (so it's always your local time).
function minsUntil(eat, before){ const [h, m] = String(eat || '18:00').split(':').map(Number); const d = new Date(); const now = d.getHours() * 60 + d.getMinutes(); return h * 60 + m - before - now; }
// Read a typed time like "6", "6:30", "6:30 pm" or "18:30". With no AM/PM, it keeps the AM/PM you already had.
function parseClock(s, cur){ const m = String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/\./g, '').match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/); if(!m) return null;
  let h = +m[1]; const mi = +(m[2] || 0); if(mi > 59) return null; const ap = m[3];
  if(ap){ if(h < 1 || h > 12) return null; if(ap[0] === 'p' && h < 12) h += 12; if(ap[0] === 'a' && h === 12) h = 0; }
  else if(h > 23) return null; else if(h >= 1 && h <= 12){ const pm = +String(cur || '18:00').split(':')[0] >= 12; if(h === 12) h = pm ? 12 : 0; else if(pm) h += 12; }
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0'); }
const mealIds = () => ((P().meal || {}).ids || []).filter(x => R(x) && !isArch(x));
const mealOff = id => !!(((P().meal || {}).off) || {})[id];
const mealOn = () => mealIds().filter(x => !mealOff(x));
const mname = r => esc(D(r).short || D(r).title || 'Recipe');
// Every ingredient across the meal, one row per item, amounts added up the same way the shopping list adds them.
function mealIngs(ids){
  const map = new Map();
  ids.forEach(id => ingLines(D(R(id))).forEach(l => { const p = splitIngredient(l); if(!p.key) return;
    let e = map.get(p.key); if(!e){ const it = allItems().find(i => ihas(i, p.key)); e = {key: p.key, name: p.name, qty: '', rids: [], section: it ? (it.section || 'Other') : guessSection(p.name)}; map.set(p.key, e); }
    if(p.qty) e.qty = addQty(e.qty, p.qty, {key: p.key}); if(!e.rids.includes(id)) e.rids.push(id); }));
  return [...map.values()];
}
const mealOnList = e => allItems().some(i => ihas(i, e.key) && e.rids.every(x => (i.recipes || []).includes(x) && onListRid(x)) && !P().shop[i.id]);
const MEAL_P = "Select which recipes you are making. We'll let you know when to start each one so everything's ready at the same time.";
function renderMealPick(){
  const list = recipes.filter(r => !isArch(r.id)).slice().sort((a, b) => String(D(a).title || '').localeCompare(String(D(b).title || '')));
  const n = Object.keys(mealPick.sel).length;
  return `<div class="sheetbg" data-act="mealpickclose"></div><div class="asksheet picksheet mealpick" role="dialog" aria-label="Cook a Meal">
    <div class="pickhead"><div class="askt">Cook a Meal</div><button class="ibtn" data-act="mealpickclose" aria-label="Close">${ICON_X}</button></div>
    <p class="muted pickp">${MEAL_P} Pick up to ${MEAL_MAX}.</p>
    ${list.length > 6 ? `<input id="mealq" class="tin" data-keep type="search" autocomplete="off" placeholder="Search your recipe box" aria-label="Search your recipe box">` : ''}
    <div class="picklist">${list.map(r => { const d = D(r), sel = !!mealPick.sel[r.id], t = mealTime(d);
      return `<button class="pickrow ${sel ? 'sel' : ''}" data-act="mealtog" data-id="${esc(r.id)}" data-s="${esc(String(d.title || '').toLowerCase())}" aria-pressed="${sel}"><span class="pt"><b>${esc(d.title || 'Untitled recipe')}</b><small>${t ? fmtDur(t.min) : 'No time listed'}</small></span><span class="pbox">${sel ? CHECK : ''}</span></button>`; }).join('')}</div>
    <button class="btn primary pickgo mealgo" data-act="mealgo" ${n >= 2 ? '' : 'disabled'}>${mealGoText(n)}</button>
  </div>`;
}
const mealGoText = n => n >= 2 ? `Start cooking (${n})` : n === 1 ? 'Pick one more recipe' : 'Pick 2 or more recipes';
// Where each recipe stands right now: waiting for its start time, on a step, or finished.
function laneState(r, eat){
  const p = progressOf(r), t = mealTime(D(r));
  if(!p.total) return {kind: 'none', p, t, text: 'No steps listed'};
  if(p.done === p.total) return {kind: 'done', p, t, text: 'All steps done ✓'};
  if(t && p.done === 0 && !(((P().meal || {}).now) || {})[r.id]){ const w = minsUntil(eat, t.min); if(w > 0) return {kind: 'wait', p, t, text: `Suggested start ${clock(eat, t.min)}`, w}; }
  return {kind: 'now', p, t, text: `Step ${p.cur + 1} of ${p.total}`};
}
function renderMeal(){
  const all = mealIds(), ids = mealOn(), back = `${backBtn()}`;
  if(!all.length) return back + `<div class="card empty mealempty"><h3>Cook a Meal</h3><p class="muted">${MEAL_P}</p><button class="btn primary" data-act="mealopen">${ICON_MEAL}Select recipes</button></div>`;
  const m = P().meal || {}, eat = m.eat || '18:00';
  // Everything is listed in the order you'd start it: longest recipe first, recipes with no listed time last.
  const byStart = list => list.map(R).map((r, i) => ({r, i, t: mealTime(D(r))})).sort((a, b) => (b.t ? b.t.min : -1) - (a.t ? a.t.min : -1) || a.i - b.i).map(x => x.r);
  const rs = byStart(ids), allR = byStart(all);
  const timed = rs.map(r => ({r, t: mealTime(D(r))})), known = timed.filter(x => x.t).sort((a, b) => b.t.min - a.t.min), unknown = timed.filter(x => !x.t);
  const longest = known.length ? known[0].t.min : 0;
  const ings = mealIngs(ids), have = ings.filter(mealOnList).length, allOn = ings.length && have === ings.length;
  const pills = allR.map(r => { const off = mealOff(r.id); return `<span class="mchip ${off ? 'off' : ''}"><button class="mchn" data-act="mealoff" data-id="${esc(r.id)}" aria-pressed="${!off}" title="${off ? 'Show in this meal again' : 'Hide from this meal'}">${mname(r)}</button><button class="mchx" data-act="mealrm" data-id="${esc(r.id)}" aria-label="Remove ${mname(r)} from this meal" title="Remove from this meal">${ICON_X}</button></span>`; }).join('') + (all.length < MEAL_MAX ? `<button class="mchip add" data-act="mealopen">+ Add recipe</button>` : '');
  const shopCard = (m.hideShop && !allOn) || !ids.length ? '' : `<div class="mshop"><span class="mshopi" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18"/><path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25"/><circle cx="18" cy="20" r="2"/><circle cx="8" cy="20" r="2"/></svg></span>
    <button class="mshopb" data-act="${allOn ? 'mealtolist' : 'mealshop'}"><b>${allOn ? 'All on your shopping list ✓' : 'Shop for ingredients'}</b><span>${allOn ? 'Go to your shopping list' : `${ings.length} ingredient${ings.length === 1 ? '' : 's'} from ${ids.length} recipe${ids.length === 1 ? '' : 's'}${have ? ` · ${have} already on your list` : ''}`}</span></button>
    ${have ? `<button class="mshopgo" data-act="mealtolist" aria-label="Go to shopping list" title="Go to shopping list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button>` : ''}
    ${allOn ? '' : `<button class="mshopx" data-act="mealshophide" aria-label="Close" title="Close">${ICON_X}</button>`}</div>`;
  const rows = known.map(({r, t}) => `<li><span class="mt">${clock(eat, t.min)}</span><div class="mtcard"><span><b>Start ${esc(D(r).title)}</b><small>${fmtDur(t.min)} ${t.from === 'total' ? 'total' : '(prep + cook)'}</small></span></div></li>`).join('');
  const timeline = known.length ? `<h3 class="mh">When to start</h3><ol class="mline">${rows}<li><span class="mt">${clock(eat, 0)}</span><div class="mtcard ready"><span><b>Ready to eat</b><small>${known.length === rs.length ? 'Everything finishes together' : 'The timed recipes finish together'}</small></span></div></li></ol>` : '';
  const unk = unknown.length ? `<div class="mnote">${unknown.map(({r}) => `<b>${esc(D(r).title)}</b>`).join(', ')} ${unknown.length === 1 ? "doesn't" : "don't"} list a total time, so ${unknown.length === 1 ? "it isn't" : "they aren't"} on the timeline. <button class="linkbtn" data-act="mealrec" data-id="${esc(unknown[0].r.id)}" data-edit="1">Add a time</button></div>` : '';
  const st = rs.map(r => laneState(r, eat));
  const nowRows = rs.map((r, i) => { const s = st[i], cur = s.kind === 'now' ? s.p.all[s.p.cur].st : null;
    return `<button class="mnowr ${s.kind}" data-act="mealjump" data-i="${i}"><span class="mnn"><b>${mname(r)}</b><small>${s.text}</small></span>${cur ? `<span class="mnt">${fmt(cur.title || cur.text)}</span>` : s.kind === 'wait' && s.p.all[0] ? `<span class="mnt">Up next: ${fmt(s.p.all[0].st.title || s.p.all[0].st.text)}</span>` : ''}</button>`; }).join('');
  const maxOff = Math.max(0, ...rs.map((r, i) => st[i].kind === 'wait' && st[i].t ? longest - st[i].t.min : 0)), scale = maxOff ? Math.min(2, 360 / maxOff) : 0;
  const lanes = rs.map((r, i) => { const d = D(r), c = cookOf(r.id), s = st[i]; let n = 0;
    const off = s.kind === 'wait' && s.t ? longest - s.t.min : 0;
    const wait = off > 0 ? `<div class="mwait" style="height:${Math.max(104, Math.round(off * scale))}px"><b>Don't start yet</b><small>Suggested start ${clock(eat, s.t.min)}, ${fmtDur(off)} after ${mname(rs[0])}</small><button class="btn mstart" data-act="mealnow" data-id="${esc(r.id)}">Start now</button></div>` : '';
    const list = (d.steps || []).map((sec, si) => (sec.section ? `<div class="stephead">${esc(sec.section)}</div>` : '') + (sec.items || []).map((x, k) => { const key = si + '-' + k; n++; const done = !!c.s[key];
      const tm = (x.timers || []).map(t => `<span class="tchip" data-act="timer" data-min="${+t.min}" data-label="${esc(t.label)}">${ICON_TIMER}${esc(t.label)}</span>`).join('');
      return `<button class="step ${done ? 'done' : ''} ${s.kind === 'now' && s.p.all[s.p.cur].key === key ? 'cur' : ''}" data-act="step" data-id="${esc(r.id)}" data-k="${key}"><span class="num">${done ? CHECK : n}</span><span class="tx">${x.title ? `<div class="tt">${esc(x.title)}</div>` : ''}<p>${fmtStep(d, key, x.text)}</p>${tm ? `<div class="tchips">${tm}</div>` : ''}</span></button>`; }).join('')).join('');
    return `<section class="mlane ${s.kind}" id="lane-${i}"><div class="mlh"><b>${esc(d.title)}</b><small>${s.text}</small></div>${wait}
      <div class="mlb">${list || '<div class="muted">No steps listed.</div>'}</div><button class="linkbtn mopen" data-act="mealrec" data-id="${esc(r.id)}">Open the full recipe →</button></section>`; }).join('');
  const untimed = rs.filter(r => stepList(D(r)).some(x => !(x.st.timers || []).length));
  const andList = a => a.length < 3 ? a.join(' and ') : a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
  const stepNote = untimed.length && rs.length > 1 ? `<p class="mfine mstepnote">This is a suggested plan. The recipes line up by start time, not step by step, because ${andList(untimed.map(mname))} ${untimed.length === 1 ? "doesn't" : "don't"} say how long each step takes.</p>` : '';
  const tabs = rs.length > 1 ? `<div class="mtabs" role="tablist">${rs.map((r, i) => `<button role="tab" class="${i === 0 ? 'on' : ''}" data-act="mealjump" data-i="${i}">${mname(r)}</button>`).join('')}</div>` : '';
  return back + `<div class="mealpg"><h2 class="mtitle">Cook a Meal</h2><div class="msub">${ids.length} recipe${ids.length === 1 ? '' : 's'}${longest ? ` · start at ${clock(eat, longest)} · about ${fmtDur(longest)}` : ''}</div>
    <div class="mpl">Tap a recipe to hide it from the meal. Tap ✕ to remove it.</div><div class="mchips">${pills}</div>${shopCard}
    ${ids.length ? `<div class="meat"><label for="mealeatx">We're eating at</label><input id="mealeatx" type="text" inputmode="text" autocomplete="off" value="${clock(eat, 0)}" aria-label="Time you're eating, like 6:30 PM"></div>
    ${timeline}${unk}${known.length ? `<p class="mfine">Start times are suggestions, so you can start any recipe whenever you like. They use each recipe's listed time and your phone's clock. Read through the steps for anything that needs to chill, rise, or marinate ahead.</p>` : ''}
    <h3 class="mh">Right now</h3><div class="mnow">${nowRows}</div>
    <h3 class="mh">Steps</h3>${stepNote}${tabs}<div class="mlanes" id="mlanes" style="--n:${rs.length}">${lanes}</div>` : `<div class="card empty">Every recipe is left out. Tap one above to add it back.</div>`}
    <button class="linkbtn mclear" data-act="mealclear">Clear this meal</button></div>
    ${mealShop ? renderMealShop(ids, ings) : ''}`;
}
function renderMealShop(ids, ings){
  const all = mealShop.mode === 'all', order = aisleOrder(), secs = [...new Set(ings.map(e => e.section))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const picked = all ? ings.filter(e => !mealOnList(e)) : ings.filter(e => mealShop.sel[e.key]);
  const rowsOf = s => ings.filter(e => e.section === s).map(e => { const on = mealOnList(e), ck = all ? !on : !!mealShop.sel[e.key];
    return `<label class="mrow2 ${on ? 'have' : ''}">${all ? `<i class="mck ${ck ? 'on' : ''}" aria-hidden="true">${ck ? CHECK : ''}</i>` : `<input type="checkbox" class="mealck" data-k="${esc(e.key)}" ${ck ? 'checked' : ''}>`}<span class="mn"><b>${esc(e.name)}</b><small>${e.qty ? fmt(e.qty) : 'Amount not listed'}${on ? ' · already on your list' : ''}</small><small class="mfor">${e.rids.map(x => mname(R(x))).join(', ')}</small></span></label>`; }).join('');
  return `<div class="sheetbg" data-act="mealshopclose"></div><div class="asksheet picksheet mealshop" role="dialog" aria-label="Shop for ingredients">
    <div class="pickhead"><div class="askt">Shop for ingredients</div><button class="ibtn" data-act="mealshopclose" aria-label="Close">${ICON_X}</button></div>
    <p class="muted pickp">Shared ingredients are added up across recipes.</p>
    <div class="mseg" role="radiogroup" aria-label="What to add"><button role="radio" aria-checked="${all}" class="${all ? 'on' : ''}" data-act="mealmode" data-m="all">Get all ingredients</button><button role="radio" aria-checked="${!all}" class="${all ? '' : 'on'}" data-act="mealmode" data-m="sel">Select ingredients</button></div>
    <div class="mlist">${secs.map(s => `<div class="msec">${esc(s)}</div>${rowsOf(s)}`).join('')}</div>
    <button class="btn primary pickgo" data-act="mealadd" ${picked.length ? '' : 'disabled'}>${picked.length ? `Add ${picked.length} to my shopping list` : all ? 'Everything is on your list' : 'Pick ingredients to add'}</button>
  </div>`;
}
function mealScrollTab(){ const ml = $('#mlanes'); if(!ml) return; const lanes = [...ml.querySelectorAll('.mlane')]; let best = 0, bd = 1e9; lanes.forEach((l, i) => { const d = Math.abs(l.offsetLeft - ml.offsetLeft - ml.scrollLeft); if(d < bd){ bd = d; best = i; } }); document.querySelectorAll('.mtabs button').forEach((b, i) => b.classList.toggle('on', i === best)); }
document.addEventListener('scroll', e => { if(e.target && e.target.id === 'mlanes') mealScrollTab(); }, true);

/* ---- tags, favorites, sorting (stored per person in kitchen.progress) ---- */
const TAGS0 = ['Appetizers','Dips','Breakfast','Mains','Sides','Soups','Salads','Pasta','Pizza','Breads','Desserts','Beverages','Vegetarian','Chicken','Beef','Pork'];
const TAGRX = [['Desserts',/\b(pie|cakes?|cookies?|brownies?|frosting|tarts?|pudding|cheesecake|cupcakes?|fudge|crisp|cobbler|ice cream|cake pops?|truffles?|bars)\b/],['Pizza',/pizza/],['Pasta',/pasta|lasagna|spaghetti|noodle|mac and|penne|ravioli|linguine|fettuccine/],['Soups',/soup|stew|chili|chowder|bisque/],['Salads',/salad/],['Breads',/bread|rolls?\b|biscuit|focaccia|bagel/],['Breakfast',/pancake|waffle|oatmeal|granola|muffin|frittata|omelet|french toast/],['Appetizers',/bites|crostini|wings|appetizer|sliders/],['Dips',/\bdip\b|salsa|hummus|guac/],['Beverages',/drink|cocktail|smoothie|lemonade|latte|punch|cider/],['Sides',/casserole|roasted|mashed|slaw|stuffing/],['Chicken',/chicken/],['Beef',/beef|steak|brisket|meatball/],['Pork',/pork|bacon|\bham\b|sausage|carnitas/]];
const MEAT = /chicken|beef|pork|bacon|sausage|\bham\b|turkey|fish|shrimp|salmon|tuna|steak|brisket|prosciutto|pepperoni|anchov|gelatin/;
function autoTags(d){
  const t = (d.title || '').toLowerCase(), ing = (d.ingredients || []).flatMap(g => g.items || []).join(' ').toLowerCase();
  let out = TAGRX.filter(([, rx]) => rx.test(t)).map(([k]) => k);
  if(out.includes('Sides') && out.some(x => ['Pasta','Pizza','Soups','Desserts','Salads','Breakfast'].includes(x))) out = out.filter(x => x !== 'Sides');
  ['Chicken','Beef','Pork'].forEach((k, i) => { if(!out.includes(k) && [/chicken/, /beef|steak|brisket/, /pork|bacon|\bham\b|sausage/][i].test(ing) && !out.includes('Desserts')) out.push(k); });
  if(!MEAT.test(ing + ' ' + t)) out.push('Vegetarian');
  else if(!out.includes('Desserts') && !out.some(x => ['Soups','Salads','Pizza','Pasta','Appetizers','Sides','Breakfast'].includes(x))) out.push('Mains');
  return [...new Set(out)];
}
const tagsOf = r => ((P().tags || {})[r.id]) || autoTags(D(r));
const favOf = id => !!((P().fav || {})[id]);
const allTags = () => { const used = recipes.flatMap(r => tagsOf(r)); return [...new Set(TAGS0.concat(P().ctags || [], used))]; };
let recTags = [], recFav = false, recQ = '', catOpen = false, sortOpen = false, tagEdit = null;
// Just added: newest recipe first. Recently viewed: the recipe opened most recently first; ones never opened follow, newest first.
const SORTS = {recent:'Just added', viewed:'Recently viewed', az:'A–Z', made:'Most made', progress:'In progress'};
const viewedAt = id => ((P().viewed || {})[id]) || 0;
// Remember when a recipe was last opened (kept with this person's other settings). Saved at most every 10 minutes per recipe.
function noteView(id){ if(!user || !R(id) || Date.now() - viewedAt(id) < 600000) return; setTimeout(() => mutate(k => { const v = k.progress.viewed = k.progress.viewed || {}; v[id] = Date.now();
  const ids = new Set(recipes.map(x => x.id)); Object.keys(v).forEach(x => { if(!ids.has(x)) delete v[x]; }); }, true)); }
const ICON_SERV = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>';
const ICON_TIME = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
const ICON_AGAIN = '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>';
const ICON_EXT = '<svg class="ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
// When the last step is checked, a butter pat drops into the bowl (under a second), once.
let finDrop = null;
function finCard(r){ const drop = finDrop && finDrop.id === r.id && Date.now() - finDrop.t < 1400 ? `<div class="findrop" aria-hidden="true">${POT_ART.replace('class="pot"', 'class="finpot"').replace(/\n\s*<g class="drops">.*<\/g>(?=\n)/, '').replace('</svg>', '<g class="fpat"><rect x="67" y="-30" width="26" height="16" rx="3" fill="#F7D774" stroke="#141414" stroke-width="3"/><rect x="69" y="-28" width="22" height="5" rx="2" fill="#FFF1B8"/></g></svg>')}</div>` : '';
  return `<div class="finwrap">${drop}<button class="btn dark again" data-act="again" data-id="${esc(r.id)}">${ICON_AGAIN}Make it again</button></div>`; }
const ICON_HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></svg>';
const ICON_SORT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>';
const ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const ICON_X = '<svg class="xi" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
const ICON_BACK = '<svg class="xi back-i" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>';
const ICON_HOME = '<svg class="xi" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const ICON_EDIT = '<svg class="xi" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';
const ICON_TIMER = '<svg class="xi" viewBox="0 0 24 24" aria-hidden="true"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>';
function renderRecipes(){
  const addTile = `<button class="tile addtile" data-act="go" data-h="add"><span class="plus">+</span><span class="body"><h2>Add a recipe</h2><span class="meta">From a link or paste</span></span></button>`;
  const starters = !recipes.length ? `<div class="card panel" style="margin-bottom:16px"><h3>Start with a favorite?</h3><p class="muted" style="margin:4px 0 12px">Add our Blueberry Pie to try things out. Remove it anytime.</p><button class="btn primary" data-act="starters">Add Blueberry Pie</button></div>` : '';
  const live = recipes.filter(r => !isArch(r.id)), arch = recipes.filter(r => isArch(r.id));
  const search = recipes.length > 1 ? `<div class="rsearch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg><input id="rsearch" type="search" placeholder="Search recipes" aria-label="Search recipes" autocomplete="off" value="${esc(recQ)}"></div>` : '';
  const archBox = arch.length ? `<details class="card archbox" id="archbox"><summary>Archived <span class="fc">${arch.length}</span><span class="chev">▾</span></summary>${arch.map(r => `<div class="arow" data-q="${esc((D(r).title + ' ' + (D(r).short || '')).toLowerCase())}"><button class="aname" data-act="go" data-h="r-${esc(r.id)}">${esc(D(r).title)}</button><button class="btn" data-act="unarch" data-id="${esc(r.id)}">Unarchive</button></div>`).join('')}</details>` : '';
  const sortK = SORTS[ui.rsort] ? ui.rsort : 'recent';
  const counts = {}; live.forEach(r => tagsOf(r).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const cats = allTags().filter(t => counts[t]).sort((x, y) => x.localeCompare(y));
  recTags = recTags.filter(t => counts[t]);
  const nFav = live.filter(r => favOf(r.id)).length; if(!nFav) recFav = false;
  const catOn = recTags.length > 0;
  const hasAll = (r, list) => { const tg = tagsOf(r); return list.every(t => tg.includes(t)); };
  const catLabel = recTags.length > 2 ? `${esc(recTags[0])} + ${recTags.length - 1} more` : recTags.map(esc).join(' + ');
  const fbar = live.length > 1 ? `<div class="fbar2"><div class="fwrap"><button class="fpill ${catOn ? 'act' : ''}" data-act="catmenu" aria-haspopup="true" aria-expanded="${catOpen}">Category${catOn ? `<span class="fcount">${recTags.length}</span>` : ''}${ICON_CHEV}</button>
    ${catOpen ? `<div class="fmenu" role="group" aria-label="Categories"><button class="fall ${!catOn ? 'on' : ''}" data-act="catclear">All categories <span>${live.length}</span></button>${cats.map(t => { const on = recTags.includes(t); const n = on ? live.filter(r => hasAll(r, recTags)).length : live.filter(r => hasAll(r, recTags.concat(t))).length; return `<button class="fck ${on ? 'on' : ''} ${!on && !n ? 'dim' : ''}" data-act="catpick" data-t="${esc(t)}" role="checkbox" aria-checked="${on}"><i class="cb">${on ? CHECK : ''}</i><b>${esc(t)}</b><span>${on ? '' : n}</span></button>`; }).join('')}</div>` : ''}</div>
    ${nFav ? `<button class="fpill favp ${recFav ? 'on' : ''}" data-act="favfilter" aria-pressed="${recFav}">${ICON_HEART}Favorites</button>` : ''}
    <div class="fwrap fright"><button class="fpill sortp" data-act="sortmenu" aria-haspopup="menu" aria-expanded="${sortOpen}" aria-label="Sort: ${SORTS[sortK]}">${ICON_SORT}${SORTS[sortK]}</button>
    ${sortOpen ? `<div class="fmenu right" role="menu">${Object.entries(SORTS).map(([k, l]) => `<button role="menuitem" class="${k === sortK ? 'on' : ''}" data-act="sortpick" data-k="${k}">${l}${k === sortK ? '<span>✓</span>' : ''}</button>`).join('')}</div>` : ''}</div></div>` : '';
  const rank = r => { const p = progressOf(r); return p.done > 0 && p.done < p.total ? 0 : p.done === 0 ? 1 : 2; };
  let shown = live.filter(r => (!catOn || hasAll(r, recTags)) && (!recFav || favOf(r.id)) && (sortK !== 'progress' || rank(r) === 0));
  const pos = new Map(live.map((r, i) => [r.id, i]));
  // Favorites keep their place in the list (Hayley, Nov 18). The Favorites filter is how to find them.
  shown = shown.slice().sort((a, b) => sortK === 'recent' ? pos.get(b.id) - pos.get(a.id) : sortK === 'viewed' ? (viewedAt(b.id) - viewedAt(a.id)) || pos.get(b.id) - pos.get(a.id) : (sortK === 'az' ? D(a).title.localeCompare(D(b).title) : sortK === 'made' ? (madeOf(b.id).n || 0) - (madeOf(a.id).n || 0) : sortK === 'progress' ? rank(a) - rank(b) : 0) || pos.get(a.id) - pos.get(b.id));
  const q = recQ.trim().toLowerCase();
  const filtered = catOn || recFav || sortK === 'progress';
  const fnote = catOn ? `<div class="selchips">${recTags.map(t => `<span class="selchip">${esc(t)}<button data-act="catpick" data-t="${esc(t)}" aria-label="Remove ${esc(t)} filter">${ICON_X}</button></span>`).join('')}${recTags.length > 1 ? `<button class="clearall" data-act="catclear">Clear all</button>` : ''}</div>${recTags.length > 1 ? `<div class="fnote">Showing recipes with ${recTags.length === 2 ? 'both' : 'all ' + recTags.length} tags</div>` : ''}` : '';
  return installTip() + starters + search + fbar + fnote + `<div class="grid" id="rgrid">` + (filtered ? '' : q ? addTile.replace('<button class="tile addtile"', '<button hidden class="tile addtile"') : addTile) + shown.map(r => {
    const d = D(r), p = progressOf(r), pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    const st = p.done === 0 ? 'Not started' : p.done === p.total ? 'Finished ✓' : `Step ${p.cur + 1} of ${p.total}`;
    const tq = (d.title + ' ' + (d.short || '') + ' ' + tagsOf(r).join(' ')).toLowerCase(), tt = tagsOf(r).slice(0, 3);
    return `<div class="tile" ${q && !tq.includes(q) ? 'hidden' : ''} role="link" tabindex="0" style="--c:${esc(d.color)}" data-act="go" data-h="r-${esc(r.id)}" data-q="${esc(tq)}">
      <span class="art">${pic(d)}</span><button class="tilefav ${favOf(r.id) ? 'on' : ''}" data-act="fav" data-id="${esc(r.id)}" aria-pressed="${favOf(r.id)}" aria-label="${favOf(r.id) ? 'Remove from favorites' : 'Add to favorites'}" title="${favOf(r.id) ? 'Favorite' : 'Add to favorites'}">${ICON_HEART}</button><button class="tilex" data-act="recipex" data-id="${esc(r.id)}" aria-label="Archive or delete ${esc(d.title)}" title="Archive or delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
      <span class="body">${tt.length ? `<span class="ttags">${tt.map(t => `<i>${esc(t)}</i>`).join('')}</span>` : ''}<h2>${esc(d.title)}</h2><span class="meta">${d.yield ? `<span>${ICON_SERV}${esc(d.yield)}</span>` : ''}${d.total ? `<span>${ICON_TIME}${esc(d.total)}</span>` : ''}</span>
      ${isPriv(r.id) ? `<span class="privtag sm">${ICON_LOCK}Private</span>` : ''}<span class="st ${p.done === 0 ? 'new' : p.done === p.total ? 'done' : 'prog'}">${st}</span><span class="bar"><i style="width:${pct}%"></i></span></span></div>`;
  }).join('') + `</div><div class="card empty" id="rnone" ${filtered && !shown.length ? '' : 'hidden'}>${sortK === 'progress' && !shown.length && !catOn && !recFav ? 'Nothing in progress right now. Open a recipe and check off a step to start.' : recTags.length > 1 ? `No recipes have ${recTags.length === 2 ? 'both' : 'all'} of these tags. Remove one to see more.` : 'No recipes match.'}</div>` + archBox;
}

// A step that writes its own amounts ("add 2 cups of the broth", "divide into 12 balls"). Times, temperatures and pan sizes don't count.
const stepHasAmount = t => /[\d½¼¾⅓⅔⅛⅜⅝⅞]|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|half)\b/i.test(String(t || '')
  .replace(/[\d.\/½¼¾⅓⅔⅛⅜⅝⅞]+(?:\s*(?:-|–|to)\s*[\d.\/½¼¾⅓⅔⅛⅜⅝⅞]+)?\s*(?:-?\s*)(?:minutes?|mins?|hours?|hrs?|seconds?|secs?|days?|weeks?|°\s*[CF]?|degrees?(?:\s*[CF])?|[CF]\b|%|inch(?:es)?|in\b|cm|x\s*\d+[\s-]*(?:inch|in|cm)|-inch|quarts?(?= (?:pot|dutch|saucepan|casserole|baking|dish))|qt\b|times|batch(?:es)?|layers?|sides?|stages?)/gi, ' ')
  .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:-|to)?\s*(?:minutes?|hours?|seconds?|days?)/gi, ' ').replace(/\bone\b(?=\s+(?:at a time|side|another|by one|more|last))/gi, ' ').replace(/\bhalf(?=[- ](?:way|of the|the))/gi, ' '));
const ICON_MINUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';
// Recipe size: ½× to 3×, and − / + for one serving at a time when the recipe says how many it serves. It lasts until the recipe is finished.
// The note that comes with a new size of a baked thing: more pans the same size, or a smaller pan.
const PANW = /\b(pies?|cakes?|loaf|loaves|pans?|tarts?|bundts?|cheesecakes?|quiches?|galettes?|dish(?:es)?|skillets?|casseroles?|crusts?)\b/i;
// Recipes that bake but don't name a pan in the yield (like a lasagna that "serves 8") get a note too, and every note
// says when to start checking. Butter Math never changes the times in the steps: there's no rule that's right for every dish (Nov 21, 2026).
const BAKES = /\b(bake[sd]?|baking|oven|roast(?:ed|ing)?|broil|pans?|dish|skillet|casserole|\d+\s*(?:x|×|by)\s*\d+)\b/i;
const bakesIn = d => PANW.test(d.yield || '') || (d.steps || []).some(sec => (sec.items || []).some(st => BAKES.test(st.text || '')));
function scaleNotes(d, f){ if(near1(f, 1) || !bakesIn(d)) return '';
  if(f < 1) return `<div class="scalenotes"><p>Use a smaller pan, and start checking a few minutes before the time in the recipe.</p></div>`;
  if(!PANW.test(d.yield || '')){ const k = Math.ceil(f); return `<div class="scalenotes"><p>Use ${k} pans the same size as the recipe's, not one bigger pan. Start checking at the time in the recipe.</p></div>`; }
  // how many pans: the scaled count of pies, cakes or loaves, rounded up ("1½ pies" needs 2 pans)
  const sy = scaleYield(d.yield, f), m = sy.match(/(\d*)([½¼¾⅓⅔⅛⅜⅝⅞]?)\s+(?:\([^)]*\)\s+)?(?:[\w-]+\s+)?(?:pies?|cakes?|loaf|loaves|pans?|tarts?|bundts?|cheesecakes?|quiches?|galettes?|dish(?:es)?|skillets?|casseroles?|crusts?)\b/i);
  const n = m && (m[1] || m[2]) ? Math.ceil((m[1] ? +m[1] : 0) + (m[2] ? ({'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875})[m[2]] : 0)) : Math.ceil(f);
  const x = ({1.5: '1½'})[f] || (Number.isInteger(f) ? String(f) : '');
  return `<div class="scalenotes"><p>${x ? `It's recommended to use ${n} similarly sized pans. Not a pan ${x}x as large` : `It's recommended to use ${n} similarly sized pans. Not one larger pan`}. Start checking at the time in the recipe.</p></div>`; }
function scaleRow(r, d, f){
  // Four sizes (decided Nov 19, 2026). A size picked earlier that isn't one of them (like 1½× or a serving count) stays shown until another is picked.
  const opts = [[.5, '½×'], [1, '1×'], [2, '2×'], [3, '3×']], id = esc(r.id);
  if(!opts.some(([v]) => near1(v, f))){ const t = sizeTag(r.id).replace(/<[^>]*>|[()\s]/g, ''); opts.push([f, t ? t + '×' : f + '×']); opts.sort((a, b) => a[0] - b[0]); }
  return `<div class="scalerow"><div class="seg scalesw" role="group" aria-label="Recipe size">${opts.map(([v, l]) => `<button data-act="scale" data-id="${id}" data-f="${v}" class="${near1(v, f) ? 'on' : ''}" aria-pressed="${near1(v, f)}">${l}</button>`).join('')}</div></div>` + scaleNotes(d, f);
}
// "Shop for ingredients" on a recipe that's already on the list: say so, and never add it twice.
// On the list in any state (still needed, in the cart, or at home)
const linkedLine = (id, line) => ingParts(line).some(pl => { const key = splitIngredient(pl).key; return allItems().some(i => (i.recipes || []).includes(id) && ihas(i, key)); });
function addSheetBody(r, d){
  const id = esc(r.id), lines = ingLines(d), head = t => `<div class="askt">${t}</div><button class="ibtn" data-act="sheetclose" aria-label="Close">${ICON_X}</button></div>`;
  if(!addSheet.again && onList(r.id)){ const missing = lines.filter(l => !linkedLine(r.id, l)).length;
    return head('Already on your list') + `<p class="frp">${missing ? `<b>${esc(d.title)}</b> is on your shopping list, but ${missing === 1 ? '1 ingredient isn\'t' : missing + ' ingredients aren\'t'}. Adding again won't double anything.` : `Every ingredient from <b>${esc(d.title)}</b> is already on your shopping list.`}</p>` +
      `<button class="askopt main" data-act="go" data-h="shopping"><b>Open shopping list</b></button>` +
      (missing ? `<button class="askopt" data-act="addall" data-id="${id}"><b>Add missing ingredients</b><span>${missing} not on your list yet</span></button>` : '') +
      `<button class="askopt" data-act="choose" data-id="${id}"><b>Select specific ingredients</b></button>`; }
  return head(addSheet.again ? 'Add ingredients to your list?' : 'Add to your shopping list') + `<button class="askopt main" data-act="addall" data-id="${id}"><b>Add all ${lines.length} ingredients</b></button><button class="askopt" data-act="choose" data-id="${id}"><b>Select specific ingredients</b></button>`;
}
// The green check hint on the current step waits until that step is on screen, so it isn't missed while someone reads the top of a recipe.
// Once it has played for 7 seconds, it doesn't come back on that recipe until the app is opened again.
function armStepHint(){
  if(stepHintObs){ stepHintObs.disconnect(); stepHintObs = null; }
  const g = document.querySelector('.ghostchk'); if(!g) return;
  const id = g.dataset.id, go = () => { g.classList.remove('wait'); stepHintSeen.add(id); if(!stepHintT[id]) stepHintT[id] = setTimeout(() => stepHinted.add(id), 7000); };
  if(!g.classList.contains('wait')) return go();
  const step = g.closest('.num'); if(!step || !('IntersectionObserver' in window)) return go();
  stepHintObs = new IntersectionObserver(es => { if(es.some(e => e.isIntersecting)){ stepHintObs.disconnect(); stepHintObs = null; go(); } }, {threshold: 1, rootMargin: '0px 0px -15% 0px'});
  stepHintObs.observe(step);
}
function renderRecipe(id){
  const r = R(id); noteView(id);
  if(!r) return `${backBtn()}<div class="card empty">That recipe isn't here anymore.</div>`;
  const d = D(r), c = cookOf(r.id), p = progressOf(r), pct = p.total ? Math.round(p.done / p.total * 100) : 0, f = scaleOf(r.id);
  const ingTx = t => { if(near1(f, 1)) return fmt(t); const sl = scaleLine(t, f); if(sl == null) return fmt(t) + '<small class="noscale">Not scaled</small>';
    const egg = /^(\d*)([½¼¾⅓⅔⅛⅜⅝⅞⅙⅚])\s+(?:(?:extra[- ])?(?:large|medium|small|jumbo)\s+)?eggs?\b/i.test(sl);
    return fmt(sl) + (egg ? `<small class="noscale">Beat 1 egg and use ${/½/.test(sl) ? 'half' : 'part'}.</small>` : ''); };
  const ings = (d.ingredients || []).map((g, gi) => (g.group ? `<div class="grp">${esc(g.group)}</div>` : '') + (g.items || []).map((t, k) => { const key = gi + '-' + k; const row = `<button class="ing ${c.i[key] ? 'on' : ''}" data-act="ing" data-id="${esc(r.id)}" data-k="${key}"><i class="box">${CHECK}</i><span>${ingTx(t)}</span></button>`;
    if(choosing !== r.id) return row + ingWarn(r.id, key, t);
    if(!splitIngredient(t).key) return `<div class="ing pick ro"><i class="pk none"></i><span>${ingTx(t)}</span></div>`;
    const inl = ingListed(r.id, t);
    return `<button class="ing pick ${inl ? 'in' : ''}" data-act="ingadd" data-id="${esc(r.id)}" data-k="${key}" aria-pressed="${inl}" aria-label="${inl ? 'On your shopping list. Tap to take it off' : 'Add to shopping list'}"><i class="pk">${CHECK}</i><span>${ingTx(t)}</span></button>`; }).join('')).join('');
  let n = 0; const curKey = p.cur >= 0 && p.all[p.cur] ? p.all[p.cur].key : null;
  const steps = (d.steps || []).map((sec, si) => (sec.section ? `<div class="stephead">${esc(sec.section)}</div>` : '') + (sec.items || []).map((st, k) => {
    const key = si + '-' + k; n++; const done = !!c.s[key]; const cur = !done && key === curKey && choosing !== r.id;
    const tm = (st.timers || []).map(t => `<span class="tchip" data-act="timer" data-min="${+t.min}" data-label="${esc(t.label)}">${ICON_TIMER}${esc(t.label)}</span>`).join('');
    return `<button class="step ${done ? 'done' : ''} ${cur ? 'cur' : ''}" id="s-${key}" data-act="step" data-id="${esc(r.id)}" data-k="${key}"><span class="num">${done ? CHECK : n}${cur && !p.done && !stepHinted.has(r.id) ? `<i class="ghostchk${stepHintSeen.has(r.id) ? '' : ' wait'}" data-id="${esc(r.id)}" aria-hidden="true">${CHECK}</i>` : ''}</span><span class="tx">${st.title ? `<div class="tt">${esc(st.title)}</div>` : ''}<p>${fmtStep(d, key, st.text, f)}</p>${!near1(f, 1) && stepHasAmount(st.text) ? '<small class="noscale">Amounts in this step are for the original size.</small>' : ''}${tm ? `<div class="tchips">${tm}</div>` : ''}</span></button>`;
  }).join('')).join('');
  const srcs = (d.links || []).filter(l => /^https?:\/\//i.test(l.url || ''));
  const hasNotes = d.notes && d.notes.length;
  const more = srcs.slice(1).filter(l => hostOf(l.url) !== hostOf(srcs[0].url));
  const notes = hasNotes || more.length ? `<div class="card panel extras">${hasNotes ? `<h4>Good to know</h4><ul>${d.notes.map(x => `<li>${fmt(x)}</li>`).join('')}</ul>` : ''}${more.map(l => `<a class="olink" href="${esc(l.url)}" target="_blank" rel="noopener"><span><b>${esc(l.label && l.label !== 'Original recipe' ? l.label : 'View on ' + hostOf(l.url))}</b><small>${esc(hostOf(l.url))}</small></span>${ICON_EXT}</a>`).join('')}</div>` : '';
  return `${mealBack === r.id ? `<button class="back" data-act="go" data-h="meal">${ICON_BACK}Back to your meal</button>` : `${backBtn()}`}
  <div class="card hero"><div class="art ${d.photo ? 'photo' : 'drawn'}">${d.photo ? pic(d) : `<div class="artbg">${art(kindOf(d), artText(d))}</div><div class="artfg">${art(kindOf(d), artText(d)).replace('xMidYMid slice', 'xMidYMid meet')}</div>`}<label class="heroedit" title="Change image">${photoBusy === r.id ? '<span class="spin dark"></span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'}<input type="file" class="vh" accept="image/*" aria-label="Change image" data-photo-for="${esc(r.id)}"></label></div><div class="body">
    <div class="ttlrow"><h2>${esc(d.title)}</h2><div class="ttlbtns"><button class="ibtn" data-act="go" data-h="edit-${esc(r.id)}" title="Edit recipe" aria-label="Edit recipe">${ICON_PEN}</button><button class="ibtn ${moreOpen ? 'on' : ''}" data-act="more" aria-label="More options" aria-expanded="${moreOpen}">${ICON_MORE}</button>${moreOpen ? `<div class="moremenu" role="menu">${isArch(r.id) || !MEAL_ON ? '' : `<button role="menuitem" class="privrow mealrow" data-act="mealfrom" data-id="${esc(r.id)}">${ICON_MEAL.replace('class="bi"', '')}<span class="pl"><b>Cook with other recipes…</b><small>Start a Meal with this recipe</small></span></button>`}<button role="menuitemcheckbox" aria-checked="${isPriv(r.id)}" class="privrow" data-act="privtog" data-id="${esc(r.id)}">${ICON_LOCK.replace('class="bi"', '')}<span class="pl"><b>Private</b><small>${isPriv(r.id) ? 'Only you can see this recipe' : 'Friends can see this recipe'}</small></span><span class="tog ${isPriv(r.id) ? 'on' : ''}"><i></i></span></button><button role="menuitem" data-act="sendopen" data-id="${esc(r.id)}">${ICON_SEND}Send to friends</button><button role="menuitem" data-act="resetrecipe" data-id="${esc(r.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>Reset progress</button>${isArch(r.id) ? `<button role="menuitem" data-act="unarch" data-id="${esc(r.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>Unarchive</button>` : `<button role="menuitem" data-act="archive" data-id="${esc(r.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>Archive</button>`}<button role="menuitem" class="danger" data-act="delrecipe" data-id="${esc(r.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Remove recipe</button></div>` : ''}</div></div>
    ${srcCredit(srcs)}${d.savedFrom ? `<div class="byl">${avatar(d.savedFrom.owner || d.savedFrom.name, d.savedFrom.name, 'xs')}Saved from ${esc(kitchenOf(d.savedFrom.name))}</div>` : ''}${isPriv(r.id) ? `<div class="privtag">${ICON_LOCK}Private · Only you can see this recipe</div>` : ''}
    <div class="meta">${d.yield ? `<span>${ICON_SERV}${esc(scaleYield(d.yield, f))}</span>` : ''}${d.total ? `<span>${ICON_TIME}${esc(d.total)}</span>` : d.cook ? `<span>${ICON_TIME}${esc(d.cook)}</span>` : ''}${madeOf(r.id).n ? `<span class="made">♥ Made ${madeOf(r.id).n}×</span>` : ''}</div>
    <div class="rtags">${tagsOf(r).map(t => `<span class="rtag">${esc(t)}<button class="rtx" data-act="tagtog" data-id="${esc(r.id)}" data-t="${esc(t)}" aria-label="Remove ${esc(t)} tag" title="Remove tag">${ICON_X}</button></span>`).join('')}<button class="rtag add" data-act="tagedit" data-id="${esc(r.id)}">${tagsOf(r).length ? '+ Tag' : '+ Add a tag'}</button></div>
    ${p.total && p.done === p.total && (P().photoAsked || {})[r.id] !== madeOf(r.id).n ? `<div class="madeitw"><label class="madeit"${d.photo ? ` data-act="madeitswap" data-id="${esc(r.id)}"` : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/></svg>Add a photo of your finished recipe!<input type="file" class="vh" accept="image/*" data-photo-for="${esc(r.id)}" data-asked="1"></label><button class="madeitx" data-act="madeitx" data-id="${esc(r.id)}" aria-label="Close" title="Close">${ICON_X}</button></div>` : ''}
    <div class="actrow">${isArch(r.id) ? `<button class="btn primary grow" data-act="unarch" data-id="${esc(r.id)}">Unarchive</button>` : `<button class="btn primary addlist grow" data-act="addask" data-id="${esc(r.id)}"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18"/><path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25"/><circle cx="18" cy="20" r="2"/><circle cx="8" cy="20" r="2"/></svg>Shop for ingredients</button>`}<button class="btn wake ${wakeLock ? 'on' : ''}" data-act="wake" aria-pressed="${!!wakeLock}" aria-label="Keep screen on" title="Keep the screen from turning off while you cook"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="${wakeLock ? 'currentColor' : 'none'}"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg><span class="wl">Screen on</span></button><button class="btn wake sendbtn" data-act="sendopen" data-id="${esc(r.id)}" aria-label="Send to friends" title="Send to friends">${ICON_SEND}</button></div>
  </div></div>
  <div class="layout">
    <div class="card panel ing-col${choosing === r.id ? ' choosing' : ''}"><div class="inghead"><h3>Ingredients</h3>${choosing === r.id ? `<button class="linkbtn addall" data-act="choosedone">Done</button>` : ''}</div>${(d.ingredients || []).length ? scaleRow(r, d, f) : ''}${ings || '<div class="muted">No ingredients yet.</div>'}</div>
    <div><h3 style="font-size:20px;margin:0 4px 10px">Steps</h3>${p.total ? `<div class="stepprog"><div class="prog-line"><b>${p.total && p.done === p.total ? 'All done — enjoy!' : `${p.done} of ${p.total} steps`}</b>${p.total && p.done < p.total ? `<button class="mc" data-act="markall" data-id="${esc(r.id)}">Mark complete</button>` : (P().cook[r.id] || {}).before ? `<button class="mc undo" data-act="unmark" data-id="${esc(r.id)}" title="Go back to where you were"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>Undo</button>` : `<span class="muted">${pct}%</span>`}</div><div class="bar"><i style="width:${pct}%"></i></div></div>` : ''}${steps || '<div class="card empty">No steps yet.</div>'}
    ${notes}${p.total && p.done === p.total ? finCard(r) : ''}
</div>
  </div>
  ${addSheet && addSheet.id === r.id ? `<div class="sheetbg" data-act="sheetclose"></div><div class="asksheet" role="dialog" aria-label="Add to your shopping list"><div class="pickhead">${addSheetBody(r, d)}</div>` : ''}
  ${tagEdit === r.id ? `<div class="sheetbg" data-act="tagdone"></div><div class="asksheet tagsheet" role="dialog" aria-label="Tags for ${esc(d.title)}"><div class="pickhead"><div class="askt">Tags</div><button class="ibtn" data-act="tagdone" aria-label="Close">${ICON_X}</button></div><div class="tagpick">${allTags().map(t => { const on = tagsOf(r).includes(t); const own = (P().ctags || []).includes(t); return `<span class="tpw"><button class="tp ${on ? 'on' : ''} ${own ? 'own' : ''}" data-act="tagtog" data-id="${esc(r.id)}" data-t="${esc(t)}" aria-pressed="${on}">${on ? '✓ ' : ''}${esc(t)}</button>${own ? `<button class="tpdel" data-act="tagdel" data-t="${esc(t)}" aria-label="Delete the ${esc(t)} tag everywhere" title="Delete this tag">${ICON_X}</button>` : ''}</span>`; }).join('')}</div><form class="newtag" data-form="newtag" data-id="${esc(r.id)}" autocomplete="off"><input id="newtag" data-keep placeholder="Holiday" maxlength="24" aria-label="New tag"><button class="btn" type="submit">Add</button></form><button class="btn primary tagdone" data-act="tagdone">Done</button></div>` : ''}
  ${sendSheet === r.id ? renderSendSheet(r) : ''}
  ${choosing === r.id ? `<div class="selbar"><span>${chosenN ? `${chosenN} added to your list` : 'Tap ingredients to add them'}</span><button class="btn primary" data-act="choosedone">Done</button></div>` : ''}`;
}
// On wide screens the Cook a Meal button sits on the checkered space just right of the page card, when there's room for it there.
function placeFab(){ const b = document.querySelector('.mealfab'), m = document.querySelector('main'); if(!b || !m) return; b.style.left = ''; b.style.right = '';
  if(innerWidth < 820) return; const mr = m.getBoundingClientRect().right;
  if(innerWidth - mr >= b.offsetWidth + 32){ b.style.left = (mr + 16) + 'px'; b.style.right = 'auto'; } else b.style.right = Math.max(16, innerWidth - mr) + 'px'; }
window.addEventListener('resize', placeFab);
function renderFab(r){
  const old = $('#fab'); if(old) old.remove(); if(fabIO){ fabIO.disconnect(); fabIO = null; }
  if(MEAL_ON && r.v === 'recipes' && !mealPick && recipes.filter(x => !isArch(x.id)).length >= 2){ const n = mealIds().length; const b = document.createElement('button'); b.id = 'fab'; b.className = 'btn primary fab mealfab'; b.innerHTML = ICON_MEAL + (n >= 2 ? `Your meal (${n})` : 'Cook a Meal'); b.title = 'Pick a few recipes to cook together'; b.dataset.act = n >= 2 ? 'go' : 'mealopen'; b.dataset.h = 'meal'; document.body.appendChild(b); placeFab(); return; }
  if(r.v !== 'recipe' || choosing) return; const rr = R(r.id); if(!rr) return; const p = progressOf(rr); if(p.cur < 0 || p.done === 0) return;
  // A round arrow button (same look as Back to top). It points down or up, toward where the current step is.
  const b = document.createElement('button'); b.id = 'fab'; b.className = 'stepfab'; b.type = 'button'; b.setAttribute('aria-label', 'Go to step ' + (p.cur + 1)); b.title = 'Current step'; b.innerHTML = '<span class="sfl">Step ' + (p.cur + 1) + '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>'; b.dataset.act = 'jump'; b.dataset.k = p.all[p.cur].key; document.body.appendChild(b);
  // Only shows while the current step is off screen. Once it's in view (you scrolled to it or tapped the button), the button goes away.
  const st = document.getElementById('s-' + p.all[p.cur].key);
  if(st && 'IntersectionObserver' in window){ b.classList.add('away'); fabIO = new IntersectionObserver(([en]) => { b.classList.toggle('away', en.isIntersecting); b.classList.toggle('up', !en.isIntersecting && en.boundingClientRect.top < 0); }, {threshold: 0.3}); fabIO.observe(st); }
  fabWake();
}
let fabIO = null, fabIdleT;
// The current-step arrow fades out after 1.5 seconds without scrolling and comes back when you scroll
// On phones only one button shows at a time: the "Step N" pill while your current step is off screen, otherwise Back to top. Both fade the same way.
function fabWake(){ const b = document.getElementById('fab'), t = document.querySelector('.totop'), els = [b && b.classList.contains('stepfab') ? b : null, t].filter(Boolean); if(!els.length) return; els.forEach(e => e.classList.remove('idle')); clearTimeout(fabIdleT); fabIdleT = setTimeout(() => els.forEach(e => e.classList.add('idle')), 1500); }
window.addEventListener('scroll', fabWake, {passive: true});

/* ---------------- add / edit form ---------------- */
let form = null; // {forId, photoBlob, photoUrl, removePhoto, busy, err}
function ensureForm(id){
  if(!form || form.forId !== (id || 'new')){
    if(form && form.photoUrl) URL.revokeObjectURL(form.photoUrl);
    form = {forId: id || 'new', review: null, photoBlob: null, photoUrl: null, removePhoto: false, busy: false, err: '', filled: false, importing: false, importMsg: '', importOk: false};
  }
  return form;
}
// Start over on a new recipe: the arrow button clears everything after a confirm (Nov 21, 2026). It shows once something is entered.
function formDirty(){
  if(form && form.forId === 'new' && (form.photoUrl || form.review || form.filled || form.importMsg)) return true;
  return [...document.querySelectorAll('.form [data-keep]')].some(el => el.type !== 'checkbox' && el.type !== 'file' && String(el.value || '').trim());
}
function syncClear(){ const b = $('#f-clear'); if(b) b.hidden = !formDirty(); }
document.addEventListener('input', e => { if(e.target && e.target.closest && e.target.closest('.form')) syncClear(); });
function clearForm(){
  document.querySelectorAll('.form [data-keep]').forEach(el => { if(el.type !== 'checkbox' && el.type !== 'file') el.value = ''; });
  if(form && form.photoUrl) URL.revokeObjectURL(form.photoUrl);
  form = null; render(); window.scrollTo(0, 0); toast('Cleared the form');
}
function renderForm(id){
  const r = id ? R(id) : null;
  if(id && !r) return `${backBtn()}<div class="card empty">That recipe isn't here anymore.</div>`;
  const f = ensureForm(id), d = r ? D(r) : {};
  const link = (d.links || []).find(l => l.url) || {};
  const v = (k, dv) => esc(dv == null ? '' : dv);
  const photoNow = f.photoUrl || (!f.removePhoto && d.photo) || null;
  return `${r ? `<button class="back" data-act="go" data-h="r-${esc(r.id)}">${ICON_BACK}Back to recipe</button>` : backBtn()}
  <div class="card panel form">
    ${r ? `<h3>Edit recipe</h3>` : `<div class="formhead"><h3>Add a recipe</h3><button class="ibtn" type="button" id="f-clear" data-act="formclear" title="Clear form" aria-label="Clear form"${formDirty() ? '' : ' hidden'}>${ICON_RESTART}</button></div>`}
    <div class="lbl2">Recipe website link <span class="hint">recommended</span></div>
    <div class="linkrow"><input class="tin" id="f-link" data-keep type="url" inputmode="url" placeholder="Paste a recipe link" value="${v('link', link.url)}"></div>
    ${!r && f.importing ? `<div class="importmsg">Importing…</div>` : !r && f.review ? reviewCard(f.review) : !r && f.importMsg ? `<div class="importmsg ${f.importOk ? 'ok' : ''}">${esc(f.importMsg)}</div>` : ''}
    <div class="lbl2">Recipe title <span class="hint">required</span></div>
    <input class="tin" id="f-title" data-keep maxlength="90" placeholder="Grandma's apple crisp" value="${v('title', d.title)}">
    ${r ? '' : `
    ${f.importOk ? '' : `<div class="lbl2">Or paste the recipe</div>
    <textarea class="tin" id="f-paste" data-keep rows="5" placeholder="Copy the recipe from the site and paste it here"></textarea>
    <div class="row" style="margin-top:8px"><label class="btn sm" id="f-ocrlbl"><input type="file" id="f-ocr" accept="image/*" hidden><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/></svg>Read from a photo</label></div><div class="ocrmsg" id="f-ocrmsg">Paste your recipe or add a screenshot to fill the recipe in below. Screenshots are read and discarded. They are never stored.</div>`}`}
    <fieldset class="lockable" ${!r && !f.filled ? 'disabled' : ''}>
    <div class="g4">
      <div><label class="lbl2" for="f-yield">Serves / makes</label><input class="tin" id="f-yield" data-keep maxlength="40" value="${v('y', d.yield)}"></div>
      <div><label class="lbl2" for="f-prep">Prep time</label><input class="tin" id="f-prep" data-keep maxlength="40" value="${v('p', d.prep)}"></div>
      <div><label class="lbl2" for="f-cook">Cook time</label><input class="tin" id="f-cook" data-keep maxlength="40" value="${v('c', d.cook)}"></div>
      <div><label class="lbl2" for="f-total">Total time</label><input class="tin" id="f-total" data-keep maxlength="40" value="${v('t', d.total)}"></div>
    </div>
    <label class="lbl2" for="f-ing">Ingredients</label>
    <textarea class="tin" id="f-ing" data-keep rows="9">${esc(groupsToIngText(d.ingredients))}</textarea>
    <label class="lbl2" for="f-steps">Steps <span class="hint">one per line · <span id="f-stepcount"></span></span></label>
    <textarea class="tin" id="f-steps" data-keep rows="9">${esc(sectionsToStepText(d.steps))}</textarea>
    <details class="steprev"><summary>See them numbered</summary><ol id="f-steplist"></ol></details>
    <label class="lbl2" for="f-notes">Notes <span class="hint">optional</span></label>
    <textarea class="tin" id="f-notes" data-keep rows="3">${esc((d.notes || []).join('\n'))}</textarea>
    <div class="lbl2">Image</div>
    <div class="picwrap">
      <div class="picprev ${photoNow ? 'canpos' : ''}" id="f-pic">${photoNow ? `<img src="${esc(photoNow)}" alt="" draggable="false"${posStyle(f.photoPos || (f.photoPos = Object.assign({x: 50, y: 50, z: 1}, d.photoPos || {})))}>` : art(guessArt(($('#f-title') || {}).value || d.title || ''), ($('#f-title') || {}).value || d.title || '')}</div>
      <label class="picbtn" title="Upload your own photo"><input type="file" id="f-photo" class="vh" accept="image/*" aria-label="Upload your own photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg></label>
      ${photoNow ? `<button class="picbtn picx" type="button" data-act="rmphoto" title="Use the drawing" aria-label="Use the drawing"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>` : ''}
    </div>
    ${photoNow ? `<div class="picfit"><span>Drag the photo to fit the frame. This is how it looks on your recipe card.</span><label>Zoom<input type="range" id="f-zoom" min="1" max="3" step="0.05" value="${+(f.photoPos || {}).z || 1}" aria-label="Zoom the photo"></label></div>` : ''}
    <p class="pichint">Use your own photo. Images from other websites belong to their creators.</p>
    ${r && onList(r.id) ? `<label class="cb"><input type="checkbox" id="f-addlist" data-keep> Add new ingredients to list</label>` : !r && shopAdd ? `<label class="cb"><input type="checkbox" id="f-addlist" data-keep checked> Add its ingredients to my shopping list</label>` : ''}
    </fieldset>
    <div class="row" style="margin-top:16px"><button class="btn primary sm" type="button" data-act="saveform" data-id="${r ? esc(r.id) : ''}" ${f.busy || (!r && !f.filled) ? 'disabled' : ''}>${f.busy ? 'Saving…' : r ? 'Save changes' : 'Save recipe'}</button></div>
    ${f.err ? `<div class="err">${esc(f.err)}</div>` : ''}
  </div>`;
}
// ---- Add from photo on the shopping list (Nov 21, 2026) ----
// A photo or screenshot of a written list. The text is read on the device, like recipe photos, and nothing is uploaded.
// Each line becomes an item the person can fix or untick before it goes on the list, sorted into an aisle the usual way.
const ICON_CAM = '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
const SHOP_PHOTO_BTN = `<label class="btn" id="shop-ocrlbl">${ICON_CAM}Add from photo<input type="file" id="shop-ocr" accept="image/*" hidden></label>`;
let shopOcr = null; // {busy, msg, lines:[{t, on}]}
const LIST_HEAD = /^(grocer(y|ies)|shopping|to buy|list|groceries list|grocery list|shopping list|need|buy)\s*:?$/i;
function listLines(text){
  const out = [], seen = new Set();
  for(let l of String(text || '').replace(/\r/g, '').split(/\n|,(?!\d)/)){
    l = l.replace(/\s+/g, ' ').trim();
    for(let i = 0; i < 2; i++) l = l.replace(/^(?:[-–—•*·▪●○◦□☐☑✓✔]+|\[\s*[xX✓✔]?\s*\]|\(\s*\)|\d+\s*[.)])\s*/, '');
    l = l.replace(/^[^A-Za-z0-9½¼¾⅓⅔]+/, '').replace(/[\s'‘’"“”.:;~>_—–-]+$/, '').trim();
    if(!/[A-Za-z]{2}/.test(l) || LIST_HEAD.test(l) || l.length > 70) continue;
    const k = l.toLowerCase(); if(seen.has(k)) continue; seen.add(k);
    out.push(l.charAt(0).toUpperCase() + l.slice(1));
    if(out.length >= 60) break;
  }
  return out;
}
// Lines that look like noise or signs, not items, start unticked so they're easy to skip (Nov 21, 2026):
// lots of stray symbols, a question, or a shouted heading like "ITEMS ESPECIALLY NEEDED".
function ocrJunk(t){
  const odd = (t.match(/[^A-Za-z0-9\s&',./()½¼¾⅓⅔-]/g) || []).length + (t.match(/[—–~|^*#@]/g) || []).length, letters = (t.match(/[A-Za-z]/g) || []).length;
  if(odd > 1 || odd / Math.max(1, t.length) > .08) return true;
  if(/\?/.test(t) || letters < 3) return true;
  if(t === t.toUpperCase() && t.split(/\s+/).length >= 2) return true;
  return false;
}
function renderShopOcr(){
  const s = shopOcr; if(!s){ $('#modalRoot').innerHTML = ''; return; }
  const n = s.lines ? s.lines.filter(x => x.on && x.t.trim()).length : 0;
  $('#modalRoot').innerHTML = `<div class="modal" data-act="shopocrclose"><div class="card ocrsheet" data-stop role="dialog" aria-modal="true" aria-labelledby="ocr-h"><h3 id="ocr-h">Add from photo</h3>
    ${s.lines ? `<p class="muted">Edit your list by unchecking what isn’t needed. Use commas to split items into separate lines.</p>
    <ul class="ocrlist">${s.lines.map((x, i) => `<li><label class="ocrck"><input type="checkbox" id="ocr-c${i}" data-oi="${i}" ${x.on ? 'checked' : ''} aria-label="Add this item"></label><input class="tin" id="ocr-t${i}" data-oi="${i}" value="${esc(x.t)}" maxlength="80" aria-label="Item"></li>`).join('')}</ul>
    <button class="linkbtn ocradd" type="button" data-act="shopocradd">Add an item</button>
    <div class="row"><button class="btn quiet" data-act="shopocrclose">Cancel</button><button class="btn primary" data-act="shopocrok"${n ? '' : ' disabled'}>Add items</button></div>`
    : `<p class="muted" role="status" aria-live="polite">${esc(s.msg || '')}</p>${s.busy ? '' : `<div class="row"><button class="btn" data-act="shopocrclose">Close</button></div>`}`}
  </div></div>`;
}
async function readListPhoto(file){
  if(!file || (shopOcr && shopOcr.busy)) return;
  shopOcr = {busy: true, msg: 'Getting ready to read the photo…'}; renderShopOcr();
  const say = t => { if(shopOcr){ shopOcr.msg = t; const p = document.querySelector('.ocrsheet [role=status]'); if(p) p.textContent = t; } };
  try{
    const T = await loadTess(), img = await shrink(file, 2200);
    const {data} = await T.recognize(img, 'eng', {logger: m => { if(m.status === 'recognizing text') say('Reading your list… ' + Math.round(m.progress * 100) + '%'); }});
    if(!shopOcr) return;
    const lines = listLines(data.text);
    if(!lines.length){ shopOcr = {busy: false, msg: "Couldn't find any items in that photo. Try a sharper, straight-on photo or a screenshot."}; renderShopOcr(); return; }
    shopOcr = {busy: false, lines: lines.map(t => ({t, on: !ocrJunk(t)}))}; renderShopOcr();
  }catch(err){ console.error(err); shopOcr = {busy: false, msg: "Couldn't read that photo. Check your connection and try again."}; renderShopOcr(); }
}
// Commas split a line into separate items (Nov 21, 2026): "Canned soup, beef stew" becomes two rows, both ticked.
function shopOcrSplit(i){
  const x = shopOcr.lines[i]; if(!x) return;
  const parts = x.t.split(/,(?!\d)/).map(t => t.trim()).filter(Boolean).map(t => ({t: t.charAt(0).toUpperCase() + t.slice(1), on: x.on}));
  const ul = document.querySelector('.ocrlist'), top = ul ? ul.scrollTop : 0;
  shopOcr.lines.splice(i, 1, ...(parts.length ? parts : [{t: '', on: x.on}])); renderShopOcr();
  const ul2 = document.querySelector('.ocrlist'); if(ul2) ul2.scrollTop = top;
}
document.addEventListener('keydown', e => { const t = e.target; if(e.key !== 'Enter' || !t || !t.dataset || t.dataset.oi == null || t.type === 'checkbox' || !shopOcr || !shopOcr.lines) return;
  e.preventDefault(); const i = +t.dataset.oi; if(/,(?!\d)/.test(t.value)){ shopOcr.lines[i].t = t.value; shopOcrSplit(i); } else if(i === shopOcr.lines.length - 1) shopOcrAddRow(); else { const n = $('#ocr-t' + (i + 1)); if(n) n.focus(); } });
function shopOcrAddRow(){
  if(!shopOcr || !shopOcr.lines) return;
  shopOcr.lines.push({t: '', on: true}); renderShopOcr();
  const ul = document.querySelector('.ocrlist'); if(ul) ul.scrollTop = ul.scrollHeight;
  const n = $('#ocr-t' + (shopOcr.lines.length - 1)); if(n) n.focus();
}
function shopOcrAdd(){
  if(!shopOcr || !shopOcr.lines) return;
  const add = shopOcr.lines.filter(x => x.on && x.t.trim()).flatMap(x => x.t.split(/,(?!\d)/)).map(t => t.trim()).filter(Boolean); if(!add.length) return;
  mutate(k => { add.forEach((line, j) => { const sp = splitIngredient(line), name = (sp.name || line).trim() || line, qty = sp.name ? (sp.qty || '') : '';
    const id = 'c-' + Date.now().toString(36) + j + rid().slice(0, 4);
    k.shopping.items.push({id, name: name.charAt(0).toUpperCase() + name.slice(1), qty, section: guessSection(name, qty) || 'Other', key: splitIngredient(name).key, recipes: [], custom: true}); }); });
  shopOcr = null; $('#modalRoot').innerHTML = '';
  if(ui.filter === 'cart' || ui.filter === 'have'){ ui.filter = 'all'; saveUi(); }
  render(); toast(`Added ${add.length} item${add.length === 1 ? '' : 's'}`);
}
document.addEventListener('change', e => {
  const t = e.target; if(!t) return;
  if(t.id === 'shop-ocr'){ const f = t.files[0]; t.value = ''; if(f) readListPhoto(f); return; }
  if(t.dataset && t.dataset.oi != null && shopOcr && shopOcr.lines){ const x = shopOcr.lines[+t.dataset.oi]; if(!x) return;
    if(t.type === 'checkbox') x.on = t.checked; else { x.t = t.value; if(/,(?!\d)/.test(t.value)){ shopOcrSplit(+t.dataset.oi); return; } }
    const b = document.querySelector('[data-act="shopocrok"]'); if(b) b.disabled = !shopOcr.lines.some(y => y.on && y.t.trim()); }
});
document.addEventListener('input', e => { const t = e.target; if(t && t.dataset && t.dataset.oi != null && t.type !== 'checkbox' && shopOcr && shopOcr.lines){ const x = shopOcr.lines[+t.dataset.oi]; if(x) x.t = t.value;
  const b = document.querySelector('[data-act="shopocrok"]'); if(b) b.disabled = !shopOcr.lines.some(y => y.on && y.t.trim()); } });
document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('[data-act="shopocrclose"]'); if(!el) return; if(el.classList.contains('modal') && e.target !== el) return; if(shopOcr && shopOcr.busy) return; shopOcr = null; $('#modalRoot').innerHTML = ''; });
// ---- Read a recipe from a photo (text is read on the device with Tesseract; nothing is uploaded) ----
let tessP = null, ocrBusy = false;
function loadTess(){
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  return tessP || (tessP = new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    sc.onload = () => res(window.Tesseract); sc.onerror = () => { tessP = null; rej(new Error('load')); }; document.head.appendChild(sc);
  }));
}
const OCR_HEAD = /^(instructions?|directions?|method|steps|preparation)\s*:?$/i;
function ocrTidy(t){
  // Photos wrap long steps onto several lines. Put each step back on one line.
  const out = []; let inSteps = false;
  for(let l of String(t || '').replace(/\r/g, '').split('\n')){
    l = l.replace(/\s+/g, ' ').trim(); if(!l) continue;
    const head = OCR_HEAD.test(l); if(head) inSteps = true;
    const prev = out[out.length - 1];
    if(inSteps && !head && prev && !OCR_HEAD.test(prev) && !/^\d+\s*[.):-]\s*\S/.test(l) && !/:$/.test(l) && (!/[.!?:)]$/.test(prev) || /^[a-z]/.test(l))) out[out.length - 1] = prev + ' ' + l;
    else out.push(l);
  }
  return out.join('\n');
}
function ocrSay(t){ const e = $('#f-ocrmsg'); if(e){ e.textContent = t; e.classList.toggle('bad', /^Couldn/.test(t)); } }
function autoFill(){
  // Pasting (or leaving the box) fills the form. Ask first if the person already typed ingredients or steps.
  const pa = $('#f-paste'), raw = pa ? pa.value : '';
  if(!raw.trim() || !form || raw === form.lastParsed) return;
  const p = parseRecipeText(looksLikeVideo(raw) ? (videoRecipeText(raw) || raw) : raw);
  if(!p.ingredients){ ocrSay("Couldn't find ingredients in that text. Make sure it includes the ingredient list."); return; }
  const ing = $('#f-ing'), st = $('#f-steps');
  const hand = (ing && ing.value.trim() && ing.value.trim() !== (form.autoIng || '')) || (st && st.value.trim() && st.value.trim() !== (form.autoSteps || ''));
  if(hand) confirmBox('Replace what you typed?', 'This fills the form from the pasted text and replaces the ingredients and steps you entered.', 'Replace', fillFromPaste);
  else fillFromPaste();
}
async function readPhoto(file){
  if(ocrBusy || !file) return; ocrBusy = true;
  const say = ocrSay;
  say('Getting ready to read the photo…');
  try{
    const T = await loadTess();
    const img = await shrink(file, 2200);
    const {data} = await T.recognize(img, 'eng', {logger: m => { if(m.status === 'recognizing text') say('Reading the photo… ' + Math.round(m.progress * 100) + '%'); }});
    const text = ocrTidy(data.text);
    if(text.length < 25){ say("Couldn't find any text in that photo. Try a sharper, straight-on photo or a screenshot."); return; }
    const pa = $('#f-paste'); if(pa){ pa.value = text; const b = $('#f-parsebtn'); if(b) b.disabled = false; }
    fillFromPaste();
    if(form && form.importOk !== true && !form.filled) say("Couldn't find ingredients in that photo. Check the text below and edit it, or try another photo.");
  }catch(err){ console.error(err); say("Couldn't read that photo. Check your connection and try again."); }
  finally{ ocrBusy = false; }
}
document.addEventListener('paste', e => {
  if(!e.target || e.target.id !== 'f-paste') return;
  const f = [...((e.clipboardData && e.clipboardData.files) || [])].find(x => /^image\//.test(x.type));
  if(f){ e.preventDefault(); readPhoto(f); } else setTimeout(autoFill, 60);
});
function fillFromPaste(){
  const raw = ($('#f-paste') || {}).value || '';
  if(!raw.trim()){ toast('Paste the recipe first'); return; }
  const p = parseRecipeText(looksLikeVideo(raw) ? (videoRecipeText(raw) || raw) : raw);
  const set = (id, val, force) => { const el = $(id); if(el && val && (force || !el.value.trim())) el.value = val; };
  set('#f-title', p.title, !(($('#f-title') || {}).value || '').trim() || $('#f-title').value === form.autoTitle); set('#f-yield', p.yield); set('#f-prep', p.prep); set('#f-cook', p.cook); set('#f-total', p.total);
  set('#f-ing', p.ingredients, true); set('#f-steps', p.steps, true); set('#f-notes', p.notes);
  if(!p.ingredients){ toast("Couldn't find ingredients. Paste just the recipe."); return; }
  form.lastParsed = raw; form.autoIng = p.ingredients; form.autoSteps = p.steps; form.autoTitle = p.title;
  form.filled = true; form.review = {n: stepLines(p.steps).length, url: (($('#f-link') || {}).value || '').trim(), warn: stepCheck(p.steps, false), src: 'paste'}; render();
  toast(p.steps ? 'Filled in' : 'Filled in the ingredients. No steps found, so add them below if the recipe has any.');
}
function videoRecipeText(desc){
  const ls = String(desc || '').replace(/\r/g, '').split('\n').map(l => l.trim());
  const qty = /^([-•*▢□]\s*)?(\d|[½⅓⅔¼¾⅛⅜⅝⅞]|one |two |three |a pinch|pinch|a few|handful|zest|juice)/i;
  const head = /^(ingredients?|for the [\w\s]+)\s*:?$/i;
  let i = ls.findIndex(l => head.test(l));
  if(i < 0){ const q = ls.findIndex(l => qty.test(l) && !/^\(?\d{1,2}:\d{2}/.test(l) && !/https?:\/\//.test(l)); if(q < 0) return null; i = q > 0 && ls[q - 1] && ls[q - 1].length < 60 && !/[.!?:]$/.test(ls[q - 1]) && !/^#/.test(ls[q - 1]) ? q - 1 : q; }
  const stop = /^(chapters|timestamps|time stamps|links|follow|connect|credits|video series|animation credits|music|shop|merch|subscribe|about)\b[^:]{0,30}:?$/i;
  let out = [];
  for(let k = i; k < ls.length; k++){
    const l = ls[k];
    if(k > i && (stop.test(l) || /^\(?\d{1,2}:\d{2}(:\d{2})?\)?\s/.test(l))) break;
    if(/https?:\/\/|www\./i.test(l) || /^(#\w+\s*)+$/.test(l) || /sponsor|use (my )?code|% off|discount|affiliate|subscribe|patreon/i.test(l)) continue;
    out.push(l);
  }
  const txt = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return txt.length > 20 ? txt : null;
}
// A pasted YouTube description: has video chapters, links, or sponsor/subscribe lines around the recipe.
function looksLikeVideo(s){ return /^\(?\d{1,2}:\d{2}(:\d{2})?\)?\s+\S/m.test(s) || /\b(subscribe|sponsor(ed)?|chapters:)/i.test(s); }
async function importLink(){
  const url = (($('#f-link') || {}).value || '').trim();
  if(!/^https?:\/\/\S+\.\S+/i.test(url)){ toast('Paste a full https:// link'); return; }
  if(form.importing) return;
  form.importing = true; form.importMsg = ''; render();
  let p = null, msg = '';
  try{
    const {data, error} = await sb.functions.invoke('import-recipe', {body: {url, yt: true}});
    if(error) throw error;
    if(data && data.ingredients) p = data; else if(data && data.caption) p = {caption: data.caption, source: data.source, vtitle: data.title}; else msg = (data && data.error) || '';
  }catch(err){ console.error(err); }
  form.importing = false;
  if(!p){ form.importOk = false; let many = false; try{ many = /(^|-)(recipes|ideas|roundup|dishes|sides|appetizers|desserts|dinners|meals|menu|menus|favorites)$/i.test(new URL(url).pathname.replace(/\/+$/, '').split('/').pop()); }catch(e){}
    form.importMsg = /(^|\.)(youtube\.com|youtu\.be)$/i.test((() => { try{ return new URL(url).hostname; }catch(e){ return ''; } })()) ? "YouTube doesn't let Butter Math read this video yet. Under the video, tap the description to open it, copy it, and paste it below." : /instagram/i.test(msg) ? "Instagram doesn't let Butter Math read this post. Copy the caption from Instagram and paste it below." : /share that page/.test(msg) ? "This site doesn't allow imports. Paste it below." : many ? 'This page lists several recipes. Open the one you want and paste its link.' : "Couldn't find a recipe on that page. Paste the recipe below. If your link lists several recipes, open the one you want and paste the direct link."; render(); return; }
  const yt = p && p.source === 'youtube';
  if(yt){ const v = videoRecipeText(p.caption); if(!v){ form.importOk = false; form.importMsg = "This video's description doesn't include the recipe. If you have it, paste it below."; render(); return; } p.caption = v; }
  if(p.caption){
    const cap = p.caption.replace(/\s*((?:10|[0-9])\uFE0F?\u20E3|\u{1F51F})\s*/gu, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const pa = $('#f-paste'); if(pa) pa.value = cap;
    const q = parseRecipeText(cap);
    if(!q.ingredients){
      let ls = cap.split('\n').map(l => l.trim()).filter(l => l && !/follow (me|us)|link in (my )?bio|tag (a|your) friend|save (this|for later)|share this|comment ["“]?\w+["”]? (below|and)/i.test(l)).slice(1);
      const t = ls.findIndex(l => /^(pro(fessional)? )?(tips|notes)\b.*:?$/i.test(l.replace(/[^\w\s:]/g, '').trim()));
      if(t >= 0){ q.notes = ls.slice(t + 1).join(' ').split(/\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?\s*/u).map(x => x.trim()).filter(x => x.length > 3).join('\n'); ls = ls.slice(0, t); }
      q.steps = ls.join('\n');
    }
    if(yt && (!q.title || /^(ingredients?|for the\b)/i.test(q.title))) q.title = String(p.vtitle || '').split(/\s+[|–—-]\s+/)[0].replace(/\s*\b(recipe|easy|best)\b\s*/gi, ' ').trim();
    q.title = (q.title || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').trim();
    const set = (id, val, force) => { const el = $(id); if(el && val && (force || !el.value.trim())) el.value = val; };
    set('#f-title', q.title); set('#f-yield', q.yield); set('#f-prep', q.prep); set('#f-cook', q.cook); set('#f-total', q.total);
    const one = t => String(t || '').replace(/\(\(([^()]*)\)\)/g, '($1)'); set('#f-ing', one(q.ingredients), true); set('#f-steps', one(q.steps), true); set('#f-notes', q.notes);
    form.filled = !!(q.title || q.steps); form.importOk = true;
    form.importMsg = yt ? (q.ingredients && q.steps.trim() ? '✓ Pulled from the YouTube description. Check it over before saving.' : q.ingredients ? '✓ Pulled the ingredients from the YouTube description. It had no written steps, so add those from the video before saving.' : '✓ Pulled from the YouTube description. It had no ingredient list, so add those before saving.')
      : q.ingredients ? '✓ Pulled from the Instagram caption. Check it over before saving.' : '✓ Pulled from the Instagram caption. It had no ingredient list, so add those before saving.';
    render(); return;
  }
  const set = (id, val, force) => { const el = $(id); if(el && val && (force || !el.value.trim())) el.value = val; };
  set('#f-title', p.title); set('#f-yield', p.yield); set('#f-prep', p.prep); set('#f-cook', p.cook); set('#f-total', p.total);
  set('#f-ing', p.ingredients, true); set('#f-steps', p.steps, true); set('#f-notes', p.notes);
  if(p.title) $('#f-title').value = p.title;
  form.filled = true; form.importOk = true; form.importMsg = ''; form.review = {n: stepLines(p.steps).length, url: ($('#f-link') || {}).value.trim(), warn: stepCheck(p.steps, true), src: 'link'}; render();
}
function reviewCard(rv){ if(!rv.url && !rv.warn) return ''; return `<div class="importrev">${rv.url ? `<a class="ir-link" href="${esc(rv.url)}" target="_blank" rel="noopener">Compare with original${ICON_EXT}</a>` : ''}${rv.warn ? `<div class="ir-warn">${esc(rv.warn)}</div>` : ''}</div>`; }
function stepLines(t){ return String(t || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !/:$/.test(l)); }
function stepCheck(t, fromSite){
  const ls = stepLines(t), long = ls.some(l => l.length > 450);
  if(fromSite && (ls.length <= 3 || long)) return "Review all recipe steps to catch anything that's missing.";
  if(long) return 'A few steps look combined. Give each step its own line.';
  return '';
}
function stepPreview(){ const ls = stepLines(($('#f-steps') || {}).value); const c = $('#f-stepcount'); if(c) c.textContent = ls.length ? `${ls.length} step${ls.length === 1 ? '' : 's'}` : ''; const o = $('#f-steplist'); if(o) o.innerHTML = ls.map(l => `<li>${esc(l)}</li>`).join(''); }
function guessArt(t){ return guessKind(t); }
async function shrink(file, max){
  try{
    const bmp = await createImageBitmap(file); const sc = Math.min(1, (max || 1400) / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', .85));
  }catch(e){ return file; }
}
async function uploadPhoto(recipeId, blob){
  const path = `${user.id}/${recipeId}-${Date.now().toString(36)}.jpg`;
  const {error} = await sb.storage.from('photos').upload(path, blob, {contentType:'image/jpeg', cacheControl:'31536000'});
  if(error) throw error;
  return {path, url: sb.storage.from('photos').getPublicUrl(path).data.publicUrl};
}
// The recipe editor runs the same amount check as the shopping list, on every ingredient line you add or change.
// On your own recipe page, a line whose amounts disagree ("3 Tbsp (30ml)") gets a red note and a Fix button.
function ingWarn(rid, key, t){ const p = splitIngredient(t); if(!p.qty) return ''; const w = checkAmt('', p.qty); if(!w || !w.fix || !rebuildLine(t, p.name, w.fix)) return '';
  return `<div class="ingwarn" role="note">${esc(w.msg)} <button class="linkbtn" data-act="ingfix" data-id="${esc(rid)}" data-k="${key}">Fix</button></div>`; }
function recipeAmtWarns(old, ingredients){
  const oldQ = new Map(), dup = new Set();
  (old.ingredients || []).forEach(g => (g.items || []).forEach(l => { const p = splitIngredient(l); if(!p.key) return; if(oldQ.has(p.key)) dup.add(p.key); oldQ.set(p.key, p.qty || ''); }));
  const was = new Set((old.ingredients || []).flatMap(g => g.items || []));
  const out = [];
  ingredients.forEach(g => (g.items || []).forEach(l => { if(was.has(l)) return; const p = splitIngredient(l); if(!p.key || !p.qty) return;
    const oq = dup.has(p.key) ? '' : (oldQ.get(p.key) || ''); if(p.qty === oq) return;
    const sc = oq ? scaleParen(oq, p.qty) : p.qty; let w = checkAmt(oq, sc);
    if(!w && sc !== p.qty) w = {msg: `The recipe had ${oq}. ${sc.replace(/\s*\([^)]*\)\s*$/, '')} would be ${(sc.match(/\(([^)]*)\)\s*$/) || [])[1]}.`, fix: sc};
    if(w){ const fixLine = w.fix ? rebuildLine(l, p.name, w.fix) : null; out.push({line: l, name: p.name, msg: w.msg, fix: w.fix && fixLine ? w.fix : '', fixLine}); } }));
  return out;
}
let amtWarnPend = null;
function showAmtWarns(ws, id){
  amtWarnPend = {ws, id}; const fx = ws.filter(w => w.fixLine);
  $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card" data-stop><h3>${ws.length > 1 ? 'Check these amounts' : 'Check this amount'}</h3>${ws.map(w => `<p class="frp amtwarn"><b>${esc(w.name.charAt(0).toUpperCase() + w.name.slice(1))}:</b> ${esc(w.msg)}${w.fix ? ` Suggested: <b>${esc(w.fix)}</b>.` : ''}</p>`).join('')}<div class="row"><button class="btn quiet" data-act="mclose">Go back</button><button class="btn" data-act="amtsaveas">Save anyway</button>${fx.length ? `<button class="btn primary" data-act="amtsavefix">Fix and save</button>` : ''}</div></div></div>`;
}
async function saveForm(id){
  const f = form, existing = id ? R(id) : null, old = existing ? D(existing) : {};
  const val = s => (($(s) || {}).value || '').trim();
  const title = val('#f-title');
  if(!title){ f.err = 'Add a recipe title.'; render(); toast(f.err); const tt = $('#f-title'); if(tt) tt.focus(); return; }
  if(!val('#f-ing')){ f.err = 'Add at least one ingredient. Amounts are optional.'; render(); toast(f.err); const ig = $('#f-ing'); if(ig) ig.focus(); return; }
  const ingredients = ingTextToGroups(val('#f-ing'));
  if(f.amtFix){ const fx = f.amtFix; ingredients.forEach(g => { g.items = (g.items || []).map(l => fx[l] || l); }); }
  ingredients.forEach(g => (g.items || []).flatMap(ingParts).forEach(l => logAmt(l)));
  if(!f.amtChecked){ const ws = recipeAmtWarns(old, ingredients); if(ws.length){ showAmtWarns(ws, id); return; } }
  const steps = tidySteps(stepTextToSections(val('#f-steps'), old.steps));
  const link = val('#f-link');
  const data = Object.assign({}, old, {
    title, short: title.length > 22 ? title.slice(0, 20).trim() + '…' : title,
    yield: val('#f-yield'), prep: val('#f-prep'), cook: val('#f-cook'), total: val('#f-total'),
    ingredients, steps, notes: val('#f-notes').split('\n').map(s => s.trim()).filter(Boolean),
    links: /^https?:\/\//i.test(link) ? [{label:'Original recipe', url:link}].concat((old.links || []).filter(l => l.url !== link && l.label !== 'Original recipe')) : (old.links || []).filter(l => l.label !== 'Original recipe'),
    color: old.color || PALETTE[recipes.length % PALETTE.length]
  });
  data.art = guessArt(title);
  if((f.photoBlob || (!f.removePhoto && old.photo)) && f.photoPos && (f.photoPos.x !== 50 || f.photoPos.y !== 50 || f.photoPos.z !== 1)) data.photoPos = {x: Math.round(f.photoPos.x), y: Math.round(f.photoPos.y), z: Math.round(f.photoPos.z * 100) / 100}; else delete data.photoPos;
  const addList = ($('#f-addlist') || {}).checked;
  f.busy = true; f.err = ''; render();
  try{
    let recId = id;
    if(!id){
      const {data: row, error} = await sb.from('recipes').insert({user_id: user.id, sort: Date.now(), data}).select('id, sort, data').single();
      if(error) throw error; recId = row.id; recipes.push(row);
    }
    let oldPath = null;
    if(f.photoBlob){ const up = await uploadPhoto(recId, f.photoBlob); oldPath = old.photoPath; data.photo = up.url; data.photoPath = up.path; data.photoMine = true; }
    else if(f.removePhoto){ oldPath = old.photoPath; delete data.photo; delete data.photoPath; }
    if(id || f.photoBlob){
      const {error} = await sb.from('recipes').update({data}).eq('id', recId); if(error) throw error;
      const row = R(recId); if(row) row.data = data;
    }
    if(oldPath) sb.storage.from('photos').remove([oldPath]).catch(() => {});
    if(!id) mutate(k => { k.progress.active[recId] = false; });
    if(addList) mutate(k => { addIngredientsTo(k, recId, ingredients); k.progress.active[recId] = true; if(k.progress.done) delete k.progress.done[recId]; });
    if(f.photoUrl) URL.revokeObjectURL(f.photoUrl);
    const toShop = !id && shopAdd && addList; shopAdd = false;
    form = null; toast(toShop ? `Saved to your recipe box and added ${ingLines(data).length} ingredients to your list` : id ? 'Saved changes' : 'Saved! Tap Shop for ingredients when you\'re ready.');
    location.hash = toShop ? 'shopping' : 'r-' + recId; loadRecipes();
  }catch(e){
    console.error(e); f.busy = false; f.err = "Couldn't save: " + ((e && e.message) || 'check your connection and try again.'); render();
  }
}
async function addStarters(){
  try{
    setStatus('busy', 'Adding…');
    const rows = STARTERS.filter(d => d.art === 'pie').map((d, i) => ({user_id: user.id, sort: Date.now() + i, data: d}));
    const {data, error} = await sb.from('recipes').insert(rows).select('id, sort, data');
    if(error) throw error;
    recipes = recipes.concat(data);
    mutate(k => data.forEach(row => { k.progress.active[row.id] = false; }));
    toast('Added Blueberry Pie'); if(data[0]) location.hash = 'r-' + data[0].id; else render();
  }catch(e){ console.error(e); toast("Couldn't add them. Try again."); setStatus('err', 'Not saved'); }
}
let pendingDel = null;
function deleteRecipe(id){
  const r = R(id); if(!r) return;
  if(pendingDel) commitDelete();
  const at = recipes.indexOf(r);
  recipes = recipes.filter(x => x.id !== id);
  pendingDel = {r, at, t: setTimeout(commitDelete, 4000)};
  if(location.hash !== '#recipes') location.hash = 'recipes'; else render();
  toast('Recipe removed', () => {
    if(!pendingDel || pendingDel.r.id !== id) return;
    clearTimeout(pendingDel.t); pendingDel = null;
    if(!R(id)) recipes.splice(Math.min(at, recipes.length), 0, r);
    render(); toast('Recipe restored');
  });
}
async function commitDelete(){
  const p = pendingDel; if(!p) return; pendingDel = null; clearTimeout(p.t);
  const {r} = p, id = r.id;
  try{
    const {error} = await sb.from('recipes').delete().eq('id', id); if(error) throw error;
    if(D(r).photoPath) sb.storage.from('photos').remove([D(r).photoPath]).catch(() => {});
    mutate(k => removeRecipeFrom(k, id));
  }catch(e){ if(!R(id)) recipes.splice(Math.min(p.at, recipes.length), 0, r); render(); toast("Couldn't remove it. Try again."); }
}
const notPending = list => pendingDel ? list.filter(x => x.id !== pendingDel.r.id) : list;
addEventListener('pagehide', () => { if(pendingDel) commitDelete(); });

/* ---------------- account ---------------- */
async function deleteAccount(){
  try{
    setStatus('busy', 'Deleting…');
    queue = []; clearTimeout(flushT);
    const {data: files} = await sb.storage.from('photos').list(user.id, {limit: 1000});
    if(files && files.length) await sb.storage.from('photos').remove(files.map(f => user.id + '/' + f.name));
    const {error} = await sb.rpc('delete_my_account');
    if(error) throw error;
    delOpen = false;
    await sb.auth.signOut();
    location.hash = '';
    authView = {mode:'signin', msg:'Your account and all your data have been deleted.', err:'', busy:false};
    render();
  }catch(e){
    console.error(e); setStatus('err', 'Not deleted');
    toast("Couldn't delete your account. Try again in a minute.");
    const b = document.querySelector('[data-act="delconfirm"]'); if(b) b.disabled = false;
  }
}
let menuOpen = false, delOpen = false, photoBusy = null;
function aisleOrder(){ return [...new Set(kitchen.shopping.sections.concat(allItems().map(i => i.section || 'Other')))]; }
function drawAisles(focus){
  const o = aisleOrder(), f = typeof focus === 'string' ? o.indexOf(focus) : focus;
  const grip = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';
  $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card aisles" data-stop><h3>Aisle order</h3><p class="muted anote">Drag aisles to match the way you walk through your store.</p>
    <ol class="alist">${o.map((s, i) => `<li class="${i === f ? 'moved' : ''}" data-s="${esc(s)}"><button class="agrip" type="button" data-i="${i}" aria-label="Move ${esc(s)}. Use the up and down arrow keys.">${grip}</button><span>${esc(s)}</span></li>`).join('')}</ol>
    <div class="row"><button class="btn primary" data-act="mclose">Done</button></div></div></div>`;
  const m = f >= 0 && document.querySelectorAll('.alist li')[f]; if(m) m.scrollIntoView({block: 'nearest'});
}
/* drag aisles in the Aisle order panel */
{ let ad = null;
  const save = (s) => { const o = [...document.querySelectorAll('.alist li')].map(x => x.dataset.s); if(o.join('\n') !== aisleOrder().join('\n')) mutate(k => { k.shopping.sections = o.slice(); }); drawAisles(s); };
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest('.agrip'); if(!g || e.button > 0) return;
    const li = g.closest('li'); e.preventDefault(); try{ g.setPointerCapture(e.pointerId); }catch(_){}
    ad = {li, list: li.parentElement, g}; li.classList.add('lifting');
  });
  document.addEventListener('pointermove', e => {
    if(!ad) return; e.preventDefault();
    const {li, list} = ad, sibs = [...list.children].filter(x => x !== li);
    const after = sibs.find(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if(after){ if(li.nextElementSibling !== after) list.insertBefore(li, after); } else if(list.lastElementChild !== li) list.appendChild(li);
    const r = list.getBoundingClientRect(); if(e.clientY < r.top + 30) list.scrollTop -= 8; else if(e.clientY > r.bottom - 30) list.scrollTop += 8;
  }, {passive: false});
  const end = () => { if(!ad) return; const {li} = ad; ad = null; li.classList.remove('lifting'); save(li.dataset.s); };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('touchstart', e => { if(e.target.closest && e.target.closest('.agrip')) e.preventDefault(); }, {passive: false});
  document.addEventListener('touchmove', e => { if(ad) e.preventDefault(); }, {passive: false});
  document.addEventListener('keydown', e => {
    const g = e.target.closest && e.target.closest('.agrip'); if(!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault(); const li = g.closest('li'), list = li.parentElement;
    if(e.key === 'ArrowUp' && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
    else if(e.key === 'ArrowDown' && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
    else return;
    const s = li.dataset.s; save(s); const n = [...document.querySelectorAll('.alist li')].find(x => x.dataset.s === s); if(n) n.querySelector('.agrip').focus();
  });
}
/* drag a recipe chip into Past trips */
let drag = null, ghost = null, dragJustEnded = false;
document.addEventListener('pointerdown', e => {
  const c = e.target.closest('[data-drag]'); if(!c || e.button > 0) return;
  drag = {el: c, id: c.dataset.id, x: e.clientX, y: e.clientY, on: false};
});
document.addEventListener('pointermove', e => {
  if(!drag) return;
  if(!drag.on){
    if(Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    drag.on = true; ghost = drag.el.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost); document.body.classList.add('dragging');
  }
  e.preventDefault();
  ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
  const t = document.elementFromPoint(e.clientX, e.clientY), d = $('#tripDrop');
  if(d) d.classList.toggle('over', !!(t && t.closest('#tripDrop')));
}, {passive: false});
function endDrag(e, cancel){
  if(!drag) return;
  const was = drag; drag = null;
  if(!was.on) return;
  dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, 350);
  const t = cancel ? null : document.elementFromPoint(e.clientX, e.clientY);
  const hit = !!(t && t.closest('#tripDrop'));
  if(ghost){ ghost.remove(); ghost = null; } document.body.classList.remove('dragging');
  const d = $('#tripDrop'); if(d) d.classList.remove('over');
  if(hit) finishRecipeTrip(was.id);
}
document.addEventListener('pointerup', e => endDrag(e, false));
document.addEventListener('pointercancel', e => endDrag(e, true));
function finishRecipeTrip(id){
  const r = R(id); if(!r) return;
  const name = D(r).short || D(r).title, at = new Date().toISOString();
  const snap = JSON.stringify({s: kitchen.shopping, p: kitchen.progress});
  mutate(k => {
    const marks = k.progress.shop = k.progress.shop || {};
    const its = k.shopping.items.filter(i => (i.recipes || []).includes(id));
    const t = k.progress.trips = k.progress.trips || [];
    if(!(t[0] && t[0].at === at)){ t.unshift({at, rid: id, r: [name], items: its.map(i => ({id: i.id, n: i.name, q: qtyFromRecipes(Object.assign({}, i, {recipes: [id]})) || i.qty || '', s: marks[i.id] === 'bought' || marks[i.id] === 'have' ? marks[i.id] : 'skip'}))}); if(t.length > 60) t.length = 60; }
    its.forEach(i => { if((i.recipes || []).length === 1) delete marks[i.id]; else { i.recipes = i.recipes.filter(x => x !== id); fixItem(i); } });
    k.progress.active[id] = false;
    (k.progress.done = k.progress.done || {})[id] = true;
  });
  toast(name + ' moved to Past trips', () => {
    mutate(k => { const o = JSON.parse(snap); k.shopping = o.s; k.progress = o.p; }); toast('Undone. ' + name + ' is back on your list.'); });
}
function newTrip(){
  const at = new Date().toISOString(), live = recipes.filter(r => isActive(r.id) && !(P().done || {})[r.id]), liveIds = live.map(r => r.id);
  const snap = JSON.stringify({s: kitchen.shopping, p: kitchen.progress});
  mutate(k => {
    const marks = k.progress.shop = k.progress.shop || {}; k.progress.logged = {};
    const own = i => (i.recipes || []).some(x => R(x));
    const vis = k.shopping.items.filter(i => !(i.recipes || []).length || (i.recipes || []).some(x => liveIds.includes(x)) || (i.custom && !own(i)));
    const loose = vis.filter(i => !own(i)), used = live.filter(r => vis.some(i => (i.recipes || []).includes(r.id)));
    const t = k.progress.trips = k.progress.trips || [];
    if(vis.length && !(t[0] && t[0].at === at)){
      t.unshift({at, rids: used.map(r => r.id), r: used.map(r => D(r).short || D(r).title), items: vis.map(i => Object.assign({id: i.id, n: i.name, q: i.qty || '', s: marks[i.id] === 'bought' || marks[i.id] === 'have' ? marks[i.id] : 'skip'}, loose.includes(i) ? {c: 1, sec: i.section || 'Other'} : {}))});
      if(t.length > 60) t.length = 60;
    }
    used.forEach(({id}) => { k.progress.active[id] = false; (k.progress.done = k.progress.done || {})[id] = true; });
    vis.forEach(i => { delete marks[i.id]; });
    k.shopping.items = k.shopping.items.filter(i => !loose.includes(i));
  });
  toast('Trip saved. Your list is cleared.', () => {
    mutate(k => { const o = JSON.parse(snap); k.shopping = o.s; k.progress = o.p; }); toast('Undone. Your list is back.'); });
}
/* enter-kitchen gate */
let gate = 'gate';
try{ if(sessionStorage.getItem('mb-in')) gate = 'in'; }catch(e){}
const KITCHEN_ART = `<svg class="kart" aria-hidden="true" viewBox="0 0 200 160"><rect width="200" height="160" rx="22" fill="#FBF6EC"/><g fill="#141414"><rect x="0" y="148" width="6" height="6"/><rect x="6" y="154" width="6" height="6"/><rect x="12" y="148" width="6" height="6"/><rect x="18" y="154" width="6" height="6"/><rect x="24" y="148" width="6" height="6"/><rect x="30" y="154" width="6" height="6"/><rect x="36" y="148" width="6" height="6"/><rect x="42" y="154" width="6" height="6"/><rect x="48" y="148" width="6" height="6"/><rect x="54" y="154" width="6" height="6"/><rect x="60" y="148" width="6" height="6"/><rect x="66" y="154" width="6" height="6"/><rect x="72" y="148" width="6" height="6"/><rect x="78" y="154" width="6" height="6"/><rect x="84" y="148" width="6" height="6"/><rect x="90" y="154" width="6" height="6"/><rect x="96" y="148" width="6" height="6"/><rect x="102" y="154" width="6" height="6"/><rect x="108" y="148" width="6" height="6"/><rect x="114" y="154" width="6" height="6"/><rect x="120" y="148" width="6" height="6"/><rect x="126" y="154" width="6" height="6"/><rect x="132" y="148" width="6" height="6"/><rect x="138" y="154" width="6" height="6"/><rect x="144" y="148" width="6" height="6"/><rect x="150" y="154" width="6" height="6"/><rect x="156" y="148" width="6" height="6"/><rect x="162" y="154" width="6" height="6"/><rect x="168" y="148" width="6" height="6"/><rect x="174" y="154" width="6" height="6"/><rect x="180" y="148" width="6" height="6"/><rect x="186" y="154" width="6" height="6"/><rect x="192" y="148" width="6" height="6"/><rect x="198" y="154" width="6" height="6"/></g><rect x="26" y="32" width="148" height="116" fill="#fff" stroke="#141414" stroke-width="3.5"/><rect x="18" y="20" width="164" height="14" rx="4" fill="#141414"/><rect x="20.0" y="38" width="17.8" height="22" fill="#D7263D"/><rect x="37.8" y="38" width="17.8" height="22" fill="#fff"/><rect x="55.6" y="38" width="17.8" height="22" fill="#D7263D"/><rect x="73.3" y="38" width="17.8" height="22" fill="#fff"/><rect x="91.1" y="38" width="17.8" height="22" fill="#D7263D"/><rect x="108.9" y="38" width="17.8" height="22" fill="#fff"/><rect x="126.7" y="38" width="17.8" height="22" fill="#D7263D"/><rect x="144.4" y="38" width="17.8" height="22" fill="#fff"/><rect x="162.2" y="38" width="17.8" height="22" fill="#D7263D"/><circle cx="28.9" cy="60" r="8.9" fill="#D7263D" stroke="#141414" stroke-width="2.6"/><circle cx="46.7" cy="60" r="8.9" fill="#fff" stroke="#141414" stroke-width="2.6"/><circle cx="64.4" cy="60" r="8.9" fill="#D7263D" stroke="#141414" stroke-width="2.6"/><circle cx="82.2" cy="60" r="8.9" fill="#fff" stroke="#141414" stroke-width="2.6"/><circle cx="100.0" cy="60" r="8.9" fill="#D7263D" stroke="#141414" stroke-width="2.6"/><circle cx="117.8" cy="60" r="8.9" fill="#fff" stroke="#141414" stroke-width="2.6"/><circle cx="135.6" cy="60" r="8.9" fill="#D7263D" stroke="#141414" stroke-width="2.6"/><circle cx="153.3" cy="60" r="8.9" fill="#fff" stroke="#141414" stroke-width="2.6"/><circle cx="171.1" cy="60" r="8.9" fill="#D7263D" stroke="#141414" stroke-width="2.6"/><rect x="18" y="35" width="164" height="5" rx="2" fill="#141414"/><rect x="36" y="82" width="90" height="40" rx="3" fill="#DDEFF5" stroke="#141414" stroke-width="2.8"/><rect x="47" y="106" width="12" height="5" rx="2.5" fill="#D7263D" stroke="#141414" stroke-width="1.8"/><path d="M53 111v11" stroke="#141414" stroke-width="2"/><rect x="73" y="106" width="12" height="5" rx="2.5" fill="#D7263D" stroke="#141414" stroke-width="1.8"/><path d="M79 111v11" stroke="#141414" stroke-width="2"/><rect x="99" y="106" width="12" height="5" rx="2.5" fill="#D7263D" stroke="#141414" stroke-width="1.8"/><path d="M105 111v11" stroke="#141414" stroke-width="2"/><path d="M36 102h90" stroke="#141414" stroke-width="3"/><path d="M44 94 l12-10" stroke="#fff" stroke-width="3" stroke-linecap="round"/><rect x="136" y="82" width="28" height="66" rx="3" fill="#D7263D" stroke="#141414" stroke-width="3"/><circle cx="150.0" cy="96" r="7" fill="#DDEFF5" stroke="#141414" stroke-width="2.5"/><circle cx="158" cy="122" r="2.2" fill="#141414"/><rect x="26" y="126" width="110" height="22" fill="#D7263D" stroke="#141414" stroke-width="3"/><path d="M26 134h110" stroke="#fff" stroke-width="2.5"/><path d="M24 148h152" stroke="#141414" stroke-width="3"/></svg>`;
const POT_ART = `<svg class="pot" viewBox="0 0 160 140" aria-hidden="true">
  <g class="spoon"><path d="M80 66 L112 8" stroke="#141414" stroke-width="9" stroke-linecap="round"/><path d="M80 66 L112 8" stroke="#C98B4E" stroke-width="5" stroke-linecap="round"/><ellipse cx="78" cy="72" rx="7" ry="11" fill="#C98B4E" stroke="#141414" stroke-width="3" transform="rotate(29 78 72)"/></g>
  <g class="drops"><g transform="translate(40 -4)"><g class="pat"><rect x="0" y="0" width="26" height="16" rx="3" fill="#F7D774" stroke="#141414" stroke-width="3"/><rect x="2" y="2" width="22" height="5" rx="2" fill="#FFF3C4"/></g></g><g transform="translate(92 -10)"><g class="pat two"><rect x="0" y="0" width="26" height="16" rx="3" fill="#F7D774" stroke="#141414" stroke-width="3"/><rect x="2" y="2" width="22" height="5" rx="2" fill="#FFF3C4"/></g></g></g>
  <path class="batter" d="M22 60 C34 44 52 40 66 46 C78 51 86 41 100 42 C116 43 128 50 138 60 Z" fill="#F4C9A6" stroke="#141414" stroke-width="3" stroke-linejoin="round"/>
  <path d="M18 62h124c0 34-27 58-62 58S18 96 18 62z" fill="#D7263D" stroke="#141414" stroke-width="4" stroke-linejoin="round"/>
  <rect x="12" y="56" width="136" height="12" rx="6" fill="#fff" stroke="#141414" stroke-width="4"/>
  <rect x="58" y="118" width="44" height="10" rx="5" fill="#D7263D" stroke="#141414" stroke-width="4"/>
  <path d="M34 78c2 10 8 19 16 25" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>
</svg>`;
const AUTH_ART = `<svg viewBox="0 0 400 170" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="170" fill="#FBF6EC"/><rect x="0" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="28" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="56" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="84" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="112" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="140" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="168" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="196" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="224" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="252" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="280" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="308" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="336" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="364" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="392" y="0" width="14" height="170" fill="#D7263D" opacity="0.09"/><rect x="0" y="0" width="400" height="14" fill="#D7263D" opacity="0.09"/><rect x="0" y="28" width="400" height="14" fill="#D7263D" opacity="0.09"/><rect x="0" y="56" width="400" height="14" fill="#D7263D" opacity="0.09"/><rect x="0" y="84" width="400" height="14" fill="#D7263D" opacity="0.09"/><rect x="0" y="112" width="400" height="14" fill="#D7263D" opacity="0.09"/><rect x="0" y="140" width="400" height="14" fill="#D7263D" opacity="0.09"/><rect x="0" y="168" width="400" height="14" fill="#D7263D" opacity="0.09"/><ellipse cx="200" cy="150" rx="92" ry="9" fill="#141414" opacity=".12"/><svg x="130" y="14" width="140" height="122.5" viewBox="0 0 160 140">
  <g class="spoon"><path d="M80 66 L112 8" stroke="#141414" stroke-width="9" stroke-linecap="round"/><path d="M80 66 L112 8" stroke="#C98B4E" stroke-width="5" stroke-linecap="round"/><ellipse cx="78" cy="72" rx="7" ry="11" fill="#C98B4E" stroke="#141414" stroke-width="3" transform="rotate(29 78 72)"/></g>
  <path class="batter" d="M22 60 C34 44 52 40 66 46 C78 51 86 41 100 42 C116 43 128 50 138 60 Z" fill="#F4C9A6" stroke="#141414" stroke-width="3" stroke-linejoin="round"/>
  <path d="M18 62h124c0 34-27 58-62 58S18 96 18 62z" fill="#D7263D" stroke="#141414" stroke-width="4" stroke-linejoin="round"/>
  <rect x="12" y="56" width="136" height="12" rx="6" fill="#fff" stroke="#141414" stroke-width="4"/>
  <rect x="58" y="118" width="44" height="10" rx="5" fill="#D7263D" stroke="#141414" stroke-width="4"/>
  <path d="M34 78c2 10 8 19 16 25" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>
</svg><g><g transform="translate(70 48) rotate(-18) scale(1)"><rect x="-13" y="-8" width="26" height="16" rx="3" fill="#F7D774" stroke="#141414" stroke-width="3"/><rect x="-11" y="-6" width="22" height="5" rx="2" fill="#FFF3C4"/></g><g transform="translate(332 58) rotate(14) scale(0.85)"><rect x="-13" y="-8" width="26" height="16" rx="3" fill="#F7D774" stroke="#141414" stroke-width="3"/><rect x="-11" y="-6" width="22" height="5" rx="2" fill="#FFF3C4"/></g><g transform="translate(300 124) rotate(-8) scale(0.7)"><rect x="-13" y="-8" width="26" height="16" rx="3" fill="#F7D774" stroke="#141414" stroke-width="3"/><rect x="-11" y="-6" width="22" height="5" rx="2" fill="#FFF3C4"/></g></g></svg>`;
function renderGate(){
  if(gate === 'loading') return `<div class="gate"><div class="loader" aria-label="Loading">${POT_ART.replace('viewBox="0 0 160 140"', 'viewBox="0 -50 160 190"')}
    <div class="ltext">Loading<span class="dots"><i>.</i><i>.</i><i>.</i></span></div></div></div>`;
  return `<div class="gate"><div class="gatecard">${KITCHEN_ART}
    <button class="btn primary big" data-act="enter">Enter your kitchen</button></div></div>`;
}
// Signing in (or opening the site in a new tab) shows the butter pats loading screen first, for at least 1.6 seconds
let autoDone = false;
function autoEnter(){
  autoDone = true; gate = 'loading'; render();
  const t0 = Date.now();
  const go = () => { if(!user) return; if(!loaded) return setTimeout(go, 150); setTimeout(() => {
    if(!user || gate !== 'loading') return;
    if(firstVisit()){ gate = 'gate'; render(); return; }
    gate = 'in'; try{ sessionStorage.setItem('mb-in', '1'); }catch(e){}
    render(); app.classList.add('fadein'); setTimeout(() => app.classList.remove('fadein'), 700);
  }, Math.max(0, 1600 - (Date.now() - t0))); };
  go();
}
const firstVisit = () => !P().entered && !recipes.length && !allItems().length && !P().tourDone;
function enterKitchen(){
  gate = 'loading'; render();
  const t0 = Date.now();
  const go = () => { if(!loaded) return setTimeout(go, 150); setTimeout(() => {
    gate = 'in'; try{ sessionStorage.setItem('mb-in', '1'); }catch(e){}
    mutate(k => { k.progress.entered = true; }, true);
    render(); app.classList.add('fadein'); setTimeout(() => app.classList.remove('fadein'), 700);
  }, Math.max(0, 1600 - (Date.now() - t0))); };
  go();
}
let isAdmin = false, adminData = null, adminBusy = false, adminUsage = null, adminFr = null, adminErr = null, admSort = 'new', admQ = '';
// Admin sections fold up (Nov 20, 2026). Errors opens on its own when there are new ones.
let admOpen = (() => { try{ return JSON.parse(localStorage.getItem('bm-admopen') || '{}'); }catch(e){ return {}; } })();
const admTop = (key, title, def, force) => `<details class="card panel admbox ${key}" data-adm="${key}"${force || (admOpen[key] ?? def) ? ' open' : ''}><summary><h3>${title}</h3>${ICON_CHEV}</summary><div class="admb">`;
// New errors are highlighted until Hayley opens them, or taps Mark all read. What she's read is saved to her account, so it carries across devices.
const errKey = x => String(x.id ?? (x.at + '|' + x.msg));
// Saving what's read redraws the page, so keep open errors open and the list where it was scrolled.
const errOpenK = new Set(); let errScroll = 0;
const errNew = x => new Date(x.at).getTime() > (P().errSeenAt || 0) && !(P().errSeen || {})[errKey(x)];
function renderErrors(){
  const e = adminErr, nn = Array.isArray(e) ? e.filter(errNew).length : 0;
  const head = n => admTop('errs', `Errors${n !== '' ? ` <small>${n}</small>` : ''}<span class="newpill"${nn ? '' : ' hidden'}>${nn} new</span>`, false, nn > 0);
  if(!e) return head('') + `<div class="muted">Checking…</div></div></details>`;
  if(e.err) return head('') + `<div class="muted">Couldn't load the error log right now.</div></div></details>`;
  if(!e.length) return head(0) + `<div class="muted">No errors logged yet.</div></div></details>`;
  const dev = ua => { ua = ua || ''; const d = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other'; const b = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : ''; return d + (b ? ' · ' + b : ''); };
  const when = t => new Date(t).toLocaleString(undefined, {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
  const lbl = {shown:'Shown to member', error:'Error', crash:'Crash', amount:'Amount not understood'};
  queueMicrotask(() => { const l = document.querySelector('.errlist'); if(l) l.scrollTop = errScroll; });
  return head(e.length) + `<div class="errtop"><p class="muted errnote">The last 50 problems members ran into, newest first. New ones are highlighted until you open them.</p><button class="btn sm" data-act="errall"${nn ? '' : ' hidden'}>Mark all read</button></div><div class="errlist">${e.map(x => `<details class="errrow${errNew(x) ? ' new' : ''}" data-ek="${esc(errKey(x))}"${errOpenK.has(errKey(x)) ? ' open' : ''}><summary><b><i class="edot" aria-hidden="true"></i>${esc(x.msg)}</b><small>${errNew(x) ? '<span class="vh">New. </span>' : ''}${esc(when(x.at))} · ${esc(x.who || 'Signed out')} · ${esc(dev(x.ua))} · ${esc(lbl[x.kind] || x.kind || '')}</small></summary><div class="errd"><div>Page: ${esc(x.page || '—')}${x.ver ? ' · version ' + esc(x.ver) : ''}</div>${x.detail ? `<pre>${esc(x.detail)}</pre>` : ''}</div></details>`).join('')}</div></div></details>`;
}
function errRead(key){
  const keep = new Set((Array.isArray(adminErr) ? adminErr : []).map(errKey));
  mutate(k => { const s = {}; Object.keys(k.progress.errSeen || {}).forEach(x => { if(keep.has(x)) s[x] = 1; }); s[key] = 1; k.progress.errSeen = s; }, true);
  errPill();
}
function errPill(){
  const nn = Array.isArray(adminErr) ? adminErr.filter(errNew).length : 0;
  document.querySelectorAll('.errrow.new').forEach(r => { if(!errNew((adminErr || []).find(x => errKey(x) === r.dataset.ek) || {at: 0})){ r.classList.remove('new'); r.querySelector('.vh')?.remove(); } });
  const p = document.querySelector('.errs .newpill'); if(p){ p.textContent = nn + ' new'; p.hidden = !nn; }
  const b = document.querySelector('[data-act="errall"]'); if(b) b.hidden = !nn;
}
document.addEventListener('toggle', ev => { const d = ev.target; if(!(d instanceof HTMLDetailsElement)) return;
  if(d.classList.contains('errrow')){ if(d.open) errOpenK.add(d.dataset.ek); else errOpenK.delete(d.dataset.ek); }
  if(d.open && d.classList.contains('errrow') && d.classList.contains('new')) errRead(d.dataset.ek);
}, true);
document.addEventListener('scroll', ev => { if(ev.target.classList && ev.target.classList.contains('errlist')) errScroll = ev.target.scrollTop; }, true);
// Only Hayley's own taps are remembered, so Errors still opens on its own the next time something new comes in.
document.addEventListener('click', ev => { const sm = ev.target.closest && ev.target.closest('.admbox>summary'); if(!sm) return; const d = sm.parentElement;
  admOpen[d.dataset.adm] = !d.open; try{ localStorage.setItem('bm-admopen', JSON.stringify(admOpen)); }catch(e){} }, true);
function renderAdmin(){
  const back = `${backBtn()}<h2 class="ptitle">Admin</h2>`;
  if(!isAdmin) return back + `<div class="card empty">This page is only for the site administrator.</div>`;
  if(!adminData && !adminBusy){
    adminBusy = true;
    sb.rpc('admin_users').then(({data, error}) => { adminBusy = false; adminData = error ? {err: true} : (data || []); render(); });
    sb.rpc('admin_errors').then(({data, error}) => { adminErr = error ? {err: true} : (data || []); render(); }, () => { adminErr = {err: true}; render(); });
    sb.rpc('admin_usage').then(({data, error}) => { adminUsage = error ? {err: true} : data; render(); }, () => {});
    sb.rpc('admin_friend_counts').then(({data, error}) => { adminFr = {}; if(!error) (data || []).forEach(f => { adminFr[String(f.email || '').toLowerCase()] = f; }); render(); }, () => {});
  }
  if(!adminData) return back + `<div class="card empty">Loading…</div>`;
  if(adminData.err) return back + `<div class="card empty">Couldn't load members.</div>`;
  const fmtD = t => t ? new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : '—';
  const fr = u => (adminFr || {})[String(u.email || '').toLowerCase()];
  const nm = u => String(u.name || u.email || '').toLowerCase();
  const sorts = {new: (a, b) => new Date(b.created_at) - new Date(a.created_at), old: (a, b) => new Date(a.created_at) - new Date(b.created_at), az: (a, b) => nm(a).localeCompare(nm(b)), active: (a, b) => new Date(b.last_sign_in_at || 0) - new Date(a.last_sign_in_at || 0), friends: (a, b) => ((fr(b) || {}).friends || 0) - ((fr(a) || {}).friends || 0) || nm(a).localeCompare(nm(b))};
  const list = adminData.slice().sort(sorts[admSort] || sorts.new);
  setTimeout(() => { const s = document.querySelector('.ascroll'); if(!s) return; const r = [...s.querySelectorAll('.arow')].find(x => x.offsetHeight); if(r && adminData.length > 5) s.style.maxHeight = r.offsetHeight * 5 + 'px'; });
  const using = adminFr ? adminData.filter(u => (fr(u) || {}).friends > 0).length : null;
  const q = admQ.trim().toLowerCase();
  const friendLine = u => { const f = fr(u); if(!adminFr) return ''; if(!f) return ' · 0 friends';
    return ` · ${f.friends} friend${f.friends == 1 ? '' : 's'}${f.pending ? ` (${f.pending} waiting)` : ''}${f.shared ? ` · ${f.shared} recipe${f.shared == 1 ? '' : 's'} sent` : ''}`; };
  return back + renderHealth() + renderErrors() + admTop('members', `Members <small>${adminData.length}</small>`, true) + `
    ${using !== null ? `<div class="muted afr">${using} of ${adminData.length} member${adminData.length === 1 ? ' has' : 's have'} at least one friend.</div>` : ''}
    <div class="atools"><input class="tin" id="adm-q" data-keep type="search" placeholder="Search members" value="${esc(admQ)}" autocomplete="off" aria-label="Search members">
    <select class="tin" id="adm-sort" aria-label="Sort members">${[['new', 'Newest joined'], ['old', 'Oldest joined'], ['az', 'A–Z'], ['active', 'Last signed in'], ['friends', 'Most friends']].map(([k, l]) => `<option value="${k}"${admSort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="atable ascroll">${list.map(u => { const s = (String(u.name || '') + ' ' + String(u.email || '')).toLowerCase(); return `<div class="arow amem" data-s="${esc(s)}"${q && !s.includes(q) ? ' hidden' : ''}><div class="amtop"><b>${esc(u.name || '—')}</b><span class="muted">${esc(u.email)}</span></div><div class="muted">Joined ${fmtD(u.created_at)} · Last in ${fmtD(u.last_sign_in_at)}</div><div class="muted">${u.recipes} recipe${u.recipes == 1 ? '' : 's'}${friendLine(u)}</div></div>`; }).join('')}
    <div class="muted anone"${q && !list.some(u => (String(u.name || '') + ' ' + String(u.email || '')).toLowerCase().includes(q)) ? '' : ' hidden'}>No members match.</div></div></div></details>`;
}
function renderHealth(){
  const u = adminUsage;
  if(!u) return admTop('health', 'Site health', true) + `<div class="muted">Checking…</div></div></details>`;
  if(u.err) return admTop('health', 'Site health', true) + `<div class="muted">Couldn't check usage right now.</div></div></details>`;
  const MB = 1024 * 1024, mb = b => (b / MB < 10 ? (b / MB).toFixed(1) : Math.round(b / MB)) + ' MB';
  const rows = [
    ['Recipes & lists', u.db_bytes, 500 * MB, mb(u.db_bytes) + ' of 500 MB'],
    ['Photos', u.storage_bytes, 1024 * MB, mb(u.storage_bytes) + ' of 1 GB'],
    ['Members', u.users, 50000, u.users.toLocaleString() + ' of 50,000'],
  ];
  const days = u.last_active ? Math.floor((Date.now() - new Date(u.last_active)) / 864e5) : null;
  const worst = Math.max(...rows.map(r => r[1] / r[2]));
  const warn = worst >= .8 ? `<div class="hwarn red">Something is close to the free limit. Time to clean up or upgrade Supabase.</div>` : worst >= .6 ? `<div class="hwarn">Getting fuller. Keep an eye on it.</div>` : `<div class="hok">✓ Everything's well within the free limits.</div>`;
  return admTop('health', 'Site health', true) + `${warn}
    ${rows.map(([n, v, max, label]) => { const p = Math.min(100, v / max * 100); return `<div class="hrow"><div class="hlbl"><span>${n}</span><span class="muted">${label}</span></div><div class="hbar ${p >= 80 ? 'red' : p >= 60 ? 'amber' : ''}"><i style="width:${Math.max(p, 1.5)}%"></i></div></div>`; }).join('')}
    <div class="muted" style="font-size:14px;margin-top:6px">Last sign-in: ${days === null ? '—' : days === 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's') + ' ago'}. Supabase pauses free sites after 7 quiet days.</div>
    ${(() => { const lb = P().lastBackup, bd = lb ? Math.floor((Date.now() - lb) / 864e5) : null, late = bd === null || bd > 14; return `<div class="hbk${late ? ' late' : ''}">Last backup: ${bd === null ? 'none recorded yet' : (bd === 0 ? 'today' : bd === 1 ? 'yesterday' : bd + ' days ago') + ' (' + new Date(lb).toLocaleDateString(undefined, {month: 'long', day: 'numeric'}) + ')'}${bd !== null && bd > 14 ? '. Overdue. Download a new one.' : bd === null ? '. Download one now.' : ''}</div>`; })()}
    <div class="row" style="margin-top:12px"><button class="btn" data-act="backup"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>Download backup</button><label class="btn" id="f-restorelbl"><input type="file" id="f-restore" accept=".zip,.json,application/zip,application/json" hidden><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>Restore from backup</label></div>
    <div class="muted" style="font-size:12px;margin-top:6px">Saves every member's recipes, lists, progress, photos, and friend connections to one zip file. Aim for one every two weeks. Restore adds anything missing from a backup. It never overwrites or deletes.</div></div></details>`;
}
const CRCT = (() => { const t = new Uint32Array(256); for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for(let i = 0; i < u.length; i++) c = CRCT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files){
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const hdr = (sig, n) => { const b = new DataView(new ArrayBuffer(n)); b.setUint32(0, sig, true); return b; };
  files.forEach(f => { const name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const l = hdr(0x04034b50, 30); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint32(14, crc, true); l.setUint32(18, sz, true); l.setUint32(22, sz, true); l.setUint16(26, name.length, true);
    parts.push(new Uint8Array(l.buffer), name, f.data);
    const c = hdr(0x02014b50, 46); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + sz; });
  const csz = central.reduce((a, p) => a + p.length, 0), e = hdr(0x06054b50, 22);
  e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], {type: 'application/zip'});
}
async function downloadBackup(){
  toast('Preparing backup…');
  const {data, error} = await sb.rpc('admin_backup');
  if(error){ console.error(error); toast("Couldn't create the backup"); return; }
  const files = [{name: 'backup.json', data: new TextEncoder().encode(JSON.stringify(data, null, 2))}];
  // Photos of sent recipes that were already saved or dismissed are skipped: nobody sees them again, and the sender may have replaced that photo since.
  // The sent-recipe records themselves stay in backup.json.
  const pics = []; (function walk(o){ if(!o || typeof o !== 'object') return; if(typeof o.photo === 'string' && /^https?:/.test(o.photo)) pics.push({url: o.photo, path: o.photoPath}); Object.values(o).forEach(walk); })(Object.assign({}, data, {recipe_shares: ((data && data.recipe_shares) || []).filter(s => !s.dismissed)}));
  const seen = new Set(); let ok = 0, bad = 0;
  for(const p of pics){ const name = 'photos/' + (p.path || p.url.split('/photos/').pop().split('?')[0]); if(seen.has(name)) continue; seen.add(name);
    toast(`Saving photos… ${ok + bad + 1} of ${pics.length}`);
    try{ const r = await fetch(p.url); if(!r.ok) throw 0; files.push({name, data: new Uint8Array(await r.arrayBuffer())}); ok++; }catch(e){ bad++; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(makeZip(files));
  a.download = 'butter-math-backup-' + new Date().toISOString().slice(0, 10) + '.zip';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`Backup downloaded${ok ? ` with ${ok} photo${ok === 1 ? '' : 's'}` : ''}${bad ? `. ${bad} photo${bad === 1 ? '' : 's'} couldn't be saved.` : ''}`);
  mutate(k => { k.progress.lastBackup = Date.now(); });
}
// ---- Restore from a backup (admin). Adds what is missing; never overwrites or deletes. ----
async function unzip(buf){
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder(), out = [];
  let e = u8.length - 22; while(e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if(e < 0) throw new Error('zip');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  for(let i = 0; i < n; i++){
    if(dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip');
    const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    if(name.endsWith('/')) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    let data = u8.subarray(start, start + csz);
    if(method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else if(method !== 0) throw new Error('zip');
    out.push({name, data});
  }
  return out;
}
let restoreBusy = false;
async function readBackupFile(file){
  if(/\.json$/i.test(file.name)) return {backup: JSON.parse(await file.text()), photos: {}};
  const files = await unzip(await file.arrayBuffer());
  const j = files.find(f => /(^|\/)backup\.json$/.test(f.name)); if(!j) throw new Error('no backup.json');
  const photos = {}; files.forEach(f => { const m = f.name.match(/(?:^|\/)photos\/(.+)$/); if(m) photos[m[1]] = f.data; });
  return {backup: JSON.parse(new TextDecoder().decode(j.data)), photos};
}
async function startRestore(file){
  if(restoreBusy || !file) return; restoreBusy = true;
  try{
    toast('Reading the backup…');
    let bk, photos;
    try{ ({backup: bk, photos} = await readBackupFile(file)); }catch(e){ console.error(e); toast("That doesn't look like a Butter Math backup"); return; }
    const {data: pv, error} = await sb.rpc('admin_restore', {bk, apply: false});
    if(error){ console.error(error); toast(/not a mixing bowl|does not look/i.test(error.message || '') ? "That doesn't look like a Butter Math backup" : "Couldn't read that backup"); return; }
    const a = pv.add, wait = pv.waiting || [];
    const bits = [[a.recipes, 'recipe'], [a.kitchens, 'shopping list', 'shopping lists'], [a.friendships, 'friend connection'], [a.shares, 'shared recipe'], [a.invites, 'invite'], [a.notices, 'save notice']].filter(x => x[0]).map(x => `${x[0]} ${x[0] === 1 ? x[1] : (x[2] || x[1] + 's')}`);
    const waitNote = wait.length ? `<p>${wait.length} ${wait.length === 1 ? 'person has' : 'people have'} no account yet (${wait.map(esc).join(', ')}). Their recipes stay in the backup. Run this again after they sign up.</p>` : '';
    if(!bits.length){ if(wait.length) confirmBox('Nothing to restore yet', `<p>Everything for the people who have accounts is already here.</p>${waitNote}`, 'OK', () => {}, true); else toast('Nothing to restore. Everything in this backup is already here.'); return; }
    const kept = pv.recipes_already_there ? `<p>${pv.recipes_already_there} recipe${pv.recipes_already_there === 1 ? ' is' : 's are'} already here and will be left alone. Nothing is overwritten or deleted.</p>` : '<p>Nothing is overwritten or deleted.</p>';
    const addIds = new Set(pv.recipe_ids || []), owners = [...new Set((bk.recipes || []).filter(r => addIds.has(r.id)).map(r => pv.user_map[r.user_id]))];
    const whoGets = !owners.length ? '' : owners.length === 1 && owners[0] === user.id ? ' Recipes go back into your own account only.' : ` Recipes go back to ${owners.length === 1 ? 'the account they came from' : `the ${owners.length} accounts they came from`}. Nobody else sees them.`;
    const nm = (pv.matched || []).length;
    confirmBox('Restore this backup?', `<p>This will add ${bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] : bits[0]}.${whoGets}</p><p>${nm} member${nm === 1 ? '' : 's'} in the backup ${nm === 1 ? 'was' : 'were'} matched to ${nm === 1 ? 'an account' : 'accounts'} here by email.</p>${kept}${waitNote}`, 'Restore', () => runRestore(bk, photos, pv), true);
  }finally{ restoreBusy = false; }
}
async function runRestore(bk, photos, pv){
  if(restoreBusy) return; restoreBusy = true;
  try{
    const ids = new Set(pv.recipe_ids || []); let up = 0, miss = 0;
    for(const r of bk.recipes || []){
      const oldPath = r && r.data && r.data.photoPath; if(!ids.has(r.id) || !oldPath) continue;
      const bytes = photos[oldPath]; if(!bytes){ miss++; continue; }
      const owner = pv.user_map[r.user_id], path = owner && owner !== r.user_id ? oldPath.split(r.user_id).join(owner) : oldPath;
      const type = /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg';
      toast(`Restoring photos… ${up + miss + 1}`);
      const {error} = await sb.storage.from('photos').upload(path, new Blob([bytes], {type}), {contentType: type, cacheControl: '31536000', upsert: false});
      if(error && !/exist|duplicate/i.test(error.message || '')) miss++; else up++;
    }
    toast('Restoring…');
    const {data, error} = await sb.rpc('admin_restore', {bk, apply: true});
    if(error){ console.error(error); toast("Couldn't finish the restore. Nothing was changed. Try again."); return; }
    await loadAll(true);
    const n = data.add;
    toast(`Restored ${n.recipes} recipe${n.recipes === 1 ? '' : 's'}${up ? ` and ${up} photo${up === 1 ? '' : 's'}` : ''}${miss ? `. ${miss} photo${miss === 1 ? '' : 's'} weren't in the backup` : ''}.`);
  }finally{ restoreBusy = false; }
}
let dlBusy = false;
async function downloadMine(){
  if(dlBusy || !recipes.length) return;
  dlBusy = true; render();
  try{
    const enc = new TextEncoder(), files = [], names = {}, used = new Set(); let ok = 0, bad = 0;
    const list = recipes.map(r => r.data).filter(Boolean).slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    const pics = list.filter(d => typeof d.photo === 'string' && /^https?:/.test(d.photo));
    for(const d of pics){
      toast(`Saving photos… ${ok + bad + 1} of ${pics.length}`);
      try{ const r = await fetch(d.photo); if(!r.ok) throw 0;
        const ext = ((d.photoPath || d.photo).split('?')[0].match(/\.(jpe?g|png|webp|gif|heic)$/i) || [0, 'jpg'])[1].toLowerCase();
        let base = String(d.title || 'recipe').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'recipe', name = `photos/${base}.${ext}`, n = 2;
        while(used.has(name.toLowerCase())) name = `photos/${base} ${n++}.${ext}`;
        used.add(name.toLowerCase()); names[d.photo] = name;
        files.push({name, data: new Uint8Array(await r.arrayBuffer())}); ok++;
      }catch(e){ bad++; } }
    const t = x => esc(prettyFractions(x));
    const one = d => { let n = 0; const srcs = (d.links || []).filter(l => /^https?:\/\//i.test(l.url || ''));
      return `<article>${names[d.photo] ? `<img src="${esc(encodeURI(names[d.photo]))}" alt="">` : ''}<h2>${esc(d.title || 'Untitled recipe')}</h2>
<p class="meta">${[d.yield, d.total || d.cook, d.savedFrom && d.savedFrom.name ? 'Saved from ' + kitchenOf(d.savedFrom.name) : ''].filter(Boolean).map(esc).join(' · ')}</p>
<h3>Ingredients</h3>${(d.ingredients || []).map(g => `${g.group ? `<h4>${esc(g.group)}</h4>` : ''}<ul>${(g.items || []).map(i => `<li>${t(i)}</li>`).join('')}</ul>`).join('')}
<h3>Steps</h3>${(d.steps || []).map(sec => `${sec.section ? `<h4>${esc(sec.section)}</h4>` : ''}<ol start="${n + 1}">${(sec.items || []).map(st => { n++; return `<li>${st.title ? `<b>${esc(st.title)}</b> ` : ''}${t(st.text)}</li>`; }).join('')}</ol>`).join('')}
${d.notes && d.notes.length ? `<h3>Good to know</h3><ul>${d.notes.map(x => `<li>${t(x)}</li>`).join('')}</ul>` : ''}
${srcs.length ? `<p class="src">${srcs.map((l, i) => `<a href="${esc(l.url)}">${i === 0 ? 'Original recipe' : esc(l.label || hostOf(l.url))}</a> (${esc(hostOf(l.url))})`).join(' · ')}</p>` : ''}</article>`; };
    const day = new Date().toLocaleDateString(undefined, {month: 'long', day: 'numeric', year: 'numeric'});
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My Butter Math recipes</title>
<style>body{font:16px/1.55 Georgia,serif;color:#141414;max-width:720px;margin:0 auto;padding:28px 20px}h1{font-size:30px;margin:0 0 4px}h2{font-size:24px;margin:0 0 4px}h3{font:700 13px/1.2 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#D7263D;margin:22px 0 6px}h4{font-size:15px;margin:14px 0 4px}.meta,.sub,.src{color:#666;font:14px Arial,sans-serif}article{border-top:2px solid #141414;padding:26px 0;margin-top:26px}img{width:100%;max-height:340px;object-fit:cover;border-radius:10px;margin-bottom:14px}ul,ol{margin:0;padding-left:22px}li{margin:4px 0}nav ol{columns:2}a{color:#141414}@media print{article{break-before:page;border:0}nav{break-after:page}img{max-height:260px}}</style></head><body>
<h1>My Butter Math recipes</h1><p class="sub">${list.length} recipe${list.length === 1 ? '' : 's'} · downloaded ${esc(day)} from ${esc(location.host)}</p>
<nav><ol>${list.map((d, i) => `<li><a href="#r${i}">${esc(d.title || 'Untitled recipe')}</a></li>`).join('')}</ol></nav>
${list.map((d, i) => one(d).replace('<article>', `<article id="r${i}">`)).join('\n')}
</body></html>`;
    files.unshift({name: 'My recipes.html', data: enc.encode(html)}, {name: 'recipes.json', data: enc.encode(JSON.stringify({app: 'Butter Math', downloaded: new Date().toISOString(), recipes: list.map(d => Object.assign({}, d, names[d.photo] ? {photoFile: names[d.photo]} : {}))}, null, 2))});
    const a = document.createElement('a'); a.href = URL.createObjectURL(makeZip(files));
    a.download = 'butter-math-recipes-' + new Date().toISOString().slice(0, 10) + '.zip';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`Downloaded ${list.length} recipe${list.length === 1 ? '' : 's'}${bad ? `. ${bad} photo${bad === 1 ? '' : 's'} couldn't be saved.` : ''}`);
  }catch(e){ console.error(e); toast("Couldn't create the download"); }
  dlBusy = false; render();
}
function restoreTrip(at){
  const trip = (P().trips || []).find(x => x.at === at); if(!trip) return;
  const ids = trip.rids ? trip.rids : trip.rid ? [trip.rid] : recipes.filter(r => (trip.r || []).includes(D(r).short || D(r).title)).map(r => r.id);
  mutate(k => {
    const t = k.progress.trips || []; const i = t.findIndex(x => x.at === at); if(i < 0) return;
    const marks = k.progress.shop = k.progress.shop || {};
    ids.forEach(id => { k.progress.active[id] = true; if(k.progress.done) delete k.progress.done[id]; });
    (t[i].items || []).forEach(it => {
      const item = (it.id && k.shopping.items.find(x => x.id === it.id)) || k.shopping.items.find(x => x.name === it.n && (!ids.length || (x.recipes || []).some(r => ids.includes(r))));
      if(item){ if(it.s === 'bought' || it.s === 'have') marks[item.id] = it.s;
        const key = item.key || splitIngredient(item.name).key; item.recipes = item.recipes || [];
        ids.forEach(id => { const r = R(id); if(r && !item.recipes.includes(id) && ingLines(D(r)).some(l => ihas(item, splitIngredient(l).key))) item.recipes.push(id); }); fixItem(item); }
      else if(it.c){ const nid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); k.shopping.items.push({id: nid, name: it.n, qty: it.q || '', section: it.sec || 'Other', key: splitIngredient(it.n).key, recipes: [], custom: true}); if(it.s === 'bought' || it.s === 'have') marks[nid] = it.s; }
    });
    t.splice(i, 1);
  });
  toast((trip.r && trip.r.length ? trip.r.join(', ') : 'Trip') + ' is back on your list');
  location.hash = 'shopping';
}
const tripDays = () => new Set((P().trips || []).map(t => new Date(t.at).toDateString())).size;
function renderTrips(){
  const trips = P().trips || [];
  const list = (arr) => `<ul class="tlist">${arr.map(i => `<li><span>${esc(i.n)}${i.q ? ` <span class="q">· ${fmt(i.q)}</span>` : ''}</span><button class="readd" data-act="readd" data-iid="${esc(i.id || '')}" data-n="${esc(i.n)}" data-q="${esc(i.q || '')}" title="Add to list" aria-label="Add ${esc(i.n)} to list">+</button></li>`).join('')}</ul>`;
  const days = [];
  trips.forEach(t => { const key = new Date(t.at).toDateString(); const g = days.find(x => x.key === key); if(g) g.trips.push(t); else days.push({key, trips: [t]}); });
  const body = days.map((g, n) => {
    const d = new Date(g.trips[0].at), all = g.trips.flatMap(t => t.items || []);
    const names = [...new Set(g.trips.flatMap(t => t.r || []))];
    const when = d.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'});
    const seen = new Map(); all.forEach(i => { const key = i.id || i.n; if(!seen.has(key)) seen.set(key, i); });
    const uniq = [...seen.values()], gt = uniq.filter(i => i.s === 'bought'), hd = uniq.filter(i => i.s === 'have'), sk = uniq.filter(i => i.s === 'skip');
    const ats = g.trips.map(t => t.at).join('|');
    return `<details class="card trip"><summary><div><b>${esc(when)}</b><div class="muted">${[`${gt.length} bought`, `${hd.length} already had`].concat(sk.length ? [`${sk.length} didn't get`] : []).join(' · ')}</div></div><button class="tripx" data-act="deltrip" data-at="${esc(ats)}" aria-label="Remove this trip" title="Remove trip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button><span class="chev">▾</span></summary>
      <div class="tbody">${names.length ? `<div class="tname">${esc(names.join(', '))}</div>` : ''}
      ${uniq.length ? `<details class="tings"><summary>See ingredients</summary>${gt.length ? `<h4>Bought</h4>${list(gt)}` : ''}${hd.length ? `<h4>Already had</h4>${list(hd)}` : ''}${sk.length ? `<h4>Didn't get</h4>${list(sk)}` : ''}</details>` : '<div class="muted" style="font-size:14px">Nothing was marked.</div>'}
      <div class="row" style="margin-top:12px"><button class="btn" data-act="untrip" data-at="${esc(ats)}"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18"/><path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25"/><circle cx="18" cy="20" r="2"/><circle cx="8" cy="20" r="2"/></svg>Back to shopping list</button></div></div></details>`;
  }).join('');
  return `<button class="back" data-act="go" data-h="shopping">${ICON_BACK}Shopping list</button>
  <h2 class="ptitle">Past trips</h2>
  ${trips.length ? `<div class="trips">${body}</div>` : `<div class="card empty">No trips yet. They're saved when you start a new one.</div>`}`;
}
function renderMenu(){
  return `<div class="umenu" role="menu">
    <div class="umhead"><b>${esc(firstName() || 'Your kitchen')}</b><span>${esc(user.email)}</span></div>
    <button role="menuitem" data-act="go" data-h="help"><span class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9 9.5a3 2.5 0 016 0c0 2-2 2-3 3.5"/><path d="M12 17h.01"/></svg></span>How it works</button>
    ${isStandalone() ? '' : `<button role="menuitem" data-act="installopen"><span class="ic">${ICON_PHONE}</span>Add to home screen</button>`}
    <button role="menuitem" data-act="go" data-h="settings"><span class="ic"><svg viewBox="0 0 24 24"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg></span>Settings</button>
    <button role="menuitem" data-act="go" data-h="account"><span class="ic"><svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>Account</button>
    ${isAdmin ? `<button role="menuitem" data-act="go" data-h="admin"><span class="ic"><svg viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg></span>Admin</button>` : ''}
    <button role="menuitem" data-act="go" data-h="feedback"><span class="ic"><svg viewBox="0 0 24 24"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/></svg></span>Send feedback</button>
    <button role="menuitem" data-act="go" data-h="privacy"><span class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="16" r="1"/><rect x="3" y="10" width="18" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></svg></span>Privacy</button>
    <button role="menuitem" class="out" data-act="signout"><span class="ic"><svg viewBox="0 0 24 24"><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></svg></span>Exit kitchen</button>
  </div>`;
}
function renderSettings(){
  return `${backBtn()}
  <div class="card panel"><h3>Settings</h3>
    <label class="lbl2" for="acc-name">Your name</label>
    <form data-form="name" class="stack"><input class="tin" id="acc-name" data-keep value="${esc(firstName())}" maxlength="40" required><div><button class="btn dark" type="submit">Save name</button></div></form>
  </div>
  <div class="card panel" style="margin-top:16px"><h3>Change password</h3>
    <form data-form="password" class="stack" autocomplete="off">
      <input class="tin" id="pw-cur" type="password" placeholder="Current password" required autocomplete="current-password">
      <input class="tin" id="pw-new" type="password" placeholder="New password (6+ characters)" minlength="6" required autocomplete="new-password">
      <input class="tin" id="pw-new2" type="password" placeholder="Type the new password again" minlength="6" required autocomplete="new-password">
      <div><button class="btn dark" type="submit">Update password</button></div>
    </form>
  </div>`;
}
function renderAccount(){
  const since = user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, {month:'long', day:'numeric', year:'numeric'}) : '';
  return `${backBtn()}
  <div class="card panel"><h3>Account</h3>
    <div class="lbl2">Email</div><div>${esc(user.email)}</div>
    ${since ? `<div class="lbl2">Member since</div><div>${esc(since)}</div>` : ''}
    <div class="lbl2">What's saved</div><div>${recipes.length} recipe${recipes.length === 1 ? '' : 's'} · ${allItems().length} shopping list item${allItems().length === 1 ? '' : 's'}</div>
  </div>
  <div class="card panel" style="margin-top:16px"><h3>Download my recipes</h3>
    <p style="margin:6px 0 12px">Get a copy of all your recipes and photos as a zip file. Open <b>My recipes.html</b> inside it to read or print them.</p>
    <button class="btn" data-act="dlmine"${dlBusy || !recipes.length ? ' disabled' : ''}>${dlBusy ? 'Preparing…' : 'Download my recipes'}</button>
    ${recipes.length ? '' : '<div class="muted" style="margin-top:8px">You don\'t have any recipes yet.</div>'}
  </div>
  <div class="card panel danger" style="margin-top:16px"><h3>Delete account</h3>
    <p style="margin:6px 0 12px">Permanently deletes your account, all your recipes and photos, your shopping list, and your cooking progress. This can't be undone.</p>
    <button class="btn dangerbtn" data-act="delopen">Delete account</button>
  </div>
  ${delOpen ? `<div class="modal" data-act="delclose"><div class="card" data-stop><h3>Delete everything?</h3>
    <div class="muted">Deletes your account and data for good. Type <b>DELETE</b> to confirm.</div>
    <input class="tin" id="del-word" autocomplete="off" style="margin-top:12px" placeholder="DELETE">
    <div class="row"><button class="btn quiet" data-act="delclose">Cancel</button><button class="btn dangerbtn" data-act="delconfirm">Delete forever</button></div></div></div>` : ''}`;
}
const FB_EMAIL = 'hello@buttermath.app';
function renderFeedback(){
  const su = encodeURIComponent('Butter Math feedback');
  return `${user ? backBtn() : `<button class="back" data-act="go" data-h="">${ICON_BACK}Sign in</button>`}
  <div class="card panel prose fb"><h3>Send feedback</h3>
    <p>Ideas, bugs, or questions? Email us at <b>${FB_EMAIL}</b>.</p>
    <div class="fbbtns"><button class="btn dark sm" data-act="copyemail">Copy email address</button></div>
  </div>`;
}
const TOUR = [
  {art: () => `<svg class="tourico" viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="8" width="36" height="48" rx="4"/><path d="M14 16h-4M14 28h-4M14 40h-4"/><path d="M24 20h16M24 28h16M24 36h10"/><path d="M38 44l4 4 8-9" class="accl"/></svg>`, title: 'Add to your recipe box', text: 'Use the Recipes tab as your own personal recipe box to store as many recipes as you\'d like. You can copy and paste a website link, copy from a social media post caption, or add a screenshot of the recipe.'},
  {art: () => `<svg class="tourico" viewBox="0 0 64 64" aria-hidden="true"><path d="M6 12h7l6 28h28l5-20H16"/><circle cx="23" cy="50" r="4"/><circle cx="43" cy="50" r="4"/><path d="M29 30l3 3 6-6" class="accl"/></svg>`, title: 'Shop for groceries', text: 'There are two ways to add ingredients to your shopping list: open a recipe and tap <b>Shop for ingredients</b>, or go to your <b>Shopping list</b> tab and tap <b>Add from recipe</b>. Add as many recipes as you like. Your ingredients are grouped by grocery aisle, like Produce and Dairy, and you can reorder the aisles. Check things off as you shop, or tap <b>Check off pantry</b> to mark anything already in your kitchen.'},
  {art: () => `<svg class="tourico" viewBox="0 0 64 64" aria-hidden="true"><path d="M10 30h44v6c0 10-8 18-18 18h-8c-10 0-18-8-18-18z"/><path d="M6 30h52"/><path d="M24 22c-3-4 3-6 0-11M32 22c-3-4 3-6 0-11M40 22c-3-4 3-6 0-11" class="accl"/></svg>`, title: 'Cook at home', text: 'Follow along with your recipes as you cook. Each one lists every ingredient, amount, and step, and you can check them off as you go.'},
  {art: () => `<svg class="tourico" viewBox="0 0 64 64" aria-hidden="true"><circle cx="22" cy="22" r="7"/><path d="M8 48c1-8 7-13 14-13s13 5 14 13"/><circle cx="43" cy="24" r="6"/><path d="M38 36c2-1 3.5-1.5 5-1.5c6 0 11 4.5 12 11.5"/><path d="M47 6c-2-2.5-6-1-5 2c.6 2 5 5 5 5s4.4-3 5-5c1-3-3-4.5-5-2z" class="acc"/></svg>`, title: 'Share with friends', text: 'Add friends in the <b>Friends</b> tab to see each other\'s recipes. Save any of theirs to your recipe box, or send them one of yours.'},
];
let tourStep = -1;
function showTour(i){
  tourStep = i; const t = TOUR[i], last = i === TOUR.length - 1;
  const arw = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  $('#modalRoot').innerHTML = `<div class="modal"><div class="card tour" data-stop><button class="tourx" data-act="tourend" aria-label="Close the tour">${ICON_X}</button>
    <div class="tourart">${t.art()}</div>
    <div class="tourbody"><h3>${t.title}</h3><p>${t.text}</p>
    <div class="tournav"><button class="tarrow" data-act="tourgo" data-i="${i - 1}" aria-label="Previous" ${i ? '' : 'disabled'}>${arw('m15 18-6-6 6-6')}</button>
    <div class="tourdots" aria-label="Step ${i + 1} of ${TOUR.length}">${TOUR.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
    ${last ? `<button class="btn primary tourdone" data-act="tourend">Let's cook</button>` : `<button class="tarrow next" data-act="tourgo" data-i="${i + 1}" aria-label="Next">${arw('m9 18 6-6-6-6')}</button>`}</div></div>
  </div></div>`;
}
/* swipe left or right to move through the tour */
{ let tx = null, ty = 0;
  document.addEventListener('touchstart', e => { const t = e.target.closest && e.target.closest('.tour'); tx = t ? e.touches[0].clientX : null; ty = t ? e.touches[0].clientY : 0; }, {passive: true});
  document.addEventListener('touchend', e => { if(tx === null || tourStep < 0) return; const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    if(Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return; const j = tourStep + (dx < 0 ? 1 : -1); if(j >= 0 && j < TOUR.length) showTour(j); }, {passive: true});
}
function maybeTour(){
  if(tourStep >= 0 || !kitchen || P().tourDone || recipes.length || allItems().length || giftToken() || claiming) return;
  showTour(0);
}
function renderHelp(){
  const step = (n, t) => `<div class="hstep"><div class="hnum">${n}</div><div><h4>${t.title}</h4><p>${t.text}</p></div></div>`;
  return `${backBtn()}
  <div class="card panel prose help"><h3>How Butter Math works</h3>
    <p class="muted">Plan, shop, and cook from one place.</p>
    ${TOUR.map((t, i) => step(i + 1, t)).join('')}
    ${step(TOUR.length + 1, {title:'How the math works', text:'Butter Math adds up amounts using the official U.S. measurement standards: 3 teaspoons in a tablespoon, 16 tablespoons in a cup, and 16 ounces in a pound. It never turns cups into grams on its own, because a cup of flour and a cup of sugar weigh different amounts. When a recipe gives both, like 1 cup (200g), it uses that recipe\'s numbers. Tap <b>Show the math</b> on any item to see how its total was added up.'})}
    <h4 class="htips">Good to know</h4>
    <ul>
      <li><b>Add a recipe</b> from a website link, or paste the text and tap <b>Download into form</b>.</li>
      <li>Tap <b>Shop for ingredients</b> on a recipe when you plan to shop for it. Ingredients will not automatically get added to your shopping list.</li>
      <li>Tap <b>Finish trip</b> when you're back from the store. The trip is saved to <b>Past trips</b>, and you can clear anything left on your list.</li>
      <li><b>Reorder aisles</b> by tapping the dots next to any section, then dragging them to match your store.</li>
      <li><b>Archive</b> recipes you're not making right now, and unarchive them anytime.</li>
      <li>Tap <b>Add friend</b> in the <b>Friends</b> tab and enter their email or share an invite link. Once they accept, you can see each other's recipes.</li>
      <li>Tap <b>+ Save</b> on a friend's recipe to get your own copy. You can edit it without changing theirs.</li>
      <li><b>Send a recipe</b> to a friend from its <b>⋯</b> menu, with a note if you like.</li>
      <li>Turn on <b>Private</b> in a recipe's <b>⋯</b> menu to keep it out of your friends' view. Your shopping list and progress are always private.</li>
      <li><b>Add to home screen:</b> tap your initial at the top right, then <b>Add to home screen</b>, so Butter Math opens like an app.</li>
    </ul>
    <div class="row" style="margin-top:14px"><button class="btn" data-act="tourgo" data-i="0">Replay the quick tour</button></div>
  </div>`;
}
function renderTerms(){
  return `${user ? backBtn() : `<button class="back" data-act="go" data-h="">${ICON_BACK}Sign in</button>`}
  <div class="card panel prose"><h3>Terms of Use</h3>
    <p class="muted">Last updated November 15, 2026</p>
    <p><b>Using Butter Math.</b> Butter Math is a free personal project for organizing recipes and shopping lists. It's for personal, non-commercial use and for ages 13 and up.</p>
    <p><b>Your content.</b> What you add is yours, and you're responsible for it. Only save content you have the right to use. Recipes saved from other websites still belong to their creators and are for your own personal use.</p>
    <p><b>Copyright concerns.</b> Recipes and photos that members save remain the property of their creators. If you believe something stored on Butter Math infringes your copyright, email <a href="mailto:hello@buttermath.app">hello@buttermath.app</a> with a description of the work, where you believe it appears, and your contact details. We'll review your request and remove the content where appropriate.</p>
    <p><b>Copyright agent.</b> Butter Math's designated agent for copyright notices under the Digital Millennium Copyright Act is Hayley Beck, P.O. Box 63073, St. Louis, MO 63163, phone 314-499-1637, email <a href="mailto:hello@buttermath.app">hello@buttermath.app</a>.</p>
    <p><b>Acceptable use.</b> You agree not to upload content that is unlawful, harmful, or abusive, and not to disrupt, overload, or misuse the site or interfere with other members' accounts.</p>
    <p><b>Provided as is.</b> Butter Math is provided "as is" and "as available", without warranties of any kind. Features may change, and the site may be suspended or discontinued at any time. We recommend keeping your own copy of any recipes and photos you upload to the site.</p>
    <p><b>Liability.</b> To the fullest extent permitted by law, Butter Math is not liable for any loss or damage resulting from your use of the site.</p>
    <p><b>Accounts.</b> You can delete your account at any time from <b>Account</b>. Accounts that break these terms may be suspended or removed.</p>
    <p><b>Changes.</b> These terms may be updated from time to time. Continuing to use Butter Math means you accept the current version.</p>
    <p><b>Contact.</b> Email <a href="mailto:hello@buttermath.app">hello@buttermath.app</a>.</p>
  </div>`;
}
function renderPrivacy(){
  return `${user ? backBtn() : `<button class="back" data-act="go" data-h="">${ICON_BACK}Sign in</button>`}
  <div class="card panel prose"><h3>Your privacy</h3>
    <p class="muted">Last updated November 19, 2026</p>
    <p><b>Your kitchen is yours.</b> Your recipes, photos, shopping list, and progress are tied to your account. Nothing is browsable through the site, and other members can't see your kitchen unless you become friends. As with most websites, the site administrator has technical access to the underlying database and can see a list of member names and email addresses to run the site. Your data is never reviewed, sold, shared, or used for advertising.</p>
    <p><b>Friends.</b> When you and another member become friends, you can each see the other's recipes and recipe photos, except ones marked private or archived. You can save copies of their recipes to your own recipe box, and any recipe you send to a friend is shared as a copy. Your friends are notified when you save their recipes. Friends never see your shopping list, cooking progress, or favorites. You can remove a friend at any time and choose to remove any recipes you've copied from them. Any copies a friend has saved of your recipes will stay in their recipe box, even if you're no longer friends. Friend requests are initiated by adding your friend's email address, because each account is linked to one. Butter Math doesn't send emails to the people you add. Whether an email address has an account is visible only to the site administrator.</p>
    <p><b>Adding recipes from a link.</b> When you paste a recipe link, Butter Math's server visits that page to copy the recipe into your form. The website you linked sees a visit from Butter Math, not from you. The link isn't saved unless you save the recipe.</p>
    <p><b>Adding recipes from a screenshot.</b> Screenshots are read on your own device to pull out the recipe text. The image is never uploaded or stored. The reading tool is downloaded from jsDelivr, a public code library, the first time you use it. Your screenshot is never sent there.</p>
    <p><b>Pasted text.</b> Recipe text you paste is sorted into the form on your device. Only what you save is stored.</p>
    <p><b>Helping us fix the math.</b> Measurements used in recipes can be written many different ways, and once in a while Butter Math can't interpret it correctly. When that happens, the system will send site administrators the specific ingredient line, along with which account it came from, so we can improve how the system interprets the amount. Your full recipe book will remain private unless shared with friends.</p>
    <p><b>Passwords stay secret.</b> Passwords are stored encrypted. No one, including the site administrator, can see yours.</p>
    <p><b>Photos.</b> Uploaded photos are stored at private, unguessable web addresses that aren't listed anywhere. Anyone with a photo's exact address could open it, so avoid uploading anything sensitive.</p>
    <p><b>Emails.</b> Butter Math only sends account emails, such as confirming your address or resetting your password. There are no newsletters or marketing emails.</p>
    <p><b>Backups.</b> To protect against data loss, the site administrator regularly downloads a backup copy of the site's data, including member names, email addresses, recipes, shopping lists, and photos. Backups are kept privately, protected by two-step sign-in, and deleted after 90 days. They're only used to restore data after a problem.</p>
    <p><b>Where it's stored.</b> Accounts and data are kept by Supabase, a database service. The website itself is hosted on GitHub Pages, and its fonts are loaded from Google Fonts. Account emails are sent through Supabase.</p>
    <p><b>Leaving.</b> You can delete your account at any time from <b>Account</b>, which permanently removes your account and everything you've saved. Copies in older backups are deleted when those backups expire, within 90 days.</p>
    <p><b>Age.</b> Butter Math is for ages 13 and up.</p>
    <p><b>Questions.</b> Email <a href="mailto:hello@buttermath.app">hello@buttermath.app</a>.</p>
  </div>`;
}

/* ---------------- timers, wake lock, modal ---------------- */
let timers = [], audio = null, tick = null;
function startTimer(min, label){
  try{ audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume && audio.resume(); }catch(e){}
  timers.push({id: rid(), label, end: Date.now() + min * 60000, rang: false}); drawTimers(); if(!tick) tick = setInterval(drawTimers, 1000); toast('Timer started: ' + label);
}
function beep(){ try{ if(!audio) return; for(let i = 0; i < 3; i++){ const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; o.connect(g); g.connect(audio.destination); const t = audio.currentTime + i * .45; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.3, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .35); o.start(t); o.stop(t + .4); } }catch(e){} try{ navigator.vibrate && navigator.vibrate([300,150,300]); }catch(e){} }
function drawTimers(){
  const now = Date.now();
  $('#timerWrap').innerHTML = timers.map(t => { const ms = t.end - now; if(ms <= 0 && !t.rang){ t.rang = true; beep(); }
    const s = Math.max(0, Math.ceil(ms / 1000)); const txt = ms <= 0 ? 'Done!' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return `<div class="timer ${ms <= 0 ? 'ring' : ''}"><span>${esc(t.label)}</span><b>${txt}</b><button data-act="untimer" data-id="${t.id}" aria-label="Dismiss">${ICON_X}</button></div>`; }).join('');
  if(!timers.length){ clearInterval(tick); tick = null; }
}
let wakeLock = null, wantWake = false;
async function reWake(){ if(wantWake && !wakeLock){ try{ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; render(); }); }catch(e){} } }
function confirmBox(title, body, okText, fn, html){
  $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card" data-stop><h3>${esc(title)}</h3><div class="muted">${html ? body : esc(body)}</div><div class="row"><button class="btn quiet" data-act="mclose">Cancel</button><button class="btn ${/^(Delete|Remove)/.test(okText) ? 'dangerbtn' : 'primary'}" data-act="mok">${esc(okText)}</button></div></div></div>`;
  confirmFn = fn;
}
let confirmFn = null;

/* ---------------- swipe down to close sheets (phones) ---------------- */
{ let sw = null;
  document.addEventListener('touchstart', e => {
    const sh = e.target.closest && e.target.closest('.asksheet'); sw = null;
    if(!sh || innerWidth >= 720 || e.touches.length !== 1 || e.target.closest('input,textarea,select')) return;
    for(let n = e.target; n && n !== sh; n = n.parentElement) if(n.scrollTop > 0) return;
    if(sh.scrollTop > 0) return;
    sw = {sh, y: e.touches[0].clientY, t: Date.now(), dy: 0};
  }, {passive: true});
  document.addEventListener('touchmove', e => { if(!sw) return; const dy = e.touches[0].clientY - sw.y; sw.dy = dy; if(dy > 0){ if(e.cancelable) e.preventDefault(); sw.sh.style.transition = 'none'; sw.sh.style.transform = `translateY(${dy}px)`; } }, {passive: false});
  document.addEventListener('touchend', () => {
    if(!sw) return; const {sh, dy, t} = sw; sw = null;
    if(dy > 110 || (dy > 40 && dy / Math.max(1, Date.now() - t) > .6)){
      sh.style.transition = 'transform .18s ease-in'; sh.style.transform = 'translateY(100%)';
      setTimeout(() => { const bg = sh.previousElementSibling; if(bg && bg.classList.contains('sheetbg')) bg.click(); }, 170);
    } else if(dy > 0){ sh.style.transition = 'transform .2s ease-out'; sh.style.transform = ''; }
  });
  document.addEventListener('touchcancel', () => { if(sw){ sw.sh.style.transform = ''; sw = null; } });
}

/* ---------------- events ---------------- */
document.addEventListener('click', async e => {
  if(dragJustEnded){ dragJustEnded = false; e.preventDefault(); return; }
  if(e.target.closest('[data-stop]') && !e.target.closest('[data-act]')) return;
  const el = e.target.closest('[data-act]');
  if(menuOpen && !(el && el.dataset.act === 'menu')){ menuOpen = false; render(); }
  if(moreOpen && !(el && ['more','privtog'].includes(el.dataset.act))){ moreOpen = false; render(); }
  if(catOpen && !(el && ['catmenu','catpick','catclear'].includes(el.dataset.act))){ catOpen = false; render(); }
  if(sortOpen && !(el && ['sortmenu','sortpick'].includes(el.dataset.act))){ sortOpen = false; render(); }
  if(fCatOpen && !(el && ['fcatmenu','fcatpick','fcatclear'].includes(el.dataset.act))){ fCatOpen = false; render(); }
  if(fSortOpen && !(el && ['fsortmenu','fsortpick'].includes(el.dataset.act))){ fSortOpen = false; render(); }
  if(!el) return;
  const a = el.dataset.act, id = el.dataset.id, shop = user ? P().shop : {};
  if(a === 'menu'){ menuOpen = !menuOpen; render(); return; }
  if(a === 'installopen'){ menuOpen = false; render(); showInstall(); return; }
  if(a === 'installtipx'){ lsSet('bm_a2hs', 'x'); render(); return; }
  if(a === 'installgo'){ $('#modalRoot').innerHTML = ''; const ev = installEvt; if(!ev) return; installEvt = null; ev.prompt(); try{ const c = await ev.userChoice; if(c && c.outcome === 'accepted') lsSet('bm_a2hs', 'done'); }catch(e){} render(); return; }
  if(a === 'heroart'){ const row = R(id); if(!row) return; const old = row.data.photoPath; const data = Object.assign({}, row.data); delete data.photo; delete data.photoPath;
    const {error} = await sb.from('recipes').update({data}).eq('id', id); if(error){ toast("Couldn't change it. Try again."); return; }
    row.data = data; if(old) sb.storage.from('photos').remove([old]).catch(() => {}); render(); toast('Switched back to the drawing'); return; }
  if(a === 'delopen'){ delOpen = true; render(); setTimeout(() => { const w = $('#del-word'); if(w) w.focus(); }, 50); return; }
  if(a === 'delclose'){ if(e.target.closest('[data-stop]') && el.classList.contains('modal')) return; delOpen = false; render(); return; }
  if(a === 'delconfirm'){ if((($('#del-word') || {}).value || '').trim().toUpperCase() !== 'DELETE'){ toast('Type DELETE to confirm'); return; } el.disabled = true; deleteAccount(); return; }
  if(a === 'go' && el.classList.contains('tab') && route().v === el.dataset.h){ window.scrollTo({top: 0, behavior: 'smooth'}); return; }
  if(a === 'go'){ if(el.dataset.h === 'admin'){ adminData = null; adminUsage = null; adminFr = null; adminErr = null; } location.hash = el.dataset.h; return; }
  if(a === 'backup'){ downloadBackup(); return; }
  if(a === 'dlmine'){ downloadMine(); return; }
  if(a === 'formclear'){ confirmBox('Start over?', "This clears everything you've entered for this recipe.", 'Clear', clearForm); return; }
  if(a === 'shopocrok'){ shopOcrAdd(); return; }
  if(a === 'shopocradd'){ shopOcrAddRow(); return; }
  if(a === 'errall'){ const t = Math.max(...(adminErr || []).map(x => new Date(x.at).getTime()), Date.now()); mutate(k => { k.progress.errSeenAt = t; k.progress.errSeen = {}; }, true); errPill(); return; }
  if(a === 'fcatmenu'){ fCatOpen = !fCatOpen; fSortOpen = false; render(); return; }
  if(a === 'fcatpick'){ const t = el.dataset.t; fCat = fCat.includes(t) ? fCat.filter(x => x !== t) : fCat.concat(t); render(); return; }
  if(a === 'fcatclear'){ fCat = []; fCatOpen = false; render(); return; }
  if(a === 'fsortmenu'){ fSortOpen = !fSortOpen; fCatOpen = false; render(); return; }
  if(a === 'fsortpick'){ fSortK = el.dataset.k; fSortOpen = false; render(); return; }
  if(a === 'addfriend'){ addFriendOpen = true; render(); setTimeout(() => { const i = $('#fr-email'); if(i && !matchMedia('(pointer: coarse)').matches) i.focus(); }, 60); getInvite().then(u => { const el = $('#fr-inv'); if(el && u) el.value = u; }); return; }
  if(a === 'frinvcopy'){ const u = myInvite || await getInvite(); if(!u){ toast("Couldn't make a link. Try again."); return; }
    try { await navigator.clipboard.writeText(u); toast('Invite link copied. Text or email it to your friend.'); } catch(_) { const el = $('#fr-inv'); if(el){ el.value = u; el.focus(); el.select(); } toast('Press and hold the link to copy it.'); } return; }
  if(a === 'addfriendclose'){ addFriendOpen = false; frSent = null; render(); return; }
  if(a === 'frmailed') return;
  if(a === 'frmail'){ if(!frSent) return; el.disabled = true; const mail = await inviteMail(frSent.em); el.disabled = false;
    if(!mail){ toast("Couldn't make an invite link. Try again."); return; }
    frSent.mail = mail; render(); location.href = mail.mail; return; }
  if(a === 'frcopy'){ const u = frSent && frSent.mail && frSent.mail.url; if(!u) return; try { await navigator.clipboard.writeText(u); toast('Invite link copied. Paste it into an email or text.'); } catch(_) { prompt('Copy this invite link:', u); } return; }
  if(a === 'frlink'){ copyInviteLink(); return; }
  if(a === 'fraccept' || a === 'frdecline'){ el.disabled = true; const f = friendBy(id); const {error} = await sb.rpc('respond_friend_request', {friend: id, accept: a === 'fraccept'}); if(error){ toast("Couldn't do that. Try again."); el.disabled = false; return; } if(a === 'fraccept' && f) toast(`You and ${f.name} are now friends`); else if(a === 'frdecline') toast('Request declined'); await loadFriends(true); return; }
  if(a === 'frcancel'){ await sb.rpc('remove_friend', {friend: id}); toast('Request canceled'); loadFriends(true); return; }
  if(a === 'frremove'){ const f = friendBy(id); if(!f) return; const n = savedFrom(f).length;
    $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card rmcard" data-stop><h3>Remove ${esc(f.name)} as a friend?</h3><div class="muted">You'll stop seeing each other's recipes.</div>
      <div class="rmbtns">${n ? `<button class="btn dark" data-act="frremoveok" data-id="${esc(id)}">Remove friend but keep saved recipes</button><button class="btn outline danger" data-act="frremoveok" data-id="${esc(id)}" data-del="1">Remove friend and saved recipes</button>` : `<button class="btn dangerbtn" data-act="frremoveok" data-id="${esc(id)}">Remove friend</button>`}<button class="btn quiet" data-act="mclose">Cancel</button></div></div></div>`; return; }
  if(a === 'frremoveok'){ $('#modalRoot').innerHTML = ''; const f = friendBy(id); const {error} = await sb.rpc('remove_friend', {friend: id}); if(error){ toast("Couldn't remove them. Try again."); return; }
    let gone = 0; if(el.dataset.del && f){ for(const r of savedFrom(f)){ const {error: de} = await sb.from('recipes').delete().eq('id', r.id); if(de) continue; if(D(r).photoPath) sb.storage.from('photos').remove([D(r).photoPath]).catch(() => {}); recipes = recipes.filter(x => x.id !== r.id); mutate(k => removeRecipeFrom(k, r.id)); gone++; } }
    delete fbook[id]; toast(f ? `Removed ${f.name}${gone ? ` and ${gone} recipe${gone === 1 ? '' : 's'}` : ''}` : 'Removed'); location.hash = 'friends'; loadFriends(true); return; }
  if(a === 'svdismiss'){ saves = saves.filter(x => x.id !== id); render(); sb.rpc('dismiss_save_notice', {notice: id}).then(() => {}, () => {}); return; }
  if(a === 'shsave' || a === 'shdismiss'){ const sh = inbox.find(x => x.id === id); if(!sh) return; el.disabled = true;
    if(a === 'shsave'){ try{ const fr = (friends || []).find(x => x.status === 'accepted' && x.name === sh.sender_name); const row = await saveCopy(sh.data, fr ? {owner: fr.friend_id, name: sh.sender_name} : {name: sh.sender_name}); toast('Recipe saved!'); }catch(err){ toast("Couldn't save it. Try again."); el.disabled = false; return; } }
    await sb.rpc('dismiss_share', {share: id}); inbox = inbox.filter(x => x.id !== id); render(); return; }
  if(a === 'fsave'){ e.stopPropagation(); e.preventDefault(); const fid = el.dataset.f, b = fbook[fid], f = friendBy(fid), row = b && b.rows.find(x => x.id === id);
    if(!row || !f){ toast("Couldn't save it. Refresh and try again."); return; } if(savedCopy(fid, id) || el.disabled) return;
    const was = el.innerHTML; el.disabled = true; const slow = setTimeout(() => { el.classList.add('busy'); el.textContent = 'Saving…'; }, 500);
    try{ const mine = await saveCopy(row.data, {id: row.id, owner: fid, name: f.name}); clearTimeout(slow);
      sb.rpc('note_saved', {owner: fid, recipe: row.id}).then(() => {}, () => {});
      const ar = el.closest('.factrow'); if(ar) ar.innerHTML = fActRow(fid, id); else el.outerHTML = `<button class="savebtn done" data-act="funsave" data-f="${esc(fid)}" data-id="${esc(id)}" aria-label="Saved. Tap to remove from your recipe box" title="Tap to unsave">${ICON_OK}Saved</button>`;
      syncFbar(fid); fadeSwap(id);
      filedNew = true; toast('Recipe saved!'); }catch(err){ clearTimeout(slow); console.error(err); toast("Couldn't save it. Try again."); el.disabled = false; el.classList.remove('busy'); el.innerHTML = was; } return; }
  if(a === 'openmine'){ openMine(id); return; }
  if(a === 'fsavedtog'){ fSavedOnly = !fSavedOnly; render(); return; }
  if(a === 'funsave'){ e.stopPropagation(); e.preventDefault(); const fid = el.dataset.f, mine = savedCopy(fid, id); if(!mine || el.disabled) return; el.disabled = true;
    const {error} = await sb.from('recipes').delete().eq('id', mine.id).eq('user_id', user.id); if(error){ toast("Couldn't remove it. Try again."); el.disabled = false; return; }
    recipes = recipes.filter(x => x.id !== mine.id); const before = {active: P().active[mine.id], cook: P().cook[mine.id]}; mutate(k => removeRecipeFrom(k, mine.id));
    const pp = D(mine).photoPath, pt = setTimeout(() => { if(pp) sb.storage.from('photos').remove([pp]).catch(() => {}); }, 7000);
    const ar = el.closest('.factrow'), tile = el.closest('.tile'); if(ar) ar.innerHTML = fActRow(fid, id); else if(fSavedOnly && tile && rowsSaved(fid) > 0) tile.remove(); else el.outerHTML = `<button class="savebtn" data-act="fsave" data-f="${esc(fid)}" data-id="${esc(id)}">${ICON_PLUS2}Save</button>`;
    if(fSavedOnly && !rowsSaved(fid)){ fSavedOnly = false; render(); } else syncFbar(fid);
    fadeSwap(id);
    toast('Removed from your recipe box', async () => { clearTimeout(pt); const {data: row, error: e2} = await sb.from('recipes').insert({id: mine.id, user_id: user.id, sort: mine.sort, data: mine.data}).select('id, sort, data').single(); if(e2){ toast("Couldn't undo. Save it again."); return; } recipes.push(row); mutate(k => { k.progress.active[row.id] = before.active === true; if(before.cook) k.progress.cook[row.id] = before.cook; }); app.__h = null; render(); });
    return; }
  if(a === 'privtog'){ const on = !isPriv(id); mutate(k => { const p = k.progress.private = k.progress.private || {}; if(on) p[id] = true; else delete p[id]; }, true); const sm = el.querySelector('small'), tg = el.querySelector('.tog'); if(sm) sm.textContent = on ? 'Only you can see this recipe' : 'Friends can see this recipe'; if(tg) tg.classList.toggle('on', on); toast(on ? 'Private. Only you can see this recipe.' : 'Friends can see this recipe'); return; }
  if(a === 'sendopen'){ moreOpen = false; sendSheet = id; sendLink = null; if(friends === null) loadFriends(true); recipeLink(id).then(u => { if(sendSheet === id) sendLink = {id, u}; }); render(); return; }
  if(a === 'reclink'){ let u = sendLink && sendLink.id === id ? sendLink.u : null; if(!u){ el.disabled = true; u = await recipeLink(id); el.disabled = false; }
    if(!u){ toast("Couldn't make a link. Try again."); return; }
    try { await navigator.clipboard.writeText(u); flashCopied(el); toast('Link copied. Paste it into a text or email.'); } catch(_) { prompt('Copy this link to the recipe:', u); } return; }
  if(a === 'reccopy'){ const r = R(id); if(!r) return; const link = sendLink && sendLink.id === id ? sendLink.u : null; const txt = shareText(D(r), link, scaleOf(id));
    try { await navigator.clipboard.writeText(txt); flashCopied(el); toast('Copied. Paste it into a text or email.'); } catch(_) { prompt('Copy this and paste it into a text:', txt); } return; }
  if(a === 'madeitx'){ mutate(k => { (k.progress.photoAsked = k.progress.photoAsked || {})[id] = madeOf(id).n; }); return; }
  if(a === 'madeitswap'){ e.preventDefault(); const inp = el.querySelector('input[type=file]'); confirmBox('Replace your photo?', 'Your new photo will replace the current one.', 'Replace', () => { if(inp){ document.body.appendChild(inp); inp.click(); } }); return; }
  if(a === 'math'){ if(mathOpen.has(id)) mathOpen.delete(id); else mathOpen.add(id); render(); return; }
  if(a === 'sendclose'){ sendSheet = null; render(); return; }
  if(a === 'sendgo'){ const to = [...document.querySelectorAll('.sendck:checked')].map(x => x.value); if(!to.length){ toast('Pick who to send it to'); return; } el.disabled = true;
    const {data, error} = await sb.rpc('send_recipe', {recipe: id, friends: to, msg: (($('#send-note') || {}).value || '').trim()});
    if(error || !data){ toast("Couldn't send it. Try again."); el.disabled = false; return; }
    sendSheet = null; render(); toast(to.length === 1 ? `Sent to ${(friendBy(to[0]) || {}).name || 'your friend'}` : `Sent to ${to.length} friends`); return; }
  if(a === 'invaccept'){ el.disabled = true; await acceptInvite(); return; }
  if(a === 'invno'){ forgetInvite(); inviteInfo = null; render(); return; }
  if(a === 'copyemail'){ try{ await navigator.clipboard.writeText(FB_EMAIL); toast('Email address copied'); }catch(err){ toast(FB_EMAIL); } return; }
  if(a === 'readd'){
    const iid = el.dataset.iid, nm = el.dataset.n, q = el.dataset.q;
    mutate(k => {
      const marks = k.progress.shop = k.progress.shop || {};
      const ex = (iid && k.shopping.items.find(i => i.id === iid)) || k.shopping.items.find(i => i.name === nm);
      const shows = ex && (!(ex.recipes || []).some(x => R(x)) || ex.recipes.some(x => R(x) && k.progress.active[x] !== false && !(k.progress.done || {})[x]));
      if(shows){ delete marks[ex.id]; return; }
      const nid = 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      k.shopping.items.push({id: nid, name: nm, qty: q, section: (ex && ex.section) || 'Other', key: splitIngredient(nm).key, recipes: [], custom: true});
    });
    toast(nm + ' added to your list'); return;
  }
  if(a === 'tourgo'){ showTour(+el.dataset.i); return; }
  if(a === 'tourend'){ $('#modalRoot').innerHTML = ''; tourStep = -1; if(!P().tourDone) mutate(k => { k.progress.tourDone = true; }); return; }
  if(a === 'deltrip'){ e.preventDefault(); const ats = el.dataset.at.split('|'), old = (P().trips || []).slice(); mutate(k => { k.progress.trips = (k.progress.trips || []).filter(t => !ats.includes(String(t.at))); }); toast('Trip removed', () => mutate(k => { k.progress.trips = old; })); return; }
  if(a === 'untrip'){ el.dataset.at.split('|').forEach(at => restoreTrip(at)); return; }
  if(a === 'authmode'){ authView = {mode: el.dataset.m, msg:'', err:'', busy:false}; landing = false; render(); window.scrollTo(0, 0); return; }
  if(a === 'logo'){ e.preventDefault(); if(user && !recovering){ location.hash = 'about'; } else { authView = {mode:'signin', msg:'', err:'', busy:false}; landing = true; if(location.hash && location.hash !== '#') history.replaceState(null, '', location.pathname); render(); } window.scrollTo(0, 0); return; }
  if(a === 'landing'){ forgetInvite(); forgetGift(); landing = true; render(); window.scrollTo(0, 0); return; }
  if(a === 'bought'){ const v = shop[id] === 'bought' ? '' : 'bought'; mutate(k => { k.progress.shop[id] = v; }); return; }
  if(a === 'itemedit'){ editItem = {id}; render(); setTimeout(() => { const n = $('#ed-qty'); if(n) n.focus(); }, 60); return; }
  if(a === 'itemeditclose'){ editItem = null; render(); return; }
  if((a === 'amtfix' || a === 'amtkeep') && editItem && editItem.step === 'warn'){ const it = allItems().find(i => i.id === editItem.id); if(!it){ editItem = null; render(); return; }
    const {name, ps, warns} = editItem; let qty = editItem.qty;
    if(a === 'amtfix'){ if(ps) warns.forEach(w => { if(w.fix) ps[w.i].nq = w.fix; }); else if(warns[0].fix) qty = warns[0].fix; }
    itemEditGo(it, name, qty, ps); return; }
  if(a === 'amtback' && editItem && editItem.step === 'warn'){ editItem = {id: editItem.id, draft: editItem.draft}; render(); return; }
  if(a === 'itemsave' && editItem && editItem.step === 'askmulti'){ saveItemParts(el.dataset.to === 'recipe'); return; }
  if(a === 'itemsave'){ if(!editItem) return; const {id: iid, name, qty} = editItem; if(el.dataset.to === 'recipe') saveItemRecipe(iid, name, qty, editItem.nameOnly); else saveItemList(iid, name, qty); return; }
  if(a === 'homemode'){ homeMode = true; render(); window.scrollTo({top: 0}); return; }
  if(a === 'homedone'){ homeMode = false; render(); const n = allItems().filter(i => P().shop[i.id] === 'have').length;
    if(n){ toast(`${n} item${n === 1 ? '' : 's'} at home`); const pill = document.querySelector('.cl-home'); if(pill){ pill.scrollIntoView({behavior: 'smooth', block: 'center'}); pill.classList.add('flash'); setTimeout(() => pill.classList.remove('flash'), 2600); } }
    return; }
  if(a === 'have'){ const v = shop[id] === 'have' ? '' : 'have'; mutate(k => { k.progress.shop[id] = v; }); if(!v){ const it = allItems().find(i => i.id === id); toast(`Removed ${it ? it.name : '1 item'} from At home`); } return; }
  if(a === 'active'){ const v = !isActive(id); mutate(k => { k.progress.active[id] = v; }); return; }
  if(a === 'chiprm'){ const r = R(id); if(!r) return; const snap = JSON.parse(JSON.stringify({items: kitchen.shopping.items, shop: kitchen.progress.shop || {}, act: kitchen.progress.active[id]}));
    mutate(k => { unlinkRecipe(k, id); delete k.progress.active[id]; });
    toast(`Removed ${listName(D(r))} from your list`, () => mutate(k => { k.shopping.items = snap.items; k.progress.shop = snap.shop; if(snap.act === undefined) delete k.progress.active[id]; else k.progress.active[id] = snap.act; })); return; }
  if(a === 'relist'){ const r = R(id); mutate(k => { if(r && !k.shopping.items.some(i => (i.recipes || []).includes(id))) addIngredientsTo(k, id, D(r).ingredients || []); k.progress.active[id] = true; if(k.progress.done) delete k.progress.done[id]; }); toast('Added to your shopping list'); return; }
  if(a === 'filter'){ ui.filter = el.dataset.tg && ui.filter === el.dataset.f ? 'all' : el.dataset.f; saveUi(); render(); return; }
  if(a === 'mergeyes'){ const ia = el.dataset.a, ib = el.dataset.b, A0 = allItems().find(i => i.id === ia), B0 = allItems().find(i => i.id === ib); if(!A0 || !B0) return;
    const SN = JSON.stringify({s: kitchen.shopping, p: kitchen.progress}), names = A0.name + ' and ' + B0.name;
    mutate(k => { const items = k.shopping.items, A = items.find(i => i.id === ia), B = items.find(i => i.id === ib); if(!A || !B) return;
      A.also = [...new Set([...(A.also || []), ...ikeys(B)])].filter(x => x !== (A.key || splitIngredient(A.name).key));
      if(B.name.length > A.name.length) A.name = B.name;
      A.recipes = [...new Set([...(A.recipes || []), ...(B.recipes || [])])]; if(B.pq) A.pq = Object.assign({}, B.pq, A.pq || {});
      const sh = k.progress.shop; if(!sh[A.id] && sh[B.id]) sh[A.id] = sh[B.id]; delete sh[B.id];
      items.splice(items.indexOf(B), 1); fixItem(A); });
    toast('Combined ' + names, () => { mutate(k => { const o = JSON.parse(SN); k.shopping = o.s; k.progress = o.p; }); toast('Undone. They\'re separate again.'); }); return; }
  if(a === 'mergeno'){ const pk = el.dataset.p; mutate(k => { const ap = k.shopping.apart = k.shopping.apart || []; if(!ap.includes(pk)) ap.push(pk); }); return; }
  if(a === 'delitem'){ const it = allItems().find(i => i.id === id); const SN = JSON.stringify({s: kitchen.shopping, p: kitchen.progress}); mutate(k => { k.shopping.items = k.shopping.items.filter(i => i.id !== id); delete k.progress.shop[id]; ((it && it.recipes) || []).forEach(rid => { if(!k.shopping.items.some(i => (i.recipes || []).includes(rid))) k.progress.active[rid] = false; }); }); if(it) toast('Removed ' + it.name, () => { mutate(k => { const o = JSON.parse(SN); k.shopping = o.s; k.progress = o.p; }); toast(it.name + ' is back on your list'); }); return; }
  if(a === 'copy'){
    const items = visibleItems().filter(i => !shop[i.id]); const secs = [...new Set(items.map(i => i.section || 'Other'))];
    const txt = secs.map(s => s + ':\n' + items.filter(i => (i.section || 'Other') === s).map(i => '- ' + i.name + (i.qty ? ' (' + i.qty + ')' : '')).join('\n')).join('\n\n');
    try{ await navigator.clipboard.writeText(txt || 'Nothing left to buy!'); toast('Copied your list'); }catch(err){ toast("Couldn't copy on this device"); }
    return;
  }
  if(a === 'resetshop'){
    $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card" data-stop><h3>Finish this trip?</h3><div class="muted">Everything on your current list moves to Past trips. Your shopping list starts fresh.</div><div class="row"><button class="btn quiet" data-act="mclose">Cancel</button><button class="btn primary" data-act="finishok">Finish</button></div></div></div>`;
    return;
  }
  if(a === 'ing'){ const c = cookOf(id), key = el.dataset.k, v = !c.i[key]; mutate(k => { const o = k.progress.cook[id] = k.progress.cook[id] || {}; (o.i = o.i || {})[key] = v; }); return; }
  if(a === 'step'){ const c = cookOf(id), key = el.dataset.k, v = !c.s[key]; { const rr = R(id); const keys = rr ? stepList(D(rr)).map(x => x.key) : []; if(v && keys.length && keys.every(k2 => k2 === key || c.s[k2])) finDrop = {id, t: Date.now()}; } mutate(k => { const o = k.progress.cook[id] = k.progress.cook[id] || {}; (o.s = o.s || {})[key] = v; delete o.before; syncMade(k, id); }); return; }
  if(a === 'resetrecipe'){ confirmBox('Reset progress?', 'Unchecks every ingredient and step.', 'Reset', () => mutate(k => { bankLegacy(k, id); k.progress.cook[id] = {i:{}, s:{}}; })); return; }
  if(a === 'finishok'){ $('#modalRoot').innerHTML = ''; newTrip(); return; }
  if(a === 'fav'){ e.stopPropagation(); const v = !favOf(id); mutate(k => { const f = k.progress.fav = k.progress.fav || {}; if(v) f[id] = true; else delete f[id]; }); return; }
  if(a === 'catmenu'){ catOpen = !catOpen; sortOpen = false; render(); return; }
  if(a === 'catclear'){ e.stopPropagation(); recTags = []; catOpen = false; render(); return; }
  if(a === 'catpick'){ const t = el.dataset.t; recTags = recTags.includes(t) ? recTags.filter(x => x !== t) : recTags.concat(t); render(); return; }
  if(a === 'favfilter'){ recFav = !recFav; render(); return; }
  if(a === 'sortmenu'){ sortOpen = !sortOpen; catOpen = false; render(); return; }
  if(a === 'sortpick'){ ui.rsort = el.dataset.k; saveUi(); sortOpen = false; render(); return; }
  if(a === 'tagedit'){ tagEdit = id; render(); return; }
  if(a === 'tagdel'){ const t = el.dataset.t, n = recipes.filter(r => tagsOf(r).includes(t)).length;
    confirmBox(`Delete the “${t}” tag?`, n ? `It comes off ${n} recipe${n === 1 ? '' : 's'}. The recipes stay.` : 'It isn’t on any recipes.', 'Delete tag', () => mutate(k => { k.progress.ctags = (k.progress.ctags || []).filter(x => x !== t); const tg = k.progress.tags = k.progress.tags || {}; recipes.forEach(r => { const cur = tg[r.id] || autoTags(D(r)); if(cur.includes(t)) tg[r.id] = cur.filter(x => x !== t); }); recTags = recTags.filter(x => x !== t); })); return; }
  if(a === 'tagdone'){ tagEdit = null; render(); return; }
  if(a === 'tagtog'){ const r = R(id); if(!r) return; const t = el.dataset.t, cur = tagsOf(r), nx = cur.includes(t) ? cur.filter(x => x !== t) : cur.concat(t); mutate(k => { (k.progress.tags = k.progress.tags || {})[id] = nx; }); return; }
  if(a === 'sclear'){ shopQ = ''; const qi = $('#shopq'); if(qi) qi.value = ''; render(); const q = $('#shopq'); if(q) q.focus({preventScroll:true}); return; }
  if(a === 'more'){ moreOpen = !moreOpen; render(); return; }
  if(a === 'addask'){ addSheet = {id}; render(); return; }
  if(a === 'mealopen'){ const sel = {}; mealOn().forEach(x => { sel[x] = true; }); mealPick = {sel}; render(); return; }
  if(a === 'mealfrom'){ const sel = {}; mealOn().forEach(x => { sel[x] = true; }); if(R(id)) sel[id] = true; moreOpen = false; mealPick = {sel}; render(); return; }
  if(a === 'mealpickclose'){ mealPick = null; render(); return; }
  if(a === 'mealtog'){ if(!mealPick) return; if(mealPick.sel[id]) delete mealPick.sel[id]; else { if(Object.keys(mealPick.sel).length >= MEAL_MAX){ toast(`A meal can have up to ${MEAL_MAX} recipes`); return; } mealPick.sel[id] = true; }
    const sel = !!mealPick.sel[id], n = Object.keys(mealPick.sel).length; el.classList.toggle('sel', sel); el.setAttribute('aria-pressed', sel); el.querySelector('.pbox').textContent = sel ? '✓' : '';
    const go = $('.mealgo'); if(go){ go.disabled = n < 2; go.textContent = mealGoText(n); } return; }
  if(a === 'mealgo'){ if(!mealPick) return; const ids = recipes.filter(r => mealPick.sel[r.id] && !isArch(r.id)).map(r => r.id); if(ids.length < 2) return; if(ids.length > MEAL_MAX){ toast(`A meal can have up to ${MEAL_MAX} recipes`); return; } mealPick = null;
    // A recipe joining the meal that was already finished starts fresh, so its steps don't show as done. Its "made" count is kept.
    const prev = mealIds(), fresh = ids.filter(x => { if(prev.includes(x)) return false; const p = progressOf(R(x)); return p.total > 0 && p.done === p.total; });
    mutate(k => { const m = k.progress.meal = Object.assign({}, k.progress.meal || {}); m.ids = ids; delete m.hideShop; if(m.off){ m.off = Object.assign({}, m.off); Object.keys(m.off).forEach(x => { if(!ids.includes(x) || !prev.includes(x)) delete m.off[x]; }); }
      fresh.forEach(x => { bankLegacy(k, x); k.progress.cook[x] = {i:{}, s:{}}; }); }, true); if(location.hash === '#meal') render(); else location.hash = 'meal'; return; }
  if(a === 'mealrm' && allItems().some(i => (i.recipes || []).includes(id))){ const nm = mname(R(id));
    $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card" data-stop><h3>Remove ${nm} from this meal?</h3><div class="muted">Do you also want to take its ingredients off your shopping list? Ingredients other recipes still need stay on your list.</div><div class="row mrmrow"><button class="btn quiet" data-act="mclose">Cancel</button><button class="btn" data-act="mealrmkeep" data-id="${esc(id)}">Keep ingredients</button><button class="btn primary" data-act="mealrmall" data-id="${esc(id)}">Remove ingredients too</button></div></div></div>`; return; }
  if(a === 'mealrmkeep' || a === 'mealrmall'){ $('#modalRoot').innerHTML = ''; const nm = R(id) ? D(R(id)).short || D(R(id)).title : 'Recipe';
    mutate(k => { const m = k.progress.meal = Object.assign({}, k.progress.meal || {}); m.ids = (m.ids || []).filter(x => x !== id); if(m.off) delete m.off[id]; if(m.now) delete m.now[id]; if(a === 'mealrmall') unlinkRecipe(k, id); });
    toast(a === 'mealrmall' ? `Removed ${nm} and its ingredients from your list` : `Removed ${nm} from this meal`); return; }
  if(a === 'mealrm'){ mutate(k => { const m = k.progress.meal = Object.assign({}, k.progress.meal || {}); m.ids = (m.ids || []).filter(x => x !== id); if(m.off) delete m.off[id]; if(m.now) delete m.now[id]; }); return; }
  if(a === 'mealnow'){ mutate(k => { const m = k.progress.meal = Object.assign({}, k.progress.meal || {}); m.now = Object.assign({}, m.now || {}, {[id]: true}); }); return; }
  if(a === 'mealtolist'){ shopBack = true; location.hash = 'shopping'; return; }
  if(a === 'mealpicker'){ const t = $('#mealeat'); if(t){ try{ t.showPicker(); }catch(err){ t.focus(); t.click(); } } return; }
  if(a === 'mealoff'){ mutate(k => { const m = k.progress.meal = Object.assign({}, k.progress.meal || {}); const off = m.off = Object.assign({}, m.off || {}); if(off[id]) delete off[id]; else off[id] = true; }); return; }
  if(a === 'mealrec'){ mealBack = id; location.hash = (el.dataset.edit ? 'edit-' : 'r-') + id; return; }
  if(a === 'mealjump'){ const i = +el.dataset.i, ml = $('#mlanes'), lane = $('#lane-' + i); if(!ml || !lane) return; ml.scrollTo({left: lane.offsetLeft - ml.offsetLeft, behavior: 'smooth'}); document.querySelectorAll('.mtabs button').forEach((b, j) => b.classList.toggle('on', j === i));
    // Switching recipes slides the steps sideways only; the page itself never jumps.
    lane.classList.remove('pulse'); void lane.offsetWidth; lane.classList.add('pulse'); return; }
  if(a === 'mealshop'){ mealShop = {mode: 'all', sel: {}}; mealIngs(mealOn()).forEach(e => { if(!mealOnList(e)) mealShop.sel[e.key] = true; }); render(); return; }
  if(a === 'mealshopclose'){ mealShop = null; render(); return; }
  if(a === 'mealmode'){ if(mealShop){ mealShop.mode = el.dataset.m; render(); } return; }
  if(a === 'mealshophide'){ mutate(k => { k.progress.meal = Object.assign({}, k.progress.meal || {}, {hideShop: true}); }); return; }
  if(a === 'mealadd'){ if(!mealShop) return; const ids = mealOn(), ings = mealIngs(ids);
    const keys = new Set((mealShop.mode === 'all' ? ings.filter(e => !mealOnList(e)) : ings.filter(e => mealShop.sel[e.key])).map(e => e.key)); if(!keys.size) return; mealShop = null;
    mutate(k => ids.forEach(rid => { const lines = ingLines(D(R(rid))).filter(l => keys.has(splitIngredient(l).key)); if(lines.length) addFresh(k, rid, lines); }));
    toast(`Added ${keys.size} ingredient${keys.size === 1 ? '' : 's'} to your shopping list`); return; }
  if(a === 'mealclear'){ const prev = JSON.parse(JSON.stringify(P().meal || {})); mutate(k => { k.progress.meal = {eat: (k.progress.meal || {}).eat}; }, true); mealBack = null; location.hash = 'recipes'; toast('Meal cleared. Your recipes and list are unchanged.', () => mutate(k => { k.progress.meal = prev; })); return; }
  if(a === 'pickopen'){ pickSheet = {sel: {}}; ui.addOpen = false; render(); return; }
  if(a === 'picknew'){ pickSheet = null; location.hash = 'add'; shopAdd = true; render(); return; }
  if(a === 'pickclose'){ pickSheet = null; render(); return; }
  if(a === 'picktog'){ if(!pickSheet || el.disabled) return; if(pickSheet.sel[id]) delete pickSheet.sel[id]; else pickSheet.sel[id] = true;
    const sel = !!pickSheet.sel[id], n = Object.keys(pickSheet.sel).length; el.classList.toggle('sel', sel); el.setAttribute('aria-pressed', sel); el.querySelector('.pbox').textContent = sel ? '✓' : '';
    const go = $('.pickgo'); if(go){ go.disabled = !n; go.textContent = n ? `Add ingredients from ${n} recipe${n === 1 ? '' : 's'}` : 'Pick a recipe'; } return; }
  if(a === 'pickgo'){ if(!pickSheet) return; const ids = Object.keys(pickSheet.sel).filter(x => R(x)); pickSheet = null; if(!ids.length){ render(); return; }
    const SN = JSON.stringify({s: kitchen.shopping, p: kitchen.progress}); let total = 0; mutate(k => { ids.forEach(rid => { const lines = ingLines(D(R(rid))); total += lines.length; addFresh(k, rid, lines); }); });
    toast(`Added ${total} ingredient${total === 1 ? '' : 's'} from ${ids.length} recipe${ids.length === 1 ? '' : 's'}`, () => { mutate(k => { const o = JSON.parse(SN); k.shopping = o.s; k.progress = o.p; }); toast('Undone. Item(s) removed from your list.'); }); return; }
  if(a === 'sheetclose'){ addSheet = null; render(); return; }
  if(a === 'addall'){ const r = R(id); if(!r) return; const was = onList(id) && !(addSheet || {}).again, lines = was ? ingLines(D(r)).filter(l => !linkedLine(id, l)) : ingLines(D(r)); addSheet = null; if(!lines.length){ render(); return; }
    const snap = JSON.stringify({s: kitchen.shopping, p: kitchen.progress}); mutate(k => addFresh(k, id, was ? ingLines(D(r)) : lines, was)); toast(`Added ${lines.length} ${lines.length === 1 ? 'ingredient' : 'ingredients'} to your list`, () => { mutate(k => { const o = JSON.parse(snap); k.shopping = o.s; k.progress = o.p; }); toast('Undone. Item(s) removed from your list.'); }); return; }
  if(a === 'choose'){ addSheet = null; choosing = id; chosenN = 0; chooseSnap = JSON.stringify({s: kitchen.shopping, p: kitchen.progress}); mutate(k => unlinkRecipe(k, id)); setTimeout(() => { const c = $('.ing-col'); if(c) window.scrollTo({top: c.getBoundingClientRect().top + scrollY - 130, behavior: 'smooth'}); }, 30); return; }
  if(a === 'choosedone'){ choosing = null; render(); const SN = chooseSnap; chooseSnap = null; if(chosenN) toast(`${chosenN} added to your list`, SN ? () => { mutate(k => { const o = JSON.parse(SN); k.shopping = o.s; k.progress = o.p; }); toast('Undone. Item(s) removed from your list.'); } : null); return; }
  if(a === 'ingadd'){ const r = R(id); if(!r) return; const [gi, ki] = el.dataset.k.split('-').map(Number); const line = ((D(r).ingredients || [])[gi] || {}).items[ki]; if(!line) return;
    if(ingListed(id, line)){ chosenN = Math.max(0, chosenN - 1); const keys = new Set(ingParts(line).map(x => splitIngredient(x).key)); mutate(k => unlinkRecipe(k, id, keys)); return; }
    chosenN++; mutate(k => addFresh(k, id, [line])); return; }
  if(a === 'scale'){ const f = +el.dataset.f, r = R(id); if(!r || !(f > 0) || near1(f, scaleOf(id))) return;
    mutate(k => { const s = k.progress.scale = k.progress.scale || {}; if(near1(f, +((k.progress.scaleDef || {})[id]) || 1)) delete s[id]; else s[id] = f; k.shopping.items.forEach(i => { if((i.recipes || []).includes(id)) fixItem(i); }); });
    const typed = allItems().filter(i => (i.recipes || []).includes(id) && i.qtyEdit);
    if(typed.length) toast(`Your list has ${typed.length === 1 ? 'an amount' : 'amounts'} you typed. Change ${typed.length === 1 ? 'it' : 'them'} to match?`, () => mutate(k => k.shopping.items.forEach(i => { if((i.recipes || []).includes(id) && i.qtyEdit){ delete i.qtyEdit; fixItem(i); } })), 'Change');
    else if(onList(id)) toast('Shopping list updated to match'); return; }
  if(a === 'scaledef'){ const f = scaleOf(id); if(!R(id)) return;
    mutate(k => { const d = k.progress.scaleDef = k.progress.scaleDef || {}; if(near1(f, 1)) delete d[id]; else d[id] = f; if(k.progress.scale) delete k.progress.scale[id]; });
    toast(near1(f, 1) ? 'This recipe now opens at its original size' : 'This recipe now opens at this size'); return; }
  if(a === 'markall'){ const r = R(id); if(!r) return; const prev = JSON.parse(JSON.stringify(cookOf(id).s)); const keys = stepList(D(r)).map(x => x.key);
    mutate(k => { const o = k.progress.cook[id] = k.progress.cook[id] || {}; o.s = o.s || {}; o.before = Object.assign({}, prev); keys.forEach(x => { o.s[x] = true; }); syncMade(k, id); });
    toast('Marked complete'); return; }
  if(a === 'unmark'){ mutate(k => { const o = k.progress.cook[id] = k.progress.cook[id] || {}; if(!o.before) return; o.s = Object.assign({}, o.before); delete o.before; syncMade(k, id); }); toast('Back to where you were'); return; }
  if(a === 'again'){ mutate(k => { bankLegacy(k, id); k.progress.cook[id] = {i:{}, s:{}}; }); addSheet = {id, again: true}; render(); window.scrollTo({top: 0, behavior: 'smooth'}); return; }
  if(a === 'recipex'){ const r = R(id); if(!r) return;
    $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card" data-stop><div class="mhead"><h3>${esc(D(r).title)}</h3><button class="ibtn mx" data-act="mclose" aria-label="Close">${ICON_X}</button></div><div class="muted">Archive will hide the recipe, but can be unhidden at any time. Removing the recipe will delete it from your recipe box entirely.</div><div class="row"><button class="btn" data-act="archive" data-id="${esc(id)}">Archive</button><button class="btn dangerbtn" data-act="delrecipe" data-id="${esc(id)}">Remove</button></div></div></div>`;
    return; }
  if(a === 'archive'){ $('#modalRoot').innerHTML = ''; const r = R(id); mutate(k => { (k.progress.archived = k.progress.archived || {})[id] = true; }); toast(D(r).title + ' archived'); if(location.hash !== '#recipes') location.hash = 'recipes'; return; }
  if(a === 'unarch'){ const r = R(id); mutate(k => { if(k.progress.archived) delete k.progress.archived[id]; }); toast(D(r).title + ' is back'); return; }
  if(a === 'delrecipe'){ $('#modalRoot').innerHTML = ''; moreOpen = false; deleteRecipe(id); return; }
  if(a === 'starters'){ el.disabled = true; addStarters(); return; }
  if(a === 'parse'){ fillFromPaste(); return; }
  if(a === 'addopen'){ ui.addOpen = true; render(); setTimeout(() => { const n = $('#addName'); if(n) n.focus(); }, 30); return; }
  if(a === 'addclose'){ ui.addOpen = false; render(); return; }
  if(a === 'aisles'){ drawAisles(el.dataset.s); return; }
  if(a === 'secmv'){
    const s = el.dataset.s, d = +el.dataset.d, vis = [...document.querySelectorAll('.section[data-sec]')].map(x => x.dataset.sec), nb = vis[vis.indexOf(s) + d];
    if(!nb) return;
    const o = aisleOrder().filter(x => x !== s); o.splice(o.indexOf(nb) + (d > 0 ? 1 : 0), 0, s);
    mutate(k => { k.shopping.sections = o.slice(); });
    setTimeout(() => { const n = document.querySelector(`.section[data-sec="${CSS.escape(s)}"]`); if(n){ n.classList.add('moved'); n.scrollIntoView({block:'nearest', behavior:'smooth'}); setTimeout(() => n.classList.remove('moved'), 700); } }, 20);
    return;
  }
  if(a === 'aislemove'){ const o = aisleOrder(), i = +el.dataset.i, j = i + (+el.dataset.d); if(j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; mutate(k => { k.shopping.sections = o.slice(); }); drawAisles(j); return; }
  if(a === 'import'){ importLink(); return; }
  if(a === 'rmphoto'){ if(form.photoUrl) URL.revokeObjectURL(form.photoUrl); form.photoBlob = null; form.photoUrl = null; form.removePhoto = true; render(); return; }
  if(a === 'saveform'){ saveForm(id || null); return; }
  if(a === 'timer'){ startTimer(+el.dataset.min, el.dataset.label); return; }
  if(a === 'untimer'){ timers = timers.filter(t => t.id !== id); drawTimers(); return; }
  if(a === 'jump'){ const s = document.getElementById('s-' + el.dataset.k); if(s) s.scrollIntoView({behavior:'smooth', block:'center'}); return; }
  if(a === 'mclose'){ if(e.target.closest('[data-stop]') && el.classList.contains('modal')) return; $('#modalRoot').innerHTML = ''; return; }
  if((a === 'amtsaveas' || a === 'amtsavefix') && amtWarnPend && form){ const {ws, id: fid} = amtWarnPend; amtWarnPend = null; $('#modalRoot').innerHTML = '';
    form.amtChecked = true; if(a === 'amtsavefix'){ form.amtFix = {}; ws.forEach(w => { if(w.fixLine) form.amtFix[w.line] = w.fixLine; }); }
    saveForm(fid); return; }
  if(a === 'ingfix'){ const r = R(id); if(!r) return; const [gi, li] = el.dataset.k.split('-').map(Number); const l = ((D(r).ingredients || [])[gi] || {items: []}).items[li]; if(!l) return;
    const p = splitIngredient(l), w = checkAmt('', p.qty), nl = w && w.fix ? rebuildLine(l, p.name, w.fix) : null; if(!nl) return;
    const data = JSON.parse(JSON.stringify(D(r))); data.ingredients[gi].items[li] = nl;
    const {error} = await sb.from('recipes').update({data}).eq('id', id); if(error){ toast("Couldn't update the recipe. Try again."); return; }
    r.data = data; mutate(k => k.shopping.items.forEach(i => { if((i.recipes || []).includes(id)) fixItem(i); })); toast('Updated to ' + w.fix); return; }
  if(a === 'mok'){ $('#modalRoot').innerHTML = ''; const fn = confirmFn; confirmFn = null; if(fn) fn(); return; }
  if(a === 'signout'){ await flush(); try{ sessionStorage.removeItem('mb-in'); }catch(err){} gate = 'gate'; await sb.auth.signOut(); location.hash = ''; return; }
  if(a === 'enter'){ enterKitchen(); return; }
  if(a === 'wake'){
    if(wakeLock){ wantWake = false; try{ await wakeLock.release(); }catch(err){} wakeLock = null; render(); toast('Screen can sleep again'); return; }
    wantWake = true;
    try{ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; render(); }); toast('Screen will stay on'); render(); }
    catch(err){ wantWake = false; toast("Not supported on this browser"); }
  }
});
document.addEventListener('input', e => {
  if(e.target.id === 'shopq'){ shopQ = e.target.value; render(); return; }
  if(e.target.id === 'f-steps') stepPreview();
  if(e.target.id === 'fsearch'){ const q = e.target.value.trim().toLowerCase(); let n = 0; document.querySelectorAll('#fgrid .tile').forEach(t => { const m = !q || t.dataset.q.includes(q); t.hidden = !m; if(m) n++; }); const no = $('#fnone'); if(no) no.hidden = !!n; return; }
  if(e.target.id === 'f-paste'){ const b = $('#f-parsebtn'); if(b) b.disabled = !e.target.value.trim(); }
  if(e.target.id === 'rsearch'){
    recQ = e.target.value; const q = e.target.value.trim().toLowerCase(); let n = 0;
    document.querySelectorAll('#rgrid .tile[data-q]').forEach(t => { const m = !q || t.dataset.q.includes(q); t.hidden = !m; if(m) n++; });
    const add = $('#rgrid .addtile'); if(add) add.hidden = !!q;
    let an = 0; document.querySelectorAll('#archbox .arow').forEach(t => { const m = !q || t.dataset.q.includes(q); t.hidden = !m; if(m) an++; });
    const ab = $('#archbox'); if(ab){ ab.hidden = !!q && !an; if(q && an) ab.open = true; }
    const none = $('#rnone'); if(none) none.hidden = !q || n + an > 0;
  }
  if(e.target.id === 'f-title'){ const p = $('#f-pic'); if(p && !p.querySelector('img')) p.innerHTML = art(guessArt(e.target.value), e.target.value); }
});
function autoImport(el){
  const u = el.value.trim();
  if(form && form.forId === 'new' && /^https?:\/\/\S+\.\S+/i.test(u) && u !== form.lastImport){ form.lastImport = u; importLink(); }
}
document.addEventListener('input', e => { if(e.target.id !== 'mealq') return; const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('.mealpick .pickrow[data-s]').forEach(r => { r.hidden = !!q && !r.dataset.s.includes(q); }); });
// The typed time is saved as soon as you leave the box: tap or click anywhere else, or press Enter.
function commitEat(el){ const cur = (P().meal || {}).eat || '18:00', v = parseClock(el.value, cur);
  if(!v){ if(el.value.trim() !== clock(cur, 0)) toast('Try a time like 6:30 PM'); el.value = clock(cur, 0); return; }
  el.value = clock(v, 0); if(v !== cur) mutate(k => { k.progress.meal = Object.assign({}, k.progress.meal || {}, {eat: v}); }); }
document.addEventListener('focusout', e => { if(e.target.id === 'mealeatx') commitEat(e.target); });
document.addEventListener('pointerdown', e => { const el = document.getElementById('mealeatx'); if(el && document.activeElement === el && e.target !== el) el.blur(); });
document.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.id === 'mealeatx'){ e.preventDefault(); e.target.blur(); } });
document.addEventListener('change', e => { if(e.target.id === 'mealeat' && /^\d\d:\d\d/.test(e.target.value)){ const v = e.target.value.slice(0, 5); mutate(k => { k.progress.meal = Object.assign({}, k.progress.meal || {}, {eat: v}); }); }
  if(e.target.classList && e.target.classList.contains('mealck') && mealShop){ if(e.target.checked) mealShop.sel[e.target.dataset.k] = true; else delete mealShop.sel[e.target.dataset.k]; const n = Object.keys(mealShop.sel).length, b = document.querySelector('.mealshop .pickgo'); if(b){ b.disabled = !n; b.textContent = n ? `Add ${n} to my shopping list` : 'Pick ingredients to add'; } } });
document.addEventListener('input', e => { if(e.target.id !== 'pickq') return; const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('.pickrow[data-s]').forEach(r => { r.hidden = !!q && !r.dataset.s.includes(q); }); });
document.addEventListener('input', e => { if(e.target.id !== 'adm-q') return; admQ = e.target.value; const q = admQ.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('.ascroll .arow').forEach(r => { const hit = !q || r.dataset.s.includes(q); r.hidden = !hit; if(hit) n++; }); const z = document.querySelector('.anone'); if(z) z.hidden = n > 0; });
document.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.id === 'f-link'){ e.preventDefault(); autoImport(e.target); } });
document.addEventListener('focusout', e => { if(e.target.id === 'f-link') autoImport(e.target); });
document.addEventListener('paste', e => {
  if(e.target.id === 'f-link' && form && form.forId === 'new') setTimeout(() => autoImport(e.target), 0);
});
document.addEventListener('change', async e => {
  if(e.target.id === 'adm-sort'){ admSort = e.target.value; render(); return; }
  if(e.target.id === 'f-paste'){ autoFill(); return; }
  if(e.target.id === 'f-restore'){ const f = e.target.files[0]; e.target.value = ''; if(f && isAdmin) startRestore(f); return; }
  if(e.target.id === 'f-ocr'){ const f = e.target.files[0]; e.target.value = ''; if(f) readPhoto(f); return; }
  if(e.target.dataset && e.target.dataset.photoFor && e.target.files[0]){
    const id = e.target.dataset.photoFor, row = R(id); if(!row) return;
    if(e.target.dataset.asked) mutate(k => { (k.progress.photoAsked = k.progress.photoAsked || {})[id] = madeOf(id).n; });
    photoBusy = id; render();
    try{
      const blob = await shrink(e.target.files[0], 1400);
      const up = await uploadPhoto(id, blob);
      const old = row.data.photoPath;
      const data = Object.assign({}, row.data, {photo: up.url, photoPath: up.path, photoMine: true}); delete data.photoPos;
      const {error} = await sb.from('recipes').update({data}).eq('id', id); if(error) throw error;
      row.data = data; if(old) sb.storage.from('photos').remove([old]).catch(() => {});
      toast('Photo saved');
    }catch(err){ console.error(err); toast("Couldn't upload. Try another photo."); }
    photoBusy = null; render(); return;
  }
  if(e.target.id === 'f-photo' && e.target.files[0]){
    const blob = await shrink(e.target.files[0], 1400);
    if(form.photoUrl) URL.revokeObjectURL(form.photoUrl);
    form.photoBlob = blob; form.photoUrl = URL.createObjectURL(blob); form.removePhoto = false; form.photoPos = {x: 50, y: 50, z: 1}; e.target.value = ''; render();
  }
});
document.addEventListener('submit', async e => {
  const kind = e.target.dataset.form; if(!kind) return; e.preventDefault();
  if(['signin','signup','forgot','newpass'].includes(kind)){ return handleAuthForm(kind); }
  if(kind === 'frsend'){ const em = (($('#fr-email') || {}).value || '').trim(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ toast('Enter their email address'); return; }
    const btn = e.target.querySelector('button'); btn.disabled = true;
    const {data: res, error} = await sb.rpc('send_friend_request', {target_email: em});
    btn.disabled = false; if(error){ toast(/slow down/.test(error.message || '') ? "That's a lot of requests today. Try again tomorrow." : "Couldn't send it. Try again."); return; }
    frSent = {em, invited: res === 'invited'}; if(frSent.invited) frSent.mail = await inviteMail(em); render(); loadFriends(true); return; }
  if(kind === 'newtag'){
    const id = e.target.dataset.id, r = R(id), raw = ($('#newtag').value || '').replace(/\s+/g, ' ').trim(); if(!r || !raw) return;
    const t = raw.charAt(0).toUpperCase() + raw.slice(1), ex = allTags().find(x => x.toLowerCase() === t.toLowerCase()) || t;
    const cur = tagsOf(r);
    mutate(k => { const c = k.progress.ctags = k.progress.ctags || []; if(!TAGS0.includes(ex) && !c.includes(ex)) c.push(ex); if(!cur.includes(ex)) (k.progress.tags = k.progress.tags || {})[id] = cur.concat(ex); });
    $('#newtag').value = ''; return;
  }
  if(kind === 'itemedit'){
    const it = editItem && allItems().find(i => i.id === editItem.id); if(!it) return;
    const name = $('#ed-name').value.trim().replace(/\s+/g, ' '); let qty = (($('#ed-qty') || {}).value || '').trim().replace(/\s+/g, ' '); if(!name) return;
    const parts = itemScaled(it) ? null : itemRecipeParts(it), warns = [];
    if(parts){ const typed = parts.map((x, i) => (($('#ed-q' + i) || {}).value || '').trim().replace(/\s+/g, ' '));
      const ps = parts.map((x, i) => { const oq = partQ(it, x); return Object.assign({}, x, {oq, nq: scaleParen(oq, typed[i])}); });
      ps.forEach((x, i) => { const w = checkAmt(x.oq, x.nq); if(w) warns.push(Object.assign({i, label: partLabel(x)}, w)); });
      if(warns.length){ editItem = {id: it.id, step: 'warn', name, ps, warns, draft: {name, qs: typed}}; render(); return; }
      itemEditGo(it, name, null, ps); return; }
    if(qty !== (it.qty || '')){ const typed = qty; qty = scaleParen(it.qty || '', qty); const w = checkAmt(it.qty || '', qty);
      if(w){ editItem = {id: it.id, step: 'warn', name, qty, warns: [w], draft: {name, qty: typed}}; render(); return; } }
    itemEditGo(it, name, qty, null); return;
  }
  if(kind === 'additem'){
    const name = $('#addName').value.trim(); if(!name) return;
    const qty = $('#addQty').value.trim(), section = $('#addSec').value || 'Other', forId = ($('#addFor') || {}).value || '';
    const id = 'c-' + Date.now().toString(36) + rid().slice(0, 4);
    mutate(k => { if(!k.shopping.items.some(i => i.id === id)) k.shopping.items.push({id, name, qty, section, key: splitIngredient(name).key, recipes: forId ? [forId] : [], custom:true}); if(forId) k.progress.active[forId] = true; });
    ui.sec = section; saveUi(); $('#addName').value = ''; $('#addQty').value = '';
    if(ui.filter === 'cart' || ui.filter === 'have'){ ui.filter = 'all'; saveUi(); }
    render(); toast('Added ' + name); const n = $('#addName'); if(n) n.focus({preventScroll:true});
  }
  if(kind === 'password'){
    const cur = $('#pw-cur').value, nw = $('#pw-new').value, nw2 = $('#pw-new2').value;
    if(nw !== nw2){ toast("The new passwords don't match"); return; }
    if(nw.length < 6){ toast('Use at least 6 characters'); return; }
    const check = await sb.auth.signInWithPassword({email: user.email, password: cur});
    if(check.error){ toast('Your current password is incorrect'); return; }
    const {error} = await sb.auth.updateUser({password: nw});
    if(error) toast("Couldn't update: " + error.message); else { ['#pw-cur','#pw-new','#pw-new2'].forEach(s => { const f = $(s); if(f) f.value = ''; }); toast('Password updated'); }
    return;
  }
  if(kind === 'name'){
    const name = $('#acc-name').value.trim();
    const {data, error} = await sb.auth.updateUser({data:{name}});
    if(error) toast("Couldn't save your name"); else { user = data.user; toast('Saved'); render(); }
  }
});
document.addEventListener('change', e => { if(!e.target.classList || !e.target.classList.contains('sendck')) return; const n = document.querySelectorAll('.sendck:checked').length, b = $('#send-go'); if(b){ b.disabled = !n; b.textContent = n ? 'Send' : 'Pick a friend'; } });
window.addEventListener('hashchange', () => { if(filedNew && route().v === 'recipes'){ filedNew = false; tinLoad(); } addSheet = null; pickSheet = null; homeMode = false; editItem = null; mealPick = null; mealShop = null; if(mealBack && !['#r-' + mealBack, '#edit-' + mealBack, '#meal'].includes(location.hash)) mealBack = null; if(location.hash !== '#shopping') shopBack = false; addFriendOpen = false; frSent = null; sendSheet = null; fQ = ''; fCatOpen = false; fSortOpen = false; if(!/^#fr?-/.test(location.hash)){ fCat = []; fSavedOnly = false; } if(/^#(friends|f-)/.test(location.hash)) loadFriends(); choosing = null; moreOpen = false; shopQ = ''; catOpen = false; sortOpen = false; tagEdit = null;
  if(form && !/^#(add|edit-)/.test(location.hash)){ if(form.photoUrl) URL.revokeObjectURL(form.photoUrl); form = null; } // leaving the form without saving: next visit starts fresh
  render(); });

boot();

// --- recipe page: back to top ---
let toTop = null;
function onNavScroll(){
  const tb = document.getElementById('timers'); document.documentElement.style.setProperty('--navlift', (tb && tb.children.length ? tb.offsetHeight : 0) + 'px');
  if(!toTop){ toTop = document.createElement('button'); toTop.className = 'totop'; toTop.type = 'button'; toTop.setAttribute('aria-label', 'Back to top'); toTop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>'; toTop.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'})); document.body.appendChild(toTop); }
  toTop.classList.toggle('show', route().v === 'recipe' && window.scrollY > innerHeight * 1.5);
}
window.addEventListener('scroll', onNavScroll, {passive: true});
window.addEventListener('resize', onNavScroll);

async function acceptInvite(){
  const t = inviteToken(); if(!t) return;
  const {data, error} = await sb.rpc('accept_invite_link', {t});
  forgetInvite(); inviteInfo = null;
  if(error){ toast("Couldn't accept the invite. Ask for a new link."); render(); return; }
  if(data) toast(`You and ${data} are now friends`); else toast("That's your own invite link");
  await loadFriends(true);
}
function afterInviteLogin(){
  if(!inviteToken()) return;
  rememberInvite(inviteToken()); if(location.hash !== '#friends') location.hash = 'friends'; else render();
}
window.addEventListener('focus', () => { if(user && loaded) loadFriends(); });
// Positioning a photo in the recipe form: drag to move, slider to zoom.
(() => { let drag = null;
  const apply = img => { const pp = form && form.photoPos; if(!pp || !img) return; img.style.objectPosition = pp.x + '% ' + pp.y + '%'; img.style.transform = `scale(${pp.z})`; img.style.transformOrigin = pp.x + '% ' + pp.y + '%'; };
  document.addEventListener('pointerdown', e => { const img = e.target.closest && e.target.closest('#f-pic.canpos img'); if(!img || !form || !form.photoPos) return; e.preventDefault(); img.setPointerCapture && img.setPointerCapture(e.pointerId); drag = {img, x: e.clientX, y: e.clientY, px: form.photoPos.x, py: form.photoPos.y, w: img.clientWidth, h: img.clientHeight}; });
  document.addEventListener('pointermove', e => { if(!drag) return; const pp = form && form.photoPos; if(!pp) return; const k = 100 / pp.z;
    pp.x = Math.max(0, Math.min(100, drag.px - (e.clientX - drag.x) / drag.w * k)); pp.y = Math.max(0, Math.min(100, drag.py - (e.clientY - drag.y) / drag.h * k)); apply(drag.img); });
  document.addEventListener('pointerup', () => { drag = null; }); document.addEventListener('pointercancel', () => { drag = null; });
  document.addEventListener('input', e => { if(e.target.id !== 'f-zoom' || !form || !form.photoPos) return; form.photoPos.z = +e.target.value || 1; apply(document.querySelector('#f-pic img')); });
})();
