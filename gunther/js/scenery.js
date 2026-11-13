// Everything that stands on the ground and is not a soldier: trees, rocks, houses, castles, tents,
// carts, boats and animals. Like the characters, it is all painted here in code, pixel by pixel,
// so the art is original, changes with the seasons, and needs no picture files.
// This file also knows the season and the weather, and draws rain, snow, mist and smoke.

import { ctx, view } from './core.js';
import { YEAR_DAYS, DAY_SECONDS } from './data.js';
import { game } from './state.js';

const S = 3;                                  // one painted pixel = 3 screen pixels, same as the ground
const OUT = '#0d0b09';
const WOOD = '#8a5a30', WOOD_D = '#5e3b1e', STONE = '#a9a498', STONE_D = '#857f72', STONE_L = '#c6c1b4';
const ROCK = '#7b828a', ROCK_L = '#a4abb2', ROCK_D = '#5f666e', SNOW = '#f4f8fa', SNOW_D = '#d5e0e8';
const METAL_D = '#7e8794', BONE = '#efe8d4', HIDE = ['#b9905e', '#93703f', '#d4b07c'];
const LAMP = '#ffd97a', DARK_WIN = '#3f5068', FORGE = '#ff9a3a', ELF_LAMP = '#b6fff0';

// ---------------------------------------------------------------- seasons and weather
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const SEASON_DAYS = YEAR_DAYS / 4;
export function season() { return Math.floor((game.day - 1) / SEASON_DAYS) % 4; }
// How far the new season has taken hold, 0 to 1. The land turns over the season's first two days.
export function seasonBlend() {
  if (game.day <= 2) return 1;
  const into = ((game.day - 1) % SEASON_DAYS) + (game.dayTime || 0) / DAY_SECONDS;
  return Math.min(1, into / 2);
}
// Each tree and roof turns at its own moment (h is its own number, 0 to 1), so a season creeps in.
export function seasonFor(h) { const s = season(); return seasonBlend() > h ? s : (s + 3) % 4; }

const WEATHERS = ['clear', 'clear', 'clear', 'cloud', 'rain', 'wind', 'mist'];
const WEATHER_NAME = { clear: 'Clear skies', cloud: 'Overcast', rain: 'Rain', wind: 'Windy', mist: 'Mist', snow: 'Snow' };
// Weather holds for two days at a time.
export function weather() {
  if (game.day <= 2) return 'clear';
  const w = WEATHERS[Math.floor(spotHash(Math.floor((game.day - 1) / 2) * 3.7 + 1.3, 11.3) * WEATHERS.length)];
  return w === 'rain' && season() === 3 ? 'snow' : w;
}
export function weatherName() { return WEATHER_NAME[weather()]; }
export function windy() { return weather() === 'wind'; }

// A steady number between 0 and 1 for a spot on the map, so each tree keeps its own timing.
export function spotHash(x, y) { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); }

// ---------------------------------------------------------------- the painter
// Paints a small picture with rectangles, then runs a dark outline round it.
function paint(w, h, fn, outline) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  fn((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); });
  if (outline !== false) {
    const d = g.getImageData(0, 0, w, h), a = d.data;
    const solid = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) solid[i] = a[i * 4 + 3] > 0 ? 1 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (solid[k]) continue;
      if ((x > 0 && solid[k - 1]) || (x < w - 1 && solid[k + 1]) || (y > 0 && solid[k - w]) || (y < h - 1 && solid[k + w])) {
        a[k * 4] = 13; a[k * 4 + 1] = 11; a[k * 4 + 2] = 9; a[k * 4 + 3] = 255;
      }
    }
    g.putImageData(d, 0, 0);
  }
  return c;
}
// A filled oval, for treetops and boulders.
function blob(r, cx, cy, rx, ry, col) {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(1 - (y * y) / ((ry + 0.5) * (ry + 0.5))));
    if (half > 0) r(cx - half, cy + y, half * 2, 1, col);
  }
}
const cache = {};
function made(key, fn) { return cache[key] || (cache[key] = fn()); }
// Draws a painted picture with the point (ax, ay) of the picture at x, y on screen.
function put(c, x, y, ax, ay, flip, scale) {
  const k = scale || S;
  x = Math.round(x); y = Math.round(y);
  if (flip) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(c, -ax * k, -ay * k, c.width * k, c.height * k); ctx.restore(); }
  else ctx.drawImage(c, x - ax * k, y - ay * k, c.width * k, c.height * k);
}

// ---------------------------------------------------------------- trees and rocks
const PINE = ['#2c6a44', '#3d8752', '#5aa868'], ELF = ['#2a8674', '#42ad92', '#8fe2c4'];
const LEAF = {
  oak: [['#5aa848', '#84c95a', '#b6e47c'], ['#3f8f3e', '#62b04c', '#93d266'], ['#b5562a', '#dc8430', '#f2b84a'], null],
  birch: [['#6fb84e', '#9ad65e', '#cdf08c'], ['#4f9f48', '#78c256', '#a9de70'], ['#c8962a', '#e9c440', '#f8e480'], null],
  pine: [PINE, PINE, PINE, PINE],
  elf: [ELF, ELF, ELF, ELF]
};
export const TREE_KINDS = ['pine', 'oak', 'birch', 'elf'];

