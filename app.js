import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { STARTERS } from './starter.js';
import { art, guessArt as guessKind } from './art.js?v=11';
import { parseRecipeText, ingTextToGroups, groupsToIngText, stepTextToSections, sectionsToStepText, splitIngredient, guessSection, SECTIONS, prettyFractions, addQty } from './parse.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = s => esc(prettyFractions(s)).replace(/([½¼¾⅓⅔⅛⅜⅝⅞])/g, '<span class="fr">$1</span>');
const clone = o => JSON.parse(JSON.stringify(o == null ? {} : o));
const rid = () => Math.random().toString(36).slice(2, 10);
const ARTS = ['pie','lasagna','cakepops','cake','cookies','bread','soup','pasta','bowl'];
const ART_NAMES = {pie:'Pie',lasagna:'Lasagna',cakepops:'Cake pops',cake:'Layer cake',cookies:'Cookies',bread:'Bread',soup:'Soup',pasta:'Pasta',bowl:'Mixing bowl'};
const PALETTE = ['#4B57A8','#D9772B','#D9487A','#3F7A55','#8A5BC2','#B7862F','#2F8A9B','#C8553D'];

/* ---------------- state ---------------- */
let sb = null, session = null, user = null;
let authView = {mode:'signin', msg:'', err:'', busy:false};
let recovering = false;
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
let toastT; function toast(t){ const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400); }

/* ------------- saving the kitchen row (shopping + progress) -------------
   Each change is a small function. It runs on the local copy right away, and on save
   it runs again on the freshest copy from the server, so two devices don't overwrite each other. */
let queue = [], flushing = false, flushT = null;
function mutate(fn){
  fn(kitchen); render();
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
    kitchen = fresh; queue.forEach(f => f(kitchen));
    flushing = false;
    if(queue.length) flush(); else { setStatus('ok', 'Saved'); render(); }
  }catch(e){
    console.error(e); queue = fns.concat(queue); flushing = false;
    setStatus('err', 'Not saved — retrying'); flushT = setTimeout(flush, 4000);
  }
}
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') flush(); else { reWake(); if(user && !queue.length && !flushing) loadAll(true); } });
window.addEventListener('pagehide', flush);

/* ---------------- boot & auth ---------------- */
async function boot(){
  if(!SUPABASE_URL || /YOUR_/.test(SUPABASE_URL) || !SUPABASE_ANON_KEY || /YOUR_/.test(SUPABASE_ANON_KEY)){
    app.innerHTML = `<div class="card panel" style="max-width:520px;margin:30px auto"><h3>Almost there</h3><p class="muted">This site isn't connected to its database yet. Add your Supabase project URL and anon key to <b>config.js</b> (see README).</p></div>`;
    return;
  }
  const mod = window.__mockSupabase || await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
function stopUser(){ isAdmin = false; adminData = null; if(channel){ try{ sb.removeChannel(channel); }catch(e){} channel = null; } recipes = []; kitchen = blankKitchen(); loaded = false; queue = []; }
async function startUser(){
  stopUser(); render();
  await loadAll();
  try{
    channel = sb.channel('kitchen-' + user.id)
      .on('postgres_changes', {event:'*', schema:'public', table:'kitchens', filter:'user_id=eq.' + user.id}, p => { if(!queue.length && !flushing && p.new && p.new.user_id){ kitchen = normalize(p.new); render(); } })
      .on('postgres_changes', {event:'*', schema:'public', table:'recipes'}, () => loadRecipes())
      .subscribe();
  }catch(e){ console.warn('realtime off', e); }
}
async function loadRecipes(){
  const {data, error} = await sb.from('recipes').select('id, sort, data').order('sort', {ascending:true});
  if(!error){ recipes = data || []; render(); }
}
async function loadAll(quiet){
  if(!quiet) setStatus('busy', 'Loading…');
  try{
    const [r, k] = await Promise.all([
      sb.from('recipes').select('id, sort, data').order('sort', {ascending:true}),
      sb.from('kitchens').select('*').eq('user_id', user.id).maybeSingle()
    ]);
    if(r.error) throw r.error; if(k.error) throw k.error;
    recipes = r.data || [];
    if(!queue.length && !flushing) kitchen = normalize(k.data);
    if(!k.data){ await sb.from('kitchens').upsert({user_id: user.id, shopping: kitchen.shopping, progress: kitchen.progress}); }
    loaded = true; setStatus('ok', 'Saved');
    sb.rpc('is_admin').then(({data}) => { const v = data === true; if(v !== isAdmin){ isAdmin = v; render(); } }, () => {});
  }catch(e){ console.error(e); setStatus('err', "Can't reach your kitchen"); loaded = true; }
  render();
}

function renderAuth(){
  const v = authView, m = v.mode;
  if(recovering){
    return `<div class="authwrap"><div class="card panel auth"><h2>Set a new password</h2>
      <form data-form="newpass"><input class="tin" type="password" id="np" placeholder="New password (6+ characters)" minlength="6" required autocomplete="new-password">
      <button class="btn primary big" type="submit">${v.busy ? 'Saving…' : 'Save password'}</button></form>
      ${v.err ? `<div class="err">${esc(v.err)}</div>` : ''}</div></div>`;
  }
  const title = m === 'signup' ? 'Create your kitchen' : m === 'forgot' ? 'Reset your password' : 'Welcome to <span style="white-space:nowrap">Mixing Bowl!</span>';
  return `<div class="authwrap">
    <div class="authhero">${AUTH_ART}</div>
    <div class="card panel auth"><h2>${title}</h2>
    <p class="muted" style="margin:4px 0 14px">${m === 'signup' ? 'Save recipes, build a shopping list, and follow along step by step on any device.' : m === 'forgot' ? "Enter your email and we'll send you a link." : 'Sign in to view your recipes and shopping list.'}</p>
    <form data-form="${m}">
      ${m === 'signup' ? `<input class="tin" id="au-name" data-keep placeholder="First name" maxlength="40" required autocomplete="given-name">` : ''}
      <input class="tin" id="au-email" data-keep type="email" placeholder="Email" required autocomplete="email">
      ${m !== 'forgot' ? `<input class="tin" id="au-pass" type="password" placeholder="Password${m === 'signup' ? ' (6+ characters)' : ''}" minlength="6" required autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}">` : ''}
      <button class="btn primary big" type="submit" ${v.busy ? 'disabled' : ''}>${v.busy ? 'One sec…' : m === 'signup' ? 'Create account' : m === 'forgot' ? 'Send reset link' : 'Sign in'}</button>
    </form>
    ${m === 'signup' ? `<div class="fine">By creating an account, you confirm you're 13 or older and agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy</a> notice.</div>` : ''}
    ${v.err ? `<div class="err">${esc(v.err)}</div>` : ''}${v.msg ? `<div class="ok">${esc(v.msg)}</div>` : ''}
    <div class="authlinks">
      ${m !== 'signin' ? `<button class="linkbtn" data-act="authmode" data-m="signin">I have an account — sign in</button>` : `<button class="linkbtn" data-act="authmode" data-m="signup">New here? Create an account</button><button class="linkbtn" data-act="authmode" data-m="forgot">Forgot password?</button>`}
    </div></div></div>`;
}
async function handleAuthForm(kind){
  const email = ($('#au-email') || {}).value, pass = ($('#au-pass') || {}).value;
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
      const {error} = await sb.auth.updateUser({password: $('#np').value}); if(error) throw error;
      recovering = false; toast('Password updated'); if(user) startUser();
    }
  }catch(e){
    const msg = (e && e.message) || 'Something went wrong.';
    authView.err = /invalid login/i.test(msg) ? "That email and password don't match." : /already registered/i.test(msg) ? 'That email already has an account. Try signing in.' : /rate limit/i.test(msg) ? 'Too many emails sent recently. Please wait a bit and try again.' : msg;
  }
  authView.busy = false; render();
}

/* ---------------- helpers ---------------- */
const R = id => recipes.find(r => r.id === id);
const D = r => (r && r.data) || {};
const P = () => kitchen.progress;
const isArch = id => !!(P().archived || {})[id];
const isActive = id => P().active[id] !== false && !isArch(id);
function stepList(d){ const out = []; (d.steps || []).forEach((sec, si) => (sec.items || []).forEach((st, k) => out.push({key: si + '-' + k, st}))); return out; }
function cookOf(id){ const c = P().cook[id] || {}; return {i: c.i || {}, s: c.s || {}}; }
function progressOf(r){ const all = stepList(D(r)); const c = cookOf(r.id); const done = all.filter(x => c.s[x.key]).length; return {total: all.length, done, cur: all.findIndex(x => !c.s[x.key]), all}; }
const allItems = () => kitchen.shopping.items || [];
const onList = id => isActive(id) && !(P().done || {})[id] && allItems().some(i => (i.recipes || []).includes(id));
const visibleItems = () => allItems().filter(it => !it.recipes || !it.recipes.length || it.recipes.some(x => R(x) ? isActive(x) : false) || (it.custom && !it.recipes.some(x => R(x))));
const firstName = () => ((user && user.user_metadata && user.user_metadata.name) || '').trim();
const artText = d => [d.title || ''].concat((d.ingredients || []).flatMap(g => g.items || [])).join('\n');
const kindOf = d => { const k = guessArt(d.title || ''); return k !== 'bowl' ? k : (d.art || 'bowl'); };
const pic = d => d.photo ? `<img src="${esc(d.photo)}" alt="" loading="lazy">` : art(kindOf(d), artText(d));

function addIngredientsTo(k, recipeId, groups){
  const items = k.shopping.items; const touched = new Set();
  (groups || []).forEach(g => (g.items || []).forEach(line => {
    const {qty, name, key} = splitIngredient(line); if(!key) return;
    let it = items.find(i => (i.key || splitIngredient(i.name).key) === key);
    if(it){
      const linked = (it.recipes || []).includes(recipeId);
      if(linked && !touched.has(it.id)) return;
      if(!linked) it.recipes = (it.recipes || []).concat(recipeId);
      if(qty) it.qty = addQty(it.qty, qty);
      touched.add(it.id);
    } else {
      const id = 'i-' + recipeId.slice(0, 8) + '-' + key.replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      items.push({id, name, qty, key, section: guessSection(name), recipes:[recipeId]});
      touched.add(id);
    }
  }));
}
function removeRecipeFrom(k, recipeId){
  k.shopping.items = k.shopping.items.map(it => Object.assign(it, {recipes: (it.recipes || []).filter(x => x !== recipeId)})).filter(it => it.custom || it.recipes.length);
  delete k.progress.cook[recipeId]; delete k.progress.active[recipeId]; if(k.progress.done) delete k.progress.done[recipeId];
}

/* ---------------- render ---------------- */
function route(){
  const h = (location.hash || '').slice(1);
  if(h.startsWith('r-')) return {v:'recipe', id:h.slice(2)};
  if(h.startsWith('edit-')) return {v:'form', id:h.slice(5)};
  if(h === 'add') return {v:'form'};
  if(['recipes','account','settings','privacy','trips','admin','terms','feedback','help'].includes(h)) return {v:h};
  return {v:'shopping'};
}
let lastView = '';
function render(){
  const kept = {}; document.querySelectorAll('[data-keep]').forEach(el => { if(el.id) kept[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
  const ae = document.activeElement && document.activeElement.id && document.activeElement.hasAttribute('data-keep') ? document.activeElement : null;
  let sel = null; try{ sel = ae && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null; }catch(e){}
  const r = route();
  if(!(user && !recovering && gate !== 'in')) delete app.dataset.gate;
  $('#hdr').innerHTML = renderHeader(r);
  if(!sb){ return; }
  if(!user && r.v === 'privacy'){ app.innerHTML = renderPrivacy(); $('#tabs').innerHTML = ''; }
  else if(!user && r.v === 'terms'){ app.innerHTML = renderTerms(); $('#tabs').innerHTML = ''; }
  else if(!user && r.v === 'feedback'){ app.innerHTML = renderFeedback(); $('#tabs').innerHTML = ''; }
  else if(!user || recovering){ app.innerHTML = renderAuth(); $('#tabs').innerHTML = ''; }
  else if(gate !== 'in'){ const g = renderGate(); if(app.dataset.gate !== g){ app.innerHTML = g; app.dataset.gate = g; } $('#tabs').innerHTML = ''; }
  else if(!loaded){ app.innerHTML = `<div class="grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`; }
  else {
    renderTabs(r);
    if(r.v === 'shopping') app.innerHTML = renderShopping();
    else if(r.v === 'recipes') app.innerHTML = renderRecipes();
    else if(r.v === 'form') app.innerHTML = renderForm(r.id);
    else if(r.v === 'account') app.innerHTML = renderAccount();
    else if(r.v === 'settings') app.innerHTML = renderSettings();
    else if(r.v === 'privacy') app.innerHTML = renderPrivacy();
    else if(r.v === 'terms') app.innerHTML = renderTerms();
    else if(r.v === 'feedback') app.innerHTML = renderFeedback();
    else if(r.v === 'help') app.innerHTML = renderHelp();
    else if(r.v === 'trips') app.innerHTML = renderTrips();
    else if(r.v === 'admin') app.innerHTML = renderAdmin();
    else app.innerHTML = renderRecipe(r.id);
    maybeTour();
  }
  const sameView = (r.v + (r.id || '')) === lastView;
  if(sameView) document.querySelectorAll('[data-keep]').forEach(el => { if(el.id && kept[el.id] != null && el.type !== 'file'){ if(el.type === 'checkbox') el.checked = kept[el.id]; else el.value = kept[el.id]; } });
  { const fp = $('#f-paste'), fb = $('#f-parsebtn'); if(fp && fb) fb.disabled = !fp.value.trim(); }
  if(ae && sameView){ const el = document.getElementById(ae.id); if(el){ el.focus({preventScroll:true}); if(sel && el.setSelectionRange) try{ el.setSelectionRange(sel[0], sel[1]); }catch(e){} } }
  const key = r.v + (r.id || '');
  if(key !== lastView){ window.scrollTo(0, 0); lastView = key; }
  renderFab(r);
}
function renderHeader(r){
  const n = firstName();
  const kn = user && n && !recovering ? `<span class="kname">${esc(n)}'s Kitchen</span>` : '';
  return `<div class="bwrap"><h1>Mixing <span>Bowl</span></h1>${kn}</div><div class="hright">${user && !recovering ? `<div id="status" class="status ${statusNow.kind}"><i class="dot"></i><span>${esc(statusNow.text)}</span></div><button class="avatar" data-act="menu" aria-label="Your menu" aria-expanded="${menuOpen}">${esc((n || (user.email || '?'))[0].toUpperCase())}</button>${menuOpen ? renderMenu() : ''}` : ''}</div>`;
}
function renderTabs(r){
  const left = visibleItems().filter(it => !P().shop[it.id]).length;
  $('#tabs').innerHTML = `<button class="tab ${r.v === 'shopping' ? 'on' : ''}" data-act="go" data-h="shopping">Shopping list${left ? `<span class="n">(${left})</span>` : ''}</button>
  <button class="tab ${r.v !== 'shopping' && r.v !== 'account' ? 'on' : ''}" data-act="go" data-h="recipes">Recipes${recipes.filter(r => !isArch(r.id)).length ? `<span class="n">(${recipes.filter(r => !isArch(r.id)).length})</span>` : ''}</button>`;
}

