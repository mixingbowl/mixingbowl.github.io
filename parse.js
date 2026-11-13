// Pure helpers: turn pasted recipe text into fields, and ingredients into shopping items.

const FRAC = '½¼¾⅓⅔⅛⅜⅝⅞';
const ASCII_FR = {'1/2':'½','1/4':'¼','3/4':'¾','1/3':'⅓','2/3':'⅔','1/8':'⅛','3/8':'⅜','5/8':'⅝','7/8':'⅞'};
export function prettyFractions(s){
  return String(s||'').replace(/(^|[^\d\/])(\d)\/(\d)(?![\d\/])/g,(m,p,a,b)=>ASCII_FR[a+'/'+b]?p+ASCII_FR[a+'/'+b]:m)
    .replace(/(\d) ([½¼¾⅓⅔⅛⅜⅝⅞])/g,'$1$2');
}

const JUNK = /^(print( recipe)?|pin( recipe)?|save( recipe)?|rate( this)?( recipe)?|jump to (recipe|video)|share|email|yum|cook mode|prevent (your )?screen from going dark|us customary|metric|\d(\.\d)?x|\d+x \d+x( \d+x)?|★+☆*|☆+|watch( the)?( video)?|video|equipment|ingredients? ?(list)?$ |course|cuisine|keyword|author|calories|servings? ?:?$|click on the times.*|did you make this.*|leave a (comment|review).*|tap or hover.*|\d+ (reviews?|comments?|ratings?)|.*\bstars? from \d+.*|\(?\d+(\.\d+)? from \d+ (votes|reviews)\)?)$/i;
const ING_HEAD = /^(the )?ingredients?( list)?:?$/i;
const STEP_HEAD = /^(instructions?|directions?|method|steps|preparation|how to make( it)?|to make)( :)?:?$/i;
const END_HEAD = /^(notes?|recipe notes|cook'?s notes|tips|nutrition( information| facts)?|make ahead.*|storage.*|freezing.*|did you make.*|more recipes.*|you may also like.*)( :)?:?$/i;

function metaFrom(line, out){
  const m = line.match(/^(prep(aration)? time|cook(ing)? time|bake time|total time|servings?|yield|makes|serves)\s*:?\s*(.+)$/i);
  if(!m) return false;
  const k = m[1].toLowerCase(), v = m[4].trim();
  if(!v || v.length > 40) return false;
  if(k.startsWith('prep')) out.prep = out.prep || v;
  else if(k.startsWith('cook') || k.startsWith('bake')) out.cook = out.cook || v;
  else if(k.startsWith('total')) out.total = out.total || v;
  else out.yield = out.yield || v;
  return true;
}
const looksIng = l => l.length < 140 && (new RegExp('^(\\d|['+FRAC+']|one |two |three |a |an |pinch|dash|handful|juice of|zest of|salt|pepper|kosher salt|black pepper)','i')).test(l);
const cleanStep = l => l.replace(/^(step\s*)?\d+\s*[.):-]\s*/i,'').replace(/^step\s*\d+\s*/i,'').trim();

