// Paints every character in code, pixel by pixel, in any team colour. Painting them in code means
// they are original art and recolour for free. (Scenery is painted the same way in scenery.js.)

import { ctx, drawFrame, shadow } from './core.js';

// ---------------------------------------------------------------- colour helpers
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function shade(rgb, f) { return rgb.map(v => Math.max(0, Math.min(255, Math.round(v * f)))); }

// ---------------------------------------------------------------- painted characters
// Every character is painted here, pixel by pixel, in the chunky style of the art mockups:
// a big square head, flat colours, a dark outline, and the team colour on a shield or cloak
// on the back side plus the skirt, so both armies read at a glance.
// Each sheet is one row of 32x32 frames: idle, walk A, walk B, wind-up, strike, dead.
const C = h => hex(h);
const OUTLINE = C('#0d0b09'), EYE = C('#1d1a16');
const WOOD = C('#8a5a30'), WOOD_D = C('#5e3b1e'), METAL = C('#c3c9d1'), METAL_D = C('#7e8794'), STRING = C('#e8e0cc');
const BOW = C('#7a3040'), BOOT = C('#2e221a'), BELT = C('#2a1d12'), BONE = C('#e8e0cc');
const MATERIAL = {
  mail: [C('#a7aeb8'), C('#7c8490')], plate: [C('#c3c9d1'), C('#8d96a2')], leather: [C('#6e4a2c'), C('#523520')],
  cloth: [C('#a39074'), C('#7c6a52')], elf: [C('#5f7f5a'), C('#46613f')], hide: [C('#7a5634'), C('#5a3e24')], red: [C('#8e3a2a'), C('#68281c')]
};
const LEGS = { human: C('#45414e'), elf: C('#4a5a44'), dwarf: C('#4d3a2a'), orc: C('#3e3328') };
// Body shapes: head position and size, torso, how far the upper body sits down (dwarves are short).
const BODY = {
  human: { hx: 12, hw: 9, tx: 11, tw: 11, oy: 0, skin: C('#e5b183'), skinD: C('#c48d62'), hair: C('#6a3e22') },
  elf: { hx: 12, hw: 8, tx: 12, tw: 9, oy: -1, skin: C('#f2d3b3'), skinD: C('#d6b08c'), hair: C('#e8cf7e'), ears: true, longHair: true },
  dwarf: { hx: 11, hw: 10, tx: 10, tw: 13, oy: 3, skin: C('#e2a274'), skinD: C('#bd7d52'), hair: C('#b0552a'), beard: true },
  orc: { hx: 11, hw: 10, tx: 10, tw: 12, oy: 0, skin: C('#7da044'), skinD: C('#5b7a2e'), hair: C('#1f1a14'), tusks: true },
  brute: { hx: 11, hw: 10, tx: 9, tw: 14, oy: 0, skin: C('#6e9440'), skinD: C('#4f6e2a'), hair: C('#1f1a14'), tusks: true }
};

