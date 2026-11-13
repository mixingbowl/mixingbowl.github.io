import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { STARTERS } from './starter.js';
import { art } from './art.js?v=8';
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
    if(!user){ stopUser(); render(); }
  });
  const {data} = await sb.auth.getSession();
  session = data.session; user = session ? session.user : null;
  if(user) startUser(); else render();
}
function stopUser(){ if(channel){ try{ sb.removeChannel(channel); }catch(e){} channel = null; } recipes = []; kitchen = blankKitchen(); loaded = false; queue = []; }
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
  const title = m === 'signup' ? 'Create your kitchen' : m === 'forgot' ? 'Reset your password' : 'Welcome back';
  return `<div class="authwrap">
    <div class="authhero">${art('pie')}</div>
    <div class="card panel auth"><h2>${title}</h2>
    <p class="muted" style="margin:4px 0 14px">${m === 'signup' ? 'Save recipes, build a shopping list, and follow along step by step on any device.' : m === 'forgot' ? "Enter your email and we'll send you a link." : 'Sign in to your recipes and shopping list.'}</p>
    <form data-form="${m}">
      ${m === 'signup' ? `<input class="tin" id="au-name" data-keep placeholder="First name" maxlength="40" required autocomplete="given-name">` : ''}
      <input class="tin" id="au-email" data-keep type="email" placeholder="Email" required autocomplete="email">
      ${m !== 'forgot' ? `<input class="tin" id="au-pass" type="password" placeholder="Password${m === 'signup' ? ' (6+ characters)' : ''}" minlength="6" required autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}">` : ''}
      <button class="btn primary big" type="submit" ${v.busy ? 'disabled' : ''}>${v.busy ? 'One sec…' : m === 'signup' ? 'Create account' : m === 'forgot' ? 'Send reset link' : 'Sign in'}</button>
    </form>
    ${v.err ? `<div class="err">${esc(v.err)}</div>` : ''}${v.msg ? `<div class="ok">${esc(v.msg)}</div>` : ''}
    <div class="authlinks">
      ${m !== 'signin' ? `<button class="linkbtn" data-act="authmode" data-m="signin">I have an account — sign in</button>` : `<button class="linkbtn" data-act="authmode" data-m="signup">New here? Create an account</button><button class="linkbtn" data-act="authmode" data-m="forgot">Forgot password?</button>`}
    </div>
    <p class="authnote">Your recipes and lists are private to your account. <a href="#privacy">How your data is kept</a></p></div></div>`;
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
const isActive = id => P().active[id] !== false;
function stepList(d){ const out = []; (d.steps || []).forEach((sec, si) => (sec.items || []).forEach((st, k) => out.push({key: si + '-' + k, st}))); return out; }
function cookOf(id){ const c = P().cook[id] || {}; return {i: c.i || {}, s: c.s || {}}; }
function progressOf(r){ const all = stepList(D(r)); const c = cookOf(r.id); const done = all.filter(x => c.s[x.key]).length; return {total: all.length, done, cur: all.findIndex(x => !c.s[x.key]), all}; }
const allItems = () => kitchen.shopping.items || [];
const visibleItems = () => allItems().filter(it => !it.recipes || !it.recipes.length || it.recipes.some(x => R(x) ? isActive(x) : false) || (it.custom && !it.recipes.some(x => R(x))));
const firstName = () => ((user && user.user_metadata && user.user_metadata.name) || '').trim();
const pic = d => d.photo ? `<img src="${esc(d.photo)}" alt="" loading="lazy">` : art(d.art || 'bowl');

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
  delete k.progress.cook[recipeId]; delete k.progress.active[recipeId];
}

/* ---------------- render ---------------- */
function route(){
  const h = (location.hash || '').slice(1);
  if(h.startsWith('r-')) return {v:'recipe', id:h.slice(2)};
  if(h.startsWith('edit-')) return {v:'form', id:h.slice(5)};
  if(h === 'add') return {v:'form'};
  if(['recipes','account','settings','privacy','trips'].includes(h)) return {v:h};
  return {v:'shopping'};
}
let lastView = '';
function render(){
  const kept = {}; document.querySelectorAll('[data-keep]').forEach(el => { if(el.id) kept[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
  const ae = document.activeElement && document.activeElement.id && document.activeElement.hasAttribute('data-keep') ? document.activeElement : null;
  let sel = null; try{ sel = ae && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null; }catch(e){}
  const r = route();
  $('#hdr').innerHTML = renderHeader(r);
  if(!sb){ return; }
  if(!user && r.v === 'privacy'){ app.innerHTML = renderPrivacy(); $('#tabs').innerHTML = ''; }
  else if(!user || recovering){ app.innerHTML = renderAuth(); $('#tabs').innerHTML = ''; }
  else if(!loaded){ app.innerHTML = `<div class="grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`; }
  else {
    renderTabs(r);
    if(r.v === 'shopping') app.innerHTML = renderShopping();
    else if(r.v === 'recipes') app.innerHTML = renderRecipes();
    else if(r.v === 'form') app.innerHTML = renderForm(r.id);
    else if(r.v === 'account') app.innerHTML = renderAccount();
    else if(r.v === 'settings') app.innerHTML = renderSettings();
    else if(r.v === 'privacy') app.innerHTML = renderPrivacy();
    else if(r.v === 'trips') app.innerHTML = renderTrips();
    else app.innerHTML = renderRecipe(r.id);
  }
  const sameView = (r.v + (r.id || '')) === lastView;
  if(sameView) document.querySelectorAll('[data-keep]').forEach(el => { if(el.id && kept[el.id] != null && el.type !== 'file'){ if(el.type === 'checkbox') el.checked = kept[el.id]; else el.value = kept[el.id]; } });
  if(ae && sameView){ const el = document.getElementById(ae.id); if(el){ el.focus({preventScroll:true}); if(sel && el.setSelectionRange) try{ el.setSelectionRange(sel[0], sel[1]); }catch(e){} } }
  const key = r.v + (r.id || '');
  if(key !== lastView){ window.scrollTo(0, 0); lastView = key; }
  renderFab(r);
}
function renderHeader(r){
  const n = firstName();
  const title = user && n ? `${esc(n)}'s <span>Kitchen</span>` : `Mixing <span>Bowl</span>`;
  return `<h1>${title}</h1><div class="hright">${user && !recovering ? `<div id="status" class="status ${statusNow.kind}"><i class="dot"></i><span>${esc(statusNow.text)}</span></div><button class="avatar" data-act="menu" aria-label="Your menu" aria-expanded="${menuOpen}">${esc((n || (user.email || '?'))[0].toUpperCase())}</button>${menuOpen ? renderMenu() : ''}` : ''}</div>`;
}
function renderTabs(r){
  const left = visibleItems().filter(it => !P().shop[it.id]).length;
  $('#tabs').innerHTML = `<button class="tab ${r.v === 'shopping' ? 'on' : ''}" data-act="go" data-h="shopping">Shopping list${left ? `<span class="n">${left}</span>` : ''}</button>
  <button class="tab ${r.v !== 'shopping' && r.v !== 'account' ? 'on' : ''}" data-act="go" data-h="recipes">Recipes${recipes.length ? `<span class="n">${recipes.length}</span>` : ''}</button>`;
}