// lean is -1, 0 or 1: the top of the tree leans that way, which is how the trees sway.
function paintTree(kind, s, lean) {
  return paint(22, 28, r => {
    const pal = LEAF[kind][s], snow = s === 3;
    const pale = kind === 'birch' || kind === 'elf';
    const bark = pale ? '#e6e0d0' : WOOD, barkD = pale ? '#b9b2a0' : WOOD_D;
    if (kind === 'pine') {
      r(10, 21, 2, 5, bark); r(10, 21, 1, 5, barkD);
      for (let y = 2; y < 22; y++) {
        const i = y - 2, half = 1 + (i % 5) + Math.floor(i / 5), sh = y < 12 ? lean : 0, third = Math.floor(half / 3);
        r(11 - half + sh, y, half * 2, 1, pal[1]);
        r(11 + sh + third, y, half - third, 1, pal[0]);
        if (i % 5 >= 2) r(11 - half + sh + 1, y, Math.max(1, third), 1, pal[2]);
        if (snow && (i % 5 === 4 || i < 2)) r(11 - half + sh, y, Math.ceil(half * 1.2), 1, i % 2 ? SNOW : SNOW_D);
      }
      return;
    }
    if (kind === 'birch') {
      r(10, 15, 2, 11, bark); r(11, 15, 1, 11, barkD); r(10, 19, 1, 1, '#3b2a1c'); r(11, 23, 1, 1, '#3b2a1c');
      if (pal) { blob(r, 11, 13, 5, 6, pal[0]); blob(r, 11 + lean, 9, 5, 7, pal[1]); blob(r, 10 + lean, 6, 2, 3, pal[2]); r(13 + lean, 11, 1, 2, pal[2]); }
      else {
        r(10 + lean, 5, 1, 10, bark); r(8 + lean, 8, 2, 1, bark); r(7 + lean, 6, 1, 2, bark); r(11 + lean, 10, 3, 1, bark); r(14 + lean, 8, 1, 2, bark); r(8, 13, 2, 1, bark);
        r(7 + lean, 5, 2, 1, SNOW); r(10 + lean, 4, 1, 1, SNOW); r(13 + lean, 7, 2, 1, SNOW);
      }
      return;
    }
    // Oak, and the taller silver-barked trees of the elf woods.
    const top = kind === 'elf' ? -2 : 0;
    r(10, 18 + top, 3, 8 - top, bark); r(10, 18 + top, 1, 8 - top, barkD);
    if (pal) {
      blob(r, 11, 13 + top, 8, 6, pal[0]); blob(r, 11 + lean, 10 + top, 7, 6, pal[1]); blob(r, 9 + lean, 8 + top, 4, 3, pal[2]);
      r(14 + lean, 9 + top, 1, 1, pal[2]); r(6, 14 + top, 2, 1, pal[1]); r(14, 16 + top, 2, 1, pal[1]);
      if (s === 0 && kind === 'oak') { r(8 + lean, 6, 1, 1, '#ffd6e8'); r(14 + lean, 11, 1, 1, '#ffd6e8'); r(6, 12, 1, 1, '#fff'); }
      if (kind === 'elf') { r(7, 14, 1, 1, '#fff2a8'); r(15, 11, 1, 1, '#fff2a8'); if (snow) { blob(r, 10 + lean, 5, 4, 1, SNOW); } }
    } else {
      r(11, 9, 1, 10, bark); r(8 + lean, 12, 3, 1, bark); r(7 + lean, 10, 1, 2, bark); r(12, 13, 4, 1, bark); r(15 + lean, 11, 1, 2, bark);
      r(10 + lean, 6, 1, 4, bark); r(13 + lean, 8, 1, 2, bark); r(6 + lean, 8, 1, 2, bark);
      r(6 + lean, 9, 2, 1, SNOW); r(10 + lean, 5, 2, 1, SNOW); r(14 + lean, 10, 2, 1, SNOW); r(12, 12, 3, 1, SNOW);
    }
  });
}
// v picks the kind of tree, h is the tree's own number, t is the time (for swaying).
export function drawTree(x, y, v, t, h) {
  const kind = TREE_KINDS[v] || 'oak';
  const wind = windy();
  const sway = Math.sin(t * (wind ? 3.4 : 1.2) + h * 6.283 + x * 0.004) + (wind ? 0.45 : 0);
  const lean = sway > 0.62 ? 1 : (sway < -0.62 ? -1 : 0);
  const s = seasonFor(h);
  put(made('tree' + kind + s + lean, () => paintTree(kind, s, lean)), x, y + 14, 11, 26);
}

function paintRock(v, snow) {
  return paint(18, 14, r => {
    if (v === 0) { blob(r, 9, 9, 7, 4, ROCK); blob(r, 8, 8, 5, 2, ROCK_L); r(5, 7, 2, 1, '#c9cfd4'); r(11, 11, 4, 1, ROCK_D); if (snow) blob(r, 8, 6, 4, 1, SNOW); }
    else if (v === 1) { blob(r, 5, 10, 4, 3, ROCK); blob(r, 12, 8, 4, 5, ROCK); blob(r, 11, 6, 2, 2, ROCK_L); r(3, 9, 2, 1, ROCK_L); r(13, 11, 3, 1, ROCK_D); if (snow) { blob(r, 12, 4, 2, 1, SNOW); r(3, 8, 3, 1, SNOW); } }
    else { blob(r, 9, 7, 5, 6, ROCK); blob(r, 8, 5, 3, 3, ROCK_L); r(10, 10, 3, 1, '#6f9a4a'); r(11, 11, 2, 1, ROCK_D); if (snow) blob(r, 9, 2, 3, 1, SNOW); }
  });
}
export function drawRock(x, y, v, h) {
  const snow = seasonFor(h) === 3;
  put(made('rock' + (v % 3) + snow, () => paintRock(v % 3, snow)), x, y + 16, 9, 13);
}

// ---------------------------------------------------------------- houses, one look for each people
const ROOFS = [['#d9a94a', '#b98a35'], ['#c0563e', '#9a4030'], ['#7a88a0', '#5f6c84']];
// Where the chimney top is on each kind of house (in painted pixels from the house's foot).
const CHIMNEY = { human: [4, -19], humantall: [5, -21], dwarf: [4, -20], dwarftall: [4, -23] };