function paintCharacter(look, team, pose) {
  const R = BODY[look.body || 'human'];
  const T = team ? hex(team) : C('#8e3a2a'), TD = shade(T, 0.68), TL = shade(T, 1.18);
  const [M, MD] = MATERIAL[look.mat || 'cloth'];
  const px = new Array(32 * 32).fill(null);
  let oy = 0;
  const rect = (x, y, w, h, c) => {
    y += oy;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < 32 && j < 32) px[j * 32 + i] = c;
  };
  const line = (x0, y0, x1, y1, c, w) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let k = 0; k <= n; k++) rect(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), w || 1, 1, c);
  };
  const step = pose === 'walkA' ? 1 : pose === 'walkB' ? -1 : 0;
  const short = R.oy >= 3;
  // Legs and boots: one foot lifts on each walking frame.
  const legTop = short ? 23 : 21, cx = R.tx + Math.floor(R.tw / 2);
  const leg = (x, up) => { rect(x, legTop, 3, 27 - legTop - up, LEGS[look.legs || (look.body === 'brute' ? 'orc' : look.body) || 'human'] || LEGS.human); rect(x - 1, 27 - up, 4, 2, BOOT); };
  leg(cx - 4, step === 1 ? 1 : 0); leg(cx + 1, step === -1 ? 1 : 0);
  oy = R.oy + (step ? 1 : 0);   // the body bobs while walking
  const tx = R.tx, tw = R.tw, hx = R.hx, hw = R.hw;
  // Back side: a cloak or a shield in team colours, drawn first so the body overlaps it.
  if (look.cloak) { rect(tx - 2, 12, 3, look.cloak === 'long' ? 13 : 9, TD); rect(tx - 1, 12, 2, look.cloak === 'long' ? 12 : 8, T); }
  if (look.shield === 'round') { rect(tx - 3, 13, 6, 7, T); rect(tx - 4, 14, 8, 5, T); rect(tx - 3, 14, 1, 5, TD); rect(tx - 1, 15, 2, 3, METAL); }
  if (look.shield === 'heater') { rect(tx - 3, 12, 6, 7, T); rect(tx - 2, 19, 4, 2, T); rect(tx - 1, 21, 2, 1, T); rect(tx - 3, 12, 1, 7, TD); rect(tx - 3, 12, 6, 1, TL); }
  if (look.shield === 'tower') { rect(tx - 4, 11, 7, 12, METAL_D); rect(tx - 3, 12, 5, 10, T); rect(tx - 2, 14, 3, 5, TL); }
  // Torso: armour or clothes, a shaded back edge, a belt and a skirt in team colours.
  const tb = short ? 23 : 21;
  rect(tx, 12, tw, tb - 12, M); rect(tx, 12, 2, tb - 12, MD);
  rect(tx, 17, tw, 1, BELT);
  rect(tx, 18, tw, tb - 18, look.skirt === false ? M : T); rect(tx, 18, 2, tb - 18, look.skirt === false ? MD : TD);
  if (look.mat === 'mail') for (let y = 13; y < 17; y += 2) for (let x = tx + 3; x < tx + tw; x += 3) rect(x, y, 1, 1, MD);
  if (look.mat === 'plate') { rect(tx + 3, 13, tw - 5, 1, C('#e4e9ee')); }
  if (look.tabard) { rect(tx + Math.floor(tw / 2) - 1, 12, 3, 5, T); }
  if (look.body === 'brute') { rect(tx, 12, tw, 2, MATERIAL.red[0]); rect(tx + tw - 4, 11, 4, 3, METAL_D); }
  // Head: big and square, eyes looking forward.
  rect(hx, 3, hw, 9, R.skin); rect(hx, 10, hw, 2, R.skinD);
  rect(hx + hw - 5, 7, 1, 2, EYE); rect(hx + hw - 2, 7, 1, 2, EYE);
  if (R.tusks) { rect(hx + hw - 6, 10, 1, 2, BONE); rect(hx + hw - 2, 10, 1, 2, BONE); rect(hx + hw - 6, 6, 6, 1, R.skinD); }
  if (R.ears) { rect(hx - 1, 6, 1, 2, R.skin); rect(hx - 2, 5, 1, 2, R.skin); }
  const h = look.helm;
  if (!h || h === 'circlet' || h === 'band') {
    rect(hx, 2, hw, 3, R.hair); rect(hx, 5, 2, 3, R.hair);
    if (R.longHair) rect(hx, 5, 2, 9, R.hair);
    if (R.tusks) { rect(hx + 3, 0, 3, 3, R.hair); }
  }
  if (h === 'circlet') { rect(hx, 4, hw, 1, C('#f2c14e')); }
  if (h === 'band') { rect(hx, 4, hw, 1, T); }
  if (h === 'hood') { rect(hx - 1, 1, hw + 2, 4, look.hoodC === 'team' ? T : M); rect(hx - 1, 5, 3, 7, look.hoodC === 'team' ? T : M); rect(hx - 1, 1, 2, 3, look.hoodC === 'team' ? TD : MD); }
  if (h === 'cap') { rect(hx - 1, 1, hw + 2, 4, METAL); rect(hx - 1, 5, hw + 2, 1, METAL_D); rect(hx + 1, 1, 3, 1, C('#e4e9ee')); }
  if (h === 'full') { rect(hx - 1, 1, hw + 2, 11, METAL); rect(hx - 1, 1, 2, 11, METAL_D); rect(hx + hw - 6, 7, 6, 1, OUTLINE); rect(hx + 3, 0, 3, 1, T); }
  if (h === 'horned') { rect(hx - 1, 1, hw + 2, 4, METAL_D); rect(hx - 3, 0, 2, 3, BONE); rect(hx + hw + 1, 0, 2, 3, BONE); rect(hx - 4, -1, 1, 2, BONE); rect(hx + hw + 3, -1, 1, 2, BONE); }
  if (R.beard) { rect(hx + 1, 9, hw - 1, 4, R.hair); rect(hx + 2, 13, hw - 3, 3, R.hair); rect(hx + hw - 5, 8, 4, 1, R.hair); }
  // Near arm and weapon.
  const ax = tx + tw;           // the arm hangs just past the torso
  const w = look.weapon;
  if (w === 'bow' || w === 'crossbow' || w === 'javelin' && pose !== 'windup' && pose !== 'strike') {
    rect(ax, 13, 2, 4, MD); rect(ax + 1, 16, 2, 2, R.skin);
    if (w === 'bow') {
      const drawn = pose === 'windup';
      line(ax + 3, 6, ax + 5, 10, BOW); line(ax + 5, 10, ax + 5, 20, BOW); line(ax + 5, 20, ax + 3, 24, BOW);
      const sx = drawn ? ax - 1 : ax + 3;
      line(ax + 3, 6, sx, 15, STRING); line(sx, 15, ax + 3, 24, STRING);
      if (drawn) { rect(ax - 1, 15, 10, 1, WOOD); rect(ax + 9, 14, 1, 3, METAL); }
    } else if (w === 'crossbow') {
      rect(ax - 2, 15, 12, 2, WOOD_D); rect(ax + 7, 11, 2, 10, METAL_D);
      if (pose === 'windup') rect(ax + 1, 14, 7, 1, STRING);
    } else { rect(ax + 2, 3, 1, 22, WOOD); rect(ax + 1, 1, 3, 3, METAL); }
  } else if (pose === 'windup') {
    // Weapon raised back over the shoulder.
    rect(ax - 1, 9, 3, 4, MD); rect(ax, 7, 2, 2, R.skin);
    if (w === 'sword') { rect(ax, 0, 2, 7, METAL); rect(ax - 1, 6, 4, 1, WOOD_D); }
    else if (w === 'axe' || w === 'pick' || w === 'cleaver' || w === 'club' || w === 'greataxe') {
      line(ax - 5, 1, ax + 1, 9, WOOD);
      if (w === 'axe' || w === 'greataxe') rect(ax - 8, -1, 4, w === 'greataxe' ? 7 : 5, METAL);
      else if (w === 'cleaver') rect(ax - 8, 0, 4, 4, METAL_D);
      else if (w === 'club') rect(ax - 8, -1, 4, 5, WOOD_D);
      else rect(ax - 9, 1, 8, 1, METAL);
    } else if (w === 'javelin') { line(ax - 6, 0, ax + 4, 14, WOOD); rect(ax - 7, -1, 2, 2, METAL); }
    else { line(ax - 4, 0, ax + 4, 22, WOOD); rect(ax - 5, -2, 2, 3, w === 'fork' ? WOOD : METAL); }
  } else if (pose === 'strike') {
    // Weapon thrust or swung forward.
    rect(ax, 13, 4, 3, MD); rect(ax + 4, 13, 2, 3, R.skin);
    if (w === 'sword') { rect(ax + 6, 14, 1, 1, WOOD_D); rect(ax + 7, 13, 6, 2, METAL); }
    else if (w === 'axe' || w === 'pick' || w === 'cleaver' || w === 'club' || w === 'greataxe') {
      rect(ax + 5, 14, 7, 1, WOOD);
      if (w === 'axe' || w === 'greataxe') rect(ax + 10, w === 'greataxe' ? 10 : 11, 3, w === 'greataxe' ? 9 : 7, METAL);
      else if (w === 'cleaver') rect(ax + 10, 12, 4, 5, METAL_D);
      else if (w === 'club') rect(ax + 9, 12, 5, 5, WOOD_D);
      else rect(ax + 11, 10, 1, 9, METAL);
    } else if (w === 'javelin') { rect(ax + 4, 14, 12, 1, WOOD); rect(ax + 16, 13, 2, 3, METAL); }
    else { line(ax - 6, 15, ax + 12, 14, WOOD); rect(ax + 12, 13, 3, 3, w === 'fork' ? WOOD : METAL); }
  } else {
    // At rest: the weapon held upright.
    rect(ax, 13, 2, 5, MD); rect(ax, 18, 2, 2, R.skin);
    if (w === 'sword') { rect(ax + 2, 17, 1, 3, WOOD_D); rect(ax + 1, 19, 3, 1, WOOD_D); rect(ax + 2, 20, 1, 7, METAL); }
    else if (w === 'axe' || w === 'pick' || w === 'cleaver' || w === 'club' || w === 'greataxe') {
      rect(ax + 2, 9, 1, 14, WOOD);
      if (w === 'axe' || w === 'greataxe') rect(ax + 3, 8, 3, w === 'greataxe' ? 8 : 5, METAL);
      else if (w === 'cleaver') rect(ax + 3, 9, 3, 4, METAL_D);
      else if (w === 'club') rect(ax + 1, 6, 3, 5, WOOD_D);
      else rect(ax - 1, 9, 7, 1, METAL);
    } else {
      rect(ax + 2, 2, 1, 26, WOOD); rect(ax + 2, -1, 1, 4, w === 'fork' ? WOOD : METAL);
      if (w === 'fork') { rect(ax + 1, -1, 1, 2, WOOD); rect(ax + 3, -1, 1, 2, WOOD); } else rect(ax + 1, 1, 3, 1, METAL);
    }
  }
  oy = 0;
  // Dark outline around the whole figure.
  const out = px.slice();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (px[y * 32 + x]) continue;
    const near = (x > 0 && px[y * 32 + x - 1]) || (x < 31 && px[y * 32 + x + 1]) || (y > 0 && px[(y - 1) * 32 + x]) || (y < 31 && px[(y + 1) * 32 + x]);
    if (near) out[y * 32 + x] = OUTLINE;
  }
  return out;
}