function renderShopping(){
  const items = visibleItems(), all = allItems(), shop = P().shop, f = ui.filter;
  const done = items.filter(it => shop[it.id]).length;
  const pct = items.length ? Math.round(done / items.length * 100) : 0;
  const chips = recipes.map(r => `<button class="chip ${isActive(r.id) ? 'on' : ''}" style="--c:${esc(D(r).color || '#888')}" data-act="active" data-id="${esc(r.id)}"><i class="sw"></i>${esc(D(r).short || D(r).title)}</button>`).join(' ');
  const pool = f === 'have' ? all : items;
  const keep = i => { const st = shop[i.id] || ''; return f === 'all' || (f === 'need' && !st) || (f === 'cart' && st === 'bought') || (f === 'have' && st === 'have'); };
  const cnt = {all: items.length, need: items.filter(i => !shop[i.id]).length, cart: items.filter(i => shop[i.id] === 'bought').length, have: all.filter(i => shop[i.id] === 'have').length};
  const fbtn = (k, l) => `<button class="chip fbtn ${f === k ? 'on' : ''}" style="--c:#2B2320" data-act="filter" data-f="${k}">${l} <span class="fc">${cnt[k]}</span></button>`;
  const order = [...new Set(kitchen.shopping.sections.concat(all.map(i => i.section || 'Other')))];
  let secs = '';
  order.forEach(sec => {
    let list = pool.filter(i => (i.section || 'Other') === sec); if(!list.length) return;
    const left = list.filter(i => !shop[i.id]).length;
    list = list.slice().sort((a, b) => (shop[a.id] ? 1 : 0) - (shop[b.id] ? 1 : 0)).filter(keep);
    if(f !== 'all' && !list.length) return;
    const sub = f === 'have' ? list.length + ' on hand' : f === 'cart' ? list.length + ' in cart' : (left ? left + ' to get' : 'all set ✓');
    secs += `<div class="section"><h3>${esc(sec)} <small>${sub}</small></h3><div class="card items">` + list.map(it => {
      const st = shop[it.id] || '';
      const tags = (it.custom ? `<span class="tag" style="--c:#6E6259">Added by you</span>` : '') + (it.recipes || []).map(x => { const rr = R(x); return rr ? `<span class="tag" style="--c:${esc(D(rr).color)}">${esc(D(rr).short || D(rr).title)}</span>` : ''; }).join('');
      return `<div class="item ${st}"><button class="check" data-act="bought" data-id="${esc(it.id)}" aria-label="In my cart">${CHECK}</button>
      <div class="info"><div class="name">${esc(it.name)}</div>${it.qty ? `<div class="qty">${fmt(it.qty)}</div>` : ''}<div class="tags">${tags}</div></div>
      <button class="have" data-act="have" data-id="${esc(it.id)}">${st === 'have' ? 'Have it ✓' : 'Have it'}</button><button class="del" data-act="delitem" data-id="${esc(it.id)}" aria-label="Remove ${esc(it.name)}">✕</button></div>`;
    }).join('') + `</div></div>`;
  });
  const secOpts = kitchen.shopping.sections;
  return `<div class="card shop-head"><button class="copyic" data-act="copy" aria-label="Copy my list" title="Copy what I still need"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2"/></svg></button>
    ${recipes.length ? `<div class="lbl">Shopping for</div><div class="row">${chips}</div>` : ''}
    <div class="prog-line"><b>${done} of ${items.length} sorted</b><span class="muted">${items.length - done} still to get</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="row" style="margin-top:12px"><button class="btn" data-act="resetshop"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.1a2 2 0 0 0 2-1.5L21.5 8H6"/></svg>Start a new trip</button><button class="btn" data-act="go" data-h="trips"><svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 7v5l3 2"/></svg>Past trips <span class="fc">${(P().trips || []).length}</span></button></div>
    <div class="lbl" style="margin-top:16px">Add something</div>
    <form class="addf" data-form="additem" autocomplete="off">
      <input id="addName" data-keep placeholder="Item (e.g. blueberries)" maxlength="80" required>
      <input id="addQty" data-keep placeholder="Amount (optional)" maxlength="60">
      <select id="addSec" data-keep aria-label="Section">${secOpts.map(s => `<option ${s === ui.sec ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select id="addFor" data-keep aria-label="Which recipe is it for?"><option value="">No specific recipe</option>${recipes.map(r => `<option value="${esc(r.id)}">For ${esc(D(r).short || D(r).title)}</option>`).join('')}</select>
      <button class="btn primary" type="submit">+ Add</button>
    </form>
    <div class="lbl" style="margin-top:16px">Show</div>
    <div class="row">${fbtn('all','All')}${fbtn('need','Still need')}${fbtn('cart','In cart')}${fbtn('have','Have it')}</div>
    <div class="legend">Tap the circle when it's in your cart · tap <b>Have it</b> for things already in your kitchen.</div>
  </div><div class="f-${f}">${secs || `<div class="card empty">${!all.length ? 'Your list is empty. Add a recipe and its ingredients land here, or add items above.' : f === 'have' ? 'Nothing marked “Have it” yet.' : f === 'cart' ? 'Nothing in your cart yet.' : "Everything's checked off — time to cook! 🎉"}</div>`}</div>`;
}

function renderRecipes(){
  const addTile = `<button class="tile addtile" data-act="go" data-h="add"><span class="plus">+</span><span class="body"><h2>Add a recipe</h2><span class="meta">Paste it from any website</span></span></button>`;
  const starters = !recipes.length ? `<div class="card panel" style="margin-bottom:16px"><h3>Start with a few favorites?</h3><p class="muted" style="margin:4px 0 12px">Add a blueberry pie, a butternut squash lasagna and cake pops, with their ingredients on your shopping list. You can remove them anytime.</p><button class="btn primary" data-act="starters">Add starter recipes</button></div>` : '';
  return starters + `<div class="grid">` + addTile + recipes.map(r => {
    const d = D(r), p = progressOf(r), pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    const st = p.done === 0 ? 'Not started' : p.done === p.total ? 'Finished ✓' : `Step ${p.cur + 1} of ${p.total}`;
    return `<button class="tile" style="--c:${esc(d.color)}" data-act="go" data-h="r-${esc(r.id)}">
      <span class="art">${pic(d)}</span>
      <span class="body"><h2>${esc(d.title)}</h2><span class="meta">${d.total ? `<span>⏱ ${esc(d.total)}</span>` : ''}${d.yield ? `<span>🍽 ${esc(d.yield)}</span>` : ''}</span>
      <span class="st">${st}</span><span class="bar"><i style="width:${pct}%"></i></span></span></button>`;
  }).join('') + `</div>`;
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
  const links = (d.links || []).filter(l => /^https?:\/\//i.test(l.url || '')).map(l => `<a class="btn orig" href="${esc(l.url)}" target="_blank" rel="noopener">📖 ${esc(l.label || 'Original recipe')} ↗</a>`).join('');
  const notes = d.notes && d.notes.length ? `<div class="notes"><b>Good to know</b><ul>${d.notes.map(x => `<li>${fmt(x)}</li>`).join('')}</ul></div>` : '';
  return `<button class="back" data-act="go" data-h="recipes">← All recipes</button>
  <div class="card hero"><div class="art ${d.photo ? 'photo' : 'drawn'}">${d.photo ? pic(d) : `<div class="artbg">${art(d.art || 'bowl')}</div><div class="artfg">${art(d.art || 'bowl').replace('xMidYMid slice', 'xMidYMid meet')}</div>`}<button class="herox" data-act="delrecipe" data-id="${esc(r.id)}" aria-label="Delete recipe" title="Delete recipe"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><label class="heroedit" title="Change picture" aria-label="Change picture">${photoBusy === r.id ? '<span class="spin dark"></span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>'}<input type="file" accept="image/*" hidden data-photo-for="${esc(r.id)}"></label></div><div class="body">
    <h2>${esc(d.title)}</h2>
    <div class="meta">${d.yield ? `<span>🍽 ${esc(d.yield)}</span>` : ''}${d.prep ? `<span>Prep ${esc(d.prep)}</span>` : ''}${d.cook ? `<span>Cook ${esc(d.cook)}</span>` : ''}${d.total ? `<span>⏱ Total ${esc(d.total)}</span>` : ''}</div>
    ${links ? `<div class="row src">${links}</div>` : ''}
    <div class="prog-line" style="margin-top:0"><b>${p.total && p.done === p.total ? 'All done — enjoy!' : `${p.done} of ${p.total} steps done`}</b><span class="muted">${pct}%</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="row" style="margin-top:12px"><button class="btn ${wakeLock ? 'on' : ''}" data-act="wake">${wakeLock ? '☀ Screen staying on' : '☀ Keep screen on'}</button><button class="btn" data-act="go" data-h="edit-${esc(r.id)}">Edit recipe</button><button class="btn" data-act="resetrecipe" data-id="${esc(r.id)}">Reset progress</button></div>
  </div></div>
  <div class="layout">
    <div class="card panel ing-col"><h3>Ingredients</h3><div class="muted" style="font-size:13px">Tick them off as you measure.</div>${ings || '<div class="muted">No ingredients yet.</div>'}</div>
    <div><h3 style="font-size:19px;margin:0 4px 10px">Steps <span class="muted" style="font-family:'DM Sans';font-size:13px;font-weight:500">— tap a step when it's done</span></h3>${steps || '<div class="card empty">No steps yet. Tap Edit to add them.</div>'}
    ${p.total && p.done === p.total ? `<div class="card finish">🎉 You made ${esc(d.title)}!</div>` : ''}${notes}
    ${links ? `<div class="card panel origbox"><b>Want the photos and tips?</b><div class="muted" style="font-size:14px">The original page has step photos and more detail.</div><div class="row" style="margin-top:10px">${links}</div></div>` : ''}</div>
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
    <div class="lbl2">Recipe title <span class="req">required</span></div>
    <input class="tin" id="f-title" data-keep maxlength="90" placeholder="e.g. Grandma's apple crisp" value="${v('title', d.title)}">
    <div class="lbl2">Recipe website link <span class="hint">optional</span></div>
    <div class="linkrow"><input class="tin" id="f-link" data-keep type="url" inputmode="url" placeholder="Paste a link to import it automatically" value="${v('link', link.url)}">${r ? '' : `<button class="btn" type="button" data-act="import" ${f.importing ? 'disabled' : ''}>${f.importing ? 'Importing…' : 'Import'}</button>`}</div>
    ${r ? '' : `${f.importMsg ? `<div class="importmsg ${f.importOk ? 'ok' : ''}">${esc(f.importMsg)}</div>` : ''}
    <div class="lbl2">Paste the recipe <span class="req">${f.importOk ? 'not needed, it imported' : 'required if the link doesn\'t import'}</span></div>
    <textarea class="tin" id="f-paste" data-keep rows="6" placeholder="On the recipe website, tap Jump to Recipe (or Print), select the recipe text, copy it, and paste it here."></textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary" type="button" data-act="parse">✨ Fill in the form</button></div>`}
    ${!r && !f.filled ? `<div class="lockmsg">Import the link or paste the recipe and tap <b>Fill in the form</b>. The details below unlock once they're filled in.</div>` : ''}
    <fieldset class="lockable" ${!r && !f.filled ? 'disabled' : ''}>
    <div class="g4">
      <div><div class="lbl2">Serves / makes</div><input class="tin" id="f-yield" data-keep maxlength="40" value="${v('y', d.yield)}"></div>
      <div><div class="lbl2">Prep time</div><input class="tin" id="f-prep" data-keep maxlength="40" value="${v('p', d.prep)}"></div>
      <div><div class="lbl2">Cook time</div><input class="tin" id="f-cook" data-keep maxlength="40" value="${v('c', d.cook)}"></div>
      <div><div class="lbl2">Total time</div><input class="tin" id="f-total" data-keep maxlength="40" value="${v('t', d.total)}"></div>
    </div>
    <div class="lbl2">Ingredients <span class="hint">one per line · end a line with ":" to start a group, like "For the crust:"</span></div>
    <textarea class="tin" id="f-ing" data-keep rows="9">${esc(groupsToIngText(d.ingredients))}</textarea>
    <div class="lbl2">Steps <span class="hint">one per line · timers are added automatically when a step mentions minutes</span></div>
    <textarea class="tin" id="f-steps" data-keep rows="9">${esc(sectionsToStepText(d.steps))}</textarea>
    <div class="lbl2">Notes <span class="hint">optional, one per line</span></div>
    <textarea class="tin" id="f-notes" data-keep rows="3">${esc((d.notes || []).join('\n'))}</textarea>
    <div class="lbl2">Picture <span class="hint">a drawing is picked from the recipe title</span></div>
    <div class="picrow">
      <div class="picprev" id="f-pic">${photoNow ? `<img src="${esc(photoNow)}" alt="">` : art(guessArt(($('#f-title') || {}).value || d.title || ''))}</div>
      <div class="piccol">
        <label class="btn filebtn"><input type="file" id="f-photo" accept="image/*" hidden>📷 ${photoNow ? 'Change photo' : 'Upload your own photo'}</label>
        ${photoNow ? `<button class="btn" type="button" data-act="rmphoto">Use the drawing instead</button>` : ''}
      </div>
    </div>
    <label class="cb"><input type="checkbox" id="f-addlist" data-keep ${r ? '' : 'checked'}> ${r ? 'Add any new ingredients to my shopping list' : 'Add the ingredients to my shopping list'}</label>
    </fieldset>
    <div class="row" style="margin-top:16px"><button class="btn primary big" type="button" data-act="saveform" data-id="${r ? esc(r.id) : ''}" ${f.busy || (!r && !f.filled) ? 'disabled' : ''}>${f.busy ? 'Saving…' : r ? 'Save changes' : 'Save recipe'}</button></div>
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
  if(!p.ingredients){ toast("Couldn't find the ingredients. Try pasting just the recipe part."); return; }
  form.filled = true; render();
  toast('Filled in. Look it over before saving.');
}
async function importLink(){
  const url = (($('#f-link') || {}).value || '').trim();
  if(!/^https?:\/\/\S+\.\S+/i.test(url)){ toast('Paste a full link that starts with https://'); return; }
  if(form.importing) return;
  form.importing = true; form.importMsg = ''; render();
  let p = null, msg = '';
  try{
    const {data, error} = await sb.functions.invoke('import-recipe', {body: {url}});
    if(error) throw error;
    if(data && data.ingredients) p = data; else msg = (data && data.error) || '';
  }catch(err){ console.error(err); }
  form.importing = false;
  if(!p){ form.importOk = false; form.importMsg = (/share that page/.test(msg) ? 'That site blocks automatic imports. ' : msg ? msg + ' ' : "Couldn't import from that site. ") + 'Paste the recipe below instead.'; render(); return; }
  const set = (id, val, force) => { const el = $(id); if(el && val && (force || !el.value.trim())) el.value = val; };
  set('#f-title', p.title); set('#f-yield', p.yield); set('#f-prep', p.prep); set('#f-cook', p.cook); set('#f-total', p.total);
  set('#f-ing', p.ingredients, true); set('#f-steps', p.steps, true); set('#f-notes', p.notes);
  if(p.title) $('#f-title').value = p.title;
  form.filled = true; form.importOk = true; form.importMsg = 'Imported! Look it over before saving.'; render();
}
function guessArt(t){
  t = (t || '').toLowerCase();
  if(/cake ?pops?/.test(t)) return 'cakepops';
  if(/\bpies?\b|\btarts?\b|galette|cobbler|crisp\b|crumble|quiche|turnover/.test(t)) return 'pie';
  if(/cupcake|cheesecake|\bcakes?\b|torte|bundt|tiramisu/.test(t)) return 'cake';
  if(/cookie|brownie|blondie|\bbars?\b|snickerdoodle|macaron|biscotti|shortbread|fudge|truffle/.test(t)) return 'cookies';
  if(/lasagna|casserole|\bbake\b|baked ziti|enchilada|gratin|moussaka|shepherd|strata/.test(t)) return 'lasagna';
  if(/soup|stew|chili|chowder|curry|bisque|gumbo|broth|pho\b|ramen/.test(t)) return 'soup';
  if(/pasta|spaghetti|noodle|penne|\bmac\b|macaroni|ravioli|gnocchi|fettuccine|linguine|rigatoni|orzo|carbonara|alfredo|lo mein/.test(t)) return 'pasta';
  if(/bread|loaf|\brolls?\b|muffin|biscuit|scone|bagel|focaccia|brioche|pancake|waffle|croissant|pretzel|buns?\b|sourdough|cinnamon roll/.test(t)) return 'bread';
  return 'bowl';
}
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
  if(!val('#f-ing')){ f.err = 'Add the ingredients (paste the recipe and tap Fill in the form).'; render(); return; }
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
    if(addList) mutate(k => { addIngredientsTo(k, recId, ingredients); k.progress.active[recId] = true; });
    if(f.photoUrl) URL.revokeObjectURL(f.photoUrl);
    form = null; toast(id ? 'Saved changes' : 'Saved ' + title);
    location.hash = 'r-' + recId; loadRecipes();
  }catch(e){
    console.error(e); f.busy = false; f.err = "Couldn't save: " + ((e && e.message) || 'check your connection and try again.'); render();
  }
}
async function addStarters(){
  try{
    setStatus('busy', 'Adding…');
    const rows = STARTERS.map((d, i) => ({user_id: user.id, sort: Date.now() + i, data: d}));
    const {data, error} = await sb.from('recipes').insert(rows).select('id, sort, data');
    if(error) throw error;
    recipes = recipes.concat(data);
    mutate(k => data.forEach(row => addIngredientsTo(k, row.id, row.data.ingredients)));
    toast('Added 3 recipes'); render();
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
function renderTrips(){
  const trips = P().trips || [];
  const list = (arr) => `<ul>${arr.map(i => `<li>${esc(i.n)}${i.q ? ` <span class="q">· ${esc(fmt(i.q))}</span>` : ''}</li>`).join('')}</ul>`;
  const body = trips.map((t, n) => {
    const d = new Date(t.at), got = t.items.filter(i => i.s === 'bought'), had = t.items.filter(i => i.s === 'have');
    const when = d.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'});
    return `<details class="card trip" ${n === 0 ? 'open' : ''}><summary><div><b>${esc(when)}</b><div class="muted">${got.length} bought · ${had.length} already had${t.r && t.r.length ? ' · ' + esc(t.r.join(', ')) : ''}</div></div><span class="chev">▾</span></summary>
      <div class="tbody">${got.length ? `<h4>Bought</h4>${list(got)}` : ''}${had.length ? `<h4>Already had</h4>${list(had)}` : ''}</div></details>`;
  }).join('');
  return `<button class="back" data-act="go" data-h="shopping">← Shopping list</button>
  <h2 class="ptitle">Past trips</h2>
  ${trips.length ? `<div class="trips">${body}</div>` : `<div class="card empty">No past trips yet. When you tap <b>Start a new trip</b>, what you bought and what you already had gets saved here.</div>`}`;
}
function renderMenu(){
  return `<div class="umenu" role="menu">
    <div class="umhead"><b>${esc(firstName() || 'Your kitchen')}</b><span>${esc(user.email)}</span></div>
    <button role="menuitem" data-act="go" data-h="settings"><span class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></span>Settings</button>
    <button role="menuitem" data-act="go" data-h="account"><span class="ic"><svg viewBox="0 0 24 24"><path d="M7 14.5V20h10v-5.5"/><path d="M7 14.5a4 4 0 0 1-1.2-7.7A4.5 4.5 0 0 1 12 4a4.5 4.5 0 0 1 6.2 2.8A4 4 0 0 1 17 14.5z"/><path d="M7 17h10"/></svg></span>Account</button>
    <button role="menuitem" data-act="go" data-h="privacy"><span class="ic"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/><path d="M12 15v2.5"/></svg></span>Privacy</button>
    <button role="menuitem" class="out" data-act="signout"><span class="ic"><svg viewBox="0 0 24 24"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M15 16l4-4-4-4"/><path d="M19 12H10"/></svg></span>Log out</button>
  </div>`;
}
function renderSettings(){
  return `<button class="back" data-act="go" data-h="recipes">← Back</button>
  <div class="card panel"><h3>Settings</h3>
    <div class="lbl2">Your name <span class="hint">shown at the top as “Name's Kitchen”</span></div>
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
  <div class="card panel" style="margin-top:16px"><h3>Put it on your phone's home screen</h3>
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
    <div class="row" style="margin-top:18px"><button class="btn" data-act="signout">Log out</button></div>
  </div>
  <div class="card panel danger" style="margin-top:16px"><h3>Delete account</h3>
    <p style="margin:6px 0 12px">Permanently deletes your account, all your recipes and photos, your shopping list and your cooking progress. This can't be undone.</p>
    <button class="btn dangerbtn" data-act="delopen">Delete my account and data</button>
  </div>
  ${delOpen ? `<div class="modal" data-act="delclose"><div class="card" data-stop><h3>Delete everything?</h3>
    <div class="muted">This removes your account and all your data for good. Type <b>DELETE</b> to confirm.</div>
    <input class="tin" id="del-word" autocomplete="off" style="margin-top:12px" placeholder="DELETE">
    <div class="row"><button class="btn" data-act="delclose">Cancel</button><button class="btn dangerbtn" data-act="delconfirm">Delete forever</button></div></div></div>` : ''}`;
}
function renderPrivacy(){
  return `<button class="back" data-act="go" data-h="${user ? 'recipes' : ''}">← Back</button>
  <div class="card panel prose"><h3>Your privacy</h3>
    <p><b>Your kitchen is yours.</b> Your recipes, photos, shopping list and cooking progress are tied to your account. Other people who use Mixing Bowl can't see them, and nobody can browse your data through the site.</p>
    <p><b>Passwords stay secret.</b> Passwords are stored encrypted. No one, including the person who runs this site, can see yours.</p>
    <p><b>Who can see the database.</b> Mixing Bowl is a small personal project run by Hayley. Like the owner of any website, she has technical access to the database that stores accounts, so she could see your email address and what you've saved. She doesn't look at people's data, sell it, or share it, and it isn't used for ads.</p>
    <p><b>Photos.</b> Photos you upload are stored at long, unguessable web addresses. They aren't listed anywhere, but anyone who had a photo's exact address could open it, so skip anything sensitive.</p>
    <p><b>Where it's stored.</b> Accounts and data are kept by Supabase, a database service. The website itself is hosted on GitHub Pages.</p>
    <p><b>Leaving.</b> You can delete your account at any time from <b>Account</b>, which permanently removes your account and everything you've saved.</p>
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
  if(a === 'go'){ location.hash = el.dataset.h; return; }
  if(a === 'authmode'){ authView = {mode: el.dataset.m, msg:'', err:'', busy:false}; render(); return; }
  if(a === 'bought'){ const v = shop[id] === 'bought' ? '' : 'bought'; mutate(k => { k.progress.shop[id] = v; }); return; }
  if(a === 'have'){ const v = shop[id] === 'have' ? '' : 'have'; mutate(k => { k.progress.shop[id] = v; }); return; }
  if(a === 'active'){ const v = !isActive(id); mutate(k => { k.progress.active[id] = v; }); return; }
  if(a === 'filter'){ ui.filter = el.dataset.f; saveUi(); render(); return; }
  if(a === 'delitem'){ const it = allItems().find(i => i.id === id); mutate(k => { k.shopping.items = k.shopping.items.filter(i => i.id !== id); delete k.progress.shop[id]; }); if(it) toast('Removed ' + it.name); return; }
  if(a === 'copy'){
    const items = visibleItems().filter(i => !shop[i.id]); const secs = [...new Set(items.map(i => i.section || 'Other'))];
    const txt = secs.map(s => s + ':\n' + items.filter(i => (i.section || 'Other') === s).map(i => '- ' + i.name + (i.qty ? ' (' + i.qty + ')' : '')).join('\n')).join('\n\n');
    try{ await navigator.clipboard.writeText(txt || 'Nothing left to buy!'); toast('Copied your list'); }catch(err){ toast("Couldn't copy on this device"); }
    return;
  }
  if(a === 'resetshop'){
    const at = new Date().toISOString(), names = recipes.filter(r => isActive(r.id)).map(r => D(r).short || D(r).title);
    confirmBox('Start a new trip?', 'This trip is saved to Past trips, then every "In cart" and "Have it" mark is cleared. Your items stay on the list.', 'Start new trip', () => mutate(k => {
      const marks = k.progress.shop || {};
      const its = k.shopping.items.filter(i => marks[i.id]).map(i => ({n: i.name, q: i.qty || '', s: marks[i.id]}));
      const t = k.progress.trips = k.progress.trips || [];
      if(its.length && !(t[0] && t[0].at === at)){ t.unshift({at, r: names, items: its}); if(t.length > 60) t.length = 60; }
      k.progress.shop = {};
    }));
    return;
  }
  if(a === 'ing'){ const c = cookOf(id), key = el.dataset.k, v = !c.i[key]; mutate(k => { const o = k.progress.cook[id] = k.progress.cook[id] || {}; (o.i = o.i || {})[key] = v; }); return; }
  if(a === 'step'){ const c = cookOf(id), key = el.dataset.k, v = !c.s[key]; mutate(k => { const o = k.progress.cook[id] = k.progress.cook[id] || {}; (o.s = o.s || {})[key] = v; }); return; }
  if(a === 'resetrecipe'){ confirmBox('Reset progress?', 'Unchecks all ingredients and steps for this recipe.', 'Reset', () => mutate(k => { k.progress.cook[id] = {i:{}, s:{}}; })); return; }
  if(a === 'delrecipe'){ const r = R(id); confirmBox('Delete this recipe?', 'This permanently deletes ' + D(r).title + ', its photo and all of your progress on it. Shopping list items that only this recipe needed are removed too. This can\'t be undone.', 'Delete recipe', () => deleteRecipe(id)); return; }
  if(a === 'starters'){ el.disabled = true; addStarters(); return; }
  if(a === 'parse'){ fillFromPaste(); return; }
  if(a === 'import'){ importLink(); return; }
  if(a === 'rmphoto'){ if(form.photoUrl) URL.revokeObjectURL(form.photoUrl); form.photoBlob = null; form.photoUrl = null; form.removePhoto = true; render(); return; }
  if(a === 'saveform'){ saveForm(id || null); return; }
  if(a === 'timer'){ startTimer(+el.dataset.min, el.dataset.label); return; }
  if(a === 'untimer'){ timers = timers.filter(t => t.id !== id); drawTimers(); return; }
  if(a === 'jump'){ const s = document.getElementById('s-' + el.dataset.k); if(s) s.scrollIntoView({behavior:'smooth', block:'center'}); return; }
  if(a === 'mclose'){ $('#modalRoot').innerHTML = ''; return; }
  if(a === 'mok'){ $('#modalRoot').innerHTML = ''; const fn = confirmFn; confirmFn = null; if(fn) fn(); return; }
  if(a === 'signout'){ await flush(); await sb.auth.signOut(); location.hash = ''; return; }
  if(a === 'wake'){
    if(wakeLock){ wantWake = false; try{ await wakeLock.release(); }catch(err){} wakeLock = null; render(); return; }
    wantWake = true;
    try{ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; render(); }); toast('Screen will stay on while this page is open'); render(); }
    catch(err){ wantWake = false; toast("This browser won't let the page keep the screen on"); }
  }
});
document.addEventListener('input', e => {
  if(e.target.id === 'f-title'){ const p = $('#f-pic'); if(p && !p.querySelector('img')) p.innerHTML = art(guessArt(e.target.value)); }
});
document.addEventListener('paste', e => {
  if(e.target.id === 'f-link' && form && form.forId === 'new') setTimeout(() => { if(/^https?:\/\/\S+\.\S+/i.test(e.target.value.trim())) importLink(); }, 0);
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
    }catch(err){ console.error(err); toast("Couldn't upload that photo. Try a different one."); }
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