function paintHouse(people, v, tall, snow, lit) {
  const win = lit ? LAMP : DARK_WIN;
  if (people === 'orc') return paintTent(false, snow);
  return paint(24, 25, r => {
    if (people === 'elf') {
      const top = tall ? -4 : 0;
      r(6, 15 + top, 12, 8 - top, '#e2d6b4'); r(16, 15 + top, 2, 8 - top, '#c6b990');
      r(11, 18, 3, 5, '#2f6f62'); r(12, 17, 1, 1, '#2f6f62'); r(12, 19, 1, 4, '#1f4f46');
      r(15, 17, 2, 2, ELF_LAMP); if (tall) { r(8, 13, 2, 2, ELF_LAMP); r(14, 13, 2, 2, ELF_LAMP); }
      blob(r, 12, 10 + top, 9, 5, ELF[0]); blob(r, 11, 9 + top, 7, 4, ELF[1]); blob(r, 9, 8 + top, 3, 2, ELF[2]);
      r(12, 3 + top, 1, 3, ELF[1]); r(13, 3 + top, 2, 1, ELF[1]);
      if (snow) { blob(r, 11, 7 + top, 5, 1, SNOW); r(8, 9 + top, 3, 1, SNOW_D); }
      return;
    }
    if (people === 'dwarf') {
      const top = tall ? -3 : 0;
      r(15, 2 + top, 3, 7, '#6f6a60'); r(15, 2 + top, 3, 1, snow ? SNOW : '#4a4640');
      r(4, 11 + top, 16, 12 - top, '#9a958a'); r(18, 11 + top, 2, 12 - top, '#7d776c');
      for (let y = 13 + top; y < 22; y += 3) r(4, y, 16, 1, '#7d776c');
      r(7, 11 + top, 1, 2, '#7d776c'); r(13, 14 + top, 1, 2, '#7d776c');
      r(3, 8 + top, 18, 3, '#5d6470'); r(3, 8 + top, 18, 1, snow ? SNOW : '#7a8494');
      r(9, 15, 5, 8, WOOD_D); r(9, 17, 5, 1, METAL_D); r(9, 20, 5, 1, METAL_D);
      r(16, 15, 2, 2, FORGE); r(5, 15, 2, 2, win); if (tall) { r(6, 10, 2, 2, win); r(12, 10, 2, 2, FORGE); }
      return;
    }
    // Human: timber and plaster. Thatched cottages in the villages, tall tiled houses in town.
    const roof = ROOFS[tall ? 1 + v % 2 : (v % 3 === 2 ? 2 : 0)];
    if (tall) {
      r(16, 1, 2, 6, STONE_D);
      r(6, 10, 12, 13, '#eadfc6'); r(16, 10, 2, 13, '#cfc2a4');
      r(6, 10, 1, 13, WOOD); r(17, 10, 1, 13, WOOD); r(6, 15, 12, 1, WOOD);
      r(8, 11, 2, 3, win); r(14, 11, 2, 3, win); r(11, 17, 3, 6, '#6b4424'); r(7, 17, 2, 3, win); r(15, 17, 2, 3, win);
      for (let i = 0; i < 7; i++) r(12 - (3 + i), 3 + i, (3 + i) * 2, 1, snow && i < 3 ? (i === 2 ? SNOW_D : SNOW) : roof[i % 2]);
      if (snow) r(16, 1, 2, 1, SNOW);
    } else {
      r(15, 3, 2, 6, STONE_D);
      r(5, 14, 14, 9, '#eadfc6'); r(17, 14, 2, 9, '#cfc2a4');
      r(5, 14, 1, 9, WOOD); r(18, 14, 1, 9, WOOD); r(5, 14, 14, 1, WOOD);
      r(8, 17, 3, 6, '#6b4424'); r(13, 16, 3, 3, win);
      for (let i = 0; i < 8; i++) r(12 - (5 + i * 0.6 | 0) - 1, 6 + i, ((5 + i * 0.6 | 0) + 1) * 2, 1, snow && i < 3 ? (i === 2 ? SNOW_D : SNOW) : roof[i % 2]);
      if (snow) r(15, 3, 2, 1, SNOW);
    }
  });
}
// Returns where the chimney top is on screen, or null if this kind of house has none.
export function drawHouse(x, y, people, v, tall, h, lit) {
  const snow = seasonFor(h) === 3;
  if (people === 'orc') { put(made('tent0' + snow, () => paintTent(false, snow)), x, y + 16, 15, 25, false, 2); return null; }
  put(made('house' + people + v + tall + snow + lit, () => paintHouse(people, v, tall, snow, lit)), x, y + 16, 12, 23);
  const c = CHIMNEY[people + (tall ? 'tall' : '')];
  return c ? { x: x + c[0] * S, y: y + 16 + c[1] * S } : null;
}