export function parseRecipeText(raw){
  const out = {title:'', yield:'', prep:'', cook:'', total:'', ingredients:'', steps:'', notes:''};
  let lines = String(raw||'').split(/\r?\n/)
    .map(l => l.replace(/ /g,' ').replace(/^[\s•▢☐□✓✔\-–*·]+/,'').replace(/\s+/g,' ').trim())
    .filter(Boolean);
  lines = lines.filter(l => !metaFrom(l,out) && !JUNK.test(l));
  let iIng = lines.findIndex(l => ING_HEAD.test(l));
  let iStep = lines.findIndex((l,i) => i > iIng && STEP_HEAD.test(l));
  let ings = [], steps = [], notes = [];
  if(iIng >= 0){
    const endIng = iStep > iIng ? iStep : lines.length;
    ings = lines.slice(iIng+1, endIng);
    if(iStep < 0){ // no instruction heading: split off long sentences
      const firstLong = ings.findIndex(l => !looksIng(l) && l.length > 60);
      if(firstLong >= 0){ steps = ings.slice(firstLong); ings = ings.slice(0, firstLong); }
    }
  } else {
    ings = lines.filter(looksIng);
    steps = lines.filter(l => !looksIng(l) && l.length > 50);
  }
  if(iStep >= 0){
    let rest = lines.slice(iStep+1);
    const iEnd = rest.findIndex(l => END_HEAD.test(l));
    if(iEnd >= 0){ notes = rest.slice(iEnd+1).filter(l => l.length > 15 && l.length < 300 && !/^(calories|fat|carb|protein|sodium|sugar|fiber|cholesterol|serving)/i.test(l)).slice(0,5); rest = rest.slice(0, iEnd); }
    steps = rest;
  }
  const before = iIng > 0 ? lines.slice(0, iIng) : lines;
  out.title = (before.find(l => l.length > 2 && l.length < 80 && !looksIng(l)) || '').replace(/\s*recipe$/i,'');
  ings = ings.filter(l => l.length < 200);
  // A short line ending in ":" or a "For the ..." line is a group heading.
  out.ingredients = ings.map(l => /^for (the )?/i.test(l) && l.length < 50 && !l.endsWith(':') ? l + ':' : l).map(prettyFractions).join('\n');
  out.steps = steps.map(cleanStep).filter(Boolean).map(prettyFractions).join('\n');
  out.notes = notes.join('\n');
  return out;
}

// ---- textarea <-> structured ----
const isHead = l => /:$/.test(l) && l.length < 60;
export function ingTextToGroups(text){
  const groups = []; let cur = {group:'', items:[]};
  String(text||'').split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
    if(isHead(l)){ if(cur.items.length || cur.group) groups.push(cur); cur = {group:l.replace(/:$/,''), items:[]}; }
    else cur.items.push(prettyFractions(l.replace(/^[•\-–*]\s*/,'')));
  });
  if(cur.items.length || cur.group) groups.push(cur);
  return groups.filter(g => g.items.length);
}
export function groupsToIngText(groups){
  return (groups||[]).map(g => (g.group ? g.group + ':\n' : '') + (g.items||[]).join('\n')).join('\n\n');
}
export function findTimers(text){
  const m = String(text).match(/(\d+)(?:\s*(?:-|–|to)\s*\d+)?\s*(minutes?|mins?|hours?|hrs?)\b/i);
  if(!m) return [];
  const n = +m[1] * (/^h/i.test(m[2]) ? 60 : 1);
  return n > 0 && n <= 24*60 ? [{label: m[0].replace(/\s+/g,' '), min: n}] : [];
}
export function stepTextToSections(text, old){
  const secs = []; let cur = {section:'', items:[]};
  const prev = {}; (old||[]).forEach(s => (s.items||[]).forEach(st => { prev[st.text] = st; }));
  String(text||'').split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
    if(isHead(l)){ if(cur.items.length) secs.push(cur); cur = {section:l.replace(/:$/,''), items:[]}; return; }
    const t = prettyFractions(cleanStep(l));
    const p = prev[t];
    cur.items.push(p ? p : {title:'', text:t, timers:findTimers(t)});
  });
  if(cur.items.length) secs.push(cur);
  return secs;
}
export function sectionsToStepText(secs){
  return (secs||[]).map(s => (s.section ? s.section + ':\n' : '') + (s.items||[]).map(st => st.text).join('\n')).join('\n\n');
}

