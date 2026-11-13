export function art(kind){
  const W='viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"';
  if(kind==='pie'){
    let strips='';[-36,-12,12,36].forEach(o=>{strips+=`<rect x="${158+o-8}" y="40" width="16" height="130" rx="6" fill="#EBC27C" stroke="#C99449" stroke-width="2"/>`});
    let strips2='';[-36,-12,12,36].forEach(o=>{strips2+=`<rect x="95" y="${103+o-8}" width="130" height="16" rx="6" fill="#E9BD74" stroke="#C99449" stroke-width="2"/>`});
    let berries='';[[130,80],[188,92],[150,130],[200,128],[118,118],[172,70],[140,100],[178,112]].forEach(([x,y])=>berries+=`<circle cx="${x}" cy="${y}" r="7" fill="#5A63B0"/><circle cx="${x-2}" cy="${y-2}" r="2" fill="#8C93D6"/>`);
    return `<svg ${W}><rect width="320" height="200" fill="#DDE4F6"/><circle cx="40" cy="30" r="5" fill="#5A63B0" opacity=".5"/><circle cx="285" cy="168" r="6" fill="#5A63B0" opacity=".5"/><circle cx="270" cy="40" r="4" fill="#5A63B0" opacity=".4"/>
    <ellipse cx="160" cy="112" rx="98" ry="86" fill="#fff"/><ellipse cx="160" cy="112" rx="98" ry="86" fill="none" stroke="#C9D2EC" stroke-width="3"/>
    <circle cx="160" cy="105" r="74" fill="#D49E54"/><circle cx="160" cy="105" r="70" fill="none" stroke="#B9823A" stroke-width="7" stroke-dasharray="6 5"/>
    <clipPath id="pc"><circle cx="160" cy="105" r="60"/></clipPath><circle cx="160" cy="105" r="60" fill="#323A78"/>
    <g clip-path="url(#pc)">${berries}${strips}${strips2}</g></svg>`;
  }
  if(kind==='lasagna'){
    return `<svg ${W}><rect width="320" height="200" fill="#F8E2C9"/><circle cx="270" cy="40" r="22" fill="#F0C9A0"/><path d="M262 32c8-6 18 0 14 8" stroke="#6E9B5A" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="160" cy="160" rx="120" ry="28" fill="#fff"/><ellipse cx="160" cy="160" rx="120" ry="28" fill="none" stroke="#EAD3B7" stroke-width="3"/>
    <path d="M85 70 L190 52 L245 72 L140 92 Z" fill="#F4C55A"/>
    <circle cx="150" cy="70" r="5" fill="#D9963A"/><circle cx="190" cy="66" r="4" fill="#D9963A"/><circle cx="210" cy="76" r="5" fill="#C9822E"/><path d="M160 60l8 4M120 75l7-3M200 58l6 5" stroke="#4F8A44" stroke-width="3" stroke-linecap="round"/>
    <path d="M140 92 L245 72 L245 150 L140 170 Z" fill="#E9A64E"/>
    <path d="M85 70 L140 92 L140 170 L85 148 Z" fill="#F2D49A"/>
    <rect x="85" y="92" width="55" height="0" />
    <path d="M85 92 L140 112 L140 120 L85 100 Z" fill="#E8862F"/>
    <path d="M85 104 L140 124 L140 132 L85 112 Z" fill="#FFF8EC"/>
    <circle cx="100" cy="112" r="3" fill="#5E9B4E"/><circle cx="122" cy="122" r="3" fill="#C2413A"/>
    <path d="M85 118 L140 138 L140 144 L85 124 Z" fill="#F6DA9F"/>
    <path d="M85 126 L140 146 L140 154 L85 134 Z" fill="#E8862F"/>
    <path d="M85 136 L140 156 L140 164 L85 144 Z" fill="#FFF8EC"/>
    <path d="M85 70 Q96 66 106 74 T128 82 T140 92" stroke="#F4C55A" stroke-width="6" fill="none"/>
    </svg>`;
  }
  if(kind==='cakepops'){
    const pop=(x,y,c,s)=>{let sp='';s.forEach(([dx,dy,r,col])=>sp+=`<rect x="${x+dx}" y="${y+dy}" width="9" height="3" rx="1.5" fill="${col}" transform="rotate(${r} ${x+dx} ${y+dy})"/>`);return `<rect x="${x-3}" y="${y+18}" width="6" height="${150-y}" rx="3" fill="#F7F1E7" stroke="#E2D6C6"/><circle cx="${x}" cy="${y}" r="27" fill="${c}"/><circle cx="${x-9}" cy="${y-10}" r="7" fill="#fff" opacity=".35"/>${sp}`};
    const S=[[-14,-6,30,'#F7C948'],[4,-14,-20,'#5AC8C8'],[10,4,60,'#7A5BD1'],[-6,10,-40,'#F25F5C'],[-18,6,10,'#5AC8C8'],[14,-4,20,'#F7C948']];
    return `<svg ${W}><rect width="320" height="200" fill="#FADDE6"/><circle cx="40" cy="160" r="30" fill="#F7CAD8"/><circle cx="290" cy="30" r="24" fill="#F7CAD8"/>
    ${pop(110,82,'#F27BA3',S)}${pop(160,62,'#FFF4EA',S)}${pop(210,86,'#B9A3EC',S)}
    <rect x="70" y="150" width="180" height="40" rx="8" fill="#fff"/><rect x="70" y="150" width="180" height="10" rx="5" fill="#F1E6F0"/></svg>`;
  }
  if(kind==='cake')return `<svg ${W}><rect width="320" height="200" fill="#F6E6F0"/><ellipse cx="160" cy="168" rx="100" ry="16" fill="#fff"/><rect x="92" y="88" width="136" height="78" rx="10" fill="#7A4A35"/><rect x="92" y="112" width="136" height="10" fill="#F7E7D0"/><rect x="92" y="140" width="136" height="10" fill="#F7E7D0"/><path d="M92 96c10 14 20-6 30 8s20-8 30 6 20-8 30 6 20-8 30 6 10-8 16-4V88H92z" fill="#F7E7D0"/><circle cx="160" cy="78" r="10" fill="#D9334F"/><path d="M160 68c2-8 8-10 12-10" stroke="#3F7A55" stroke-width="3" fill="none"/></svg>`;
  if(kind==='cookies'){let c='';[[115,110,'#C98A4B'],[200,95,'#B97A3E'],[165,140,'#D29A58']].forEach(([x,y,col])=>{c+=`<circle cx="${x}" cy="${y}" r="38" fill="${col}"/>`;[[-12,-10],[10,-14],[14,8],[-8,12],[0,-2]].forEach(([dx,dy])=>c+=`<circle cx="${x+dx}" cy="${y+dy}" r="5" fill="#4A2C1E"/>`)});return `<svg ${W}><rect width="320" height="200" fill="#F3E7D7"/>${c}</svg>`}
  if(kind==='bread')return `<svg ${W}><rect width="320" height="200" fill="#EFE3CF"/><ellipse cx="160" cy="160" rx="110" ry="18" fill="#D9C4A3"/><path d="M70 150c0-60 40-90 90-90s90 30 90 90z" fill="#C98A4B"/><path d="M110 92l20 28M150 80l18 30M190 84l16 28" stroke="#E9B877" stroke-width="7" stroke-linecap="round"/></svg>`;
  if(kind==='soup')return `<svg ${W}><rect width="320" height="200" fill="#E4EFE2"/><path d="M60 95h200a100 70 0 0 1-200 0z" fill="#fff"/><ellipse cx="160" cy="95" rx="100" ry="18" fill="#E2913F"/><circle cx="130" cy="92" r="5" fill="#3F7A55"/><circle cx="175" cy="98" r="4" fill="#3F7A55"/><path d="M130 60c-6-10 6-14 0-24M160 56c-6-10 6-14 0-24M190 60c-6-10 6-14 0-24" stroke="#9BB79A" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
  if(kind==='pasta')return `<svg ${W}><rect width="320" height="200" fill="#F7E6D2"/><ellipse cx="160" cy="120" rx="110" ry="60" fill="#fff"/><path d="M90 120c20-40 60 30 80-10s50 20 60 0M95 135c30-30 50 25 80-5s40 15 55-5M110 105c20-20 40 20 60-5s40 10 50-5" stroke="#F0CF7A" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="140" cy="112" r="10" fill="#C2413A"/><circle cx="185" cy="122" r="9" fill="#C2413A"/></svg>`;
  return `<svg ${W}><rect width="320" height="200" fill="#EFE6D8"/><path d="M80 90 h160 a80 70 0 0 1 -160 0z" fill="#D7A97A"/><ellipse cx="160" cy="90" rx="80" ry="12" fill="#B9875A"/><path d="M200 30 l-30 60" stroke="#8A7B6E" stroke-width="5" stroke-linecap="round"/><ellipse cx="208" cy="22" rx="10" ry="16" fill="none" stroke="#8A7B6E" stroke-width="4" transform="rotate(28 208 22)"/></svg>`;
}