// A hide tent, with a skull on a pole if it is a big one.
function paintTent(big, snow) {
  return paint(32, 27, r => {
    r(14, 1, 1, 5, WOOD_D); r(16, 1, 1, 5, WOOD_D); r(13, 1, 1, 2, WOOD_D); r(17, 1, 1, 2, WOOD_D);
    for (let y = 5; y < 25; y++) {
      const half = Math.round((y - 4) * 0.62) + 1;
      r(15 - half, y, half * 2, 1, snow && y < 9 ? SNOW : HIDE[0]);
      r(15 + (half >> 1), y, half - (half >> 1), 1, HIDE[1]);
    }
    r(7, 17, 3, 2, HIDE[2]); r(19, 12, 2, 2, HIDE[2]); r(10, 11, 1, 1, OUT); r(11, 12, 1, 1, OUT); r(21, 19, 1, 1, OUT);
    for (let y = 14; y < 25; y++) { const half = Math.floor((y - 13) * 0.36) + 1; r(15 - half, y, half * 2, 1, '#2a1f18'); }
    if (big) {
      r(12, 9, 6, 1, '#8e3a2a'); r(11, 10, 8, 1, '#8e3a2a');
      r(28, 9, 1, 16, WOOD_D); r(27, 5, 3, 3, BONE); r(27, 8, 1, 1, BONE); r(29, 8, 1, 1, BONE); r(27, 6, 1, 1, OUT); r(29, 6, 1, 1, OUT);
    }
  });
}
export function drawTent(x, y, big, scale) {
  const snow = season() === 3 && seasonBlend() > 0.5;
  put(made('tent' + (big ? 1 : 0) + snow, () => paintTent(big, snow)), x, y, 15, 25, false, scale || S);
}

// ---------------------------------------------------------------- towns
const KEEP_ROOF = [['#4f6fa8', '#3d588a'], ['#b5533a', '#903f2c'], ['#6b5a7a', '#52445f']];
function paintKeep(people, art, snow, lit) {
  const win = lit ? LAMP : '#2c3440';
  return paint(46, 46, r => {
    if (people === 'elf') {
      // White spires under a great tree.
      r(21, 10, 5, 31, '#cfc4a8'); r(24, 10, 2, 31, '#a89c80');
      blob(r, 23, 10, 17, 7, ELF[0]); blob(r, 22, 8, 14, 5, ELF[1]); blob(r, 17, 6, 6, 2, ELF[2]); blob(r, 30, 9, 4, 2, ELF[2]);
      r(10, 13, 1, 1, '#fff2a8'); r(34, 11, 1, 1, '#fff2a8'); r(27, 14, 1, 1, '#fff2a8');
      if (snow) { blob(r, 20, 4, 8, 1, SNOW); blob(r, 31, 7, 4, 1, SNOW_D); }
      for (const sx of [6, 35]) {
        r(sx, 18, 5, 24, '#efe9da'); r(sx + 3, 18, 2, 24, '#d2cbb8');
        for (let i = 0; i < 10; i++) { const w = 1 + 2 * Math.floor(i / 3); r(sx + 2 - (w >> 1), 8 + i, w, 1, snow && i < 4 ? SNOW : ELF[i % 3 === 2 ? 0 : 1]); }
        r(sx + 2, 22, 1, 3, ELF_LAMP); r(sx + 2, 29, 1, 3, ELF_LAMP);
      }
      r(11, 31, 24, 11, '#e8e2d0'); r(11, 31, 24, 1, '#fffdf4'); r(11, 40, 24, 2, '#d2cbb8');
      r(13, 33, 1, 5, ELF[1]); r(14, 35, 1, 1, ELF[2]); r(31, 34, 1, 6, ELF[1]); r(32, 36, 2, 1, ELF[1]);
      r(20, 34, 6, 8, '#2f6f62'); r(21, 33, 4, 1, '#2f6f62'); r(23, 34, 1, 8, '#1f4f46');
      r(18, 35, 1, 2, '#fff2a8'); r(27, 35, 1, 2, '#fff2a8');
      return;
    }
    if (people === 'dwarf') {
      // A gate cut into the mountain.
      for (let y = 3; y < 43; y++) {
        const half = Math.min(21, Math.round(2 + (y - 3) * 0.52) + (y % 5 === 0 ? 1 : 0));
        r(23 - half, y, half * 2, 1, ROCK);
        r(23 - half, y, Math.floor(half * 0.55), 1, ROCK_L);
        r(23 + Math.floor(half * 0.6), y, half - Math.floor(half * 0.6), 1, ROCK_D);
        if (y < (snow ? 14 : 8)) r(23 - half, y, half * 2 - (y % 2), 1, y % 3 ? SNOW : SNOW_D);
      }
      r(15, 25, 16, 18, '#5d5850'); r(14, 23, 18, 2, '#c08a3e'); r(14, 23, 18, 1, '#e0aa5a');
      r(15, 25, 2, 18, STONE_D); r(29, 25, 2, 18, STONE_D);
      r(18, 28, 10, 15, '#3a2d22'); r(23, 28, 1, 15, '#22180f'); r(18, 31, 10, 1, METAL_D); r(18, 38, 10, 1, METAL_D);
      r(22, 19, 3, 3, '#c08a3e'); r(23, 20, 1, 1, '#22180f');
      r(11, 20, 1, 2, FORGE); r(34, 18, 1, 2, FORGE); r(26, 13, 1, 2, FORGE); r(19, 15, 1, 2, win);
      for (const bx of [10, 34]) { r(bx, 38, 2, 5, '#4a4640'); r(bx - 1, 37, 4, 1, '#4a4640'); r(bx, 35, 2, 2, '#f39a2b'); r(bx, 34, 1, 1, '#ffe08a'); }
      return;
    }
    if (people === 'orc') {
      // A great hide tent behind a palisade of sharpened logs.
      r(22, 0, 1, 5, WOOD_D); r(24, 0, 1, 5, WOOD_D);
      for (let y = 4; y < 34; y++) {
        const half = Math.round((y - 3) * 0.55) + 1;
        r(23 - half, y, half * 2, 1, snow && y < 8 ? SNOW : HIDE[0]); r(23 + (half >> 1), y, half - (half >> 1), 1, HIDE[1]);
      }
      r(19, 10, 8, 1, '#8e3a2a'); r(18, 11, 10, 1, '#8e3a2a'); r(14, 20, 3, 2, HIDE[2]); r(28, 16, 2, 2, HIDE[2]);
      for (let y = 18; y < 34; y++) { const half = Math.floor((y - 17) * 0.3) + 1; r(23 - half, y, half * 2, 1, '#2a1f18'); }
      for (let x = 3; x < 42; x += 2) {
        if (x >= 20 && x < 26) continue;
        const hgt = 11 + (x * 7) % 3;
        r(x, 43 - hgt, 2, hgt, x % 4 === 3 ? '#7a5a36' : '#6b4c2c'); r(x, 42 - hgt, 1, 1, '#7a5a36');
        if (snow) r(x, 42 - hgt, 1, 1, SNOW);
      }
      r(3, 37, 17, 1, '#4a3520'); r(26, 37, 16, 1, '#4a3520');
      r(18, 26, 2, 17, WOOD_D); r(26, 26, 2, 17, WOOD_D); r(18, 23, 2, 2, BONE); r(26, 23, 2, 2, BONE); r(18, 25, 1, 1, BONE); r(27, 25, 1, 1, BONE);
      r(20, 33, 6, 10, '#2a1f18');
      return;
    }
    // Human: a stone keep, two round towers and a curtain wall with a gate.
    const roof = KEEP_ROOF[art % 3];
    r(16, 10, 14, 22, STONE); r(27, 10, 3, 22, STONE_D);
    for (const x of [16, 20, 24, 28]) r(x, 8, 2, 2, snow ? SNOW : STONE);
    r(19, 14, 2, 3, win); r(25, 14, 2, 3, win); r(22, 20, 2, 3, win);
    r(17, 18, 3, 1, STONE_D); r(23, 12, 3, 1, STONE_D);
    for (const tx of [4, 34]) {
      r(tx, 16, 8, 26, STONE); r(tx + 6, 16, 2, 26, STONE_D); r(tx, 16, 1, 26, STONE_L);
      for (let i = 0; i < 8; i++) { const half = Math.ceil((i + 1) * 0.62); r(tx + 4 - half, 8 + i, half * 2, 1, snow && i < 3 ? SNOW : roof[i % 3 ? 0 : 1]); }
      r(tx - 1, 16, 10, 1, roof[1]); r(tx + 3, 21, 2, 3, win); r(tx + 2, 30, 3, 1, STONE_D);
    }
    r(11, 27, 24, 15, STONE_L); r(11, 40, 24, 2, STONE);
    for (let x = 12; x < 34; x += 4) r(x, 25, 2, 2, snow ? SNOW : STONE_L);
    r(13, 31, 3, 1, STONE); r(29, 30, 3, 1, STONE); r(14, 37, 3, 1, STONE); r(30, 36, 3, 1, STONE); r(27, 39, 2, 1, STONE);
    r(19, 31, 8, 11, STONE_D); r(20, 30, 6, 1, STONE_D);
    r(20, 32, 6, 10, '#3b2a1c'); r(22, 32, 1, 10, '#22180f'); r(24, 32, 1, 10, '#22180f'); r(20, 35, 6, 1, '#22180f'); r(20, 38, 6, 1, '#22180f');
  });
}
export function drawKeep(x, y, people, art, lit) {
  const snow = season() === 3 && seasonBlend() > 0.4;
  put(made('keep' + people + art + snow + lit, () => paintKeep(people, art || 0, snow, lit)), x, y + 36, 23, 43);
}
// Where smoke rises from each kind of town, as offsets from the town's spot.
export const KEEP_SMOKE = { human: [[-12, -72], [22, -60]], dwarf: [[-6, -96], [30, -40]], orc: [[0, -92]], elf: [] };

