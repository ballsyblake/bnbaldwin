// Loads the picture files, and makes extra sprites in code:
//  - soldiers (spearmen, swordsmen, recruits) painted pixel by pixel, in any team colour
//  - recoloured copies of the archer and orc sheets (team cloaks, brown-cloaked orc skirmishers)
// Painting sprites in code means they are original art and can be recoloured for free.

import { ctx, drawFrame, shadow } from './core.js';

const ASSET_NAMES = ['gunther', 'orc-yellow', 'orc-red', 'trees', 'rocks', 'keep', 'houses', 'orc-tent'];
export const img = {};

export function loadAssets() {
  return Promise.all(ASSET_NAMES.map(name => new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = resolve;
    i.onerror = () => reject(new Error('Could not load ' + name));
    i.src = 'assets/' + name + '.png';
    img[name] = i;
  })));
}

// ---------------------------------------------------------------- recolouring
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function shade(rgb, f) { return rgb.map(v => Math.max(0, Math.min(255, Math.round(v * f)))); }

// Copies an image, swapping exact colours. `swaps` is a list of [fromRGB, toRGB].
function recolour(image, swaps) {
  const c = document.createElement('canvas');
  c.width = image.width; c.height = image.height;
  const g = c.getContext('2d');
  g.drawImage(image, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    if (!d.data[i + 3]) continue;
    for (const [from, to] of swaps) {
      if (d.data[i] === from[0] && d.data[i + 1] === from[1] && d.data[i + 2] === from[2]) {
        d.data[i] = to[0]; d.data[i + 1] = to[1]; d.data[i + 2] = to[2];
        break;
      }
    }
  }
  g.putImageData(d, 0, 0);
  return c;
}

// ---------------------------------------------------------------- painted soldiers
// Each soldier sheet is one row of 32x32 frames: idle, walk A, walk B, wind-up, strike, dead.
const SKIN = hex('#e0a878'), SKIN_D = hex('#b47a52'), HAIR = hex('#5a3a22');
const METAL = hex('#b8c2cc'), METAL_D = hex('#6c7684'), WOOD = hex('#8a5a30');
const LEGS = hex('#4a4a58'), BOOTS = hex('#3a2a20'), OUTLINE = hex('#22180f'), BELT = hex('#3b2a1c');

// Body shapes for each people. oy pushes the upper body down (dwarves are short), wide makes the
// torso broader, and each has its own skin and hair.
const RACE_BODY = {
  human: { oy: 0, wide: 0, skin: SKIN, skinD: SKIN_D, hair: HAIR },
  elf: { oy: -1, wide: -1, skin: hex('#f2d2b4'), skinD: hex('#d4ab8a'), hair: hex('#e6d08a'), ears: true, longHair: true },
  dwarf: { oy: 4, wide: 1, skin: hex('#e2a274'), skinD: hex('#b97a50'), hair: hex('#9a4a24'), beard: true }
};