function renderShopping(){
  const items = visibleItems(), all = allItems(), shop = P().shop, f = ui.filter;
  const done = items.filter(it => shop[it.id]).length;
  const pct = items.length ? Math.round(done / items.length * 100) : 0;
  const chipRecipes = recipes.filter(r => !(P().done || {})[r.id] && !isArch(r.id));
  const chips = chipRecipes.map(r => `<button class="chip ${isActive(r.id) ? 'on' : ''}" style="--c:${esc(D(r).color || '#888')}" data-act="active" data-drag="1" data-id="${esc(r.id)}"><i class="sw"></i>${esc(D(r).short || D(r).title)}</button>`).join(' ');
  const pool = f === 'have' ? all : items;
  const keep = i => { const st = shop[i.id] || ''; return f === 'all' || (f === 'need' && !st) || (f === 'cart' && st === 'bought') || (f === 'have' && st === 'have'); };
  const cnt = {all: items.length, need: items.filter(i => !shop[i.id]).length, cart: items.filter(i => shop[i.id] === 'bought').length, have: all.filter(i => shop[i.id] === 'have').length};
  const fbtn = (k, l) => `<button class="${f === k ? 'on' : ''}" aria-pressed="${f === k}" data-act="filter" data-f="${k}">${l} <span class="fc">${cnt[k]}</span></button>`;
  const order = [...new Set(kitchen.shopping.sections.concat(all.map(i => i.section || 'Other')))];
  let secs = '';
  order.forEach(sec => {
    let list = pool.filter(i => (i.section || 'Other') === sec); if(!list.length) return;
    const left = list.filter(i => !shop[i.id]).length;
    list = list.slice().sort((a, b) => (shop[a.id] ? 1 : 0) - (shop[b.id] ? 1 : 0)).filter(keep);
    if(f !== 'all' && !list.length) return;
    const sub = f === 'have' ? list.length + ' on hand' : f === 'cart' ? list.length + ' in cart' : (left ? left + ' to get' : 'all set ✓');
    secs += `<div class="section" data-sec="${esc(sec)}"><h3>${esc(sec)} <small>${sub}</small><span class="secmv"><button class="up" data-act="secmv" data-s="${esc(sec)}" data-d="-1" aria-label="Move ${esc(sec)} up"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button><button class="dn" data-act="secmv" data-s="${esc(sec)}" data-d="1" aria-label="Move ${esc(sec)} down"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></span></h3><div class="card items">` + list.map(it => {
      const st = shop[it.id] || '';
      const tags = (it.custom ? `<span class="tag" style="--c:#6E6259">Added by you</span>` : '') + (it.recipes || []).map(x => { const rr = R(x); return rr ? `<span class="tag" style="--c:${esc(D(rr).color)}">${esc(D(rr).short || D(rr).title)}</span>` : ''; }).join('');
      return `<div class="item ${st}"><button class="check" data-act="bought" data-id="${esc(it.id)}" aria-label="In my cart">${CHECK}</button>
      <div class="info"><div class="name">${esc(it.name)}</div>${it.qty ? `<div class="qty">${fmt(it.qty)}</div>` : ''}<div class="tags">${tags}</div></div>
      <button class="have" data-act="have" data-id="${esc(it.id)}">${st === 'have' ? 'Have it ✓' : 'Have it'}</button><button class="del" data-act="delitem" data-id="${esc(it.id)}" aria-label="Remove ${esc(it.name)}">✕</button></div>`;
    }).join('') + `</div></div>`;
  });
  const secOpts = kitchen.shopping.sections;
  return `<div class="card shop-head"><button class="copyic" data-act="copy" aria-label="Copy my list" title="Copy what I still need"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2"/></svg></button>
    ${chipRecipes.length ? `<div class="lbl">Shopping for</div><div class="row">${chips}</div><div class="draghint">Done with a recipe? Drag it to Past trips.</div>` : ''}
    <div class="prog-line"><b>${done} of ${items.length} sorted</b><span class="muted">${items.length - done} still remaining</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
  </div>
  ${all.length || (P().trips || []).length ? `<div class="seg" role="group" aria-label="Show">${fbtn('all','All')}${fbtn('need','Need')}${fbtn('cart','In cart')}${fbtn('have','Have')}</div>` : ''}
  ${ui.addOpen ? `<form class="card addcard addf" data-form="additem" autocomplete="off">
      <input id="addName" data-keep placeholder="Item (e.g. blueberries)" maxlength="80" required>
      <input id="addQty" data-keep placeholder="Amount (optional)" maxlength="60">
      <select id="addSec" data-keep aria-label="Section">${secOpts.map(s => `<option ${s === ui.sec ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select id="addFor" data-keep aria-label="Which recipe is it for?"><option value="">No specific recipe</option>${recipes.map(r => `<option value="${esc(r.id)}">For ${esc(D(r).short || D(r).title)}</option>`).join('')}</select>
      <button class="btn primary" type="submit">+ Add</button>
      <button class="btn" type="button" data-act="addclose">Done</button>
    </form>` : `<button class="addrow" data-act="addopen"><span>+</span> Add an item</button>`}
  <div class="f-${f}">${secs || `<div class="card empty">${!all.length ? 'Nothing here yet. Open a recipe and tap <b>Add to shopping list</b>, or add an item above.' : f === 'have' ? 'Nothing marked “Have it” yet.' : f === 'cart' ? 'Nothing in your cart yet.' : "All set — time to cook! 🎉"}</div>`}</div>
  ${all.length || (P().trips || []).length ? `<div class="tripfoot">${all.length ? `<div class="tf-q">Done shopping?</div><p>Finished recipes move to Past trips. Anything you still need stays on your list.</p><button class="btn primary" data-act="resetshop">Start a new trip</button>` : ''}<button class="tf-link" data-act="go" data-h="trips">Past trips (${(P().trips || []).length})</button></div>` : ''}
  ${chipRecipes.length ? `<div id="tripDrop" class="dropzone" aria-hidden="true"><svg class="bi" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 7v5l3 2"/></svg>Drop here to move to Past trips</div>` : ''}`;
}

function renderRecipes(){
  const addTile = `<button class="tile addtile" data-act="go" data-h="add"><span class="plus">+</span><span class="body"><h2>Add a recipe</h2><span class="meta">From a link or paste</span></span></button>`;
  const starters = !recipes.length ? `<div class="card panel" style="margin-bottom:16px"><h3>Start with a favorite?</h3><p class="muted" style="margin:4px 0 12px">Add our Blueberry Pie to try things out. Remove it anytime.</p><button class="btn primary" data-act="starters">Add Blueberry Pie</button></div>` : '';
  const live = recipes.filter(r => !isArch(r.id)), arch = recipes.filter(r => isArch(r.id));
  const search = recipes.length > 1 ? `<div class="rsearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="rsearch" type="search" placeholder="Search recipes" aria-label="Search recipes" autocomplete="off"></div>` : '';
  const archBox = arch.length ? `<details class="card archbox" id="archbox"><summary>Archived <span class="fc">${arch.length}</span><span class="chev">▾</span></summary>${arch.map(r => `<div class="arow" data-q="${esc((D(r).title + ' ' + (D(r).short || '')).toLowerCase())}"><button class="aname" data-act="go" data-h="r-${esc(r.id)}"><i class="sw" style="--c:${esc(D(r).color || '#888')}"></i>${esc(D(r).title)}</button><button class="btn" data-act="unarch" data-id="${esc(r.id)}">Unarchive</button></div>`).join('')}</details>` : '';
  return starters + search + `<div class="grid" id="rgrid">` + addTile + live.map(r => {
    const d = D(r), p = progressOf(r), pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    const st = p.done === 0 ? 'Not started' : p.done === p.total ? 'Finished ✓' : `Step ${p.cur + 1} of ${p.total}`;
    return `<div class="tile" role="link" tabindex="0" style="--c:${esc(d.color)}" data-act="go" data-h="r-${esc(r.id)}" data-q="${esc((d.title + ' ' + (d.short || '')).toLowerCase())}">
      <span class="art">${pic(d)}</span><button class="tilex" data-act="recipex" data-id="${esc(r.id)}" aria-label="Archive or delete ${esc(d.title)}" title="Archive or delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <span class="body"><h2>${esc(d.title)}</h2><span class="meta">${d.total ? `<span>⏱ ${esc(d.total)}</span>` : ''}${d.yield ? `<span>🍽 ${esc(d.yield)}</span>` : ''}</span>
      <span class="st">${st}</span><span class="bar"><i style="width:${pct}%"></i></span></span></div>`;
  }).join('') + `</div><div class="card empty" id="rnone" hidden>No recipes match.</div>` + archBox;
}

function renderRecipe(id){
  const r = R(id);
  if(!r) return `<button class="back" data-act="go" data-h="recipes">← All recipes</button><div class="card empty">That recipe isn't here anymore.</div>`;
  const d = D(r), c = cookOf(r.id), p = progressOf(r), pct = p.total ? Math.round(p.done / p.total * 100) : 0;
  const ings = (d.ingredients || []).map((g, gi) => (g.group ? `<div class="grp">${esc(g.group)}</div>` : '') + (g.items || []).map((t, k) => { const key = gi + '-' + k; return `<button class="ing ${c.i[key] ? 'on' : ''}" data-act="ing" data-id="${esc(r.id)}" data-k="${key}"><i class="box">${CHECK}</i><span>${fmt(t)}</span></button>`; }).join('')).join('');
  let n = 0; const curKey = p.cur >= 0 && p.all[p.cur] ? p.all[p.cur].key : null;
  const steps = (d.steps || []).map((sec, si) => (sec.section ? `<div class="stephead">${esc(sec.section)}</div>` : '') + (sec.items || []).map((st, k) => {
    const key = si + '-' + k; n++; const done = !!c.s[key]; const cur = !done && key === curKey;
    const tm = (st.timers || []).map(t => `<span class="tchip" data-act="timer" data-min="${+t.min}" data-label="${esc(t.label)}">⏲ ${esc(t.label)}</span>`).join('');
    return `<button class="step ${done ? 'done' : ''} ${cur ? 'cur' : ''}" id="s-${key}" data-act="step" data-id="${esc(r.id)}" data-k="${key}"><span class="num">${done ? '✓' : n}</span><span class="tx">${st.title ? `<div class="tt">${esc(st.title)}</div>` : ''}<p>${fmt(st.text)}</p>${tm ? `<div class="tchips">${tm}</div>` : ''}</span></button>`;
  }).join('')).join('');
  const links = (d.links || []).filter(l => /^https?:\/\//i.test(l.url || '')).map(l => `<a class="lchip" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || 'Original recipe')} ↗</a>`).join('');
  const notes = d.notes && d.notes.length ? `<div class="notes"><b>Good to know</b><ul>${d.notes.map(x => `<li>${fmt(x)}</li>`).join('')}</ul></div>` : '';
  return `<button class="back" data-act="go" data-h="recipes">← All recipes</button>
  <div class="card hero"><div class="art ${d.photo ? 'photo' : 'drawn'}">${d.photo ? pic(d) : `<div class="artbg">${art(kindOf(d), artText(d))}</div><div class="artfg">${art(kindOf(d), artText(d)).replace('xMidYMid slice', 'xMidYMid meet')}</div>`}<label class="heroedit" title="Change image" aria-label="Change image">${photoBusy === r.id ? '<span class="spin dark"></span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>'}<input type="file" accept="image/*" hidden data-photo-for="${esc(r.id)}"></label></div><div class="body">
    <h2>${esc(d.title)}</h2>
    <div class="meta">${d.yield ? `<span>🍽 ${esc(d.yield)}</span>` : ''}${d.prep ? `<span>Prep ${esc(d.prep)}</span>` : ''}${d.cook ? `<span>Cook ${esc(d.cook)}</span>` : ''}${d.total ? `<span>⏱ Total ${esc(d.total)}</span>` : ''}</div>
    ${links ? `<div class="row src">${links}</div>` : ''}
    <div class="prog-line" style="margin-top:0"><b>${p.total && p.done === p.total ? 'All done — enjoy!' : `${p.done} of ${p.total} steps done`}</b><span class="muted">${pct}%</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="row" style="margin-top:12px">${isArch(r.id) ? `<button class="btn primary" data-act="unarch" data-id="${esc(r.id)}">Unarchive</button>` : ''}${!onList(r.id) && !isArch(r.id) ? `<button class="btn primary addlist" data-act="relist" data-id="${esc(r.id)}"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>Add to shopping list</button>` : ''}<button class="btn ${wakeLock ? 'on' : ''}" data-act="wake"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>${wakeLock ? 'Screen staying on' : 'Keep screen on'}</button><button class="btn" data-act="go" data-h="edit-${esc(r.id)}">Edit recipe</button><button class="btn" data-act="resetrecipe" data-id="${esc(r.id)}">Reset progress</button>${isArch(r.id) ? '' : `<button class="btn" data-act="recipex" data-id="${esc(r.id)}">Archive or delete</button>`}</div>
  </div></div>
  <div class="layout">
    <div class="card panel ing-col"><h3>Ingredients</h3>${ings || '<div class="muted">No ingredients yet.</div>'}</div>
    <div><h3 style="font-size:19px;margin:0 4px 10px">Steps</h3>${steps || '<div class="card empty">No steps yet.</div>'}
    ${p.total && p.done === p.total ? `<div class="card finish">🎉 You made ${esc(d.title)}!</div>` : ''}${notes}
    ${links ? `<div class="card panel origbox"><b>Photos and tips</b><div class="lchips">${links}</div></div>` : ''}</div>
  </div>`;
}
function renderFab(r){
  const old = $('#fab'); if(old) old.remove();
  if(r.v !== 'recipe') return; const rr = R(r.id); if(!rr) return; const p = progressOf(rr); if(p.cur < 0 || p.done === 0) return;
  const b = document.createElement('button'); b.id = 'fab'; b.className = 'btn primary fab'; b.textContent = '↓ Current step'; b.dataset.act = 'jump'; b.dataset.k = p.all[p.cur].key; document.body.appendChild(b);
}

/* ---------------- add / edit form ---------------- */
let form = null; // {forId, photoBlob, photoUrl, removePhoto, busy, err}
function ensureForm(id){
  if(!form || form.forId !== (id || 'new')){
    if(form && form.photoUrl) URL.revokeObjectURL(form.photoUrl);
    form = {forId: id || 'new', photoBlob: null, photoUrl: null, removePhoto: false, busy: false, err: '', filled: false, importing: false, importMsg: '', importOk: false};
  }
  return form;
}
function renderForm(id){
  const r = id ? R(id) : null;
  if(id && !r) return `<button class="back" data-act="go" data-h="recipes">← All recipes</button><div class="card empty">That recipe isn't here anymore.</div>`;
  const f = ensureForm(id), d = r ? D(r) : {};
  const link = (d.links || []).find(l => l.url) || {};
  const v = (k, dv) => esc(dv == null ? '' : dv);
  const photoNow = f.photoUrl || (!f.removePhoto && d.photo) || null;
  return `<button class="back" data-act="go" data-h="${r ? 'r-' + esc(r.id) : 'recipes'}">← ${r ? 'Back to recipe' : 'All recipes'}</button>
  <div class="card panel form">
    <h3>${r ? 'Edit recipe' : 'Add a recipe'}</h3>
    <div class="lbl2">Recipe website link <span class="hint">recommended</span></div>
    <div class="linkrow"><input class="tin" id="f-link" data-keep type="url" inputmode="url" placeholder="Paste a recipe link" value="${v('link', link.url)}"></div>
    ${!r && f.importing ? `<div class="importmsg">Importing…</div>` : !r && f.importMsg ? `<div class="importmsg ${f.importOk ? 'ok' : ''}">${esc(f.importMsg)}</div>` : ''}
    <div class="lbl2">Recipe title <span class="hint">required</span></div>
    <input class="tin" id="f-title" data-keep maxlength="90" placeholder="e.g. Grandma's apple crisp" value="${v('title', d.title)}">
    ${r ? '' : `
    ${f.importOk ? '' : `<div class="lbl2">Or paste the recipe</div>
    <textarea class="tin" id="f-paste" data-keep rows="5" placeholder="Copy the recipe from the site and paste it here"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary sm" type="button" data-act="parse" id="f-parsebtn" disabled><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>Download into form</button></div>`}`}
    <fieldset class="lockable" ${!r && !f.filled ? 'disabled' : ''}>
    <div class="g4">
      <div><div class="lbl2">Serves / makes</div><input class="tin" id="f-yield" data-keep maxlength="40" value="${v('y', d.yield)}"></div>
      <div><div class="lbl2">Prep time</div><input class="tin" id="f-prep" data-keep maxlength="40" value="${v('p', d.prep)}"></div>
      <div><div class="lbl2">Cook time</div><input class="tin" id="f-cook" data-keep maxlength="40" value="${v('c', d.cook)}"></div>
      <div><div class="lbl2">Total time</div><input class="tin" id="f-total" data-keep maxlength="40" value="${v('t', d.total)}"></div>
    </div>
    <div class="lbl2">Ingredients</div>
    <textarea class="tin" id="f-ing" data-keep rows="9">${esc(groupsToIngText(d.ingredients))}</textarea>
    <div class="lbl2">Steps</div>
    <textarea class="tin" id="f-steps" data-keep rows="9">${esc(sectionsToStepText(d.steps))}</textarea>
    <div class="lbl2">Notes <span class="hint">optional</span></div>
    <textarea class="tin" id="f-notes" data-keep rows="3">${esc((d.notes || []).join('\n'))}</textarea>
    <div class="lbl2">Image</div>
    <div class="picwrap">
      <div class="picprev" id="f-pic">${photoNow ? `<img src="${esc(photoNow)}" alt="">` : art(guessArt(($('#f-title') || {}).value || d.title || ''), ($('#f-title') || {}).value || d.title || '')}</div>
      <label class="picbtn" title="Upload your own photo" aria-label="Upload your own photo"><input type="file" id="f-photo" accept="image/*" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg></label>
      ${photoNow ? `<button class="picbtn picx" type="button" data-act="rmphoto" title="Use the drawing" aria-label="Use the drawing"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}
    </div>
    ${r && onList(r.id) ? `<label class="cb"><input type="checkbox" id="f-addlist" data-keep> Add new ingredients to list</label>` : ''}
    </fieldset>
    <div class="row" style="margin-top:16px"><button class="btn primary sm" type="button" data-act="saveform" data-id="${r ? esc(r.id) : ''}" ${f.busy || (!r && !f.filled) ? 'disabled' : ''}>${f.busy ? 'Saving…' : r ? 'Save changes' : 'Save recipe'}</button></div>
    ${f.err ? `<div class="err">${esc(f.err)}</div>` : ''}
  </div>`;
}
function fillFromPaste(){
  const raw = ($('#f-paste') || {}).value || '';
  if(!raw.trim()){ toast('Paste the recipe first'); return; }
  const p = parseRecipeText(raw);
  const set = (id, val, force) => { const el = $(id); if(el && val && (force || !el.value.trim())) el.value = val; };
  set('#f-title', p.title); set('#f-yield', p.yield); set('#f-prep', p.prep); set('#f-cook', p.cook); set('#f-total', p.total);
  set('#f-ing', p.ingredients, true); set('#f-steps', p.steps, true); set('#f-notes', p.notes);
  if(!p.ingredients){ toast("Couldn't find ingredients. Paste just the recipe."); return; }
  form.filled = true; render();
  toast('Filled in');
}
async function importLink(){
  const url = (($('#f-link') || {}).value || '').trim();
  if(!/^https?:\/\/\S+\.\S+/i.test(url)){ toast('Paste a full https:// link'); return; }
  if(form.importing) return;
  form.importing = true; form.importMsg = ''; render();
  let p = null, msg = '';
  try{
    const {data, error} = await sb.functions.invoke('import-recipe', {body: {url}});
    if(error) throw error;
    if(data && data.ingredients) p = data; else if(data && data.caption) p = {caption: data.caption}; else msg = (data && data.error) || '';
  }catch(err){ console.error(err); }
  form.importing = false;
  if(!p){ form.importOk = false; form.importMsg = (/share that page/.test(msg) ? "This site doesn't allow imports." : msg || "Couldn't import that link.") + ' Paste it below.'; render(); return; }
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
    q.title = (q.title || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').trim();
    const set = (id, val, force) => { const el = $(id); if(el && val && (force || !el.value.trim())) el.value = val; };
    set('#f-title', q.title); set('#f-yield', q.yield); set('#f-prep', q.prep); set('#f-cook', q.cook); set('#f-total', q.total);
    set('#f-ing', q.ingredients, true); set('#f-steps', q.steps, true); set('#f-notes', q.notes);
    form.filled = !!(q.title || q.steps); form.importOk = true;
    form.importMsg = q.ingredients ? '✓ Pulled from the Instagram caption. Check it over before saving.' : '✓ Pulled from the Instagram caption. It had no ingredient list, so add those before saving.';
    render(); return;
  }
  const set = (id, val, force) => { const el = $(id); if(el && val && (force || !el.value.trim())) el.value = val; };
  set('#f-title', p.title); set('#f-yield', p.yield); set('#f-prep', p.prep); set('#f-cook', p.cook); set('#f-total', p.total);
  set('#f-ing', p.ingredients, true); set('#f-steps', p.steps, true); set('#f-notes', p.notes);
  if(p.title) $('#f-title').value = p.title;
  form.filled = true; form.importOk = true; form.importMsg = '✓ Imported'; render();
}
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
async function saveForm(id){
  const f = form, existing = id ? R(id) : null, old = existing ? D(existing) : {};
  const val = s => (($(s) || {}).value || '').trim();
  const title = val('#f-title');
  if(!title){ f.err = 'Add a recipe title.'; render(); return; }
  if(!val('#f-ing')){ f.err = 'Add the ingredients (paste the recipe and tap Download into form).'; render(); return; }
  const ingredients = ingTextToGroups(val('#f-ing'));
  const steps = stepTextToSections(val('#f-steps'), old.steps);
  const link = val('#f-link');
  const data = Object.assign({}, old, {
    title, short: title.length > 22 ? title.slice(0, 20).trim() + '…' : title,
    yield: val('#f-yield'), prep: val('#f-prep'), cook: val('#f-cook'), total: val('#f-total'),
    ingredients, steps, notes: val('#f-notes').split('\n').map(s => s.trim()).filter(Boolean),
    links: /^https?:\/\//i.test(link) ? [{label:'Original recipe', url:link}].concat((old.links || []).filter(l => l.url !== link && l.label !== 'Original recipe')) : (old.links || []).filter(l => l.label !== 'Original recipe'),
    color: old.color || PALETTE[recipes.length % PALETTE.length]
  });
  data.art = guessArt(title);
  const addList = ($('#f-addlist') || {}).checked;
  f.busy = true; f.err = ''; render();
  try{
    let recId = id;
    if(!id){
      const {data: row, error} = await sb.from('recipes').insert({user_id: user.id, sort: Date.now(), data}).select('id, sort, data').single();
      if(error) throw error; recId = row.id; recipes.push(row);
    }
    let oldPath = null;
    if(f.photoBlob){ const up = await uploadPhoto(recId, f.photoBlob); oldPath = old.photoPath; data.photo = up.url; data.photoPath = up.path; }
    else if(f.removePhoto){ oldPath = old.photoPath; delete data.photo; delete data.photoPath; }
    if(id || f.photoBlob){
      const {error} = await sb.from('recipes').update({data}).eq('id', recId); if(error) throw error;
      const row = R(recId); if(row) row.data = data;
    }
    if(oldPath) sb.storage.from('photos').remove([oldPath]).catch(() => {});
    if(!id) mutate(k => { k.progress.active[recId] = false; });
    if(addList) mutate(k => { addIngredientsTo(k, recId, ingredients); k.progress.active[recId] = true; if(k.progress.done) delete k.progress.done[recId]; });
    if(f.photoUrl) URL.revokeObjectURL(f.photoUrl);
    form = null; toast(id ? 'Saved changes' : 'Saved! Tap Add to shopping list when you\'re ready.');
    location.hash = 'r-' + recId; loadRecipes();
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
async function deleteRecipe(id){
  const r = R(id); if(!r) return;
  try{
    const {error} = await sb.from('recipes').delete().eq('id', id); if(error) throw error;
    if(D(r).photoPath) sb.storage.from('photos').remove([D(r).photoPath]).catch(() => {});
    recipes = recipes.filter(x => x.id !== id);
    mutate(k => removeRecipeFrom(k, id));
    location.hash = 'recipes'; toast('Recipe removed');
  }catch(e){ toast("Couldn't remove it. Try again."); }
}

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
  const o = aisleOrder();
  const up = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>', dn = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card aisles" data-stop><h3>Aisle order</h3>
    <ol class="alist">${o.map((s, i) => `<li class="${i === focus ? 'moved' : ''}"><span>${esc(s)}</span><button class="mv" data-act="aislemove" data-i="${i}" data-d="-1" aria-label="Move ${esc(s)} up" ${i === 0 ? 'disabled' : ''}>${up}</button><button class="mv" data-act="aislemove" data-i="${i}" data-d="1" aria-label="Move ${esc(s)} down" ${i === o.length - 1 ? 'disabled' : ''}>${dn}</button></li>`).join('')}</ol>
    <div class="row"><button class="btn primary" data-act="mclose">Done</button></div></div></div>`;
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
  mutate(k => {
    const marks = k.progress.shop = k.progress.shop || {};
    const its = k.shopping.items.filter(i => (i.recipes || []).includes(id));
    const t = k.progress.trips = k.progress.trips || [];
    if(!(t[0] && t[0].at === at)){ t.unshift({at, rid: id, r: [name], items: its.filter(i => marks[i.id]).map(i => ({id: i.id, n: i.name, q: i.qty || '', s: marks[i.id]}))}); if(t.length > 60) t.length = 60; }
    its.forEach(i => { if((i.recipes || []).length === 1) delete marks[i.id]; });
    k.progress.active[id] = false;
    (k.progress.done = k.progress.done || {})[id] = true;
  });
  toast(name + ' moved to Past trips');
}
function newTrip(){
  const at = new Date().toISOString(), live = recipes.filter(r => isActive(r.id) && !(P().done || {})[r.id]);
  const fin0 = live.filter(r => { const its = allItems().filter(i => (i.recipes || []).includes(r.id)); return its.length && its.every(i => P().shop[i.id]); });
  const moved = fin0.map(r => D(r).short || D(r).title);
  mutate(k => {
    const marks = k.progress.shop = k.progress.shop || {}, logged = k.progress.logged = k.progress.logged || {};
    Object.keys(logged).forEach(id => { if(!marks[id]) delete logged[id]; });
    const itemsOf = id => k.shopping.items.filter(i => (i.recipes || []).includes(id));
    const fin = live.filter(r => { const its = itemsOf(r.id); return its.length && its.every(i => marks[i.id]); }).map(r => r.id);
    const loose = k.shopping.items.filter(i => !(i.recipes || []).some(x => R(x)) && marks[i.id]);
    const shown = k.shopping.items.filter(i => marks[i.id] && !logged[i.id] && ((i.recipes || []).some(x => live.some(r => r.id === x)) || loose.includes(i)));
    const names = live.filter(r => fin.includes(r.id) || shown.some(i => (i.recipes || []).includes(r.id))).map(r => D(r).short || D(r).title);
    const t = k.progress.trips = k.progress.trips || [];
    if((shown.length || fin.length) && !(t[0] && t[0].at === at)){
      t.unshift({at, rids: fin, r: names, items: shown.map(i => Object.assign({id: i.id, n: i.name, q: i.qty || '', s: marks[i.id]}, loose.includes(i) ? {c: 1, sec: i.section || 'Other'} : {}))});
      if(t.length > 60) t.length = 60;
    }
    fin.forEach(id => { k.progress.active[id] = false; (k.progress.done = k.progress.done || {})[id] = true; });
    const stillNeeded = i => (i.recipes || []).some(x => live.some(r => r.id === x) && !fin.includes(x));
    k.shopping.items.forEach(i => { if(marks[i.id] && !stillNeeded(i) && !loose.includes(i)){ delete marks[i.id]; delete logged[i.id]; } });
    loose.forEach(i => { delete marks[i.id]; delete logged[i.id]; });
    k.shopping.items = k.shopping.items.filter(i => !loose.includes(i));
    shown.forEach(i => { if(marks[i.id]) logged[i.id] = true; });
  });
  toast(moved.length ? moved.join(', ') + ' moved to Past trips' : 'Trip saved. Your list is ready.');
}
/* enter-kitchen gate */
let gate = 'gate';
try{ if(sessionStorage.getItem('mb-in')) gate = 'in'; }catch(e){}
const KITCHEN_ART = `<svg class="kart" aria-hidden="true" viewBox="0 0 200 160"><rect width="200" height="160" rx="22" fill="#FBF6EC"/><g fill="#141414"><rect x="0" y="148" width="6" height="6"/><rect x="6" y="154" width="6" height="6"/><rect x="12" y="148" width="6" height="6"/><rect x="18" y="154" width="6" height="6"/><rect x="24" y="148" width="6" height="6"/><rect x="30" y="154" width="6" height="6"/><rect x="36" y="148" width="6" height="6"/><rect x="42" y="154" width="6" height="6"/><rect x="48" y="148" width="6" height="6"/><rect x="54" y="154" width="6" height="6"/><rect x="60" y="148" width="6" height="6"/><rect x="66" y="154" width="6" height="6"/><rect x="72" y="148" width="6" height="6"/><rect x="78" y="154" width="6" height="6"/><rect x="84" y="148" width="6" height="6"/><rect x="90" y="154" width="6" height="6"/><rect x="96" y="148" width="6" height="6"/><rect x="102" y="154" width="6" height="6"/><rect x="108" y="148" width="6" height="6"/><rect x="114" y="154" width="6" height="6"/><rect x="120" y="148" width="6" height="6"/><rect x="126" y="154" width="6" height="6"/><rect x="132" y="148" width="6" height="6"/><rect x="138" y="154" width="6" height="6"/><rect x="144" y="148" width="6" height="6"/><rect x="150" y="154" width="6" height="6"/><rect x="156" y="148" width="6" height="6"/><rect x="162" y="154" width="6" height="6"/><rect x="168" y="148" width="6" height="6"/><rect x="174" y="154" width="6" height="6"/><rect x="180" y="148" width="6" height="6"/><rect x="186" y="154" width="6" height="6"/><rect x="192" y="148" width="6" height="6"/><rect x="198" y="154" width="6" height="6"/></g><rect x="26" y="32" width="148" height="116" fill="#fff" stroke="#141414" stroke-width="3.5"/><rect x="18" y="20" width="164" height="14" rx="4" fill="#141414"/><rect x="20.0" y="38" width="17.8" height="22" fill="#D7263D"/><rect x="37.8" y="38" width="17.8" height="22" fill="#fff"/><rect x="55.6" y="38" width="17.8" height="22" fill="#D7263D"/><rect x="73.3" y="38" width="17.8" height="22" fill="#fff"/><rect x="91.1" y="38" width="17.8" height="22" fill="#D7263D"/><rect x="108.9" y="38" width="17.8" height="22" fill="#fff"/><rect x="126.7" y="38" width="17.8" height="22" fill="#D7263D"/><rect x="144.4" y="38" width="17.8" height="22" fill="#fff"/><rect x="162.2" y="38" width="17.8" height="22" fill="#D7263D"/><circle cx="28.9" cy="60" r="8.9" fill="#D7263D" stroke="#141414" stroke-width="2.6"/><circle cx="46.7" cy="60" r="8.9" fill="#fff" stroke="#141414" stroke-width="2.6"/><circle cx="64.4" cy="60" r="8.9" fill="#D7263D" stroke="#141414" stroke-width="2.6"/><circle cx="82.2" cy="60" r="8.9" fill="#fff" stroke="#141414" stroke-width="2.6"/><circle cx="100.0" cy="60" r="8.9" fill="#D7263D" stroke="#141414" stroke-width="2.6"/><circle cx="117.8" cy="60" r="8.9" fill="#fff" stroke="#141414" stroke-width="2.6"/><circle cx="135.6" cy="60" r="8.9" fill="#D7263D" stroke="#141414" stroke-width="2.6"/><circle cx="153.3" cy="60" r="8.9" fill="#fff" stroke="#141414" stroke-width="2.6"/><circle cx="171.1" cy="60" r="8.9" fill="#D7263D" stroke="#141414" stroke-width="2.6"/><rect x="18" y="35" width="164" height="5" rx="2" fill="#141414"/><rect x="36" y="82" width="90" height="40" rx="3" fill="#DDEFF5" stroke="#141414" stroke-width="2.8"/><rect x="47" y="106" width="12" height="5" rx="2.5" fill="#D7263D" stroke="#141414" stroke-width="1.8"/><path d="M53 111v11" stroke="#141414" stroke-width="2"/><rect x="73" y="106" width="12" height="5" rx="2.5" fill="#D7263D" stroke="#141414" stroke-width="1.8"/><path d="M79 111v11" stroke="#141414" stroke-width="2"/><rect x="99" y="106" width="12" height="5" rx="2.5" fill="#D7263D" stroke="#141414" stroke-width="1.8"/><path d="M105 111v11" stroke="#141414" stroke-width="2"/><path d="M36 102h90" stroke="#141414" stroke-width="3"/><path d="M44 94 l12-10" stroke="#fff" stroke-width="3" stroke-linecap="round"/><rect x="136" y="82" width="28" height="66" rx="3" fill="#D7263D" stroke="#141414" stroke-width="3"/><circle cx="150.0" cy="96" r="7" fill="#DDEFF5" stroke="#141414" stroke-width="2.5"/><circle cx="158" cy="122" r="2.2" fill="#141414"/><rect x="26" y="126" width="110" height="22" fill="#D7263D" stroke="#141414" stroke-width="3"/><path d="M26 134h110" stroke="#fff" stroke-width="2.5"/><path d="M24 148h152" stroke="#141414" stroke-width="3"/></svg>`;
const POT_ART = `<svg class="pot" viewBox="0 0 160 140" aria-hidden="true">
  <g class="spoon"><path d="M80 66 L112 8" stroke="#141414" stroke-width="9" stroke-linecap="round"/><path d="M80 66 L112 8" stroke="#C98B4E" stroke-width="5" stroke-linecap="round"/><ellipse cx="78" cy="72" rx="7" ry="11" fill="#C98B4E" stroke="#141414" stroke-width="3" transform="rotate(29 78 72)"/></g>
  <g class="drops" fill="#F4C9A6" stroke="#141414" stroke-width="2.5"><circle cx="44" cy="52" r="4.5"/><circle cx="116" cy="50" r="4"/><circle cx="58" cy="44" r="3.2"/><circle cx="102" cy="42" r="3.5"/></g>
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
</svg><g fill="#D7263D" opacity=".55"><path d="M70 40l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><path d="M330 52l2.4 5.6 5.6 2.4-5.6 2.4-2.4 5.6-2.4-5.6-5.6-2.4 5.6-2.4z"/><path d="M300 118l2 4.6 4.6 2-4.6 2-2 4.6-2-4.6-4.6-2 4.6-2z"/></g></svg>`;
function renderGate(){
  if(gate === 'loading') return `<div class="gate"><div class="loader" aria-label="Loading">${POT_ART}
    <div class="ltext">Loading<span class="dots"><i>.</i><i>.</i><i>.</i></span></div></div></div>`;
  return `<div class="gate"><div class="gatecard">${KITCHEN_ART}
    <button class="btn primary big" data-act="enter">Enter your kitchen</button></div></div>`;
}
function enterKitchen(){
  gate = 'loading'; render();
  const t0 = Date.now();
  const go = () => { if(!loaded) return setTimeout(go, 150); setTimeout(() => {
    gate = 'in'; try{ sessionStorage.setItem('mb-in', '1'); }catch(e){}
    render(); app.classList.add('fadein'); setTimeout(() => app.classList.remove('fadein'), 700);
  }, Math.max(0, 1600 - (Date.now() - t0))); };
  go();
}
let isAdmin = false, adminData = null, adminBusy = false, adminUsage = null;
function renderAdmin(){
  const back = `<button class="back" data-act="go" data-h="shopping">← Back</button><h2 class="ptitle">Admin</h2>`;
  if(!isAdmin) return back + `<div class="card empty">This page is only for the site administrator.</div>`;
  if(!adminData && !adminBusy){
    adminBusy = true;
    sb.rpc('admin_users').then(({data, error}) => { adminBusy = false; adminData = error ? {err: true} : (data || []); render(); });
    sb.rpc('admin_usage').then(({data, error}) => { adminUsage = error ? {err: true} : data; render(); }, () => {});
  }
  if(!adminData) return back + `<div class="card empty">Loading…</div>`;
  if(adminData.err) return back + `<div class="card empty">Couldn't load members.</div>`;
  const fmtD = t => t ? new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : '—';
  return back + renderHealth() + `<div class="card panel"><h3>Members <small>${adminData.length}</small></h3>
    <div class="atable">${adminData.map(u => `<div class="arow"><div><b>${esc(u.name || '—')}</b><div class="muted">${esc(u.email)}</div></div><div class="muted">Joined ${fmtD(u.created_at)}<br>Last in ${fmtD(u.last_sign_in_at)}<br>${u.recipes} recipe${u.recipes == 1 ? '' : 's'}</div></div>`).join('')}</div></div>`;
}
function renderHealth(){
  const u = adminUsage;
  if(!u) return `<div class="card panel health"><h3>Site health</h3><div class="muted">Checking…</div></div>`;
  if(u.err) return `<div class="card panel health"><h3>Site health</h3><div class="muted">Couldn't check usage right now.</div></div>`;
  const MB = 1024 * 1024, mb = b => (b / MB < 10 ? (b / MB).toFixed(1) : Math.round(b / MB)) + ' MB';
  const rows = [
    ['Recipes & lists', u.db_bytes, 500 * MB, mb(u.db_bytes) + ' of 500 MB'],
    ['Photos', u.storage_bytes, 1024 * MB, mb(u.storage_bytes) + ' of 1 GB'],
    ['Members', u.users, 50000, u.users.toLocaleString() + ' of 50,000'],
  ];
  const days = u.last_active ? Math.floor((Date.now() - new Date(u.last_active)) / 864e5) : null;
  const worst = Math.max(...rows.map(r => r[1] / r[2]));
  const warn = worst >= .8 ? `<div class="hwarn red">Something is close to the free limit. Time to clean up or upgrade Supabase.</div>` : worst >= .6 ? `<div class="hwarn">Getting fuller. Keep an eye on it.</div>` : `<div class="hok">✓ Everything's well within the free limits.</div>`;
  return `<div class="card panel health"><h3>Site health</h3>${warn}
    ${rows.map(([n, v, max, label]) => { const p = Math.min(100, v / max * 100); return `<div class="hrow"><div class="hlbl"><span>${n}</span><span class="muted">${label}</span></div><div class="hbar ${p >= 80 ? 'red' : p >= 60 ? 'amber' : ''}"><i style="width:${Math.max(p, 1.5)}%"></i></div></div>`; }).join('')}
    <div class="muted" style="font-size:14px;margin-top:6px">Last sign-in: ${days === null ? '—' : days === 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's') + ' ago'}. Supabase pauses free sites after 7 quiet days.</div>
    <div class="row" style="margin-top:12px"><button class="btn" data-act="backup"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>Download backup</button></div>
    <div class="muted" style="font-size:12px;margin-top:6px">Saves every member's recipes, lists and progress to a file. Photos aren't included.</div></div>`;
}
async function downloadBackup(){
  toast('Preparing backup…');
  const {data, error} = await sb.rpc('admin_backup');
  if(error){ console.error(error); toast("Couldn't create the backup"); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'mixingbowl-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup downloaded');
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
      if(item) marks[item.id] = it.s;
      else if(it.c){ const nid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); k.shopping.items.push({id: nid, name: it.n, qty: it.q || '', section: it.sec || 'Other', key: splitIngredient(it.n).key, recipes: [], custom: true}); marks[nid] = it.s; }
    });
    t.splice(i, 1);
  });
  toast((trip.r && trip.r.length ? trip.r.join(', ') : 'Trip') + ' is back on your list');
  location.hash = 'shopping';
}
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
    const uniq = [...seen.values()], gt = uniq.filter(i => i.s === 'bought'), hd = uniq.filter(i => i.s === 'have');
    const ats = g.trips.map(t => t.at).join('|');
    return `<details class="card trip" ${n === 0 ? 'open' : ''}><summary><div><b>${esc(when)}</b><div class="muted">${gt.length} bought · ${hd.length} already had</div></div><span class="chev">▾</span></summary>
      <div class="tbody">${names.length ? `<div class="tname">${esc(names.join(', '))}</div>` : ''}
      ${uniq.length ? `<details class="tings"><summary>See ingredients</summary>${gt.length ? `<h4>Bought</h4>${list(gt)}` : ''}${hd.length ? `<h4>Already had</h4>${list(hd)}` : ''}</details>` : '<div class="muted" style="font-size:14px">Nothing was marked.</div>'}
      <div class="row" style="margin-top:12px"><button class="btn" data-act="untrip" data-at="${esc(ats)}"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>Back to shopping list</button></div></div></details>`;
  }).join('');
  return `<button class="back" data-act="go" data-h="shopping">← Shopping list</button>
  <h2 class="ptitle">Past trips</h2>
  ${trips.length ? `<div class="trips">${body}</div>` : `<div class="card empty">No trips yet. They're saved when you start a new one.</div>`}`;
}
function renderMenu(){
  return `<div class="umenu" role="menu">
    <div class="umhead"><b>${esc(firstName() || 'Your kitchen')}</b><span>${esc(user.email)}</span></div>
    <button role="menuitem" data-act="go" data-h="help"><span class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4"/><path d="M12 17h.01"/></svg></span>How it works</button>
    <button role="menuitem" data-act="go" data-h="settings"><span class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></span>Settings</button>
    <button role="menuitem" data-act="go" data-h="account"><span class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span>Account</button>
    ${isAdmin ? `<button role="menuitem" data-act="go" data-h="admin"><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg></span>Admin</button>` : ''}
    <button role="menuitem" data-act="go" data-h="feedback"><span class="ic"><svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg></span>Send feedback</button>
    <button role="menuitem" data-act="go" data-h="privacy"><span class="ic"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/><path d="M12 15v2.5"/></svg></span>Privacy</button>
    <button role="menuitem" class="out" data-act="signout"><span class="ic"><svg viewBox="0 0 24 24"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M15 16l4-4-4-4"/><path d="M19 12H10"/></svg></span>Exit kitchen</button>
  </div>`;
}
function renderSettings(){
  return `<button class="back" data-act="go" data-h="recipes">← Back</button>
  <div class="card panel"><h3>Settings</h3>
    <div class="lbl2">Your name </div>
    <form data-form="name" class="row"><input class="tin" id="acc-name" data-keep style="flex:1;min-width:160px" value="${esc(firstName())}" maxlength="40" required><button class="btn primary" type="submit">Save name</button></form>
  </div>
  <div class="card panel" style="margin-top:16px"><h3>Change password</h3>
    <form data-form="password" class="stack" autocomplete="off">
      <input class="tin" id="pw-cur" type="password" placeholder="Current password" required autocomplete="current-password">
      <input class="tin" id="pw-new" type="password" placeholder="New password (6+ characters)" minlength="6" required autocomplete="new-password">
      <input class="tin" id="pw-new2" type="password" placeholder="Type the new password again" minlength="6" required autocomplete="new-password">
      <div><button class="btn primary" type="submit">Update password</button></div>
    </form>
  </div>
  <div class="card panel" style="margin-top:16px"><h3>Add Mixing Bowl to your Home Screen</h3>
    <p class="muted" style="margin:6px 0 10px">This site is not yet available in the App Store. Follow the steps below to add it to your phone's Home Screen.</p>
    <p style="margin:6px 0"><b>iPhone:</b> open this site in Safari, tap Share, then <b>Add to Home Screen</b>.</p>
    <p style="margin:6px 0"><b>Android:</b> open it in Chrome, tap ⋮, then <b>Add to Home screen</b>.</p>
  </div>`;
}
function renderAccount(){
  const since = user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, {month:'long', day:'numeric', year:'numeric'}) : '';
  return `<button class="back" data-act="go" data-h="recipes">← Back</button>
  <div class="card panel"><h3>Account</h3>
    <div class="lbl2">Email</div><div>${esc(user.email)}</div>
    ${since ? `<div class="lbl2">Member since</div><div>${esc(since)}</div>` : ''}
    <div class="lbl2">What's saved</div><div>${recipes.length} recipe${recipes.length === 1 ? '' : 's'} · ${allItems().length} shopping list item${allItems().length === 1 ? '' : 's'}</div>
  </div>
  <div class="card panel danger" style="margin-top:16px"><h3>Delete account</h3>
    <p style="margin:6px 0 12px">Permanently deletes your account, all your recipes and photos, your shopping list and your cooking progress. This can't be undone.</p>
    <button class="btn dangerbtn" data-act="delopen">Delete my account and data</button>
  </div>
  ${delOpen ? `<div class="modal" data-act="delclose"><div class="card" data-stop><h3>Delete everything?</h3>
    <div class="muted">Deletes your account and data for good. Type <b>DELETE</b> to confirm.</div>
    <input class="tin" id="del-word" autocomplete="off" style="margin-top:12px" placeholder="DELETE">
    <div class="row"><button class="btn" data-act="delclose">Cancel</button><button class="btn dangerbtn" data-act="delconfirm">Delete forever</button></div></div></div>` : ''}`;
}
const FB_EMAIL = 'mixingbowl.admin@gmail.com';
function renderFeedback(){
  const su = encodeURIComponent('Mixing Bowl feedback');
  return `<button class="back" data-act="go" data-h="${user ? 'recipes' : ''}">← Back</button>
  <div class="card panel prose fb"><h3>Send feedback</h3>
    <p>Ideas, bugs or questions? Email us at <b>${FB_EMAIL}</b>.</p>
    <div class="fbbtns"><button class="btn primary sm" data-act="copyemail">Copy email address</button></div>
  </div>`;
}
const TOUR = [
  {art: () => `<svg class="tourico" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 16c-6-5-14-6-22-5v38c8-1 16 0 22 5c6-5 14-6 22-5V11c-8-1-16 0-22 5z"/><path d="M32 16v38"/><path d="M18 22h8M18 30h8M38 22h8" class="accl"/></svg>`, title: 'Plan your recipes', text: 'Save your recipes by pasting the URL or the recipe steps into the recipe form.'},
  {art: () => `<svg class="tourico" viewBox="0 0 64 64" aria-hidden="true"><rect x="12" y="10" width="32" height="44" rx="5"/><path d="M20 22h16M20 30h16M20 38h10"/><circle cx="46" cy="44" r="10" class="acc"/><path d="M46 39v10M41 44h10" class="w"/></svg>`, title: 'Add to your shopping list', text: 'When you\'re ready to shop, open a recipe and tap <b>Add to shopping list</b>. Add as many recipes as you like.'},
  {art: () => `<svg class="tourico" viewBox="0 0 64 64" aria-hidden="true"><path d="M6 12h7l6 28h28l5-20H16"/><circle cx="23" cy="50" r="4"/><circle cx="43" cy="50" r="4"/><path d="M29 30l3 3 6-6" class="accl"/></svg>`, title: 'Shop for groceries', text: 'Your ingredients are grouped by grocery aisle, like Produce and Dairy, and you can reorder the aisles. Check things off as you shop, or tap <b>Have it</b> for anything already in your kitchen.'},
  {art: () => `<svg class="tourico" viewBox="0 0 64 64" aria-hidden="true"><path d="M10 30h44v6c0 10-8 18-18 18h-8c-10 0-18-8-18-18z"/><path d="M6 30h52"/><path d="M24 22c-3-4 3-6 0-11M32 22c-3-4 3-6 0-11M40 22c-3-4 3-6 0-11" class="accl"/></svg>`, title: 'Cook at home', text: 'Follow along with your recipes as you cook. Each one lists every ingredient, amount, and step, and you can check them off as you go. Use the Recipes page as your own personal cookbook to store as many recipes as you\'d like.'},
];
let tourStep = -1;
function showTour(i){
  tourStep = i; const t = TOUR[i], last = i === TOUR.length - 1;
  $('#modalRoot').innerHTML = `<div class="modal"><div class="card tour" data-stop>
    <div class="tourart">${t.art()}</div>
    <div class="tourbody"><div class="tourdots">${TOUR.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
    <h3>${t.title}</h3><p>${t.text}</p>
    <div class="row tourbtns">${i ? `<button class="btn" data-act="tourgo" data-i="${i - 1}">Back</button>` : `<button class="btn ghost" data-act="tourend">Skip</button>`}<button class="btn primary" data-act="${last ? 'tourend' : 'tourgo'}" data-i="${i + 1}">${last ? 'Let\'s cook' : 'Next'}</button></div></div>
  </div></div>`;
}
function maybeTour(){
  if(tourStep >= 0 || !kitchen || P().tourDone || recipes.length || allItems().length) return;
  showTour(0);
}
function renderHelp(){
  const step = (n, t) => `<div class="hstep"><div class="hnum">${n}</div><div><h4>${t.title}</h4><p>${t.text}</p></div></div>`;
  return `<button class="back" data-act="go" data-h="recipes">← Back</button>
  <div class="card panel prose help"><h3>How Mixing Bowl works</h3>
    <p class="muted">Plan, shop and cook from one place.</p>
    ${TOUR.map((t, i) => step(i + 1, t)).join('')}
    <h4 class="htips">Good to know</h4>
    <ul>
      <li><b>Add a recipe</b> from a website link, or paste the text and tap <b>Download into form</b>.</li>
      <li>Tap <b>Add to shopping list</b> on a recipe when you plan to shop for it. Ingredients will not automatically get added to your shopping list.</li>
      <li>Tap <b>Start a new trip</b> when you're starting a new shopping run. Finished recipes move to <b>Past trips</b>, and anything you still need stays on your list.</li>
      <li><b>Reorder aisles</b> with the arrows next to each section so the list matches your store.</li>
      <li><b>Archive</b> recipes you're not making right now, and unarchive them anytime.</li>
      <li><b>Add to your Home Screen</b> from Settings so it opens like an app.</li>
    </ul>
    <div class="row" style="margin-top:14px"><button class="btn" data-act="tourgo" data-i="0">Replay the quick tour</button></div>
  </div>`;
}
function renderTerms(){
  return `<button class="back" data-act="go" data-h="${user ? 'recipes' : ''}">← Back</button>
  <div class="card panel prose"><h3>Terms of Use</h3>
    <p class="muted">Last updated November 13, 2026</p>
    <p><b>Using Mixing Bowl.</b> Mixing Bowl is a free personal project for organizing recipes and shopping lists. It's for personal, non-commercial use and for ages 13 and up.</p>
    <p><b>Your content.</b> What you add is yours, and you're responsible for it. Only save content you have the right to use. Recipes saved from other websites still belong to their creators and are for your own personal use.</p>
    <p><b>Fair use of the site.</b> Don't upload anything illegal, harmful or abusive, and don't try to break, overload or misuse the site or other people's accounts.</p>
    <p><b>Provided as is.</b> Mixing Bowl is offered as is, without warranties of any kind. Features may change, and the site may be paused or shut down. Keep your own copy of anything important.</p>
    <p><b>Liability.</b> To the fullest extent permitted by law, Mixing Bowl is not liable for any loss or damage resulting from your use of the site.</p>
    <p><b>Accounts.</b> You can delete your account at any time from <b>Account</b>. Accounts that break these terms may be suspended or removed.</p>
    <p><b>Changes.</b> These terms may be updated from time to time. Continuing to use Mixing Bowl means you accept the current version.</p>
    <p><b>Contact.</b> Email <a href="mailto:mixingbowl.admin@gmail.com">mixingbowl.admin@gmail.com</a>.</p>
  </div>`;
}
function renderPrivacy(){
  return `<button class="back" data-act="go" data-h="${user ? 'recipes' : ''}">← Back</button>
  <div class="card panel prose"><h3>Your privacy</h3>
    <p><b>Your kitchen is yours.</b> Your recipes, photos, shopping list and progress are tied to your account. Other members can't see them, and nothing is browsable through the site. As with most websites, the site administrator has technical access to the underlying database and can see a list of member names and email addresses to run the site. Your data is never reviewed, sold, shared or used for advertising.</p>
    <p><b>Passwords stay secret.</b> Passwords are stored encrypted. No one, including the site administrator, can see yours.</p>
    <p><b>Photos.</b> Uploaded photos are stored at private, unguessable web addresses that aren't listed anywhere. Anyone with a photo's exact address could open it, so avoid uploading anything sensitive.</p>
    <p><b>Where it's stored.</b> Accounts and data are kept by Supabase, a database service. The website itself is hosted on GitHub Pages.</p>
    <p><b>Leaving.</b> You can delete your account at any time from <b>Account</b>, which permanently removes your account and everything you've saved.</p>
    <p><b>Age.</b> Mixing Bowl is for ages 13 and up.</p>
    <p><b>Questions.</b> Email <a href="mailto:mixingbowl.admin@gmail.com">mixingbowl.admin@gmail.com</a>.</p>
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
    return `<div class="timer ${ms <= 0 ? 'ring' : ''}"><span>${esc(t.label)}</span><b>${txt}</b><button data-act="untimer" data-id="${t.id}" aria-label="Dismiss">✕</button></div>`; }).join('');
  if(!timers.length){ clearInterval(tick); tick = null; }
}
let wakeLock = null, wantWake = false;
async function reWake(){ if(wantWake && !wakeLock){ try{ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; render(); }); }catch(e){} } }
function confirmBox(title, body, okText, fn){
  $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card" data-stop><h3>${esc(title)}</h3><div class="muted">${esc(body)}</div><div class="row"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="mok">${esc(okText)}</button></div></div></div>`;
  confirmFn = fn;
}
let confirmFn = null;

