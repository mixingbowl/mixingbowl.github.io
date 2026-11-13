// Cartoon recipe illustrations: outlined, shaded, with small props. 320x200 viewBox.
const O = '#3B2A22';           // outline color
const SW = 'stroke="' + O + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';
const W = 'viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"';

function cloth(bg, line){ // soft gingham tablecloth
  return `<g class="cloth"><rect width="320" height="200" fill="${bg}"/>
  <g opacity=".5" fill="${line}">${Array.from({length:9},(_,i)=>`<rect x="${i*40}" y="0" width="20" height="200" opacity=".35"/>`).join('')}${Array.from({length:6},(_,i)=>`<rect x="0" y="${i*40}" width="320" height="20" opacity=".35"/>`).join('')}</g></g>`;
}
function sparkle(x, y, s, c){ return `<path d="M${x} ${y-s}L${x+s*.28} ${y-s*.28}L${x+s} ${y}L${x+s*.28} ${y+s*.28}L${x} ${y+s}L${x-s*.28} ${y+s*.28}L${x-s} ${y}L${x-s*.28} ${y-s*.28}Z" fill="${c}"/>`; }
function plate(cx, cy, rx, ry){
  return `<ellipse cx="${cx}" cy="${cy+6}" rx="${rx+4}" ry="${ry+3}" fill="#000" opacity=".12"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#FFFFFF" ${SW}/>
  <ellipse cx="${cx}" cy="${cy-2}" rx="${rx*.72}" ry="${ry*.66}" fill="#F3F0EA"/>`;
}