function paintSoldier(look, team, pose) {
  const T = hex(team), TD = shade(T, 0.68), TL = shade(T, 1.22);
  const body = RACE_BODY[look.race || 'human'];
  const px = new Array(32 * 32).fill(null);
  let oy = 0;   // vertical shift for everything above the legs
  const rect = (x, y, w, h, c) => {
    y += oy;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < 32 && j < 32) px[j * 32 + i] = c;
  };
  const line = (x0, y0, x1, y1, c) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) rect(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), 1, 1, c);
  };
  // Legs, with a stride for the walking frames. Dwarves have short ones.
  const stride = pose === 'walkA' ? 2 : pose === 'walkB' ? -2 : 0;
  if (body.oy >= 3) {
    rect(11, 25, 4, 3, LEGS); rect(17, 25, 4, 3, LEGS);
    rect(10 - stride, 28, 5, 2, BOOTS); rect(17 + stride, 28, 5, 2, BOOTS);
  } else {
    rect(12, 21, 3, 4, LEGS); rect(17, 21, 3, 4, LEGS);
    rect(12 - stride, 25, 3, 3, LEGS); rect(17 + stride, 25, 3, 3, LEGS);
    rect(11 - stride, 28, 4, 2, BOOTS); rect(17 + stride, 28, 4, 2, BOOTS);
  }
  oy = body.oy;
  const w0 = 11 - body.wide, ww = 10 + body.wide * 2;
  // Shield on the far arm, drawn first so the body overlaps it.
  if (look.shield === 'round') { rect(7, 13, 6, 8, WOOD); rect(7, 13, 6, 1, METAL_D); rect(7, 20, 6, 1, METAL_D); rect(6, 14, 1, 6, METAL_D); rect(9, 15, 2, 4, T); rect(9, 16, 2, 2, METAL); }
  if (look.shield === 'kite') { rect(6, 11, 7, 9, METAL); rect(7, 20, 5, 2, METAL); rect(8, 22, 3, 1, METAL); rect(9, 11, 1, 11, T); rect(6, 14, 7, 2, T); rect(6, 11, 1, 9, METAL_D); }
  if (look.shield === 'tower') { rect(5, 10, 8, 13, METAL_D); rect(6, 11, 6, 11, T); rect(8, 13, 2, 7, METAL); }
  // Tunic in team colours, with a belt. Elves wear a long cloak behind.
  if (look.cloak) { rect(w0 - 1, 11, 3, 13, TD); }
  rect(w0, 12, ww, 10 - (body.oy >= 3 ? 1 : 0), T); rect(w0, 12, 2, 10, TD); rect(w0, 22 - (body.oy >= 3 ? 1 : 0), ww, 1, TD);
  rect(w0, 18, ww, 1, BELT);
  if (look.helm === 'full') { rect(13, 12, 6, 1, METAL); }
  // Far arm.
  rect(w0 - 1, 13, 2, 6, TD);
  // Head.
  rect(13, 5, 6, 6, body.skin); rect(13, 9, 6, 2, body.skinD); rect(17, 7, 1, 1, OUTLINE);
  if (body.ears) { rect(12, 5, 1, 2, body.skin); rect(11, 4, 1, 2, body.skin); }
  if (!look.helm || look.helm === 'circlet' || look.helm === 'hood') {
    rect(12, 3, 7, 3, body.hair); rect(12, 6, 1, 3, body.hair);
    if (body.longHair) rect(12, 6, 2, 7, body.hair);
  }
  if (look.helm === 'circlet') rect(12, 4, 7, 1, hex('#f0cf7a'));
  if (look.helm === 'hood') { rect(12, 2, 7, 3, T); rect(11, 4, 2, 7, T); rect(12, 2, 2, 2, TD); }
  if (look.helm === 'cap') { rect(12, 2, 8, 4, METAL); rect(11, 5, 10, 1, METAL_D); rect(13, 2, 2, 2, hex('#e4ecf4')); }
  if (look.helm === 'full') { rect(12, 2, 8, 9, METAL); rect(16, 6, 4, 1, OUTLINE); rect(12, 2, 2, 9, METAL_D); rect(15, 1, 2, 2, T); }
  if (body.beard) { rect(13, 9, 7, 4, body.hair); rect(14, 13, 5, 2, body.hair); rect(16, 8, 3, 1, body.hair); }
  // Near arm and weapon.
  const w = look.weapon;
  if (w === 'bow' || w === 'crossbow') {
    // Ranged weapons: held out in front, drawn back on the wind-up frame.
    const drawn = pose === 'windup';
    rect(19, 13, 4, 2, T); rect(23, 13, 2, 2, body.skin);
    if (w === 'bow') {
      line(24, 6, 26, 10, WOOD); line(26, 10, 26, 18, WOOD); line(26, 18, 24, 22, WOOD);
      const sx = drawn ? 19 : 24;
      line(24, 6, sx, 14, hex('#e8e4d8')); line(sx, 14, 24, 22, hex('#e8e4d8'));
      if (drawn) { rect(19, 14, 9, 1, WOOD); rect(28, 13, 2, 3, METAL); }
    } else {
      rect(16, 14, 12, 2, WOOD); rect(26, 10, 2, 9, METAL_D); rect(28, 14, 2, 1, METAL);
      if (drawn) rect(20, 13, 6, 1, hex('#e8e4d8'));
    }
  } else if (pose === 'windup') {
    rect(18, 10, 3, 3, T); rect(20, 8, 2, 3, body.skin);
    if (w === 'sword') { rect(20, 1, 2, 8, METAL); rect(19, 9, 4, 1, WOOD); }
    else if (w === 'axe' || w === 'pick') { line(14, 2, 21, 12, WOOD); if (w === 'axe') rect(11, 0, 4, 5, METAL); else rect(10, 1, 7, 1, METAL); }
    else { line(14, 2, 22, 22, WOOD); rect(13, 0, 2, 3, w === 'fork' ? WOOD : METAL); if (w === 'fork') { rect(12, 0, 1, 2, WOOD); rect(15, 0, 1, 2, WOOD); } }
  } else if (pose === 'strike') {
    rect(19, 13, 5, 3, T); rect(24, 13, 2, 3, body.skin);
    if (w === 'sword') { rect(26, 13, 1, 3, WOOD); rect(27, 14, 5, 1, METAL); rect(27, 13, 4, 1, METAL); }
    else if (w === 'axe' || w === 'pick') { rect(24, 14, 6, 1, WOOD); if (w === 'axe') rect(28, 11, 3, 6, METAL); else rect(29, 10, 1, 8, METAL); }
    else { line(10, 15, 29, 14, WOOD); rect(29, 13, 3, 3, w === 'fork' ? WOOD : METAL); if (w === 'fork') { rect(29, 12, 3, 1, WOOD); rect(29, 16, 3, 1, WOOD); } }
  } else {
    rect(19, 13, 2, 5, T); rect(19, 18, 2, 2, body.skin);
    if (w === 'sword') { rect(21, 17, 1, 2, WOOD); rect(20, 19, 3, 1, WOOD); rect(21, 20, 1, 7, METAL); }
    else if (w === 'axe') { rect(21, 8, 1, 14, WOOD); rect(22, 8, 3, 5, METAL); }
    else if (w === 'pick') { rect(21, 8, 1, 14, WOOD); rect(18, 8, 7, 1, METAL); }
    else { rect(21, 3, 1, 26, WOOD); rect(21, 0, 1, 4, w === 'fork' ? WOOD : METAL); if (w === 'fork') { rect(20, 0, 1, 2, WOOD); rect(22, 0, 1, 2, WOOD); } else { rect(20, 2, 3, 1, METAL); } }
  }
  oy = 0;
  // Dark outline around everything, like the other sprites.
  const out = px.slice();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (px[y * 32 + x]) continue;
    const near = (x > 0 && px[y * 32 + x - 1]) || (x < 31 && px[y * 32 + x + 1]) || (y > 0 && px[(y - 1) * 32 + x]) || (y < 31 && px[(y + 1) * 32 + x]);
    if (near) out[y * 32 + x] = OUTLINE;
  }
  return out;
}

