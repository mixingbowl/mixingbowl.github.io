// Cartoon recipe illustrations: outlined, shaded, with small props. 320x200 viewBox.
// art(kind, text): kind picks the drawing, text (title + ingredients) picks flavors and colors.
const O = '#3B2A22';           // outline color
const SW = 'stroke="' + O + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';
const W = 'viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"';
let artN = 0;
const f = n => n.toFixed(1);
const rng = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

function cloth(bg, line){ // soft gingham tablecloth
  return `<g class="cloth"><rect width="320" height="200" fill="${bg}"/>
  <g fill="${line}">${Array.from({length:9},(_,i)=>`<rect x="${i*40}" y="0" width="20" height="200" opacity=".18"/>`).join('')}${Array.from({length:6},(_,i)=>`<rect x="0" y="${i*40}" width="320" height="20" opacity=".18"/>`).join('')}</g></g>`;
}
function sparkle(x, y, s, c){ return `<path d="M${x} ${y-s}L${x+s*.28} ${y-s*.28}L${x+s} ${y}L${x+s*.28} ${y+s*.28}L${x} ${y+s}L${x-s*.28} ${y+s*.28}L${x-s} ${y}L${x-s*.28} ${y-s*.28}Z" fill="${c || '#fff'}"/>`; }
const sparkles = (...pts) => pts.map(([x, y, s]) => sparkle(x, y, s)).join('');
function plate(cx, cy, rx, ry, rim){
  return `<ellipse cx="${cx+2}" cy="${cy+6}" rx="${rx+4}" ry="${ry+3}" fill="#000" opacity=".12"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#FFFFFF" ${SW}/>
  <ellipse cx="${cx}" cy="${cy-2}" rx="${rx*.78}" ry="${ry*.74}" fill="#F2EEE6"/>
  ${rim ? `<ellipse cx="${cx}" cy="${cy-1}" rx="${rx*.88}" ry="${ry*.86}" fill="none" stroke="${rim}" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/>` : ''}`;
}
const lg = (id, k, x2, y2, stops) => `<linearGradient id="${id}${k}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o,c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const rg = (id, k, stops, cx, cy, r) => `<radialGradient id="${id}${k}" cx="${cx || .4}" cy="${cy || .35}" r="${r || .75}">${stops.map(([o,c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`;
const leaf = (x, y, rot, c) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M0 0 C 6 -10, 18 -10, 22 0 C 18 8, 6 8, 0 0Z" fill="${c || '#6DB36A'}" stroke="${O}" stroke-width="1.3"/><path d="M2 0 L19 0" stroke="#3F7D3D" stroke-width="1"/></g>`;
const fork = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-3" y="0" width="6" height="58" rx="3" fill="#D9DEE4" stroke="${O}" stroke-width="1.6"/><path d="M-9 -28 v16 q0 10 9 10 q9 0 9 -10 v-16" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M-9 -28 v16 q0 10 9 10 q9 0 9 -10 v-16" fill="none" stroke="#D9DEE4" stroke-width="4" stroke-linecap="round"/><path d="M-3 -28 v14 M3 -28 v14" stroke="${O}" stroke-width="5" stroke-linecap="round"/><path d="M-3 -28 v14 M3 -28 v14" stroke="#D9DEE4" stroke-width="2.4" stroke-linecap="round"/></g>`;
const spoon = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-3" y="0" width="6" height="60" rx="3" fill="#D9DEE4" stroke="${O}" stroke-width="1.6"/><ellipse cx="0" cy="-10" rx="9" ry="13" fill="#D9DEE4" stroke="${O}" stroke-width="1.6"/><ellipse cx="-2" cy="-13" rx="3" ry="5" fill="#fff" opacity=".6"/></g>`;
const steam = (xs, y) => xs.map(x => `<path d="M${x} ${y} q-8 -10 0 -20 q8 -10 0 -20" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".75"/>`).join('');

// ---- flavors: picked from the recipe title first, then its ingredients ----
const FLAVORS = [
  ['blueberry', /blueberr/, {main:'#3B458F', dark:'#262B66', light:'#9AA6F0', jam:'#3A2468', bg:'#DCE3F6', line:'#7F8FD0'}],
  ['strawberry', /strawberr/, {main:'#D7263D', dark:'#8E1426', light:'#FF9AA8', jam:'#B0182E', bg:'#FBE1E4', line:'#E89AA6'}],
  ['raspberry', /raspberr/, {main:'#C2185B', dark:'#7A0E3A', light:'#F48FB1', jam:'#9C1446', bg:'#FBE1EC', line:'#E39AB9'}],
  ['blackberry', /blackberr/, {main:'#3A1F4F', dark:'#1F0F2E', light:'#9C7FC0', jam:'#2E1840', bg:'#E8E0F2', line:'#A995C8'}],
  ['cherry', /cherr/, {main:'#B5121B', dark:'#6E0A10', light:'#F27A80', jam:'#8A0F18', bg:'#FBE0DE', line:'#E59A96'}],
  ['peach', /peach|apricot|mango/, {main:'#F6A04D', dark:'#C8692A', light:'#FFD3A1', jam:'#E68A3A', bg:'#FDEBDA', line:'#F2BE8C'}],
  ['apple', /apple/, {main:'#E9B44C', dark:'#B9822E', light:'#F8DC92', jam:'#D99A3A', bg:'#F4EAD6', line:'#D8B97E', skin:'#C8412F'}],
  ['pumpkin', /pumpkin|sweet potato|butternut/, {main:'#E07B2A', dark:'#A9531A', light:'#F7B26E', jam:'#D46F22', bg:'#FCE6D2', line:'#EFB27E', smooth:1}],
  ['lemon', /lemon/, {main:'#F4D03F', dark:'#C9A21E', light:'#FCEB9A', jam:'#F1C232', bg:'#FDF6D6', line:'#EBD480', smooth:1}],
  ['lime', /key lime|\blime/, {main:'#B5D86B', dark:'#7FA33E', light:'#E0F2B4', jam:'#A6CC5A', bg:'#EAF4DA', line:'#B8D48E', smooth:1}],
  ['pecan', /pecan|walnut/, {main:'#8A4B22', dark:'#5C2E12', light:'#C98A5A', jam:'#6E3818', bg:'#F4E6D6', line:'#D2AE88'}],
  ['banana', /banana/, {main:'#F5DE7A', dark:'#C9A93A', light:'#FFF2B8', jam:'#EBCB55', bg:'#FDF4D8', line:'#EBD488'}],
  ['redvelvet', /red velvet/, {main:'#A3162B', dark:'#6A0C1A', light:'#E65A6E', jam:'#8A1022', bg:'#FBE0E2', line:'#E39AA2'}],
  ['matcha', /matcha|pistachio|mint\b|green tea|spinach|pesto|basil/, {main:'#7DAA4E', dark:'#4F7A2A', light:'#C8E3A0', jam:'#6A9A3E', bg:'#E6F2DC', line:'#AFD08E'}],
  ['chocchip', /chocolate chips?|choc chip/, {main:'#E2A75E', dark:'#3E2416', light:'#F6CF8A', jam:'#B97A35', bg:'#F4E3D3', line:'#C99A74'}],
  ['chocolate', /chocolate|cocoa|fudge|mocha|brownie|oreo/, {main:'#5A3522', dark:'#3E2416', light:'#8A5A3C', jam:'#4A2A18', bg:'#F4E3D3', line:'#C99A74'}],
  ['tomato', /tomato|marinara|red sauce|bolognese|salsa|pizza sauce/, {main:'#D9452B', dark:'#9E2A16', light:'#F48A70', jam:'#C83A22', bg:'#FBE3D8', line:'#EFA98E'}],
  ['carrot', /carrot/, {main:'#EE8A2E', dark:'#B65E16', light:'#FFC07C', jam:'#E07A20', bg:'#FDE9D6', line:'#F2B987'}],
  ['vanilla', /vanilla|cream|white/, {main:'#F6EAD0', dark:'#D8C39A', light:'#FFFBF0', jam:'#EFDDB5', bg:'#F6EEE0', line:'#DCC7A4'}],
];
export function flavorOf(text){
  const t = (text || '').toLowerCase(), title = t.split('\n')[0];
  for(const src of [title, t]) for(const [name, re, c] of FLAVORS) if(re.test(src)) return Object.assign({name}, c);
  return null;
}

// ---- which drawing fits the recipe ----
export function guessArt(text){
  const t = (text || '').toLowerCase().split('\n')[0];
  const tests = [
    ['cakepops', /cake ?pops?/], ['cupcake', /cupcake/], ['muffin', /muffin/],
    ['brownies', /brownie|blondie|\bbars?\b|fudge|rice krispie/],
    ['cookies', /cookie|snickerdoodle|macaron|biscotti|shortbread|truffle/],
    ['pancakes', /pancake|waffle|crepe|french toast/],
    ['cake', /cheesecake|\bcakes?\b|torte|bundt|tiramisu|trifle/],
    ['pie', /\bpies?\b|\btarts?\b|galette|cobbler|crisp\b|crumble|quiche|turnover/],
    ['icecream', /ice cream|gelato|sorbet|sundae|popsicle|frozen yogurt/],
    ['smoothie', /smoothie|shake\b|milkshake|lemonade|latte|cocktail|punch|\btea\b|juice|drink/],
    ['pizza', /pizza|flatbread|calzone/],
    ['tacos', /taco|burrito|quesadilla|fajita|nacho|enchilada/],
    ['burger', /burger|slider|sloppy joe/],
    ['sandwich', /sandwich|panini|\bwrap\b|\bsub\b|grilled cheese|blt|toastie|toast\b/],
    ['lasagna', /lasagna|casserole|\bbake\b|baked ziti|gratin|moussaka|shepherd|strata|pot pie/],
    ['soup', /soup|stew|chili|chowder|curry|bisque|gumbo|broth|pho\b|ramen|dal\b/],
    ['pasta', /pasta|spaghetti|noodle|penne|\bmac\b|macaroni|ravioli|gnocchi|fettuccine|linguine|rigatoni|orzo|carbonara|alfredo|lo mein|pad thai/],
    ['stirfry', /stir.?fry|fried rice|\brice\b|risotto|paella|teriyaki|poke|bibimbap|bowl\b/],
    ['salad', /salad|slaw|coleslaw/],
    ['eggs', /\beggs?\b|omelet|frittata|shakshuka|benedict|scramble/],
    ['chicken', /chicken|turkey|wings?\b|drumstick|roast\b|steak|pork|salmon|fish|shrimp|meatloaf|ribs/],
    ['bread', /bread|loaf|\brolls?\b|biscuit|scone|bagel|focaccia|brioche|croissant|pretzel|buns?\b|sourdough|cinnamon roll/],
  ];
  for(const [k, re] of tests) if(re.test(t)) return k;
  return 'bowl';
}

export function art(kind, text){
  const fl = flavorOf(text || ''), id = 'a' + (++artN) + '-', u = k => `url(#${id}${k})`;
  const D = DRAW[kind] || DRAW.bowl;
  return D(fl, id, u, (text || '').toLowerCase());
}

const DRAW = {};

// ---------- PIE ----------
DRAW.pie = (fl, id, u) => {
  if(!fl || ['vanilla','tomato','matcha','carrot','chocchip'].includes(fl.name)) return closedPie(id, u);
  const c = fl.name === 'chocolate' ? flavorOf('blueberry') : fl;
  const choc = fl && fl.name === 'chocolate';
  const smooth = c.smooth || choc, fill = choc ? fl : c;
  const cx = 160, cy = 100, rx = 66, ry = 54, w = 14, r = rng(3);
  const piece = (x, y, s) => c.name === 'apple' ? `<path d="M${x-s} ${y} q${s} ${-s*1.2} ${s*2} 0 q${-s} ${s*.5} ${-s*2} 0Z" fill="${c.light}" stroke="${c.dark}" stroke-width="1.1"/><path d="M${x-s} ${y} q${s} ${-s*1.2} ${s*2} 0" stroke="${c.skin}" stroke-width="1.6" fill="none"/>`
    : c.name === 'peach' ? `<path d="M${x-s} ${y+2} q${s} ${-s*1.4} ${s*2} 0 q${-s} ${s*.6} ${-s*2} 0Z" fill="${c.main}" stroke="${c.dark}" stroke-width="1.1"/>`
    : c.name === 'pecan' ? `<ellipse cx="${x}" cy="${y}" rx="${s*1.2}" ry="${s*.7}" fill="${c.main}" stroke="${O}" stroke-width="1.1"/><path d="M${x-s} ${y} h${s*2}" stroke="${c.dark}" stroke-width="1"/>`
    : `<circle cx="${x}" cy="${y}" r="${s}" fill="${u('bb')}" stroke="${O}" stroke-width="1.3"/><circle cx="${f(x-s*.38)}" cy="${f(y-s*.3)}" r="${f(s*.28)}" fill="${c.light}" opacity=".8"/>`;
  const pts = [[128,72,7],[152,66,6.5],[178,70,7],[200,86,6.5],[116,98,7],[196,112,7],[124,126,6.5],[160,140,7],[184,134,6.5],[146,92,6],[172,96,6],[158,116,6.5]];
  const xs = [0,1,2,3].map(i => cx - rx*.62 + i*rx*.413), ys = [0,1,2,3].map(i => cy - ry*.62 + i*ry*.413);
  let lat = xs.map(x => `<rect x="${f(x-w/2)}" y="${cy-ry-10}" width="${w}" height="${2*ry+20}" rx="6" fill="${u('st')}" stroke="#A86E2C" stroke-width="1.4"/>`).join('') + ys.map(y => `<rect x="${cx-rx-10}" y="${f(y-w/2)}" width="${2*rx+20}" height="${w}" rx="6" fill="${u('sh')}" stroke="#A86E2C" stroke-width="1.4"/>`).join('');
  xs.forEach((x, i) => ys.forEach((y, j) => { lat += (i + j) % 2 === 0 ? `<rect x="${f(x-w/2)}" y="${f(y-w/2-3)}" width="${w}" height="${w+6}" rx="3" fill="${u('st')}"/><path d="M${f(x-w/2)} ${f(y-w/2-3)} v${w+6} M${f(x+w/2)} ${f(y-w/2-3)} v${w+6}" stroke="#A86E2C" stroke-width="1.4"/>` : `<path d="M${f(x-w/2+1)} ${f(y+w/2+1)} h${w-2}" stroke="#8A5A22" stroke-width="2" opacity=".35"/>`; }));
  let sugar = ''; for(let i = 0; i < 70; i++){ const a = r()*6.283, d = Math.sqrt(r()), x = f(cx + Math.cos(a)*rx*d), y = f(cy + Math.sin(a)*ry*d); sugar += `<rect x="${x}" y="${y}" width="2.2" height="2.2" rx=".6" fill="#FFF8E6" opacity=".9" transform="rotate(${Math.round(r()*90)} ${x} ${y})"/>`; }
  let crimp = ''; for(let i = 0; i < 30; i++){ const a = i/30*6.283, x = f(cx + Math.cos(a)*(rx+6)), y = f(cy + Math.sin(a)*(ry+6)); crimp += `<ellipse cx="${x}" cy="${y}" rx="10" ry="8.5" fill="${u('cr')}" stroke="#A86E2C" stroke-width="1.5" transform="rotate(${Math.round(a*57.3+90)} ${x} ${y})"/><path d="M${f(x-3)} ${f(y-3)} q3 -2 6 0" stroke="#FCE3B0" stroke-width="1.6" fill="none" stroke-linecap="round"/>`; }
  const bub = [[132,78,4],[186,84,3.5],[150,118,3],[178,122,4],[140,98,2.5],[196,104,3]].map(([x,y,s]) => `<circle cx="${x}" cy="${y}" r="${s}" fill="${c.light}" opacity=".55"/>`).join('');
  const top = smooth
    ? `<ellipse cx="${cx}" cy="${cy}" rx="${rx+2}" ry="${ry+2}" fill="${u('jam')}"/><ellipse cx="${cx-14}" cy="${cy-16}" rx="30" ry="12" fill="#fff" opacity=".18"/>
       <g transform="translate(${cx} ${cy})"><path d="M-22 6 q-4 -16 10 -18 q2 -12 14 -12 q14 2 12 14 q14 2 10 16 q-22 8 -46 0Z" fill="#FFFDF6" stroke="${O}" stroke-width="1.5"/><path d="M-14 0 q12 -8 26 -2 M-6 -12 q8 -6 14 0" stroke="#E8DCC4" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
       ${[[132,84],[188,86],[140,124],[184,122],[150,70],[200,104]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${fill.dark}" opacity=".7"/>`).join('')}
       ${c.name === 'lemon' || c.name === 'lime' ? `<path d="M${cx+20} ${cy-30} a10 10 0 1 1 0.1 0Z" fill="${c.light}" stroke="${O}" stroke-width="1.3"/><path d="M${cx+20} ${cy-40} v20 M${cx+10} ${cy-30} h20 M${cx+13} ${cy-37} l14 14 M${cx+27} ${cy-37} l-14 14" stroke="${c.dark}" stroke-width="1"/>` : ''}`
    : `<ellipse cx="${cx}" cy="${cy}" rx="${rx+2}" ry="${ry+2}" fill="${u('jam')}"/><g clip-path="${u('ca')}">${pts.map(([x,y,s]) => piece(x,y,s)).join('')}${bub}</g><g clip-path="${u('ca')}">${lat}</g><g clip-path="${u('ca')}">${sugar}</g>
       <path d="M108 128 q-4 10 2 14 q6 -4 3 -14Z" fill="${c.jam}" stroke="${O}" stroke-width="1.3"/><path d="M212 82 q6 6 2 13 q-6 -2 -2 -13Z" fill="${c.jam}" stroke="${O}" stroke-width="1.3"/>`;
  const side = c.name === 'apple' ? `<g transform="translate(52 154)"><circle r="13" fill="#C8412F" stroke="${O}" stroke-width="1.8"/><path d="M-4 -6 q-4 4 -2 10" stroke="#fff" stroke-width="2.4" fill="none" opacity=".5" stroke-linecap="round"/><path d="M0 -13 q2 -6 6 -8" stroke="#6B3A1E" stroke-width="2" fill="none"/>${leaf(4,-16,-30)}</g>`
    : c.name === 'lemon' || c.name === 'lime' ? `<g transform="translate(54 156)"><ellipse rx="16" ry="12" fill="${c.main}" stroke="${O}" stroke-width="1.8"/><ellipse cx="-5" cy="-4" rx="5" ry="3" fill="#fff" opacity=".5"/></g>${leaf(66,142,20)}`
    : c.name === 'pumpkin' ? `<g transform="translate(54 156)"><ellipse rx="18" ry="13" fill="${c.main}" stroke="${O}" stroke-width="1.8"/><path d="M-6 -12 q-4 12 0 24 M6 -12 q4 12 0 24" stroke="${c.dark}" stroke-width="1.4" fill="none"/><rect x="-2" y="-18" width="4" height="7" rx="2" fill="#6B4A2A"/></g>`
    : choc ? `<g transform="translate(46 150) rotate(-12)"><rect width="34" height="20" rx="3" fill="${fill.main}" stroke="${O}" stroke-width="1.6"/><path d="M11 0 v20 M22 0 v20 M0 10 h34" stroke="${fill.dark}" stroke-width="1.4"/></g>`
    : [[52,150,8],[66,162,7],[44,166,6.5]].map(([x,y,s]) => piece(x,y,s)).join('') + leaf(58,142,-30) + leaf(70,148,20);
  return `<svg ${W}><defs>${rg(id,'bb',[[0,c.light],[.55,c.main],[1,c.dark]],.35,.35,.8)}${rg(id,'jam',[[0,smooth ? fill.light : c.main],[.7,smooth ? fill.main : c.jam],[1,smooth ? fill.dark : c.dark]],.5,.45,.6)}
    ${lg(id,'cr',0,1,[[0,'#F7D493'],[.55,'#E6AE5E'],[1,'#C98A3E']])}${lg(id,'st',1,0,[[0,'#D99A4C'],[.35,'#F6CF8A'],[.7,'#EDB868'],[1,'#C98A3E']])}${lg(id,'sh',0,1,[[0,'#F8D899'],[.5,'#EDB868'],[1,'#C98A3E']])}${lg(id,'tin',0,1,[[0,'#E9EDF2'],[1,'#9AA3AE']])}
    <clipPath id="${id}ca"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath></defs>
    ${cloth(c.bg, c.line)}
    ${plate(160,106,122,80,c.line)}
    <ellipse cx="160" cy="103" rx="88" ry="74" fill="${u('tin')}" ${SW}/>
    ${top}${crimp}
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#7A4A1A" stroke-width="1.4" opacity=".5"/>
    ${fork(282,128,-18)}${side}${smooth ? '' : [[268,42,7],[282,52,6]].map(([x,y,s]) => piece(x,y,s)).join('')}
    ${sparkles([40,40,7],[232,26,5],[300,176,5],[100,184,4])}
  </svg>`;
};

// ---------- BROWNIES / BARS ----------
DRAW.brownies = (fl, id, u) => {
  const c = fl && ['lemon','pumpkin','peach','vanilla','banana','lime','raspberry','strawberry','blueberry','cherry'].includes(fl.name) ? fl : null;
  const blondie = /blond/.test(String(fl && fl.name)) ;
  const top = c ? c.main : '#5A3522', side = c ? c.dark : '#3E2416', hi = c ? c.light : '#7A4A2E', r = rng(7);
  const crust = c && (c.smooth || c.name === 'lemon') ? '#E6B56E' : side;
  const block = (x, y, s, rot) => {
    let bits = ''; for(let i = 0; i < 5; i++) bits += c ? `<circle cx="${f(x+12+r()*(s-20))}" cy="${f(y+6+r()*(s*.4-10))}" r="2.6" fill="${c.dark}" opacity=".5"/>` : `<path d="M${f(x+8+r()*(s-20))} ${f(y+6+r()*(s*.42-12))} l4 -2 l3 3 l-2 4 l-5 -1Z" fill="#2A160C" opacity=".85"/>`;
    let cracks = ''; for(let i = 0; i < 3; i++){ const cx = x + 10 + r()*(s-24), cy = y + 6 + r()*(s*.4-12); cracks += `<path d="M${f(cx)} ${f(cy)} q6 -3 12 1 q4 3 9 0" stroke="${hi}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".9"/>`; }
    return `<g transform="rotate(${rot} ${x+s/2} ${y+s/2})">
      <path d="M${x} ${y+s*.45} L${x+s} ${y+s*.45} L${x+s} ${y+s*.45+22} L${x} ${y+s*.45+22}Z" fill="${u('sd')}" ${SW}/>
      ${c ? `<path d="M${x} ${y+s*.45+14} h${s} v8 h-${s}Z" fill="${crust}" opacity=".9"/>` : `<path d="M${x} ${y+s*.45+6} h${s} M${x} ${y+s*.45+13} h${s}" stroke="#2A160C" stroke-width="1" opacity=".5"/>`}
      <path d="M${x} ${y+s*.45} L${x+12} ${y} L${x+s+12} ${y} L${x+s} ${y+s*.45}Z" fill="${u('tp')}" ${SW}/>
      <path d="M${x+s} ${y+s*.45} L${x+s+12} ${y} L${x+s+12} ${y+22} L${x+s} ${y+s*.45+22}Z" fill="${side}" ${SW}/>
      ${bits}${c ? '' : cracks}
      ${c && c.name === 'lemon' ? Array.from({length:8},() => `<circle cx="${f(x+14+r()*(s-16))}" cy="${f(y+4+r()*(s*.38))}" r="1.3" fill="#fff"/>`).join('') : ''}
      <path d="M${x+14} ${y+5} h${s*.5}" stroke="#fff" stroke-width="2" opacity=".2" stroke-linecap="round"/>
    </g>`;
  };
  let sugar = ''; for(let i = 0; i < 14; i++) sugar += `<circle cx="${f(90+r()*150)}" cy="${f(60+r()*40)}" r="${f(.6+r()*.8)}" fill="#fff" opacity=".7"/>`;
  return `<svg ${W}><defs>${lg(id,'tp',1,1,[[0,hi],[.5,top],[1,side]])}${lg(id,'sd',0,1,[[0,top],[1,side]])}${lg(id,'bd',0,1,[[0,'#E7B97E'],[1,'#C68E52']])}</defs>
    ${cloth(c ? c.bg : '#F4E3D3', c ? c.line : '#C99A74')}
    <ellipse cx="164" cy="160" rx="132" ry="22" fill="#000" opacity=".12"/>
    <path d="M36 118 L270 96 Q292 96 294 110 L296 140 Q294 152 280 154 L46 172 Q30 172 30 158 L30 130 Q30 118 36 118Z" fill="${u('bd')}" ${SW}/>
    <path d="M44 126 L270 106 M44 140 L276 120 M46 154 L280 136" stroke="#B07A42" stroke-width="1.4" opacity=".55"/>
    <circle cx="282" cy="124" r="5" fill="${c ? c.bg : '#F4E3D3'}" stroke="${O}" stroke-width="1.6"/>
    ${block(64,78,62,-4)}${block(140,70,62,-3)}${block(104,40,60,-5)}
    ${sugar}
    <g transform="translate(244 30) rotate(24)"><path d="M2 0 q14 2 14 10 l-2 50 h-12Z" fill="#D9DEE4" ${SW}/><path d="M5 6 v48" stroke="#fff" stroke-width="2" opacity=".6"/><rect x="0" y="58" width="16" height="34" rx="5" fill="#4A3426" ${SW}/><circle cx="8" cy="68" r="1.6" fill="#C9A27E"/><circle cx="8" cy="82" r="1.6" fill="#C9A27E"/></g>
    ${leaf(40,70,-20)}${sparkles([30,36,6],[290,40,7],[260,180,4])}
  </svg>`;
};

// ---------- COOKIES ----------
DRAW.cookies = (fl, id, u, t) => {
  const r = rng(11), choc = fl && fl.name === 'chocolate', fruit = fl && ['raspberry','strawberry','cherry','blueberry','lemon'].includes(fl.name) ? fl : null;
  const dough = choc ? '#6A4028' : '#E2A75E', edge = choc ? '#3E2416' : '#B97A35', hi = choc ? '#8A5A3C' : '#F6CF8A';
  const chipC = choc ? '#F4EEDF' : '#3E2416';
  const plain = /sugar|shortbread|snickerdoodle|butter cookie|gingerbread/.test((t || '').split('\n')[0]) || (fl && ['vanilla','lemon','pumpkin'].includes(fl.name));
  const cookie = (cx, cy, rr, rot) => {
    let chips = ''; if(!plain) for(let i = 0; i < 7; i++){ const a = r()*6.28, d = Math.sqrt(r())*rr*.72; chips += fruit ? `<circle cx="${f(cx+Math.cos(a)*d)}" cy="${f(cy+Math.sin(a)*d*.8)}" r="3.4" fill="${fruit.main}" stroke="${fruit.dark}" stroke-width=".8"/>` : `<path d="M${f(cx+Math.cos(a)*d)} ${f(cy+Math.sin(a)*d*.8)} l4 -3 l4 2 l-1 5 l-6 1Z" fill="${chipC}"/>`; }
    let cr = ''; for(let i = 0; i < 4; i++){ const a = r()*6.28, d = r()*rr*.6; cr += `<path d="M${f(cx+Math.cos(a)*d)} ${f(cy+Math.sin(a)*d*.8)} q5 -3 10 0" stroke="${edge}" stroke-width="1.4" fill="none" opacity=".7"/>`; }
    let pts = ''; for(let i = 0; i < 18; i++){ const a = i/18*6.283, rr2 = rr*(.94+r()*.1); pts += `${i ? 'L' : 'M'}${f(cx+Math.cos(a)*rr2)} ${f(cy+Math.sin(a)*rr2*.82)}`; }
    const sugar = plain ? Array.from({length:10},() => `<rect x="${f(cx-rr*.6+r()*rr*1.2)}" y="${f(cy-rr*.5+r()*rr)}" width="2" height="2" fill="#fff" opacity=".9"/>`).join('') : '';
    return `<g transform="rotate(${rot} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy+7}" rx="${rr}" ry="${rr*.8}" fill="${edge}" ${SW}/><path d="${pts}Z" fill="${u('dg')}" ${SW}/>${cr}${chips}${sugar}<ellipse cx="${cx-rr*.35}" cy="${cy-rr*.35}" rx="${rr*.25}" ry="${rr*.12}" fill="#fff" opacity=".25"/></g>`;
  };
  let crumbs = ''; for(let i = 0; i < 10; i++) crumbs += `<circle cx="${f(60+r()*200)}" cy="${f(150+r()*30)}" r="${f(1.5+r()*2)}" fill="${dough}" stroke="${edge}" stroke-width=".8"/>`;
  return `<svg ${W}><defs>${rg(id,'dg',[[0,hi],[.6,dough],[1,edge]])}</defs>
    ${cloth('#E2EEF2','#8EB6C4')}
    <rect x="24" y="44" width="272" height="140" rx="14" fill="#B9C3CC" ${SW}/><rect x="34" y="54" width="252" height="120" rx="8" fill="#D5DCE2"/>
    <path d="M40 60 L280 60 M40 168 L280 168" stroke="#fff" stroke-width="2" opacity=".5"/>
    ${cookie(92,96,34,-8)}${cookie(176,84,36,6)}${cookie(250,108,30,-4)}${cookie(132,140,32,10)}${cookie(214,146,30,-10)}
    ${crumbs}
    <g transform="translate(16 120)"><rect x="0" y="0" width="38" height="46" rx="6" fill="#fff" ${SW}/><path d="M38 12 q14 0 14 12 q0 12 -14 12" fill="none" ${SW}/><rect x="4" y="6" width="30" height="10" fill="#EAF2F6"/></g>
    ${sparkles([300,30,7],[30,30,5],[160,188,4])}
  </svg>`;
};

// ---------- PANCAKES / WAFFLES ----------
DRAW.pancakes = (fl, id, u) => {
  const fr = fl && ['blueberry','strawberry','raspberry','blackberry','banana','chocolate','chocchip','peach','apple','pumpkin','cherry'].includes(fl.name) ? fl : null;
  const cake = fr && fr.name === 'pumpkin' ? '#E39A4E' : fr && fr.name === 'chocolate' ? '#7A4A2E' : '#E7AE5E';
  let stack = ''; for(let i = 0; i < 5; i++){ const y = 140 - i*15; stack += `<ellipse cx="160" cy="${y+6}" rx="${78-i}" ry="20" fill="${fr && fr.name === 'chocolate' ? '#4A2A18' : '#C98A3E'}" ${SW}/><ellipse cx="160" cy="${y}" rx="${78-i}" ry="20" fill="${u('pk')}" ${SW}/>`; }
  let tops = '';
  if(!fr || fr.name === 'blueberry' || fr.name === 'blackberry' || fr.name === 'cherry') { const cc = fr || flavorOf('blueberry'); tops = [[146,72],[164,66],[180,74],[156,80],[172,82]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${cc.main}" stroke="${O}" stroke-width="1.3"/><circle cx="${x-2}" cy="${y-2}" r="1.8" fill="#fff" opacity=".6"/>`).join(''); }
  else if(fr.name === 'strawberry' || fr.name === 'raspberry') tops = [[144,70,-20],[164,64,10],[184,72,30],[158,82,-5]].map(([x,y,a]) => `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M-8 -4 q8 -6 16 0 q0 12 -8 18 q-8 -6 -8 -18Z" fill="${fr.main}" stroke="${O}" stroke-width="1.3"/><path d="M-7 -5 l3 -4 l4 3 l4 -3 l3 4" fill="#5FA35C" stroke="${O}" stroke-width="1"/><circle cx="-3" cy="2" r=".9" fill="#FCE9A8"/><circle cx="3" cy="3" r=".9" fill="#FCE9A8"/><circle cx="0" cy="8" r=".9" fill="#FCE9A8"/></g>`).join('');
  else if(fr.name === 'banana') tops = [[146,72],[164,66],[182,74],[162,82]].map(([x,y]) => `<ellipse cx="${x}" cy="${y}" rx="9" ry="6" fill="#FFF2B8" stroke="${O}" stroke-width="1.3"/><circle cx="${x}" cy="${y}" r="1.6" fill="#C9A93A"/>`).join('');
  else if(fr.name === 'chocolate' || fr.name === 'chocchip') tops = [[148,72],[160,66],[174,72],[164,80],[184,78],[140,80]].map(([x,y]) => `<path d="M${x} ${y} l4 -3 l4 2 l-1 5 l-6 1Z" fill="#2A160C"/>`).join('');
  else tops = `<path d="M140 76 q20 -14 44 0 q-22 10 -44 0Z" fill="${fr.main}" stroke="${O}" stroke-width="1.3"/>`;
  return `<svg ${W}><defs>${rg(id,'pk',[[0,'#F8D899'],[.7,cake],[1,'#C98A3E']],.5,.35,.7)}${lg(id,'sy',0,1,[[0,'#D98A3A'],[1,'#B5651D']])}</defs>
    ${cloth(fr ? fr.bg : '#FCEFD8', fr ? fr.line : '#E9B97A')}
    ${plate(160,158,118,30)}
    ${stack}
    <path d="M100 78 q20 -16 60 -14 q46 0 64 14 q-6 10 -18 6 q-4 22 -10 2 q-14 6 -30 4 q-6 30 -12 2 q-22 2 -40 -4 q-4 16 -10 -2 q-6 0 -4 -8Z" fill="${fr && fr.name === 'chocolate' ? '#3E2416' : u('sy')}" stroke="${O}" stroke-width="1.6" opacity=".95"/>
    <path d="M122 72 q20 -8 40 -6" stroke="#FFD9A0" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
    <rect x="146" y="50" width="26" height="16" rx="3" fill="#FCE9A8" ${SW}/><path d="M148 52 h22" stroke="#fff" stroke-width="2" opacity=".7"/>
    ${tops}
    <g transform="translate(262 92)"><path d="M0 0 h28 l-4 60 h-20Z" fill="${u('sy')}" ${SW}/><rect x="6" y="-14" width="16" height="16" rx="3" fill="#D9DEE4" ${SW}/><path d="M6 8 h16" stroke="#fff" stroke-width="2" opacity=".4"/></g>
    ${leaf(52,90,-20)}${sparkles([40,40,7],[286,34,6],[60,176,4])}
  </svg>`;
};

// generic pie: golden top crust with vents, so the flavor stays a surprise
function closedPie(id, u){
  const cx = 160, cy = 100, rx = 70, ry = 58;
  let crimp = ''; for(let i = 0; i < 30; i++){ const a = i/30*6.283, x = f(cx + Math.cos(a)*(rx+2)), y = f(cy + Math.sin(a)*(ry+2)); crimp += `<ellipse cx="${x}" cy="${y}" rx="10" ry="8.5" fill="${u('cr')}" stroke="#A86E2C" stroke-width="1.5" transform="rotate(${Math.round(a*57.3+90)} ${x} ${y})"/><path d="M${f(x-3)} ${f(y-3)} q3 -2 6 0" stroke="#FCE3B0" stroke-width="1.6" fill="none" stroke-linecap="round"/>`; }
  const r = rng(5); let sugar = ''; for(let i = 0; i < 60; i++){ const a = r()*6.283, d = Math.sqrt(r())*.9, x = f(cx + Math.cos(a)*rx*d), y = f(cy + Math.sin(a)*ry*d); sugar += `<rect x="${x}" y="${y}" width="2.2" height="2.2" rx=".6" fill="#FFF8E6" opacity=".9" transform="rotate(${Math.round(r()*90)} ${x} ${y})"/>`; }
  const vents = [0, 72, 144, 216, 288].map(a => `<g transform="translate(${cx} ${cy}) scale(1 .83) rotate(${a})"><path d="M0 -14 q5 -14 0 -30 q-5 16 0 30Z" fill="#8A4A1E" stroke="#A86E2C" stroke-width="1.2"/></g>`).join('');
  return `<svg ${W}><defs>${rg(id,'top',[[0,'#FBE2A8'],[.55,'#EDBB6C'],[1,'#C98A3E']],.45,.4,.7)}${lg(id,'cr',0,1,[[0,'#F7D493'],[.55,'#E6AE5E'],[1,'#C98A3E']])}${lg(id,'tin',0,1,[[0,'#E9EDF2'],[1,'#9AA3AE']])}</defs>
    ${cloth('#F4EAD6','#D8B97E')}
    ${plate(160,106,122,80,'#D8B97E')}
    <ellipse cx="160" cy="103" rx="88" ry="74" fill="${u('tin')}" ${SW}/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${u('top')}" ${SW}/>
    <path d="M${cx-46} ${cy-22} q40 -30 84 -6" stroke="#FFF1CC" stroke-width="5" fill="none" opacity=".55" stroke-linecap="round"/>
    ${vents}<circle cx="${cx}" cy="${cy}" r="5" fill="#8A4A1E" stroke="#A86E2C" stroke-width="1.2"/>
    ${sugar}${crimp}
    ${fork(282,128,-18)}${leaf(50,150,-30)}${leaf(62,158,20)}
    <g transform="translate(270 44)"><path d="M-12 0 q12 -14 24 0 q-2 10 -12 12 q-10 -2 -12 -12Z" fill="#fff" stroke="${O}" stroke-width="1.6"/><path d="M-4 -2 q4 -6 8 0" stroke="#E8DCC4" stroke-width="1.4" fill="none"/></g>
    ${sparkles([40,40,7],[232,26,5],[300,176,5],[100,184,4])}
  </svg>`;
}

// ---------- LAYER CAKE ----------
DRAW.cake = (fl, id, u) => {
  const c = fl && fl.name !== 'chocchip' ? fl : {name:'vanilla', main:'#F6EAD0', dark:'#D8C39A', light:'#FFFBF0', bg:'#F4E4EE', line:'#D9A9C4'};
  const sponge = c.name === 'chocolate' ? '#6A4028' : c.name === 'redvelvet' ? '#A3162B' : c.name === 'carrot' ? '#D98A3E' : c.name === 'lemon' ? '#F6DC7A' : '#F2D29A';
  const frost = c.name === 'chocolate' ? '#4A2A18' : ['redvelvet','carrot','vanilla','lemon'].includes(c.name) ? '#FFF8EC' : c.light;
  const fill = c.name === 'chocolate' ? '#3E2416' : ['strawberry','raspberry','cherry','blueberry','blackberry','lemon','lime','peach','matcha'].includes(c.name) ? c.main : '#FFF8EC';
  const r = rng(13);
  let dots = ''; for(let i = 0; i < 18; i++) dots += `<rect x="${f(110+r()*104)}" y="${f(52+r()*20)}" width="5" height="2" rx="1" fill="${['#E85D75','#F4C542','#5BB8D9','#7FC77A','#B38BE0'][i%5]}" transform="rotate(${Math.round(r()*180)} ${f(110+r()*104)} ${f(60)})"/>`;
  const topper = ['strawberry','raspberry','cherry','blueberry'].includes(c.name)
    ? [[136,52],[162,46],[188,52]].map(([x,y]) => c.name === 'blueberry' ? `<circle cx="${x}" cy="${y}" r="7" fill="${c.main}" stroke="${O}" stroke-width="1.3"/><circle cx="${x-2}" cy="${y-2}" r="2" fill="#fff" opacity=".6"/>` : c.name === 'cherry' ? `<circle cx="${x}" cy="${y}" r="7.5" fill="${c.main}" stroke="${O}" stroke-width="1.3"/><path d="M${x} ${y-7} q4 -10 10 -12" stroke="#5A3A1E" stroke-width="1.6" fill="none"/>` : `<g transform="translate(${x} ${y})"><path d="M-8 -4 q8 -6 16 0 q0 12 -8 18 q-8 -6 -8 -18Z" fill="${c.main}" stroke="${O}" stroke-width="1.3"/><path d="M-7 -5 l3 -4 l4 3 l4 -3 l3 4" fill="#5FA35C" stroke="${O}" stroke-width="1"/></g>`).join('')
    : c.name === 'chocolate' ? [[140,50],[162,46],[184,50]].map(([x,y]) => `<path d="M${x-8} ${y+4} q0 -12 8 -14 q8 2 8 14Z" fill="#6A4028" stroke="${O}" stroke-width="1.3"/>`).join('')
    : c.name === 'lemon' || c.name === 'lime' ? `<g transform="translate(162 48)"><path d="M-14 4 a14 14 0 0 1 28 0Z" fill="${c.main}" stroke="${O}" stroke-width="1.4"/><path d="M0 4 v-12 M0 4 l-9 -8 M0 4 l9 -8" stroke="${c.dark}" stroke-width="1"/></g>`
    : dots;
  const layers = [0,1,2].map(i => `<path d="M96 ${86+i*28} h128 v24 h-128Z" fill="${sponge}"/>${i < 2 ? `<path d="M96 ${108+i*28} h128 v6 h-128Z" fill="${fill}"/>` : ''}`).join('');
  return `<svg ${W}><defs>${lg(id,'fr',1,0,[[0,frost],[.5,'#fff'],[1,frost]])}</defs>
    ${cloth(c.bg, c.line)}
    <ellipse cx="160" cy="174" rx="118" ry="16" fill="#000" opacity=".12"/>
    <path d="M70 160 h180 l-14 12 h-152Z" fill="#E8EDF2" ${SW}/><rect x="152" y="172" width="16" height="16" fill="#D3DAE2" ${SW}/>
    <ellipse cx="160" cy="160" rx="96" ry="16" fill="#F7F9FB" ${SW}/>
    <path d="M90 74 h140 v84 q-70 14 -140 0Z" fill="${frost}" ${SW}/>
    <g opacity=".95">${layers}</g>
    <path d="M90 74 h6 v84 h-6Z M224 74 h6 v84 h-6Z" fill="${frost}"/>
    <path d="M90 158 q70 14 140 0" fill="none" ${SW}/>
    <ellipse cx="160" cy="74" rx="70" ry="18" fill="${u('fr')}" ${SW}/>
    <path d="M90 74 q8 18 16 4 q8 18 16 2 q8 18 16 2 q8 18 16 2 q8 18 16 2 q8 18 16 2 q8 18 16 2 q8 18 18 -14" fill="${frost}" ${SW}/>
    <path d="M102 70 q30 -12 60 -10" stroke="#fff" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/>
    ${topper}
    <g transform="translate(264 100) rotate(18)"><path d="M0 0 l12 0 l-2 54 l-8 0Z" fill="#D9DEE4" ${SW}/><rect x="-1" y="52" width="14" height="30" rx="4" fill="#F4C542" ${SW}/></g>
    ${sparkles([40,36,7],[286,40,6],[40,170,4])}
  </svg>`;
};

// ---------- CUPCAKES ----------
DRAW.cupcake = (fl, id, u) => {
  const c = fl || {name:'vanilla', main:'#F8C8D8', dark:'#D98AA6', light:'#FFE6EE', bg:'#FBE7EE', line:'#E7A9BF'};
  const frost = c.name === 'chocolate' ? '#5A3522' : c.name === 'redvelvet' || c.name === 'vanilla' || c.name === 'carrot' ? '#FFF6EC' : c.light;
  const base = c.name === 'chocolate' ? '#6A4028' : c.name === 'redvelvet' ? '#A3162B' : '#E9B56A';
  const cup = (x, y, s, liner) => `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-30 0 L-22 40 L22 40 L30 0Z" fill="${liner}" ${SW}/>${[-20,-10,0,10,20].map(v => `<path d="M${v*1.05} 2 L${v*.75} 38" stroke="#fff" stroke-width="2" opacity=".55"/>`).join('')}
    <path d="M-32 0 q0 -10 10 -10 h44 q10 0 10 10Z" fill="${base}" ${SW}/>
    <path d="M-30 -6 q-6 -18 14 -20 q-2 -16 16 -18 q18 2 16 18 q20 2 14 20 q-30 8 -60 0Z" fill="${frost}" ${SW}/>
    <path d="M-20 -14 q14 -8 28 -4 M-10 -30 q10 -6 18 0" stroke="#fff" stroke-width="2.4" fill="none" opacity=".7" stroke-linecap="round"/>
    ${c.name === 'chocolate' || c.name === 'vanilla' ? `<circle cx="0" cy="-42" r="6" fill="#D7263D" stroke="${O}" stroke-width="1.3"/><path d="M0 -48 q2 -8 8 -10" stroke="#5A3A1E" stroke-width="1.5" fill="none"/>` : `<circle cx="0" cy="-40" r="6" fill="${c.main}" stroke="${O}" stroke-width="1.3"/>`}
  </g>`;
  return `<svg ${W}>${cloth(c.bg, c.line)}
    <ellipse cx="160" cy="176" rx="120" ry="12" fill="#000" opacity=".12"/>
    ${cup(92,128,.95,'#7FC3D9')}${cup(228,128,.95,'#F4C542')}${cup(160,136,1.12,'#E85D75')}
    ${Array.from({length:10},(_,i) => `<rect x="${60+i*22}" y="${180-(i%3)*4}" width="6" height="2.4" rx="1" fill="${['#E85D75','#F4C542','#5BB8D9','#7FC77A','#B38BE0'][i%5]}" transform="rotate(${i*37} ${63+i*22} ${181})"/>`).join('')}
    ${sparkles([40,40,7],[286,36,6],[300,150,4])}
  </svg>`;
};

// ---------- MUFFINS ----------
DRAW.muffin = (fl, id, u) => {
  const c = fl;
  const top = c && c.name === 'chocolate' ? '#6A4028' : c && c.name === 'pumpkin' ? '#D98A3E' : c && c.name === 'banana' ? '#D9A55A' : '#E3A95C';
  const dots = c && ['blueberry','raspberry','strawberry','cherry','blackberry','chocolate','chocchip'].includes(c.name) ? (c.name === 'chocolate' || c.name === 'chocchip' ? '#2A160C' : c.main) : null;
  const r = rng(17);
  const muff = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-30 0 L-22 40 L22 40 L30 0Z" fill="#F3E7D2" ${SW}/>${[-20,-10,0,10,20].map(v => `<path d="M${v*1.05} 2 L${v*.75} 38" stroke="#D8C6A6" stroke-width="2"/>`).join('')}
    <path d="M-36 2 q-6 -30 36 -34 q42 4 36 34 q-36 8 -72 0Z" fill="${u('mf')}" ${SW}/>
    ${dots ? Array.from({length:7},() => `<circle cx="${f(-24+r()*48)}" cy="${f(-24+r()*22)}" r="3.6" fill="${dots}" stroke="${O}" stroke-width=".8"/>`).join('') : Array.from({length:12},() => `<rect x="${f(-24+r()*48)}" y="${f(-26+r()*22)}" width="3" height="3" rx="1" fill="#FCE3B0" opacity=".9"/>`).join('')}
    <path d="M-22 -18 q14 -10 30 -8" stroke="#FCE3B0" stroke-width="2.4" fill="none" opacity=".7" stroke-linecap="round"/>
  </g>`;
  return `<svg ${W}><defs>${rg(id,'mf',[[0,'#F6CF8A'],[.6,top],[1,'#A86E2C']],.45,.3,.8)}</defs>
    ${cloth(c ? c.bg : '#F6EADB', c ? c.line : '#DDBF97')}
    <path d="M30 150 L290 150 L300 178 L20 178Z" fill="#C9A27E" ${SW}/><path d="M24 168 h272" stroke="#A9825E" stroke-width="1.4"/>
    ${muff(96,112,.95)}${muff(226,112,.95)}${muff(160,122,1.12)}
    ${leaf(40,60,-20)}${sparkles([40,36,6],[290,40,7],[160,30,4])}
  </svg>`;
};

// ---------- ICE CREAM ----------
DRAW.icecream = (fl, id, u) => {
  const c = fl || flavorOf('strawberry');
  const scoops = [c.name === 'chocolate' ? '#6A4028' : c.light, '#FFF6E4', c.name === 'chocolate' ? '#8A5A3C' : c.main];
  const scoop = (x, y, col) => `<path d="M${x-30} ${y+10} q-4 -36 30 -38 q34 2 30 38 q-6 6 -10 2 q-6 6 -12 0 q-6 6 -12 0 q-6 6 -12 0 q-6 6 -10 -2Z" fill="${col}" ${SW}/><path d="M${x-16} ${y-14} q8 -8 18 -8" stroke="#fff" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/>`;
  return `<svg ${W}>${cloth(c.bg, c.line)}
    <ellipse cx="160" cy="176" rx="90" ry="12" fill="#000" opacity=".12"/>
    <path d="M100 116 q60 18 120 0 l-14 54 q-46 10 -92 0Z" fill="#F7F9FB" ${SW}/><path d="M104 128 q56 14 112 0" stroke="${c.line}" stroke-width="3" fill="none" stroke-dasharray="2 7" stroke-linecap="round"/>
    <ellipse cx="160" cy="116" rx="62" ry="14" fill="#E8EDF2" ${SW}/>
    ${scoop(128,104,scoops[0])}${scoop(192,104,scoops[1])}${scoop(160,74,scoops[2])}
    <path d="M150 36 q0 -10 10 -12 q10 2 10 12 q-10 6 -20 0Z" fill="#fff" ${SW}/>
    <circle cx="160" cy="22" r="7" fill="#D7263D" stroke="${O}" stroke-width="1.4"/><path d="M160 15 q2 -8 8 -10" stroke="#5A3A1E" stroke-width="1.6" fill="none"/>
    <g transform="translate(236 60) rotate(30)"><rect x="-6" y="0" width="12" height="44" rx="3" fill="#E9B56A" ${SW}/><path d="M-6 10 h12 M-6 22 h12 M-6 34 h12" stroke="#B97A35" stroke-width="1.2"/></g>
    ${Array.from({length:8},(_,i) => `<rect x="${124+i*9}" y="${54+(i%3)*6}" width="5" height="2" rx="1" fill="${['#E85D75','#F4C542','#5BB8D9','#7FC77A'][i%4]}" transform="rotate(${i*40} ${126+i*9} ${55})"/>`).join('')}
    ${spoon(78,120,-28)}${sparkles([40,40,7],[286,36,6],[290,150,4])}
  </svg>`;
};

// ---------- SMOOTHIE / DRINK ----------
DRAW.smoothie = (fl, id, u) => {
  const c = fl || flavorOf('strawberry');
  const drink = c.name === 'chocolate' ? '#8A5A3C' : c.main;
  return `<svg ${W}><defs>${lg(id,'dr',0,1,[[0,c.light],[1,drink]])}</defs>${cloth(c.bg, c.line)}
    <ellipse cx="160" cy="180" rx="70" ry="10" fill="#000" opacity=".12"/>
    <path d="M118 40 h84 l-10 136 q-32 8 -64 0Z" fill="#fff" opacity=".55" ${SW}/>
    <path d="M122 70 h76 l-8 104 q-30 7 -60 0Z" fill="${u('dr')}"/>
    <path d="M118 40 h84 l-10 136 q-32 8 -64 0Z" fill="none" ${SW}/>
    <path d="M130 78 l6 90" stroke="#fff" stroke-width="5" opacity=".45" stroke-linecap="round"/>
    <path d="M120 66 q10 -12 22 -2 q10 -12 22 0 q12 -12 22 0 q10 -10 18 2" fill="#FFF8EC" ${SW}/>
    <g transform="rotate(14 186 30)"><rect x="182" y="0" width="10" height="76" rx="4" fill="#E85D75" ${SW}/><path d="M182 14 h10 M182 30 h10 M182 46 h10" stroke="#fff" stroke-width="3"/></g>
    ${['strawberry','raspberry'].includes(c.name) ? `<g transform="translate(206 44) rotate(20)"><path d="M-10 -5 q10 -8 20 0 q0 16 -10 22 q-10 -6 -10 -22Z" fill="${c.main}" stroke="${O}" stroke-width="1.4"/><path d="M-9 -6 l4 -5 l5 4 l5 -4 l4 5" fill="#5FA35C" stroke="${O}" stroke-width="1"/></g>`
      : c.name === 'lemon' || c.name === 'lime' || c.name === 'peach' ? `<g transform="translate(206 44)"><circle r="16" fill="${c.light}" stroke="${O}" stroke-width="1.6"/><circle r="11" fill="none" stroke="${c.dark}" stroke-width="1"/><path d="M0 -11 v22 M-11 0 h22 M-8 -8 l16 16 M8 -8 l-16 16" stroke="${c.dark}" stroke-width="1"/></g>`
      : `<circle cx="206" cy="46" r="9" fill="${c.main}" stroke="${O}" stroke-width="1.4"/><circle cx="203" cy="43" r="2.4" fill="#fff" opacity=".6"/>`}
    ${leaf(214,30,-40)}
    <g transform="translate(250 150)">${[0,1,2].map(i => `<circle cx="${i*14}" cy="${i%2*6}" r="8" fill="${c.main}" stroke="${O}" stroke-width="1.3"/>`).join('')}</g>
    <g transform="translate(58 146)"><ellipse rx="22" ry="8" fill="#F4C542" stroke="${O}" stroke-width="1.6"/><path d="M-20 0 q20 -26 40 0" fill="#FCE3A0" stroke="${O}" stroke-width="1.6"/></g>
    ${sparkles([40,40,7],[286,36,6],[160,22,4])}
  </svg>`;
};

// ---------- BREAD ----------
DRAW.bread = (fl, id, u) => {
  const r = rng(19);
  return `<svg ${W}><defs>${rg(id,'cr',[[0,'#F2C27A'],[.6,'#D08A3E'],[1,'#9C5A22']],.45,.35,.75)}</defs>${cloth('#F2E6D4','#D3B58C')}
    <path d="M24 132 L296 116 L300 172 L28 184Z" fill="#C9A27E" ${SW}/><path d="M26 160 L298 146" stroke="#A9825E" stroke-width="1.4"/><circle cx="286" cy="132" r="4.5" fill="#F2E6D4" stroke="${O}" stroke-width="1.4"/>
    <path d="M52 132 q-6 -78 100 -82 q108 4 102 76 q-100 18 -202 6Z" fill="${u('cr')}" ${SW}/>
    ${[0,1,2,3].map(i => `<path d="M${92+i*36} ${70+i*2} q10 22 4 46" stroke="#F8DCA4" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M${92+i*36} ${70+i*2} q10 22 4 46" stroke="#A86E2C" stroke-width="1.4" fill="none" stroke-linecap="round" transform="translate(-4 0)"/>`).join('')}
    <path d="M78 76 q40 -26 90 -24" stroke="#fff" stroke-width="4" fill="none" opacity=".35" stroke-linecap="round"/>
    ${Array.from({length:30},() => `<ellipse cx="${f(70+r()*170)}" cy="${f(64+r()*56)}" rx="1.4" ry=".8" fill="#FFF3DA" opacity=".8"/>`).join('')}
    <g transform="translate(256 136) rotate(-8)"><path d="M-22 6 q-4 -30 22 -32 q26 2 22 32 q-22 6 -44 0Z" fill="#F8E7C4" ${SW}/><path d="M-18 4 q-2 -22 18 -24 q20 2 18 24" fill="none" stroke="#D08A3E" stroke-width="5"/>${Array.from({length:8},() => `<circle cx="${f(-12+r()*24)}" cy="${f(-14+r()*14)}" r="1.4" fill="#E2C893"/>`).join('')}</g>
    <g transform="translate(286 60) rotate(14)">${[0,1,2,3,4].map(i => `<ellipse cx="${i%2 ? 5 : -5}" cy="${-i*9}" rx="4" ry="7" fill="#E7C27A" stroke="#A86E2C" stroke-width="1.2" transform="rotate(${i%2 ? 30 : -30} ${i%2 ? 5 : -5} ${-i*9})"/>`).join('')}<path d="M0 0 v40" stroke="#A86E2C" stroke-width="1.6"/></g>
    <g transform="translate(40 150)"><rect x="-14" y="-10" width="28" height="18" rx="3" fill="#FCE9A8" ${SW}/><path d="M-12 -8 h24" stroke="#fff" stroke-width="2" opacity=".7"/></g>
    ${sparkles([36,40,6],[160,26,5],[300,190,4])}
  </svg>`;
};

// ---------- SOUP / STEW ----------
DRAW.soup = (fl, id, u) => {
  const c = fl && ['tomato','pumpkin','carrot','matcha','chocolate','vanilla','lemon'].includes(fl.name) ? fl : null;
  const broth = c ? (c.name === 'chocolate' ? '#7A4A2E' : c.name === 'vanilla' ? '#F2E4C6' : c.main) : '#E89A3C';
  const r = rng(23);
  const bits = Array.from({length:9},() => { const x = f(112+r()*96), y = f(84+r()*18); return r() > .5 ? `<rect x="${x}" y="${y}" width="8" height="7" rx="1.5" fill="#F6E7C8" stroke="${O}" stroke-width="1"/>` : `<circle cx="${x}" cy="${y}" r="3.5" fill="#5FA35C" stroke="${O}" stroke-width=".8"/>`; }).join('');
  return `<svg ${W}><defs>${rg(id,'br',[[0,'#fff'],[.25,broth],[1,broth]],.4,.35,.8)}</defs>${cloth(c ? c.bg : '#E3EEDC', c ? c.line : '#A9C69A')}
    ${steam([130,160,190],60)}
    <ellipse cx="160" cy="176" rx="104" ry="12" fill="#000" opacity=".12"/>
    <ellipse cx="160" cy="166" rx="112" ry="18" fill="#fff" ${SW}/>
    <path d="M70 92 h180 q-4 66 -90 72 q-86 -6 -90 -72Z" fill="#fff" ${SW}/>
    <path d="M82 116 q78 44 156 0" stroke="#E85D75" stroke-width="4" fill="none"/><path d="M86 128 q74 38 148 0" stroke="#E85D75" stroke-width="1.5" fill="none" stroke-dasharray="3 6"/>
    <ellipse cx="160" cy="92" rx="90" ry="20" fill="#F7F3EC" ${SW}/>
    <ellipse cx="160" cy="94" rx="78" ry="14" fill="${u('br')}"/>
    ${bits}
    <path d="M140 92 q12 -6 24 0 q-12 6 -24 0Z" fill="#fff" opacity=".85"/>
    ${spoon(232,90,30)}
    <g transform="translate(46 140)"><ellipse rx="22" ry="10" fill="#E3B26A" ${SW}/><path d="M-16 -2 l10 -4 M-4 -4 l10 -4 M8 -4 l8 -2" stroke="#A86E2C" stroke-width="1.6" stroke-linecap="round"/></g>
    ${leaf(274,150,-20)}${sparkles([40,40,6],[290,36,7])}
  </svg>`;
};

// ---------- PASTA ----------
DRAW.pasta = (fl, id, u) => {
  const t = fl ? fl.name : 'tomato';
  const sauce = t === 'matcha' ? '#6E9A3E' : t === 'vanilla' ? '#F6EAD0' : '#C8412F';
  const swirl = Array.from({length:8},(_,i) => `<path d="M${86+i*4} ${112+i*4} C 120 ${74+i*6}, 200 ${150-i*4}, ${234-i*4} ${104+i*5}" stroke="#F3D27E" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M${86+i*4} ${112+i*4} C 120 ${74+i*6}, 200 ${150-i*4}, ${234-i*4} ${104+i*5}" stroke="#D9AE52" stroke-width="1.4" fill="none" stroke-linecap="round" transform="translate(0 3)"/>`).join('');
  const balls = t === 'vanilla' || t === 'matcha' ? '' : [[136,110,13],[178,104,14],[158,128,12]].map(([x,y,s]) => `<circle cx="${x}" cy="${y}" r="${s}" fill="#8E3B26" ${SW}/><circle cx="${x-4}" cy="${y-4}" r="3.5" fill="#B8573A"/>`).join('');
  const r = rng(29);
  return `<svg ${W}>${cloth('#F8E5D0','#EDB98D')}
    ${plate(160,124,126,62,'#EDB98D')}
    <ellipse cx="160" cy="118" rx="90" ry="44" fill="#F0C863" ${SW}/>
    <clipPath id="${id}pc"><ellipse cx="160" cy="118" rx="88" ry="42"/></clipPath><g clip-path="${u('pc')}">${swirl}</g>
    <path d="M114 110 q 20 -18 46 -8 q 28 -14 46 8 q -10 18 -46 14 q -36 8 -46 -14Z" fill="${sauce}" ${SW.replace('2.2','1.4')} opacity=".95"/>
    ${balls}
    ${Array.from({length:14},() => `<rect x="${f(124+r()*70)}" y="${f(98+r()*30)}" width="2.4" height="2.4" fill="#FFF7E0"/>`).join('')}
    ${leaf(186,88,-30,'#4E8B47')}${leaf(198,92,30,'#4E8B47')}
    ${fork(262,96,22)}
    <g transform="translate(46 60)"><path d="M-14 -10 l28 0 l-6 34 h-16Z" fill="#E9EDF2" ${SW}/><rect x="-10" y="-20" width="20" height="10" rx="2" fill="#C8412F" ${SW}/></g>
    ${sparkles([292,36,6],[34,170,5],[160,22,4])}
  </svg>`;
};

// ---------- PIZZA ----------
DRAW.pizza = (fl, id, u) => {
  const r = rng(31), cx = 160, cy = 104;
  const pep = Array.from({length:9},() => { const a = r()*6.28, d = 20+r()*48; return `<circle cx="${f(cx+Math.cos(a)*d)}" cy="${f(cy+Math.sin(a)*d*.62)}" r="7" fill="#B8312A" stroke="${O}" stroke-width="1.1"/><circle cx="${f(cx+Math.cos(a)*d-2)}" cy="${f(cy+Math.sin(a)*d*.62-2)}" r="1.6" fill="#E26A5A"/>`; }).join('');
  const basil = Array.from({length:4},(_,i) => leaf(f(130+i*22), f(88+(i%2)*28), i*50, '#4E8B47')).join('');
  return `<svg ${W}><defs>${rg(id,'ch',[[0,'#FFF2B8'],[.7,'#F6D36A'],[1,'#E7AE3E']],.45,.4,.7)}</defs>${cloth('#F6E1D2','#E2A98A')}
    <ellipse cx="164" cy="114" rx="128" ry="76" fill="#000" opacity=".12"/>
    <ellipse cx="160" cy="108" rx="126" ry="74" fill="#C9A27E" ${SW}/><path d="M60 108 h200" stroke="#A9825E" stroke-width="1.2" opacity=".5"/>
    <ellipse cx="160" cy="104" rx="108" ry="66" fill="#D99A4C" ${SW}/>
    <ellipse cx="160" cy="102" rx="96" ry="57" fill="#C8412F"/>
    <path d="M70 102 q8 -40 60 -52 q50 -10 90 10 q36 22 30 50 q-10 32 -60 40 q-60 6 -100 -16 q-24 -14 -20 -32Z" fill="${u('ch')}"/>
    ${pep}${basil}
    ${[0,60,120,180,240,300].map(a => `<path d="M${cx} ${cy} L${f(cx+Math.cos(a*Math.PI/180)*108)} ${f(cy+Math.sin(a*Math.PI/180)*66)}" stroke="#B97A35" stroke-width="1.3" opacity=".55"/>`).join('')}
    <g transform="translate(270 40) rotate(30)"><circle r="14" fill="#D9DEE4" stroke="${O}" stroke-width="1.6"/><circle r="3" fill="#9AA3AE"/><rect x="-4" y="14" width="8" height="40" rx="3" fill="#4A3426" stroke="${O}" stroke-width="1.6"/></g>
    ${sparkles([36,36,6],[296,150,5],[50,176,4])}
  </svg>`;
};

// ---------- TACOS ----------
DRAW.tacos = (fl, id, u) => {
  const taco = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <path d="M-44 10 q44 -76 88 0Z" fill="#F2C462" ${SW}/>
    <path d="M-38 6 q38 -50 76 0" fill="#8E3B26"/>
    ${[[-24,-8],[-8,-18],[10,-16],[24,-6]].map(([a,b]) => `<path d="M${a-8} ${b} q8 -10 16 0" fill="#7FC77A" stroke="${O}" stroke-width="1"/>`).join('')}
    ${[[-18,-2],[2,-10],[18,-2]].map(([a,b]) => `<rect x="${a}" y="${b}" width="7" height="6" rx="1.5" fill="#D9452B" stroke="${O}" stroke-width=".8"/>`).join('')}
    <path d="M-26 -4 q26 -26 52 0" stroke="#F8E08A" stroke-width="4" fill="none" stroke-dasharray="4 4"/>
    <path d="M-44 10 q44 -76 88 0" fill="none" ${SW}/><path d="M-30 -2 q10 -30 34 -36" stroke="#FCE3A0" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/>
  </g>`;
  return `<svg ${W}>${cloth('#FBEBD3','#EDBE7C')}
    ${plate(160,140,128,40,'#EDBE7C')}
    ${taco(104,132,-6)}${taco(214,132,6)}${taco(160,122,0)}
    <g transform="translate(46 70)"><ellipse rx="22" ry="9" fill="#fff" ${SW}/><ellipse cy="-2" rx="18" ry="6" fill="#C8412F"/>${[[-8,-3],[0,-4],[8,-2]].map(([a,b]) => `<circle cx="${a}" cy="${b}" r="1.6" fill="#7FC77A"/>`).join('')}</g>
    <g transform="translate(276 72) rotate(-20)"><ellipse rx="16" ry="12" fill="#9BCB5A" stroke="${O}" stroke-width="1.6"/><ellipse rx="11" ry="8" fill="#DDF0A8"/><path d="M0 -8 v16 M-11 0 h22 M-8 -6 l16 12 M8 -6 l-16 12" stroke="#9BCB5A" stroke-width="1"/></g>
    ${sparkles([30,30,6],[296,30,6],[160,24,4])}
  </svg>`;
};

// ---------- BURGER ----------
DRAW.burger = (fl, id, u) => {
  const r = rng(37);
  return `<svg ${W}><defs>${rg(id,'bun',[[0,'#F8D38A'],[.6,'#E3A04A'],[1,'#B97A35']],.4,.3,.8)}</defs>${cloth('#FBE6D6','#E9AE8C')}
    <ellipse cx="150" cy="176" rx="96" ry="12" fill="#000" opacity=".12"/>
    <path d="M78 150 h144 q0 24 -72 24 q-72 0 -72 -24Z" fill="${u('bun')}" ${SW}/>
    <path d="M72 140 q78 22 156 0 q4 12 -6 14 q-72 12 -144 0 q-10 -2 -6 -14Z" fill="#6A3A22" ${SW}/>
    <path d="M70 128 q12 14 24 4 q12 14 24 4 q12 14 24 4 q12 14 24 4 q12 14 24 4 q12 14 24 4 q12 14 16 -8Z" fill="#F6C342" ${SW}/>
    <path d="M68 118 q14 -10 26 2 q12 -12 26 0 q12 -12 26 0 q12 -12 26 0 q12 -12 26 0 q12 -12 26 0 q10 -10 14 6 l-164 4Z" fill="#7FC77A" ${SW}/>
    ${[[100,112],[150,108],[198,112]].map(([x,y]) => `<ellipse cx="${x}" cy="${y}" rx="18" ry="5" fill="#D9452B" stroke="${O}" stroke-width="1.3"/>`).join('')}
    <path d="M74 112 q-6 -64 76 -66 q82 2 76 66Z" fill="${u('bun')}" ${SW}/>
    <path d="M100 70 q30 -18 60 -16" stroke="#FCE3B0" stroke-width="4" fill="none" opacity=".6" stroke-linecap="round"/>
    ${Array.from({length:12},() => `<ellipse cx="${f(98+r()*104)}" cy="${f(62+r()*34)}" rx="2.6" ry="1.4" fill="#FFF6DC" transform="rotate(${Math.round(r()*90)} ${f(150)} ${f(80)})"/>`).join('')}
    <g transform="translate(250 104)">${[0,1,2,3,4].map(i => `<rect x="${i*8-18}" y="${-20+(i%2)*6}" width="7" height="56" rx="2" fill="#F2C462" stroke="${O}" stroke-width="1.3" transform="rotate(${(i-2)*6} ${i*8-15} 30)"/>`).join('')}<path d="M-26 20 h52 l-6 40 h-40Z" fill="#D7263D" ${SW}/><path d="M-20 30 h40" stroke="#fff" stroke-width="3" opacity=".7"/></g>
    ${sparkles([36,36,6],[292,34,6],[40,170,4])}
  </svg>`;
};

// ---------- SANDWICH ----------
DRAW.sandwich = (fl, id, u) => {
  const half = (x, y, flip) => `<g transform="translate(${x} ${y}) scale(${flip} 1)">
    <path d="M-50 30 L0 -46 L50 30Z" fill="#F7E3B8" ${SW}/>
    <path d="M-44 22 L0 -38 L44 22" fill="none" stroke="#D99A4C" stroke-width="5"/>
    <path d="M-46 30 h92 v8 h-92Z" fill="#E85D75" stroke="${O}" stroke-width="1.4"/>
    <path d="M-48 38 q8 8 16 0 q8 8 16 0 q8 8 16 0 q8 8 16 0 q8 8 16 0 q8 8 16 0 v6 h-96Z" fill="#7FC77A" stroke="${O}" stroke-width="1.4"/>
    <path d="M-46 44 h92 v8 h-92Z" fill="#F6C342" stroke="${O}" stroke-width="1.4"/>
    <path d="M-50 52 h100 v12 q-50 6 -100 0Z" fill="#F7E3B8" ${SW}/>
  </g>`;
  return `<svg ${W}>${cloth('#E6EFE0','#A9C69A')}
    <rect x="34" y="56" width="252" height="124" rx="16" fill="#C9A27E" ${SW}/><path d="M44 80 h232 M44 150 h232" stroke="#A9825E" stroke-width="1.4" opacity=".6"/>
    ${half(118,104,1)}${half(206,112,-1)}
    <g transform="translate(150 50)"><path d="M0 0 v60" stroke="#C9A27E" stroke-width="2.4"/><path d="M0 -4 l10 -6 l-2 10Z" fill="#E85D75" stroke="${O}" stroke-width="1"/></g>
    <g transform="translate(270 62) rotate(20)"><ellipse rx="10" ry="22" fill="#5FA35C" stroke="${O}" stroke-width="1.6"/>${[-10,0,10].map(v => `<circle cx="${v/3}" cy="${v}" r="1.4" fill="#2F6A2B"/>`).join('')}</g>
    ${sparkles([34,36,6],[300,170,5],[160,22,4])}
  </svg>`;
};

// ---------- SALAD ----------
DRAW.salad = (fl, id, u) => {
  const r = rng(41);
  const greens = Array.from({length:14},() => { const x = f(92+r()*136), y = f(78+r()*34); return `<path d="M${x} ${y} q8 -14 18 -4 q-4 12 -18 4Z" fill="${r() > .5 ? '#7FC77A' : '#5FA35C'}" stroke="${O}" stroke-width="1"/>`; }).join('');
  const toms = Array.from({length:5},() => { const x = f(104+r()*112), y = f(80+r()*26); return `<circle cx="${x}" cy="${y}" r="7" fill="#D9452B" stroke="${O}" stroke-width="1.2"/><circle cx="${f(+x-2)}" cy="${f(+y-2)}" r="2" fill="#fff" opacity=".5"/>`; }).join('');
  const cukes = Array.from({length:4},() => { const x = f(104+r()*112), y = f(84+r()*22); return `<circle cx="${x}" cy="${y}" r="7" fill="#DDF0A8" stroke="#4F7A2A" stroke-width="2"/>`; }).join('');
  return `<svg ${W}>${cloth('#E3F0DC','#A9C69A')}
    <ellipse cx="160" cy="174" rx="110" ry="12" fill="#000" opacity=".12"/>
    <path d="M60 96 h200 q-6 70 -100 74 q-94 -4 -100 -74Z" fill="#F7F9FB" ${SW}/>
    <path d="M74 118 q86 44 172 0" stroke="#7FB8C9" stroke-width="4" fill="none"/>
    <ellipse cx="160" cy="96" rx="100" ry="22" fill="#EEF3F5" ${SW}/>
    <clipPath id="${id}sc"><path d="M60 96 q0 -40 100 -42 q100 2 100 42 q-100 26 -200 0Z"/></clipPath>
    <g clip-path="${u('sc')}">${greens}${cukes}${toms}${Array.from({length:10},() => `<rect x="${f(100+r()*120)}" y="${f(76+r()*28)}" width="3" height="3" fill="#FFF3D0"/>`).join('')}</g>
    <g transform="translate(240 40) rotate(28)"><rect x="-3" y="0" width="6" height="60" rx="3" fill="#C9A27E" ${SW}/><path d="M-8 -26 v18 q0 8 8 8 q8 0 8 -8 v-18" fill="none" stroke="#C9A27E" stroke-width="5"/></g>
    <g transform="translate(46 132)"><path d="M-10 -26 h20 l4 50 h-28Z" fill="#F6E7A8" opacity=".8" ${SW}/><rect x="-6" y="-36" width="12" height="10" rx="2" fill="#5FA35C" ${SW}/></g>
    ${sparkles([36,36,6],[292,36,6],[290,170,4])}
  </svg>`;
};

// ---------- EGGS / BREAKFAST ----------
DRAW.eggs = (fl, id, u) => {
  const egg = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-30 0 q-6 -22 14 -26 q10 -16 28 -6 q22 -2 20 20 q8 20 -16 26 q-20 10 -34 2 q-18 -2 -12 -16Z" fill="#fff" ${SW}/><circle cx="2" cy="-2" r="13" fill="${u('yk')}" stroke="#D99A1E" stroke-width="1.6"/><circle cx="-3" cy="-7" r="3.6" fill="#fff" opacity=".7"/></g>`;
  return `<svg ${W}><defs>${rg(id,'yk',[[0,'#FFE27A'],[.6,'#F6B81E'],[1,'#E09A12']],.4,.35,.8)}</defs>${cloth('#FDF0D6','#EDCB8A')}
    <ellipse cx="160" cy="118" rx="104" ry="56" fill="#000" opacity=".14"/>
    <ellipse cx="156" cy="110" rx="100" ry="54" fill="#3E3F46" ${SW}/><ellipse cx="156" cy="106" rx="84" ry="42" fill="#55565E"/>
    <path d="M250 104 l50 -10 q8 0 8 8 q0 8 -8 8 l-50 6Z" fill="#3E3F46" ${SW}/>
    ${egg(126,104,1)}${egg(190,104,.92)}
    ${[[150,80],[160,134],[106,128]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#2A2A2A"/>`).join('')}
    ${leaf(160,74,-20,'#5FA35C')}
    <g transform="translate(46 160)"><rect x="-26" y="-12" width="52" height="24" rx="4" fill="#E9B56A" ${SW}/><path d="M-20 -6 q20 6 40 0" stroke="#B97A35" stroke-width="2" fill="none"/></g>
    ${steam([130,190],64)}${sparkles([36,36,6],[292,40,6],[290,170,4])}
  </svg>`;
};

// ---------- CHICKEN / ROAST / MAIN ----------
DRAW.chicken = (fl, id, u) => {
  return `<svg ${W}><defs>${rg(id,'sk',[[0,'#F8CE7E'],[.55,'#D9863A'],[1,'#9C5222']],.4,.3,.8)}</defs>${cloth('#F4E6D4','#D7B48C')}
    <ellipse cx="160" cy="146" rx="132" ry="42" fill="#000" opacity=".12"/>
    <ellipse cx="160" cy="138" rx="128" ry="42" fill="#fff" ${SW}/><ellipse cx="160" cy="136" rx="104" ry="32" fill="#F2EEE6"/>
    ${[[84,138],[100,152],[222,150],[240,136]].map(([x,y]) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="8" fill="#E8B24A" stroke="${O}" stroke-width="1.3"/>`).join('')}
    ${[[96,128],[230,126]].map(([x,y]) => `<rect x="${x-6}" y="${y-4}" width="14" height="8" rx="3" fill="#EE8A2E" stroke="${O}" stroke-width="1.2" transform="rotate(-20 ${x} ${y})"/>`).join('')}
    <path d="M100 126 q-6 -60 62 -66 q68 2 64 62 q-4 22 -64 24 q-58 -2 -62 -20Z" fill="${u('sk')}" ${SW}/>
    <path d="M200 90 q30 -10 40 6 q4 10 -6 12 l-22 -2Z" fill="${u('sk')}" ${SW}/><circle cx="242" cy="98" r="7" fill="#FFF6E4" ${SW}/>
    <path d="M118 92 q-30 -10 -40 6 q-4 10 6 12 l22 -2Z" fill="${u('sk')}" ${SW}/><circle cx="78" cy="100" r="7" fill="#FFF6E4" ${SW}/>
    <path d="M124 80 q30 -20 64 -8" stroke="#FFE2A8" stroke-width="5" fill="none" opacity=".55" stroke-linecap="round"/>
    ${[[140,96],[170,90],[156,112],[186,108]].map(([x,y]) => `<path d="M${x} ${y} l4 -4 M${x+4} ${y} l-4 -4" stroke="#7A3E16" stroke-width="1.4"/>`).join('')}
    ${leaf(150,62,-30,'#4E8B47')}${leaf(164,60,20,'#4E8B47')}
    ${steam([134,186],50)}${sparkles([36,36,6],[292,36,6])}
  </svg>`;
};

// ---------- RICE BOWL / STIR-FRY ----------
DRAW.stirfry = (fl, id, u) => {
  const r = rng(43);
  const rice = Array.from({length:40},() => `<ellipse cx="${f(98+r()*124)}" cy="${f(86+r()*22)}" rx="3" ry="1.6" fill="#fff" stroke="#E2DCCF" stroke-width=".6" transform="rotate(${Math.round(r()*180)} ${f(160)} ${f(96)})"/>`).join('');
  return `<svg ${W}>${cloth('#F6E4D8','#E3B39A')}
    <ellipse cx="160" cy="174" rx="104" ry="12" fill="#000" opacity=".12"/>
    <path d="M64 96 h192 q-6 70 -96 74 q-90 -4 -96 -74Z" fill="#D7263D" ${SW}/>
    <path d="M78 120 q82 40 164 0" stroke="#F4C542" stroke-width="3" fill="none"/>
    <ellipse cx="160" cy="96" rx="96" ry="20" fill="#F7F3EC" ${SW}/>
    <path d="M74 96 q86 -30 172 0 q-86 18 -172 0Z" fill="#FBF8F1"/>
    ${rice}
    ${[[120,88],[146,82],[176,86],[200,92]].map(([x,y]) => `<path d="M${x-10} ${y} q10 -12 20 0 q-10 8 -20 0Z" fill="#C8612F" stroke="${O}" stroke-width="1.1"/>`).join('')}
    ${[[132,98],[188,100],[160,90]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#5FA35C" stroke="${O}" stroke-width="1"/>`).join('')}
    ${[[110,96],[214,98]].map(([x,y]) => `<rect x="${x-6}" y="${y-3}" width="12" height="6" rx="2" fill="#EE8A2E" stroke="${O}" stroke-width="1"/>`).join('')}
    ${Array.from({length:10},() => `<ellipse cx="${f(110+r()*100)}" cy="${f(84+r()*14)}" rx="1.4" ry=".8" fill="#FFF6DC"/>`).join('')}
    <g transform="rotate(-18 226 54)"><rect x="200" y="50" width="96" height="5" rx="2.5" fill="#C9A27E" ${SW.replace('2.2','1.4')}/><rect x="200" y="62" width="96" height="5" rx="2.5" fill="#C9A27E" ${SW.replace('2.2','1.4')}/></g>
    <g transform="translate(46 150)"><ellipse rx="18" ry="7" fill="#fff" ${SW}/><ellipse cy="-1" rx="13" ry="4" fill="#4A2A18"/></g>
    ${steam([136,180],62)}${sparkles([36,36,6],[292,140,5])}
  </svg>`;
};

// ---------- MIXING BOWL (default) ----------
DRAW.bowl = (fl, id, u) => {
  const c = fl;
  const batter = c ? (c.name === 'chocolate' ? '#7A4A2E' : c.light) : '#F6E7C8';
  return `<svg ${W}><defs>${lg(id,'bw',0,1,[[0,'#A9D8E6'],[1,'#6FA9BC']])}</defs>${cloth(c ? c.bg : '#EFE6D8', c ? c.line : '#D9C6A8')}
    <ellipse cx="160" cy="176" rx="104" ry="10" fill="#000" opacity=".12"/>
    <g transform="rotate(-22 214 64)"><rect x="210" y="16" width="8" height="70" rx="4" fill="#C98A4E" ${SW}/><path d="M214 84 c -16 8 -16 36 0 42 c 16 -6 16 -34 0 -42Z" fill="#C98A4E" ${SW}/></g>
    <path d="M58 96 h204 c 0 46 -44 76 -102 76 s -102 -30 -102 -76 Z" fill="${u('bw')}" ${SW}/>
    <path d="M74 118 c 24 36 148 36 172 0" stroke="#fff" stroke-width="5" fill="none" opacity=".45"/>
    <ellipse cx="160" cy="96" rx="102" ry="20" fill="#B9E0EC" ${SW}/>
    <ellipse cx="160" cy="98" rx="86" ry="13" fill="${batter}"/>
    <path d="M120 96 q 20 -8 40 0 t 40 0" stroke="#fff" stroke-width="3" fill="none" opacity=".5"/>
    <g transform="translate(52 64)"><path d="M-14 10 q14 -26 28 0Z" fill="#fff" ${SW}/><ellipse cy="10" rx="14" ry="4" fill="#F2EEE6" ${SW}/></g>
    <g transform="translate(270 150)"><ellipse rx="12" ry="15" fill="#FFF8EC" ${SW}/><ellipse cx="-4" cy="-6" rx="3" ry="5" fill="#fff" opacity=".8"/></g>
    ${sparkles([46,130,6],[278,40,6],[160,30,4])}
  </svg>`;
};

DRAW.lasagna = () => {
    const layer = (y, h, fill, wave) => `<path d="M96 ${y} q 10 -${wave} 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 14 0 L 210 ${y+h} L 96 ${y+h} Z" fill="${fill}"/>`;
    return `<svg ${W}>${cloth('#FBE6CF','#F2B98A')}
      ${plate(156,150,120,30)}
      <g transform="translate(0,-6)">
        <path d="M96 78 L 154 60 L 252 74 L 210 96 Z" fill="#F7C95C" ${SW}/>
        <circle cx="150" cy="72" r="5" fill="#E2913C"/><circle cx="186" cy="70" r="4" fill="#E2913C"/><circle cx="214" cy="80" r="6" fill="#D57F2F"/><circle cx="170" cy="82" r="3.5" fill="#D57F2F"/>
        <path d="M134 70 q 6 -6 14 -2 q -6 4 -14 2Z" fill="#4E8B47" ${SW.replace('2.2','1.2')}/><path d="M196 66 q 6 -6 14 -2 q -6 4 -14 2Z" fill="#4E8B47" ${SW.replace('2.2','1.2')}/>
        <path d="M210 96 L 252 74 L 252 150 L 210 172 Z" fill="#E8A04A" ${SW}/>
        <path d="M210 112 L 252 90" stroke="#C45A2A" stroke-width="5"/><path d="M210 132 L 252 110" stroke="#FFF6E3" stroke-width="5"/><path d="M210 152 L 252 130" stroke="#C45A2A" stroke-width="5"/>
        <rect x="96" y="96" width="114" height="76" fill="#F2D49A"/>
        ${layer(96,10,'#F5C651',3)}
        ${layer(106,12,'#E36F2E',4)}
        ${layer(118,8,'#FFF6E6',3)}
        <circle cx="112" cy="122" r="3" fill="#5E9B4E"/><circle cx="140" cy="121" r="3" fill="#C2413A"/><circle cx="172" cy="123" r="3" fill="#5E9B4E"/><circle cx="196" cy="121" r="3" fill="#C2413A"/>
        ${layer(126,10,'#F6DDA6',3)}
        ${layer(136,12,'#E36F2E',4)}
        ${layer(148,8,'#FFF6E6',3)}
        ${layer(156,16,'#F2D49A',3)}
        <path d="M96 78 L 96 172 L 210 172 L 210 96 Z" fill="none" ${SW}/>
        <path d="M112 96 q 4 10 0 16" stroke="#E36F2E" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M168 96 q 3 8 0 13" stroke="#E36F2E" stroke-width="4" fill="none" stroke-linecap="round"/>
      </g>
      <g transform="rotate(-18 60 120)"><rect x="54" y="70" width="8" height="90" rx="4" fill="#C9CED6" ${SW}/><path d="M50 50 v 26 q 8 8 16 0 v -26" fill="none" ${SW}/><path d="M55 50 v 22 M61 50 v 22" ${SW}/></g>
      ${sparkle(274,40,6,'#fff')}${sparkle(40,40,5,'#fff')}
    </svg>`;
};
DRAW.cakepops = () => {
    const pop = (x, y, c, hi, sprinkles) => `
      <path d="M${x} ${y+24} L ${x} 162" stroke="#EDE3D3" stroke-width="7" stroke-linecap="round"/><path d="M${x} ${y+24} L ${x} 162" stroke="${O}" stroke-width="1.6" stroke-dasharray="0" fill="none" opacity=".0"/>
      <rect x="${x-3.5}" y="${y+22}" width="7" height="${140-y}" rx="3.5" fill="#F7F1E6" ${SW.replace('2.2','1.6')}/>
      <circle cx="${x}" cy="${y}" r="28" fill="${c}" ${SW}/>
      <path d="M${x-28} ${y+4} q 6 10 14 6 q 6 8 12 2 q 8 8 14 0 q 6 6 16 -6" fill="none" stroke="#fff" stroke-width="3" opacity=".55"/>
      <ellipse cx="${x-10}" cy="${y-12}" rx="8" ry="5" fill="${hi}" transform="rotate(-30 ${x-10} ${y-12})"/>
      ${sprinkles.map(([dx,dy,r,col]) => `<rect x="${x+dx}" y="${y+dy}" width="9" height="3.2" rx="1.6" fill="${col}" transform="rotate(${r} ${x+dx} ${y+dy})"/>`).join('')}
      <path d="M${x-7} ${y+30} l 7 6 l 7 -6" fill="none" stroke="#E0457B" stroke-width="3" stroke-linecap="round"/>`;
    const S = [[-14,-4,30,'#F7C948'],[4,-16,-20,'#41B6C4'],[10,4,60,'#7A5BD1'],[-6,10,-40,'#F25F5C'],[-18,8,10,'#41B6C4'],[14,-6,20,'#F7C948'],[0,-2,75,'#fff']];
    return `<svg ${W}>${cloth('#FADDE7','#F2A9C1')}
      <ellipse cx="160" cy="184" rx="108" ry="10" fill="#000" opacity=".12"/>
      ${pop(104,86,'#F27BA3','#FFC7DA',S)}${pop(160,64,'#FFF4EA','#FFFFFF',S)}${pop(216,90,'#B9A3EC','#E1D6FF',S)}
      <path d="M86 150 h 148 l -10 34 h -128 Z" fill="#FFFFFF" ${SW}/>
      <path d="M86 150 h 148 v 8 h -148 Z" fill="#F4C7D6" ${SW}/>
      <path d="M100 168 h 120" stroke="#F27BA3" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>
      ${sparkle(46,44,6,'#fff')}${sparkle(280,50,7,'#fff')}${sparkle(276,140,4,'#fff')}
    </svg>`;
};