function characterSheet(look, team) {
  const c = document.createElement('canvas');
  c.width = 32 * 6; c.height = 32;
  const g = c.getContext('2d');
  const d = g.createImageData(c.width, c.height);
  ['idle', 'walkA', 'walkB', 'windup', 'strike'].forEach((pose, f) => {
    const px = paintCharacter(look, team, pose);
    for (let i = 0; i < 32 * 32; i++) {
      if (!px[i]) continue;
      const x = f * 32 + (i % 32), y = Math.floor(i / 32), k = (y * c.width + x) * 4;
      d.data[k] = px[i][0]; d.data[k + 1] = px[i][1]; d.data[k + 2] = px[i][2]; d.data[k + 3] = 255;
    }
  });
  g.putImageData(d, 0, 0);
  // Dead frame: the idle pose lying on its side.
  g.save(); g.translate(5 * 32 + 16, 26); g.rotate(-Math.PI / 2); g.drawImage(c, 0, 0, 32, 32, -26, -16, 32, 32); g.restore();
  return c;
}

// ---------------------------------------------------------------- sprite cache
// What each kind of character wears and carries.
const LOOKS = {
  gunther: { mat: 'leather', helm: null, weapon: 'bow', cloak: 'long', skirt: false, hair: 'red' },
  recruit: { mat: 'cloth', helm: null, weapon: 'fork' },
  spear: { mat: 'mail', helm: 'cap', shield: 'round', weapon: 'spear' },
  sword: { mat: 'plate', helm: 'full', shield: 'heater', weapon: 'sword', tabard: true },
  archer: { mat: 'leather', helm: 'band', weapon: 'bow', cloak: 'short' },
  elfscout: { body: 'elf', mat: 'elf', helm: 'hood', hoodC: 'team', weapon: 'bow', cloak: 'long' },
  elfarcher: { body: 'elf', mat: 'elf', helm: null, weapon: 'bow', cloak: 'long' },
  sentinel: { body: 'elf', mat: 'mail', helm: 'circlet', weapon: 'bow', cloak: 'long' },
  elfblade: { body: 'elf', mat: 'elf', helm: 'circlet', weapon: 'sword', cloak: 'long' },
  dwarfminer: { body: 'dwarf', mat: 'leather', helm: null, weapon: 'pick' },
  dwarfaxe: { body: 'dwarf', mat: 'mail', helm: 'cap', shield: 'round', weapon: 'axe' },
  ironguard: { body: 'dwarf', mat: 'plate', helm: 'full', shield: 'tower', weapon: 'axe' },
  dwarfxbow: { body: 'dwarf', mat: 'leather', helm: 'cap', weapon: 'crossbow', cloak: 'short' },
  grunt: { body: 'orc', mat: 'hide', helm: null, weapon: 'cleaver', legs: 'orc' },
  brute: { body: 'brute', mat: 'hide', helm: null, shield: 'round', weapon: 'club', legs: 'orc' },
  shaman: { body: 'orc', mat: 'hide', helm: 'hood', weapon: 'javelin', legs: 'orc', cloak: 'short' },
  warlord: { body: 'brute', mat: 'plate', helm: 'horned', weapon: 'greataxe', cloak: 'long', legs: 'orc' }
};
// Map sprite names from the troop list to the looks above. Orcs keep their own dark red colours.
const SPRITE_KIND = { gunther: 'gunther', archer: 'archer', grunt: 'grunt', brute: 'brute', shaman: 'shaman', warlord: 'warlord' };
const ORC_RED = '#8e3a2a';
const cache = {};