function soldierSheet(look, team) {
  const c = document.createElement('canvas');
  c.width = 32 * 6; c.height = 32;
  const g = c.getContext('2d');
  const d = g.createImageData(c.width, c.height);
  ['idle', 'walkA', 'walkB', 'windup', 'strike'].forEach((pose, f) => {
    const px = paintSoldier(look, team, pose);
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
// Every unit asks for its sprite through spriteFor(kind, team) and gets a ready-made sheet.
const cache = {};
const RANGER_CLOAK = [[90, 70, 29], [59, 45, 10], [110, 86, 41], [74, 56, 18]];
const ORC_CLOAK = [[130, 119, 23], [158, 157, 36]];

export function spriteFor(kind, team) {
  const key = kind + team;
  if (cache[key]) return cache[key];
  let sheet;
  if (kind === 'archer') {
    // The archer sheet with the cloak in team colours, so Gunther (who keeps the original
    // brown cloak) still stands out.
    const T = hex(team);
    sheet = recolour(img.gunther, [[RANGER_CLOAK[0], shade(T, 0.72)], [RANGER_CLOAK[1], shade(T, 0.45)], [RANGER_CLOAK[2], shade(T, 0.9)], [RANGER_CLOAK[3], shade(T, 0.58)]]);
  } else if (kind === 'shaman') {
    sheet = recolour(img['orc-yellow'], [[ORC_CLOAK[0], [92, 70, 50]], [ORC_CLOAK[1], [120, 94, 64]]]);
  } else {
    const looks = {
      recruit: { helm: null, shield: null, weapon: 'fork' },
      spear: { helm: 'cap', shield: 'round', weapon: 'spear' },
      sword: { helm: 'full', shield: 'kite', weapon: 'sword' },
      elfscout: { race: 'elf', helm: 'hood', weapon: 'bow', cloak: true },
      elfarcher: { race: 'elf', helm: null, weapon: 'bow', cloak: true },
      sentinel: { race: 'elf', helm: 'circlet', weapon: 'bow', cloak: true },
      elfblade: { race: 'elf', helm: 'circlet', weapon: 'sword', cloak: true },
      dwarfminer: { race: 'dwarf', helm: null, weapon: 'pick' },
      dwarfaxe: { race: 'dwarf', helm: 'cap', shield: 'round', weapon: 'axe' },
      ironguard: { race: 'dwarf', helm: 'full', shield: 'tower', weapon: 'axe' },
      dwarfxbow: { race: 'dwarf', helm: 'cap', weapon: 'crossbow' }
    };
    sheet = soldierSheet(looks[kind], team);
  }
  cache[key] = sheet;
  return sheet;
}

// Draws any unit sprite. anim is idle / walk / attack / cast / dead; t is time in that anim.
// Sheets come in two layouts: the 10-column archer/orc sheets and the 6-frame painted soldiers.
export function drawUnit(sprite, kind, team, x, y, scale, anim, t, flip) {
  let sheet, col = 0, row = 0;
  if (sprite === 'soldier') {
    sheet = spriteFor(kind, team);
    if (anim === 'walk') col = 1 + Math.floor(t * 6) % 2;
    else if (anim === 'attack') col = t < 0.18 ? 3 : 4;
    else if (anim === 'dead') col = 5;
    drawFrame(sheet, 32, 32, col, 0, x, y - 14 * scale, scale, flip);
    return;
  }
  if (sprite === 'gunther') sheet = img.gunther;
  else if (sprite === 'archer') sheet = spriteFor('archer', team);
  else if (sprite === 'shaman') sheet = spriteFor('shaman', '');
  else sheet = img[sprite];
  col = Math.floor(t * 8) % 10;
  if (anim === 'walk') { row = 2; col = Math.floor(t * 12) % 10; }
  else if (anim === 'attack') { row = 3; col = sprite === 'gunther' || sprite === 'archer' ? 3 + Math.min(Math.floor(t * 24), 5) : 5 + Math.min(Math.floor(t * 14), 4); }
  else if (anim === 'cast') { row = 1; col = 3 + Math.min(Math.floor(t * 12), 6); }
  else if (anim === 'dead') { row = 4; col = Math.min(Math.floor(t * 10), 9); }
  drawFrame(sheet, 32, 32, col, row, x, y - 13 * scale, scale, flip);
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
  ctx.fillStyle = '#22180f'; ctx.fillRect(x - 1, y - 2, 4, 26); ctx.fillRect(x + 1, y - 1, 16, 14);
  ctx.fillStyle = '#c8b48a'; ctx.fillRect(x, y, 2, 24);
  ctx.fillStyle = colour; ctx.fillRect(x + 2, y, 14, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 2, y + 8, 14, 4);
}