// ---------------------------------------------------------------- small things
const PROPS = {
  well: [10, 11, r => { r(2, 6, 6, 4, STONE); r(2, 9, 6, 1, STONE_D); r(3, 6, 4, 1, '#22303a'); r(2, 2, 1, 4, WOOD); r(7, 2, 1, 4, WOOD); r(1, 1, 8, 2, '#b5533a'); r(1, 2, 8, 1, '#903f2c'); }],
  barrels: [12, 11, r => {
    for (const [bx, by] of [[1, 5], [6, 5], [4, 1]]) { r(bx, by, 4, 5, WOOD); r(bx + 3, by, 1, 5, WOOD_D); r(bx, by + 1, 4, 1, METAL_D); r(bx, by + 3, 4, 1, METAL_D); }
  }],
  logs: [16, 9, r => {
    r(1, 6, 13, 2, WOOD); r(2, 4, 11, 2, '#9a6a3a'); r(4, 2, 7, 2, WOOD);
    r(1, 6, 1, 2, '#e0c08a'); r(13, 6, 1, 2, '#e0c08a'); r(2, 4, 1, 2, '#e0c08a'); r(12, 4, 1, 2, '#e0c08a'); r(4, 2, 1, 2, '#e0c08a'); r(10, 2, 1, 2, '#e0c08a');
  }],
  stump: [7, 6, r => { r(1, 2, 4, 3, WOOD); r(4, 2, 1, 3, WOOD_D); r(1, 1, 4, 1, '#e0c08a'); r(2, 1, 1, 1, '#c9a06a'); }],
  stall: [16, 13, r => {
    r(1, 4, 1, 8, WOOD_D); r(13, 4, 1, 8, WOOD_D);
    for (let x = 0; x < 15; x++) r(x, 1, 1, 3, x % 4 < 2 ? '#c0563e' : '#efe3c2');
    r(1, 8, 13, 2, WOOD); r(1, 10, 13, 1, WOOD_D); r(3, 7, 2, 1, '#e8c23e'); r(7, 7, 2, 1, '#c0563e'); r(10, 6, 2, 2, '#6fb84e');
  }],
  stall2: [16, 13, r => {
    r(1, 4, 1, 8, WOOD_D); r(13, 4, 1, 8, WOOD_D);
    for (let x = 0; x < 15; x++) r(x, 1, 1, 3, x % 4 < 2 ? '#3a8f7a' : '#efe3c2');
    r(1, 8, 13, 2, WOOD); r(1, 10, 13, 1, WOOD_D); r(3, 6, 2, 2, '#b08a5a'); r(6, 7, 3, 1, '#d8dce6'); r(10, 7, 2, 1, '#9a4030');
  }],
  mine: [24, 17, r => {
    for (let y = 3; y < 16; y++) { const half = Math.min(11, 4 + Math.round((y - 3) * 0.8)); r(12 - half, y, half * 2, 1, ROCK); r(12 - half, y, half >> 1, 1, ROCK_L); }
    r(8, 8, 8, 8, '#1a1410'); r(7, 7, 10, 1, WOOD); r(7, 7, 1, 9, WOOD); r(16, 7, 1, 9, WOOD_D); r(10, 15, 4, 1, METAL_D);
  }],
  cart: [10, 8, r => { r(1, 2, 7, 3, '#6b4424'); r(1, 4, 7, 1, WOOD_D); r(2, 1, 5, 1, '#4a4f58'); r(3, 0, 2, 1, '#6a707a'); r(1, 5, 2, 2, '#22180f'); r(6, 5, 2, 2, '#22180f'); }],
  hay: [9, 8, r => { blob(r, 4, 4, 3, 2, '#e2be58'); r(1, 5, 6, 2, '#e2be58'); r(2, 3, 2, 1, '#f4dc88'); r(5, 6, 2, 1, '#b98a35'); }],
  mill: [16, 24, r => {
    r(5, 8, 6, 15, '#eadfc6'); r(4, 15, 8, 8, '#eadfc6'); r(10, 8, 1, 15, '#cfc2a4'); r(11, 15, 1, 8, '#cfc2a4');
    r(4, 5, 8, 3, '#b5533a'); r(5, 4, 6, 1, '#b5533a'); r(4, 7, 8, 1, '#903f2c');
    r(7, 18, 2, 5, WOOD_D); r(7, 11, 2, 2, DARK_WIN);
  }],
  boat: [16, 13, r => {
    r(1, 8, 13, 2, '#6b4424'); r(2, 10, 11, 1, '#4a2f18'); r(0, 7, 2, 1, '#6b4424'); r(13, 7, 2, 1, '#6b4424');
    r(7, 1, 1, 7, WOOD_D); for (let i = 0; i < 5; i++) r(8, 2 + i, 1 + i, 1, i === 2 ? '#d6c79e' : '#efe3c2');
    r(3, 5, 2, 3, '#3a6ea5'); r(3, 4, 2, 1, '#e8b88a');
  }],
  ship: [26, 21, r => {
    r(3, 13, 20, 3, '#6b4424'); r(5, 16, 16, 1, '#4a2f18'); r(1, 12, 3, 1, '#6b4424'); r(19, 10, 5, 3, '#7a5230'); r(19, 10, 5, 1, '#9a6a3a'); r(3, 14, 20, 1, '#8a5a30');
    r(12, 1, 1, 12, WOOD_D); r(6, 3, 13, 8, '#efe3c2'); r(6, 5, 13, 1, '#b5533a'); r(6, 8, 13, 1, '#b5533a'); r(6, 10, 13, 1, '#d6c79e');
    r(13, 0, 3, 1, '#b5533a');
  }],
  campTent: [16, 12, r => { for (let y = 2; y < 11; y++) { const half = y - 1 > 7 ? 7 : y - 1; r(8 - half, y, half * 2, 1, '#d6c79e'); r(8 + (half >> 1), y, half - (half >> 1), 1, '#b9a67e'); } r(7, 6, 2, 5, '#3b2a1c'); r(8, 0, 1, 2, WOOD_D); }]
};
// Feet of each prop, in painted pixels, so they stand on their spot.
export function drawProp(name, x, y, flip) {
  const p = PROPS[name];
  put(made('prop' + name, () => paint(p[0], p[1], p[2])), x, y, p[0] / 2, p[1] - 1, flip);
}
// The turning sails of a windmill whose foot is at x, y.
export function drawMillSails(x, y, t) {
  const hx = Math.round(x), hy = Math.round(y - 17 * S);
  const a = t * (windy() ? 2.2 : 0.8);
  ctx.save(); ctx.translate(hx, hy);
  for (let k = 0; k < 4; k++) {
    ctx.save(); ctx.rotate(a + k * Math.PI / 2);
    ctx.fillStyle = OUT; ctx.fillRect(-2, -2, 34, 4); ctx.fillRect(9, 0, 25, 11);
    ctx.fillStyle = WOOD_D; ctx.fillRect(0, -1, 32, 2);
    ctx.fillStyle = '#efe3c2'; ctx.fillRect(10, 1, 22, 8);
    ctx.fillStyle = '#d6c79e'; ctx.fillRect(10, 7, 22, 2);
    ctx.restore();
  }
  ctx.fillStyle = OUT; ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
}