let artN = 0;
export function art(kind){
  if(kind === 'pie'){
    const id = 'pA' + (++artN) + '-', u = k => `url(#${id}${k})`, f = n => n.toFixed(1);
    const berry = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${u('bb')}" stroke="${O}" stroke-width="1.3"/><path d="M${f(x-r*.35)} ${f(y-r*.55)} l${f(r*.35)} ${f(r*.25)} l${f(r*.35)} ${f(-r*.25)}" stroke="#1E2357" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="${f(x-r*.38)}" cy="${f(y+r*.1)}" r="${f(r*.26)}" fill="#B9C2FF" opacity=".8"/>`;
    const mint = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M0 0 C 6 -10, 18 -10, 22 0 C 18 8, 6 8, 0 0Z" fill="#6DB36A" stroke="${O}" stroke-width="1.3"/><path d="M2 0 L19 0" stroke="#3F7D3D" stroke-width="1"/></g>`;
    const cx = 160, cy = 100, rx = 66, ry = 54, w = 14;
    const xs = [0,1,2,3].map(i => cx - rx*.62 + i*rx*.413), ys = [0,1,2,3].map(i => cy - ry*.62 + i*ry*.413);
    let lat = xs.map(x => `<rect x="${f(x-w/2)}" y="${cy-ry-10}" width="${w}" height="${2*ry+20}" rx="6" fill="${u('st')}" stroke="#A86E2C" stroke-width="1.4"/>`).join('') + ys.map(y => `<rect x="${cx-rx-10}" y="${f(y-w/2)}" width="${2*rx+20}" height="${w}" rx="6" fill="${u('sh')}" stroke="#A86E2C" stroke-width="1.4"/>`).join('');
    xs.forEach((x, i) => ys.forEach((y, j) => { lat += (i + j) % 2 === 0 ? `<rect x="${f(x-w/2)}" y="${f(y-w/2-3)}" width="${w}" height="${w+6}" rx="3" fill="${u('st')}"/><path d="M${f(x-w/2)} ${f(y-w/2-3)} v${w+6} M${f(x+w/2)} ${f(y-w/2-3)} v${w+6}" stroke="#A86E2C" stroke-width="1.4"/>` : `<path d="M${f(x-w/2+1)} ${f(y+w/2+1)} h${w-2}" stroke="#8A5A22" stroke-width="2" opacity=".35"/>`; }));
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let sugar = ''; for(let i = 0; i < 70; i++){ const a = rnd()*6.283, r = Math.sqrt(rnd()), x = f(cx + Math.cos(a)*rx*r), y = f(cy + Math.sin(a)*ry*r); sugar += `<rect x="${x}" y="${y}" width="2.2" height="2.2" rx=".6" fill="#FFF8E6" opacity=".9" transform="rotate(${Math.round(rnd()*90)} ${x} ${y})"/>`; }
    let crimp = ''; for(let i = 0; i < 30; i++){ const a = i/30*6.283, x = f(cx + Math.cos(a)*(rx+6)), y = f(cy + Math.sin(a)*(ry+6)); crimp += `<ellipse cx="${x}" cy="${y}" rx="10" ry="8.5" fill="${u('cr')}" stroke="#A86E2C" stroke-width="1.5" transform="rotate(${Math.round(a*57.3+90)} ${x} ${y})"/><path d="M${f(x-3)} ${f(y-3)} q3 -2 6 0" stroke="#FCE3B0" stroke-width="1.6" fill="none" stroke-linecap="round"/>`; }
    const bub = [[132,78,4],[186,84,3.5],[150,118,3],[178,122,4],[140,98,2.5],[196,104,3]].map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#7B57B8" opacity=".85"/><circle cx="${f(x-r*.3)}" cy="${f(y-r*.3)}" r="${f(r*.35)}" fill="#C9B4F0"/>`).join('');
    const fork = `<g transform="translate(282 128) rotate(-18)"><rect x="-3" y="0" width="6" height="58" rx="3" fill="#D9DEE4" stroke="${O}" stroke-width="1.6"/><path d="M-9 -28 v16 q0 10 9 10 q9 0 9 -10 v-16" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M-9 -28 v16 q0 10 9 10 q9 0 9 -10 v-16" fill="none" stroke="#D9DEE4" stroke-width="4" stroke-linecap="round"/><path d="M-3 -28 v14 M3 -28 v14" stroke="${O}" stroke-width="5" stroke-linecap="round"/><path d="M-3 -28 v14 M3 -28 v14" stroke="#D9DEE4" stroke-width="2.4" stroke-linecap="round"/></g>`;
    const lg = (k, x2, y2, stops) => `<linearGradient id="${id}${k}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o,c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
    return `<svg ${W}><defs><radialGradient id="${id}bb" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#6A78D6"/><stop offset=".6" stop-color="#3B458F"/><stop offset="1" stop-color="#262B66"/></radialGradient><radialGradient id="${id}jam" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#5A3A8E"/><stop offset=".7" stop-color="#3A2468"/><stop offset="1" stop-color="#26174A"/></radialGradient>
      ${lg('cr',0,1,[[0,'#F7D493'],[.55,'#E6AE5E'],[1,'#C98A3E']])}${lg('st',1,0,[[0,'#D99A4C'],[.35,'#F6CF8A'],[.7,'#EDB868'],[1,'#C98A3E']])}${lg('sh',0,1,[[0,'#F8D899'],[.5,'#EDB868'],[1,'#C98A3E']])}${lg('tin',0,1,[[0,'#E9EDF2'],[1,'#9AA3AE']])}
      <clipPath id="${id}ca"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath></defs>
      ${cloth('#DCE3F6','#7F8FD0')}
      <ellipse cx="162" cy="112" rx="126" ry="82" fill="#000" opacity=".12"/>
      <ellipse cx="160" cy="106" rx="122" ry="80" fill="#fff" ${SW}/><ellipse cx="160" cy="104" rx="98" ry="64" fill="#F2EEE6"/>
      <ellipse cx="160" cy="104" rx="106" ry="70" fill="none" stroke="#7F8FD0" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/>
      <ellipse cx="160" cy="103" rx="88" ry="74" fill="${u('tin')}" ${SW}/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx+2}" ry="${ry+2}" fill="${u('jam')}"/>
      <g clip-path="${u('ca')}">${[[128,72,7],[152,66,6.5],[178,70,7],[200,86,6.5],[116,98,7],[196,112,7],[124,126,6.5],[160,140,7],[184,134,6.5],[146,92,6],[172,96,6],[158,116,6.5]].map(b => berry(...b)).join('')}${bub}</g>
      <g clip-path="${u('ca')}">${lat}</g><g clip-path="${u('ca')}">${sugar}</g>
      <path d="M108 128 q-4 10 2 14 q6 -4 3 -14Z" fill="#3A2468" stroke="${O}" stroke-width="1.3"/><path d="M212 82 q6 6 2 13 q-6 -2 -2 -13Z" fill="#3A2468" stroke="${O}" stroke-width="1.3"/>
      ${crimp}
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#7A4A1A" stroke-width="1.4" opacity=".5"/>
      ${fork}${berry(52,150,8)}${berry(66,162,7)}${berry(44,166,6.5)}${mint(58,142,-30)}${mint(70,148,20)}${berry(268,42,7)}${berry(282,52,6)}
      ${sparkle(40,40,7,'#fff')}${sparkle(232,26,5,'#fff')}${sparkle(300,176,5,'#fff')}${sparkle(100,184,4,'#fff')}
    </svg>`;
  }
  if(kind === 'lasagna'){
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
  }
  if(kind === 'cakepops'){
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
  }
  if(kind === 'cake'){
    return `<svg ${W}>${cloth('#F6E5EF','#E7B5CC')}
      ${plate(160,166,112,20)}
      <path d="M92 92 v 66 q 68 14 136 0 v -66 Z" fill="#8A4F38" ${SW}/>
      <path d="M92 116 q 68 12 136 0 v 10 q -68 12 -136 0 Z" fill="#FBEBD6"/>
      <path d="M92 138 q 68 12 136 0 v 10 q -68 12 -136 0 Z" fill="#FBEBD6"/>
      <ellipse cx="160" cy="92" rx="68" ry="14" fill="#FBEBD6" ${SW}/>
      <path d="M92 92 q 0 14 10 16 q 4 14 10 0 q 10 4 16 -2 q 4 18 10 2 q 12 4 22 0 q 6 12 12 0 q 12 2 20 -4 q 4 10 10 0 q 8 0 20 -12" fill="#FBEBD6" ${SW}/>
      <circle cx="160" cy="70" r="12" fill="#D7263D" ${SW}/><circle cx="156" cy="66" r="3.5" fill="#FF8C9A"/>
      <path d="M160 58 q 4 -14 16 -18" fill="none" ${SW}/><path d="M176 40 q 10 2 12 10 q -10 0 -12 -10Z" fill="#4E8B47" ${SW.replace('2.2','1.4')}/>
      ${[[118,96],[134,100],[188,99],[204,95],[146,88],[176,88]].map(([x,y],i)=>`<rect x="${x}" y="${y}" width="7" height="2.6" rx="1.3" fill="${['#F7C948','#41B6C4','#F25F5C','#7A5BD1','#41B6C4','#F7C948'][i]}" transform="rotate(${i*35} ${x} ${y})"/>`).join('')}
      ${sparkle(56,52,6,'#fff')}${sparkle(270,46,7,'#fff')}
    </svg>`;
  }
  if(kind === 'cookies'){
    const cookie = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${SW}/>
      <path d="M${x-r*.5} ${y-r*.2} q ${r*.3} ${r*.15} ${r*.55} -${r*.05} M${x+r*.1} ${y+r*.45} q ${r*.2} -${r*.15} ${r*.45} 0" stroke="#A86A2F" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${[[-.45,-.45],[.35,-.5],[.5,.2],[-.2,.5],[-.6,.15],[.05,-.05]].map(([dx,dy])=>`<path d="M${x+dx*r-4} ${y+dy*r+3} q 4 -9 8 0 Z" fill="#4A2C1E"/>`).join('')}`;
    return `<svg ${W}>${cloth('#F3E6D4','#E2C7A2')}
      <ellipse cx="150" cy="172" rx="104" ry="14" fill="#000" opacity=".12"/>
      ${cookie(110,128,42,'#D99A55')}${cookie(176,140,38,'#CF8C47')}${cookie(140,92,36,'#E0A562')}
      <g ${SW}><path d="M232 60 h 46 l -6 112 h -34 Z" fill="#FFFFFF" opacity=".95"/><path d="M234 92 h 42 l -4 80 h -34 Z" fill="#F4F4F4"/></g>
      <path d="M244 70 v 92" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9"/>
      <path d="M232 60 h 46" ${SW}/>
      ${sparkle(52,46,6,'#fff')}${sparkle(296,40,5,'#fff')}
      ${[[60,170],[210,180],[80,60]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3" fill="#C88A48"/>`).join('')}
    </svg>`;
  }
  if(kind === 'bread'){
    return `<svg ${W}>${cloth('#EFE3CC','#D8C29C')}
      <path d="M44 164 h 232 l -10 16 h -212 Z" fill="#B98A5B" ${SW}/><path d="M44 164 h 232" stroke="#8C6440" stroke-width="2"/>
      <path d="M66 160 C 60 110, 100 70, 160 70 C 220 70, 260 110, 254 160 Z" fill="#C9853F" ${SW}/>
      <path d="M80 150 C 78 116, 108 88, 160 86 C 212 88, 242 116, 240 150" fill="none" stroke="#E2A35E" stroke-width="8" opacity=".6" stroke-linecap="round"/>
      ${[[110,92,128,122],[146,82,162,116],[184,86,198,120],[214,100,224,128]].map(([a,b,c,d])=>`<path d="M${a} ${b} Q ${(a+c)/2-6} ${(b+d)/2} ${c} ${d}" stroke="#F3D19A" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M${a} ${b} Q ${(a+c)/2-6} ${(b+d)/2} ${c} ${d}" stroke="${O}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>`).join('')}
      <g transform="translate(266 62) rotate(18)"><path d="M0 0 v 70" ${SW}/>${[0,14,28,42].map(y=>`<ellipse cx="-7" cy="${y+6}" rx="5" ry="9" fill="#E4C06A" ${SW.replace('2.2','1.4')} transform="rotate(-25 -7 ${y+6})"/><ellipse cx="7" cy="${y+6}" rx="5" ry="9" fill="#E4C06A" ${SW.replace('2.2','1.4')} transform="rotate(25 7 ${y+6})"/>`).join('')}</g>
      ${sparkle(46,48,6,'#fff')}
    </svg>`;
  }
  if(kind === 'soup'){
    return `<svg ${W}>${cloth('#E2EFE0','#AFD0AB')}
      <path d="M118 52 c -10 -12 10 -18 0 -32 M160 46 c -10 -12 10 -18 0 -32 M202 52 c -10 -12 10 -18 0 -32" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".85"/>
      <ellipse cx="160" cy="176" rx="96" ry="10" fill="#000" opacity=".12"/>
      <path d="M58 90 h 204 c 0 48 -42 80 -102 80 s -102 -32 -102 -80 Z" fill="#FFFFFF" ${SW}/>
      <path d="M70 112 c 20 40 160 40 180 0" stroke="#D7263D" stroke-width="5" fill="none" opacity=".75"/>
      <ellipse cx="160" cy="90" rx="102" ry="20" fill="#FFFFFF" ${SW}/>
      <ellipse cx="160" cy="92" rx="88" ry="14" fill="#E78F3C"/>
      <ellipse cx="146" cy="88" rx="30" ry="5" fill="#F7B868" opacity=".8"/>
      ${[[124,92],[178,96],[200,88]].map(([x,y])=>`<rect x="${x}" y="${y-5}" width="10" height="10" rx="2" fill="#F2CD86" ${SW.replace('2.2','1.4')}/>`).join('')}
      ${[[140,96],[164,86],[188,94],[112,88]].map(([x,y])=>`<path d="M${x} ${y} q 4 -6 9 -1 q -4 5 -9 1Z" fill="#4E8B47"/>`).join('')}
      <g transform="rotate(28 236 70)"><ellipse cx="236" cy="96" rx="10" ry="6" fill="#C9CED6" ${SW}/><rect x="233" y="30" width="6" height="64" rx="3" fill="#C9CED6" ${SW}/></g>
    </svg>`;
  }
  if(kind === 'pasta'){
    const swirl = Array.from({length:7},(_,i)=>`<path d="M${86+i*4} ${108+i*5} C ${120} ${70+i*6}, ${200} ${150-i*4}, ${234-i*4} ${100+i*6}" stroke="#F3D27E" stroke-width="6" fill="none" stroke-linecap="round"/>`).join('');
    return `<svg ${W}>${cloth('#F8E5D0','#EDB98D')}
      ${plate(160,124,126,62)}
      <ellipse cx="160" cy="118" rx="88" ry="42" fill="#F0C863" ${SW}/>
      <clipPath id="pastaClip"><ellipse cx="160" cy="118" rx="86" ry="40"/></clipPath>
      <g clip-path="url(#pastaClip)">${swirl}${swirl.replace(/#F3D27E/g,'#E5B95A').replace(/stroke-width="6"/g,'stroke-width="2"')}</g>
      <path d="M118 110 q 20 -16 44 -6 q 26 -12 44 8 q -10 16 -44 12 q -34 6 -44 -14Z" fill="#C8412F" opacity=".9"/>
      ${[[134,110,13],[176,106,14],[156,126,12]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#8E3B26" ${SW}/><circle cx="${x-4}" cy="${y-4}" r="3.5" fill="#C06A4C"/>`).join('')}
      <path d="M190 90 q 10 -10 20 -2 q -10 8 -20 2Z" fill="#4E8B47" ${SW.replace('2.2','1.4')}/><path d="M200 84 v 8" stroke="#2F6A2B" stroke-width="1.5"/>
      ${[[150,98],[168,120],[142,128],[186,116]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="1.8" fill="#FFF7E0"/>`).join('')}
      <g transform="rotate(22 262 80)"><rect x="258" y="50" width="8" height="94" rx="4" fill="#C9CED6" ${SW}/><path d="M252 26 v 28 q 10 8 20 0 v -28" fill="none" ${SW}/><path d="M258 26 v 24 M266 26 v 24" ${SW}/></g>
    </svg>`;
  }
  // mixing bowl (default)
  return `<svg ${W}>${cloth('#EFE6D8','#D9C6A8')}
    <ellipse cx="160" cy="176" rx="100" ry="10" fill="#000" opacity=".12"/>
    ${[[70,60],[250,70],[86,150],[236,150],[120,40]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2.4" fill="#fff" opacity=".9"/>`).join('')}
    <g transform="rotate(-22 214 64)"><path d="M214 20 v 60" ${SW}/><path d="M214 80 c -18 10 -16 40 0 46 c 16 -6 18 -36 0 -46Z M214 80 c -8 10 -8 40 0 46 c 8 -6 8 -36 0 -46Z" fill="none" stroke="#9AA3AE" stroke-width="2.4"/><rect x="209" y="6" width="10" height="26" rx="5" fill="#D7263D" ${SW}/></g>
    <path d="M58 96 h 204 c 0 46 -44 76 -102 76 s -102 -30 -102 -76 Z" fill="#7FB8C9" ${SW}/>
    <path d="M74 118 c 24 36 148 36 172 0" stroke="#fff" stroke-width="5" fill="none" opacity=".5"/>
    <ellipse cx="160" cy="96" rx="102" ry="20" fill="#9FD0DE" ${SW}/>
    <ellipse cx="160" cy="98" rx="86" ry="13" fill="#F6E7C8"/>
    <path d="M120 96 q 20 -8 40 0 t 40 0" stroke="#E9D2A4" stroke-width="3" fill="none"/>
    ${sparkle(46,52,6,'#fff')}${sparkle(278,40,6,'#fff')}
  </svg>`;
}