export function spriteFor(kind, team) {
  const key = kind + team;
  if (cache[key]) return cache[key];
  const look = LOOKS[kind] || LOOKS.recruit;
  let t = team;
  if (look.body === 'orc' || look.body === 'brute') t = ORC_RED;
  if (kind === 'gunther' || kind === 'gunthersword') t = '#f2c14e';
  const sheet = characterSheet(look, t);
  return (cache[key] = sheet);
}

// Gunther's hair is auburn; the painter reads it from here.
BODY.gunther = Object.assign({}, BODY.human, { hair: C('#9a3a1e') });
LOOKS.gunther.body = 'gunther';
LOOKS.gunthersword = Object.assign({}, LOOKS.gunther, { weapon: 'sword', shield: 'heater', cloak: null });
LEGS.gunther = C('#4a3a2c');

function sheetFor(sprite, kind, team) {
  if (sprite === 'soldier') return spriteFor(kind, team);
  return spriteFor(SPRITE_KIND[sprite] || sprite, team);
}

// Draws any unit sprite. anim is idle / walk / attack / dead; t is time in that anim.
export function drawUnit(sprite, kind, team, x, y, scale, anim, t, flip) {
  const sheet = sheetFor(sprite, kind, team);
  let col = 0;
  if (anim === 'walk') col = 1 + Math.floor(t * 6) % 2;
  else if (anim === 'attack' || anim === 'cast') col = t < 0.18 ? 3 : 4;
  else if (anim === 'dead') col = 5;
  drawFrame(sheet, 32, 32, col, 0, x, y - 14 * scale, scale, flip);
}