// A field of crops: green shoots in spring, tall in summer, gold in autumn, stubble under snow.
const FIELD = [['#8a6a42', '#6fae4a'], ['#7aa844', '#9cc85a'], ['#d9a94a', '#f0cc66'], ['#b9a890', '#eef2f4']];
export function drawField(x, y, w, h, t, hsh) {
  const s = seasonFor(hsh), cols = FIELD[s];
  x = Math.round(x); y = Math.round(y);   // whole pixels only: snapping to the art grid made it judder against the ground
  ctx.fillStyle = 'rgba(60, 44, 24, 0.55)'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = cols[0]; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = cols[1];
  for (let ry = 3; ry < h; ry += 9) ctx.fillRect(x, y + ry, w, s === 0 ? 3 : 6);
  // The wind runs through standing corn.
  if (s === 1 || s === 2) {
    const band = ((t * (windy() ? 90 : 36) + hsh * 200) % (w + 60)) - 30;
    ctx.fillStyle = 'rgba(255, 255, 220, 0.22)';
    const bx = Math.max(0, Math.round(band / 3) * 3), bw = Math.min(w - bx, 18);
    if (bw > 0 && bx < w) ctx.fillRect(x + bx, y, bw, h);
  }
}

// ---------------------------------------------------------------- animals and little people
function paintSheep(f) {
  return paint(11, 9, r => {
    r(1, 2, 7, 4, '#f2efe6'); r(2, 1, 5, 1, '#f2efe6'); r(1, 5, 7, 1, '#d0cabb');
    if (f === 2) r(7, 5, 2, 2, '#2c2622'); else r(7, 2, 2, 2, '#2c2622');
    if (f === 1) { r(3, 6, 1, 1, '#2c2622'); r(5, 6, 1, 2, '#2c2622'); } else { r(2, 6, 1, 2, '#2c2622'); r(6, 6, 1, 2, '#2c2622'); }
  });
}
// f: 0 standing, 1 walking, 2 grazing.
export function drawSheep(x, y, f, flip) { put(made('sheep' + f, () => paintSheep(f)), x, y, 5, 8, flip, 2); }