// ---- shopping ----
const UNITS = ['cups?','c\\.','tablespoons?','tbsps?','tbs','tsps?','teaspoons?','ounces?','oz','pounds?','lbs?','grams?','g','kg','kilograms?','ml','milliliters?','liters?','litres?','l','cloves?','cans?','packages?','pkgs?','sticks?','pinch(?:es)?','dash(?:es)?','bunch(?:es)?','heads?','slices?','sprigs?','quarts?','pints?','containers?','jars?','bags?','boxes?','bars?','envelopes?','fl\\.? ?oz','large','medium','small','whole'];
const Q = '(?:\\d+\\s*['+FRAC+']|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?|['+FRAC+'])';
const LEAD = new RegExp('^((?:about |approx\\.? )?'+Q+'(?:\\s*(?:-|–|to)\\s*'+Q+')?\\s*(?:\\([^)]*\\)\\s*)?(?:(?:'+UNITS.join('|')+')\\b\\.?\\s*)?(?:\\([^)]*\\)\\s*)?(?:(?:'+UNITS.join('|')+')\\b\\.?\\s*)?(?:of\\s+)?)','i');
const DESCRIPTORS = /\b(fresh|freshly|chopped|sliced|diced|minced|softened|chilled|cold|ice[- ]cold|cubed|melted|room temperature|at room temperature|divided|optional|packed|lightly|finely|thinly|roughly|large|small|medium|extra|pure|grated|shredded|whole|to taste|for garnish|for serving|plus more|spooned and leveled|beaten|ground)\b/g;

export function splitIngredient(line){
  const s = prettyFractions(String(line||'').trim());
  let qty = '', name = s;
  const m = s.match(LEAD);
  if(m && /\d|[½¼¾⅓⅔⅛⅜⅝⅞]/.test(m[1])){ qty = m[1].trim(); name = s.slice(m[1].length); }
  name = name.replace(/\([^)]*\)/g,' ').split(/,| – | - |;/)[0].replace(/\b(plus more|or more|divided|optional)\b.*$/i,'').replace(/\s+/g,' ').trim();
  if(!name) name = s;
  name = name.charAt(0).toUpperCase() + name.slice(1);
  const key = name.toLowerCase().replace(/[^a-z ]/g,' ').replace(DESCRIPTORS,' ').replace(/\s+/g,' ').trim().replace(/s$/,'') || name.toLowerCase();
  return {qty, name, key};
}

export const SECTIONS = ['Produce','Meat & seafood','Dairy & eggs','Bakery & bread','Baking aisle','Pasta, grains & canned','Oils, sauces & condiments','Spices','Frozen','Supplies','Other'];
const W = s => new RegExp('\\b(' + s + ')(e?s)?\\b');
const GUESS = [
  ['Baking aisle', W('cream of tartar|baking powder|baking soda|flour|sugar|yeast|vanilla|extract|cocoa|chocolate|chocolate chip|chip|candy melt|sprinkle|cornstarch|shortening|confectioner|molasses|honey|maple syrup|oat|pecan|walnut|almond|coconut|gelatin|food coloring|marshmallow|graham cracker|peanut butter')],
  ['Spices', W('cinnamon|nutmeg|allspice|ground ginger|paprika|cumin|oregano|thyme|chili powder|garlic powder|onion powder|cayenne|clove|cardamom|turmeric|coriander|bay leaf|bay leave|red pepper flake|italian seasoning|black pepper|salt|seasoning|curry powder')],
  ['Frozen', W('frozen|ice cream')],
  ['Dairy & eggs', W('milk|butter|cream|cheese|ricotta|mozzarella|parmesan|cheddar|feta|yogurt|egg|buttermilk|half and half')],
  ['Meat & seafood', W('chicken|beef|pork|turkey|sausage|bacon|ham|lamb|steak|shrimp|salmon|fish|tuna|cod')],
  ['Produce', W('apple|banana|berry|berrie|blueberry|blueberrie|strawberry|strawberrie|raspberry|raspberrie|lemon|lime|orange|onion|garlic|shallot|bell pepper|pepper|tomato|tomatoe|potato|potatoe|carrot|celery|zucchini|squash|pumpkin|mushroom|spinach|kale|lettuce|cabbage|broccoli|cauliflower|herb|parsley|cilantro|basil|mint|rosemary|scallion|green onion|avocado|cucumber|corn|ginger|fruit|peach|peache|pear|cherry|cherrie|grape|mango|pineapple|jalapeno')],
  ['Bakery & bread', W('bread|bun|roll|tortilla|bagel|pita|naan|croissant')],
  ['Pasta, grains & canned', W('pasta|noodle|spaghetti|lasagna|macaroni|rice|quinoa|couscous|broth|stock|bean|chickpea|lentil|tomato paste|tomato sauce|crushed tomato')],
  ['Oils, sauces & condiments', W('oil|vinegar|soy sauce|mustard|ketchup|mayo|mayonnaise|hot sauce|worcestershire|sriracha|salsa|dressing|pesto')],
  ['Supplies', W('stick|parchment|foil|plastic wrap|liner|skewer|toothpick|pan|dish')],
];
export function guessSection(name){
  const n = String(name).toLowerCase();
  for(const [sec, re] of GUESS) if(re.test(n)) return sec;
  return 'Other';
}