// A little covered wagon for merchant caravans on the world map.
export function drawWagon(x, y, team, flip) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) ctx.scale(-1, 1);
  shadow(0, 4, 22);
  ctx.fillStyle = '#22180f'; ctx.fillRect(-20, -26, 36, 24);
  ctx.fillStyle = '#efe3c2'; ctx.fillRect(-18, -24, 32, 12);
  ctx.fillStyle = '#d6c79e'; ctx.fillRect(-18, -14, 32, 2);
  ctx.fillStyle = '#8a5a30'; ctx.fillRect(-18, -12, 32, 8);
  ctx.fillStyle = team; ctx.fillRect(-6, -24, 6, 12);
  ctx.fillStyle = '#3b2a1c'; ctx.fillRect(16, -8, 8, 2);
  // Wheels.
  ctx.fillStyle = '#22180f'; ctx.fillRect(-16, -6, 8, 8); ctx.fillRect(4, -6, 8, 8);
  ctx.fillStyle = '#6b4424'; ctx.fillRect(-14, -4, 4, 4); ctx.fillRect(6, -4, 4, 4);
  // Mule.
  ctx.fillStyle = '#22180f'; ctx.fillRect(22, -18, 14, 12);
  ctx.fillStyle = '#7d6a58'; ctx.fillRect(24, -16, 10, 6); ctx.fillRect(32, -20, 4, 6);
  ctx.fillRect(24, -10, 2, 6); ctx.fillRect(32, -10, 2, 6);
  ctx.restore();
}

// A banner on a pole, used above parties and settlements on the map.
export function drawBanner(x, y, colour) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = '#22180f'; ctx.fillRect(x - 1, y - 2, 4, 26);
  ctx.fillStyle = '#c8b48a'; ctx.fillRect(x, y, 2, 24);
  // The cloth ripples: each strip of it rides a wave that runs out from the pole.
  const t = performance.now() / 1000;
  for (let k = 0; k < 4; k++) {
    const dy = k ? Math.round(Math.sin(t * 5 - k * 1.1 + x * 0.05) * (k * 0.6)) : 0, w = k === 3 ? 2 : 4;
    ctx.fillStyle = '#22180f'; ctx.fillRect(x + 1 + k * 4, y - 1 + dy, w + 2, 14);
    ctx.fillStyle = colour; ctx.fillRect(x + 2 + k * 4, y + dy, w, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 2 + k * 4, y + 8 + dy, w, 4);
  }
}

// A still portrait of a unit as an image URL, for HTML menus such as the party roster.
const portraits = {};
export function portrait(sprite, kind, team) {
  const key = sprite + '|' + kind + '|' + team;
  if (portraits[key]) return portraits[key];
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  c.getContext('2d').drawImage(sheetFor(sprite, kind, team), 0, 0, 32, 32, 0, 0, 32, 32);
  return (portraits[key] = c.toDataURL());
}