function paintDeer(f) {
  return paint(15, 13, r => {
    const B = '#a8703e', D = '#7d5028';
    r(2, 5, 8, 3, B); r(2, 7, 8, 1, '#c99a62'); r(1, 5, 1, 1, '#f2efe6');
    if (f === 1) { r(9, 7, 2, 2, B); r(10, 9, 3, 2, B); r(12, 10, 1, 1, OUT); }
    else { r(9, 3, 2, 3, B); r(10, 2, 3, 2, B); r(12, 2, 1, 1, OUT); r(10, 0, 1, 2, D); r(12, 0, 1, 2, D); }
    if (f === 2) { r(1, 8, 1, 2, D); r(3, 8, 1, 3, D); r(8, 8, 1, 3, D); r(10, 8, 1, 2, D); }
    else if (f === 3) { r(4, 8, 1, 3, D); r(5, 8, 1, 2, D); r(7, 8, 1, 3, D); r(6, 8, 1, 2, D); }
    else { r(3, 8, 1, 4, D); r(4, 8, 1, 4, D); r(8, 8, 1, 4, D); r(9, 8, 1, 4, D); }
  });
}
// f: 0 standing, 1 grazing, 2 and 3 running.
export function drawDeer(x, y, f, flip) { put(made('deer' + f, () => paintDeer(f)), x, y, 7, 12, flip, 2); }

const SKIN = { human: '#e8b88a', elf: '#f2dfc4', dwarf: '#dba27a', orc: '#6f9a4a' };
const HAIR = { human: ['#5e3b1e', '#22180f', '#b98a35'], elf: ['#e8dca0', '#d8d2c0', '#c9a06a'], dwarf: ['#9a4a22', '#5e3b1e', '#8a8f96'], orc: ['#22180f', '#22180f', '#3b2a1c'] };
const CLOTH = { human: ['#7a6a52', '#9a4030', '#4f6f8a', '#b9a67e'], elf: ['#3a8f7a', '#8fa86a', '#d8d2c0', '#5f8f6a'], dwarf: ['#6b4c2c', '#7a4a3a', '#5d6470', '#8a6a3e'], orc: ['#6b4c2c', '#8e3a2a', '#93703f', '#4a3520'] };
function paintFolk(people, k, f) {
  return paint(9, 13, r => {
    const skin = SKIN[people], hair = HAIR[people][k % 3], cloth = CLOTH[people][k % 4], short = people === 'dwarf' ? 1 : 0;
    r(3, 1 + short, 3, 3, skin); r(3, 1 + short, 3, 1, hair); r(3, 2 + short, 1, 1, hair);
    if (people === 'dwarf') r(3, 4, 3, 2, hair);
    if (people === 'elf') r(2, 2, 1, 1, skin);
    if (people === 'human' && k % 4 === 1) r(2, 1, 5, 1, '#d9a94a');
    r(3, 4 + short * 2, 3, 4 - short, cloth); r(2, 5 + short, 1, 2, cloth); r(6, 5 + short, 1, 2, cloth);
    if (f) { r(3, 8, 1, 2, '#3b2a1c'); r(5, 8, 1, 3, '#3b2a1c'); } else { r(3, 8, 1, 3, '#3b2a1c'); r(5, 8, 1, 3, '#3b2a1c'); }
  });
}
export function drawFolk(x, y, people, k, walking, t, flip) {
  const f = walking ? Math.floor(t * 5) % 2 : 0;
  put(made('folk' + people + (k % 12) + f, () => paintFolk(people, k % 12, f)), x, y, 4, 12, flip, 2);
}

// A bird on the wing: three blocks that flap. Crows inland, gulls over the water.
export function drawBird(x, y, t, gull, high) {
  x = Math.round(x); y = Math.round(y);
  const up = Math.sin(t * (gull ? 7 : 11)) > 0;
  if (high) { ctx.fillStyle = 'rgba(20, 40, 20, 0.2)'; ctx.fillRect(x - 4, y + high, 9, 3); }
  ctx.fillStyle = gull ? '#f6f6f2' : '#22180f';
  ctx.fillRect(x - 1, y, 3, 3);
  ctx.fillRect(x - 5, up ? y - 3 : y + 1, 4, 3); ctx.fillRect(x + 2, up ? y - 3 : y + 1, 4, 3);
}