// ---- adding amounts together ("1 large + 2 large" → "3 large") ----
const FV = {'⅙':1/6,'⅚':5/6,'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875};
const UNIT_NORM = [[/^(cups?|c\.?)$/i,'cup'],[/^(tablespoons?|tbsps?|tbs|tbl)\.?$/i,'Tbsp'],[/^(teaspoons?|tsps?)\.?$/i,'tsp'],[/^(ounces?|oz)\.?$/i,'oz'],[/^(pounds?|lbs?)\.?$/i,'lb'],[/^(grams?|g)$/i,'g'],[/^(kg|kilograms?)$/i,'kg'],[/^(ml|milliliters?)$/i,'ml'],[/^(cloves?)$/i,'clove'],[/^(cans?)$/i,'can'],[/^(sticks?)$/i,'stick'],[/^(large|medium|small|whole)$/i,'$1'],[/^$/,'']];
function num(s){
  s = s.trim(); let m;
  if((m = s.match(/^(\d+)\s*([½¼¾⅓⅔⅛⅜⅝⅞])$/))) return +m[1] + FV[m[2]];
  if((m = s.match(/^([½¼¾⅓⅔⅛⅜⅝⅞])$/))) return FV[m[1]];
  if((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2]/m[3];
  if((m = s.match(/^(\d+)\/(\d+)$/))) return m[1]/m[2];
  if((m = s.match(/^\d+(\.\d+)?$/))) return +s;
  return null;
}
function nice(n){
  const whole = Math.floor(n + 1e-9), frac = n - whole;
  const opts = [[0,''],[.125,'⅛'],[1/6,'⅙'],[5/6,'⅚'],[.25,'¼'],[1/3,'⅓'],[.375,'⅜'],[.5,'½'],[.625,'⅝'],[2/3,'⅔'],[.75,'¾'],[.875,'⅞'],[1,'']];
  let best = opts[0]; for(const o of opts) if(Math.abs(o[0] - frac) < Math.abs(best[0] - frac)) best = o;
  const w = best[0] === 1 ? whole + 1 : whole;
  if(Math.abs(best[0] - frac) > .03) return String(Math.round(n * 100) / 100);
  return (w ? String(w) : '') + best[1] || '0';
}
function parsePart(p){
  const m = String(p).trim().match(/^(\d+\s*[½¼¾⅓⅔⅛⅜⅝⅞⅙⅚]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞])\s*(?:\([^)]*\))?\s*([A-Za-z.]*)\s*(?:\([^)]*\))?$/);
  if(!m) return null;
  const n = num(m[1]); if(n == null) return null;
  let unit = m[2] || '';
  for(const [re, u] of UNIT_NORM){ if(re.test(unit)){ unit = unit.replace(re, u); break; } }
  return {n, unit};
}
export function addQty(a, b){
  if(!a) return b || ''; if(!b) return a;
  const parts = String(a).split(' + ').concat(String(b).split(' + '));
  const sums = new Map(), text = [];
  parts.forEach(p => { const x = parsePart(p); if(!x){ if(p.trim()) text.push(p.trim()); return; }
    const s = sums.get(x.unit) || {n:0, c:0, orig:p.trim()}; s.n += x.n; s.c++; sums.set(x.unit, s); });
  const plural = (u, n) => n > 1 && /^(cup|clove|can|stick)$/.test(u) ? u + 's' : u;
  const out = [...sums.entries()].map(([u, s]) => s.c === 1 ? s.orig : nice(s.n) + (u ? ' ' + plural(u, s.n) : ''));
  return out.concat(text).join(' + ');
}