/* ---------------- events ---------------- */
document.addEventListener('click', async e => {
  if(dragJustEnded){ dragJustEnded = false; e.preventDefault(); return; }
  if(e.target.closest('[data-stop]') && !e.target.closest('[data-act]')) return;
  const el = e.target.closest('[data-act]');
  if(menuOpen && !(el && el.dataset.act === 'menu')){ menuOpen = false; render(); }
  if(!el) return;
  const a = el.dataset.act, id = el.dataset.id, shop = user ? P().shop : {};
  if(a === 'menu'){ menuOpen = !menuOpen; render(); return; }
  if(a === 'heroart'){ const row = R(id); if(!row) return; const old = row.data.photoPath; const data = Object.assign({}, row.data); delete data.photo; delete data.photoPath;
    const {error} = await sb.from('recipes').update({data}).eq('id', id); if(error){ toast("Couldn't change it. Try again."); return; }
    row.data = data; if(old) sb.storage.from('photos').remove([old]).catch(() => {}); render(); toast('Switched back to the drawing'); return; }
  if(a === 'delopen'){ delOpen = true; render(); setTimeout(() => { const w = $('#del-word'); if(w) w.focus(); }, 50); return; }
  if(a === 'delclose'){ if(e.target.closest('[data-stop]') && el.classList.contains('modal')) return; delOpen = false; render(); return; }
  if(a === 'delconfirm'){ if((($('#del-word') || {}).value || '').trim().toUpperCase() !== 'DELETE'){ toast('Type DELETE to confirm'); return; } el.disabled = true; deleteAccount(); return; }
  if(a === 'go'){ if(el.dataset.h === 'admin'){ adminData = null; adminUsage = null; } location.hash = el.dataset.h; return; }
  if(a === 'backup'){ downloadBackup(); return; }
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
    toast(nm + ' added to list'); return;
  }
  if(a === 'tourgo'){ showTour(+el.dataset.i); return; }
  if(a === 'tourend'){ $('#modalRoot').innerHTML = ''; tourStep = -1; if(!P().tourDone) mutate(k => { k.progress.tourDone = true; }); return; }
  if(a === 'untrip'){ el.dataset.at.split('|').forEach(at => restoreTrip(at)); return; }
  if(a === 'authmode'){ authView = {mode: el.dataset.m, msg:'', err:'', busy:false}; render(); return; }
  if(a === 'bought'){ const v = shop[id] === 'bought' ? '' : 'bought'; mutate(k => { k.progress.shop[id] = v; }); return; }
  if(a === 'have'){ const v = shop[id] === 'have' ? '' : 'have'; mutate(k => { k.progress.shop[id] = v; }); return; }
  if(a === 'active'){ const v = !isActive(id); mutate(k => { k.progress.active[id] = v; }); return; }
  if(a === 'relist'){ const r = R(id); mutate(k => { if(r && !k.shopping.items.some(i => (i.recipes || []).includes(id))) addIngredientsTo(k, id, D(r).ingredients || []); k.progress.active[id] = true; if(k.progress.done) delete k.progress.done[id]; }); toast('Added to your shopping list'); return; }
  if(a === 'filter'){ ui.filter = el.dataset.f; saveUi(); render(); return; }
  if(a === 'delitem'){ const it = allItems().find(i => i.id === id); mutate(k => { k.shopping.items = k.shopping.items.filter(i => i.id !== id); delete k.progress.shop[id]; }); if(it) toast('Removed ' + it.name); return; }
  if(a === 'copy'){
    const items = visibleItems().filter(i => !shop[i.id]); const secs = [...new Set(items.map(i => i.section || 'Other'))];
    const txt = secs.map(s => s + ':\n' + items.filter(i => (i.section || 'Other') === s).map(i => '- ' + i.name + (i.qty ? ' (' + i.qty + ')' : '')).join('\n')).join('\n\n');
    try{ await navigator.clipboard.writeText(txt || 'Nothing left to buy!'); toast('Copied your list'); }catch(err){ toast("Couldn't copy on this device"); }
    return;
  }
  if(a === 'resetshop'){
    confirmBox('Start a new trip?', 'Finished recipes move to Past trips. Anything you still need stays on your list.', 'Start new trip', () => newTrip());
    return;
  }
  if(a === 'ing'){ const c = cookOf(id), key = el.dataset.k, v = !c.i[key]; mutate(k => { const o = k.progress.cook[id] = k.progress.cook[id] || {}; (o.i = o.i || {})[key] = v; }); return; }
  if(a === 'step'){ const c = cookOf(id), key = el.dataset.k, v = !c.s[key]; mutate(k => { const o = k.progress.cook[id] = k.progress.cook[id] || {}; (o.s = o.s || {})[key] = v; }); return; }
  if(a === 'resetrecipe'){ confirmBox('Reset progress?', 'Unchecks every ingredient and step.', 'Reset', () => mutate(k => { k.progress.cook[id] = {i:{}, s:{}}; })); return; }
  if(a === 'recipex'){ const r = R(id); if(!r) return;
    $('#modalRoot').innerHTML = `<div class="modal" data-act="mclose"><div class="card" data-stop><h3>${esc(D(r).title)}</h3><div class="muted">Archive hides it until you want it again. Delete removes it for good.</div><div class="row"><button class="btn" data-act="mclose">Cancel</button><button class="btn" data-act="archive" data-id="${esc(id)}">Archive</button><button class="btn dangerbtn" data-act="delrecipe" data-id="${esc(id)}">Delete</button></div></div></div>`;
    return; }
  if(a === 'archive'){ $('#modalRoot').innerHTML = ''; const r = R(id); mutate(k => { (k.progress.archived = k.progress.archived || {})[id] = true; }); toast(D(r).title + ' archived'); if(location.hash !== '#recipes') location.hash = 'recipes'; return; }
  if(a === 'unarch'){ const r = R(id); mutate(k => { if(k.progress.archived) delete k.progress.archived[id]; }); toast(D(r).title + ' is back'); return; }
  if(a === 'delrecipe'){ const r = R(id); confirmBox('Delete this recipe?', 'Deletes ' + D(r).title + ', its photo, progress and list items only it needed. Can\'t be undone.', 'Delete recipe', () => deleteRecipe(id)); return; }
  if(a === 'starters'){ el.disabled = true; addStarters(); return; }
  if(a === 'parse'){ fillFromPaste(); return; }
  if(a === 'addopen'){ ui.addOpen = true; render(); setTimeout(() => { const n = $('#addName'); if(n) n.focus(); }, 30); return; }
  if(a === 'addclose'){ ui.addOpen = false; render(); return; }
  if(a === 'aisles'){ drawAisles(); return; }
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
  if(a === 'mclose'){ $('#modalRoot').innerHTML = ''; return; }
  if(a === 'mok'){ $('#modalRoot').innerHTML = ''; const fn = confirmFn; confirmFn = null; if(fn) fn(); return; }
  if(a === 'signout'){ await flush(); try{ sessionStorage.removeItem('mb-in'); }catch(err){} gate = 'gate'; await sb.auth.signOut(); location.hash = ''; return; }
  if(a === 'enter'){ enterKitchen(); return; }
  if(a === 'wake'){
    if(wakeLock){ wantWake = false; try{ await wakeLock.release(); }catch(err){} wakeLock = null; render(); return; }
    wantWake = true;
    try{ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; render(); }); toast('Screen will stay on'); render(); }
    catch(err){ wantWake = false; toast("Not supported on this browser"); }
  }
});
document.addEventListener('input', e => {
  if(e.target.id === 'f-paste'){ const b = $('#f-parsebtn'); if(b) b.disabled = !e.target.value.trim(); }
  if(e.target.id === 'rsearch'){
    const q = e.target.value.trim().toLowerCase(); let n = 0;
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
document.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.id === 'f-link'){ e.preventDefault(); autoImport(e.target); } });
document.addEventListener('focusout', e => { if(e.target.id === 'f-link') autoImport(e.target); });
document.addEventListener('paste', e => {
  if(e.target.id === 'f-link' && form && form.forId === 'new') setTimeout(() => autoImport(e.target), 0);
});
document.addEventListener('change', async e => {
  if(e.target.dataset && e.target.dataset.photoFor && e.target.files[0]){
    const id = e.target.dataset.photoFor, row = R(id); if(!row) return;
    photoBusy = id; render();
    try{
      const blob = await shrink(e.target.files[0], 1400);
      const up = await uploadPhoto(id, blob);
      const old = row.data.photoPath;
      const data = Object.assign({}, row.data, {photo: up.url, photoPath: up.path});
      const {error} = await sb.from('recipes').update({data}).eq('id', id); if(error) throw error;
      row.data = data; if(old) sb.storage.from('photos').remove([old]).catch(() => {});
      toast('Photo saved');
    }catch(err){ console.error(err); toast("Couldn't upload. Try another photo."); }
    photoBusy = null; render(); return;
  }
  if(e.target.id === 'f-photo' && e.target.files[0]){
    const blob = await shrink(e.target.files[0], 1400);
    if(form.photoUrl) URL.revokeObjectURL(form.photoUrl);
    form.photoBlob = blob; form.photoUrl = URL.createObjectURL(blob); form.removePhoto = false; e.target.value = ''; render();
  }
});
document.addEventListener('submit', async e => {
  const kind = e.target.dataset.form; if(!kind) return; e.preventDefault();
  if(['signin','signup','forgot','newpass'].includes(kind)) return handleAuthForm(kind);
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
window.addEventListener('hashchange', render);

boot();