// ---------------------------------------------------------------- smoke and fire
// Puffs rising from a chimney at x, y. Drawn fresh from the clock, so nothing has to be remembered.
export function drawSmoke(x, y, t, seed, dark, big) {
  const wind = windy() ? 46 : 12, n = big ? 7 : 5, rise = big ? 96 : 54;
  for (let k = 0; k < n; k++) {
    const p = (t * (big ? 0.22 : 0.3) + k / n + seed) % 1;
    const size = 3 + Math.round(p * (big ? 5 : 3)) * 3;
    const px = x + p * p * wind + Math.sin(p * 7 + k * 2.1 + seed * 9) * 4, py = y - p * rise;
    ctx.globalAlpha = (1 - p) * (dark ? 0.8 : 0.5);
    ctx.fillStyle = dark ? '#3a3632' : '#eeeae0';
    ctx.fillRect(Math.round(px / 3) * 3 - (size >> 1), Math.round(py / 3) * 3 - (size >> 1), size, size);
  }
  ctx.globalAlpha = 1;
}
// Flames licking at something that has been burned.
export function drawFlames(x, y, t, seed) {
  [['#e8572a', 9, 18], ['#f39a2b', 6, 12], ['#ffe08a', 3, 7]].forEach(([col, w, h], k) => {
    const flick = Math.round(Math.sin(t * 13 + k * 2 + seed * 20) * 1.4) * 3;
    ctx.fillStyle = col; ctx.fillRect(Math.round(x) - w + flick / 3, Math.round(y) - h - Math.abs(flick), w * 2, h + Math.abs(flick));
  });
}
export function drawCampfire(x, y, t) {
  const glow = ctx.createRadialGradient(x, y - 8, 4, x, y - 8, 70);
  glow.addColorStop(0, 'rgba(255, 190, 90, 0.35)');
  glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = glow; ctx.fillRect(x - 70, y - 78, 140, 140);
  ctx.fillStyle = '#7a8088';
  for (let a = 0; a < 8; a++) ctx.fillRect(Math.round(x) + Math.round(Math.cos(a * 0.785) * 6) * 3 - 3, Math.round(y) + Math.round(Math.sin(a * 0.785) * 3) * 3 - 3, 6, 6);
  ctx.fillStyle = '#6b4424'; ctx.fillRect(x - 15, y - 3, 30, 6);
  ctx.fillStyle = '#58371d'; ctx.fillRect(x - 3, y - 9, 6, 15);
  [['#e8572a', 12, 18], ['#f39a2b', 9, 13], ['#ffe08a', 5, 8]].forEach(([col, wdt, ht], k) => {
    const flick = Math.round(Math.sin(t * 14 + k * 2) * 1.5) * 3;
    ctx.fillStyle = col;
    ctx.fillRect(x - wdt, y - ht - 3 + Math.abs(flick), wdt * 2, ht);
    ctx.fillRect(x - wdt / 2 + flick, y - ht - 9, wdt, 6);
  });
}

// ---------------------------------------------------------------- weather over the whole screen
const LEAF_COL = ['#b6e47c', '#93d266', '#f2b84a', '#f4f8fa'];
export function drawWeather(t) {
  const W = view.W, H = view.H, w = weather();
  if (w === 'clear') return;
  if (w === 'cloud') { ctx.fillStyle = 'rgba(70, 80, 100, 0.14)'; ctx.fillRect(0, 0, W, H); return; }
  if (w === 'mist') {
    ctx.fillStyle = 'rgba(226, 232, 236, 0.2)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(240, 244, 246, 0.08)';
    for (let k = 0; k < 7; k++) {
      const bw = 300 + (k * 97) % 260, x = ((k * 331 + t * (10 + k * 3)) % (W + bw)) - bw, y = (k * 173) % H;
      ctx.fillRect(Math.round(x / 6) * 6, Math.round(y / 6) * 6, bw, 36 + (k % 3) * 18);
    }
    return;
  }
  if (w === 'rain') {
    ctx.fillStyle = 'rgba(50, 70, 100, 0.16)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(215, 232, 255, 0.6)';
    const n = Math.round(W * H / 5500);
    for (let i = 0; i < n; i++) {
      const y = ((i * 53.7 + t * 880 * (0.8 + (i % 5) * 0.08)) % (H + 60)) - 30;
      const x = ((i * 97.13) % (W + 240)) - y * 0.25;
      ctx.fillRect(Math.round(x), Math.round(y), 2, 12);
    }
    return;
  }
  if (w === 'snow') {
    ctx.fillStyle = 'rgba(230, 240, 250, 0.1)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const n = Math.round(W * H / 8000);
    for (let i = 0; i < n; i++) {
      const y = ((i * 37.1 + t * (40 + (i % 5) * 12)) % (H + 20)) - 10;
      const x = ((i * 91.7 + Math.sin(t * 0.8 + i) * 18 + t * 10) % (W + 20)) - 10;
      ctx.fillRect(Math.round(x / 3) * 3, Math.round(y / 3) * 3, 3, 3);
    }
    return;
  }
  // Wind: leaves (or snow) streaking past.
  ctx.fillStyle = LEAF_COL[season()];
  for (let i = 0; i < 28; i++) {
    const x = ((i * 137.3 + t * (240 + (i % 4) * 50)) % (W + 80)) - 40;
    const y = ((i * 71.9) % H) + Math.sin(t * 3 + i * 1.7) * 22 + ((t * 30) % H);
    ctx.fillRect(Math.round(x), Math.round(y % H), 5, 2);
  }
}
