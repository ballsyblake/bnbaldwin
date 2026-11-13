// The life of the island that has nothing to do with war: villagers about their work, sheep and
// deer, fishing boats and trading ships, birds, drifting cloud shadows, and night falling when
// Gunther makes camp. None of it is saved or affects the game; it only makes the map feel lived in.

import { ctx, view, seeded, dist, rand, pick } from './core.js';
import { WORLD_W, WORLD_H, SETTLEMENTS } from './data.js';
import { game } from './state.js';
import { terrainAt, T, decor, shoreValue, ISLAND } from './terrain.js';
import { peopleOf } from './sieges.js';
import {
  drawProp, drawMillSails, drawField, drawSheep, drawDeer, drawFolk, drawBird, drawSmoke, drawFlames,
  drawWeather, weather, season, spotHash, KEEP_SMOKE
} from './scenery.js';

const sites = {};        // per settlement: { props, fields, sheep, folk, boats, spots }
const herds = [];        // deer
const ships = [];
const flocks = [];
const clouds = [];
let shipPath = [];
let built = false;
let flockIn = 3;
let night = 0;           // 0 day, 1 full night; eases in when Gunther camps

const dry = (x, y) => { const t = terrainAt(x, y); return t === T.GRASS || t === T.FOREST || t === T.HILLS; };
const dryAround = (x, y, r) => dry(x, y) && dry(x - r, y) && dry(x + r, y) && dry(x, y - r) && dry(x, y + r);

export function buildLife() {
  if (built) return;
  built = true;
  SETTLEMENTS.forEach((s, idx) => {
    if (s.kind !== 'town' && s.kind !== 'village') return;
    const rnd = seeded(300 + idx * 17);
    const people = peopleOf(s), town = s.kind === 'town';
    const L = sites[s.id] = { props: [], fields: [], sheep: [], folk: [], boats: [], spots: [], people };
    // The keep or hall and the houses round it are already standing.
    const taken = [{ x: s.x, y: s.y, r: town ? 120 : 76 }];
    // Finds a free bit of open ground near the settlement.
    const spot = (r0, r1, room) => {
      for (let k = 0; k < 60; k++) {
        const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0);
        const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r * 0.8;
        if (!dryAround(x, y, room) || taken.some(q => dist(q.x, q.y, x, y) < q.r + room + 14)) continue;
        if (SETTLEMENTS.some(o => o !== s && dist(o.x, o.y, x, y) < 150)) continue;
        taken.push({ x, y, r: room });
        return { x, y };
      }
      return null;
    };
    const prop = (name, x, y, extra) => L.props.push(Object.assign({ name, x, y }, extra));
    const makes = s.makes || [];
    if (makes.includes('grain')) {
      for (let k = 0; k < 2; k++) {
        const p = spot(150, 250, 52);
        if (!p) continue;
        L.fields.push({ x: p.x - 42, y: p.y - 27, w: 84, h: 54, h0: rnd() });
        L.spots.push({ x: p.x, y: p.y + 34 });
        const side = p.x < s.x ? -1 : 1;    // the mill stands on the far side of the field from the village
        if (k === 0 && people === 'human') prop('mill', p.x + side * 64, p.y + 8, { mill: true });
        else prop('hay', p.x + side * 56, p.y + 20);
      }
    }
    if (makes.includes('wool')) {
      const p = spot(140, 230, 46);
      if (p) {
        for (let k = 0; k < 4; k++) L.sheep.push({ hx: p.x, hy: p.y, x: p.x + (rnd() - 0.5) * 60, y: p.y + (rnd() - 0.5) * 40, tx: p.x, ty: p.y, wait: rnd() * 4, flip: rnd() < 0.5 });
        L.spots.push({ x: p.x + 30, y: p.y + 26 });
      }
    }
    if (makes.includes('timber')) {
      const p = spot(130, 210, 34);
      if (p) { prop('logs', p.x, p.y); prop('logs', p.x + 40, p.y + 14); prop('stump', p.x - 30, p.y + 12); prop('stump', p.x + 12, p.y - 24); L.spots.push({ x: p.x + 10, y: p.y + 22 }); }
    }
    if (makes.includes('iron') || makes.includes('tools')) {
      const p = spot(140, 220, 36);
      if (p) { prop('mine', p.x, p.y); prop('cart', p.x + 20, p.y + 16); L.spots.push({ x: p.x - 6, y: p.y + 16 }); }
    }
    if (makes.includes('fish')) {
      // The nearest water, if the sea is close enough to fish.
      let best = null;
      for (let r = 120; r < 620 && !best; r += 30) for (let a = 0; a < Math.PI * 2; a += 0.2) {
        const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
        if (terrainAt(x, y) === T.SHALLOW && terrainAt(x + Math.cos(a) * 40, y + Math.sin(a) * 40) <= T.SHALLOW) { best = { x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30 }; break; }
      }
      if (best) for (let k = 0; k < 2; k++) L.boats.push({ x: best.x + (k ? 70 : -20), y: best.y + (k ? 34 : 0), ph: rnd() * 6, flip: k === 1 });
    }
    if (makes.includes('ale') || town) prop('barrels', s.x + (town ? 62 : 26), s.y + (town ? 42 : 50));
    if (town && people !== 'orc') { prop('stall', s.x - 44, s.y + 96); prop(makes.includes('spice') ? 'stall2' : 'barrels', s.x + 40, s.y + 100); L.spots.push({ x: s.x - 40, y: s.y + 108 }, { x: s.x + 34, y: s.y + 112 }); }
    if (!town && people === 'human') prop('well', s.x - 6, s.y + 76);
    // People walk between the houses, the gate and wherever the work is.
    const houses = town ? [[-104, 14], [104, 10], [-84, 80], [88, 78]] : [[-50, 8], [48, 4], [-40, 60], [44, 56]];
    for (const [dx, dy] of houses) L.spots.push({ x: s.x + dx, y: s.y + dy });
    L.spots.push({ x: s.x, y: s.y + (town ? 44 : 24) });
    const n = town ? 5 : 3;
    for (let k = 0; k < n; k++) {
      const at = L.spots[Math.floor(rnd() * L.spots.length)];
      L.folk.push({ x: at.x, y: at.y, tx: at.x, ty: at.y, wait: rnd() * 5, k: Math.floor(rnd() * 12), flip: false, walking: false });
    }
    // Clear any trees standing where a field or a workplace now is.
    for (let i = decor.length - 1; i >= 0; i--) {
      const d = decor[i];
      if (d.kind !== 'house' && taken.some(q => dist(q.x, q.y, d.x, d.y) < q.r + 22)) decor.splice(i, 1);
    }
  });

  // Deer keep to the edges of the woods, away from people.
  const dr = seeded(77);
  for (let k = 0; k < 900 && herds.length < 20; k++) {
    const x = 200 + dr() * (WORLD_W - 400), y = 200 + dr() * (WORLD_H - 400);
    if (terrainAt(x, y) !== T.GRASS || !dryAround(x, y, 40)) continue;
    if (![[70, 0], [-70, 0], [0, 70], [0, -70]].some(([dx, dy]) => terrainAt(x + dx, y + dy) === T.FOREST)) continue;
    if (SETTLEMENTS.some(s => dist(s.x, s.y, x, y) < 300) || herds.some(h => dist(h[0].x, h[0].y, x, y) < 320)) continue;
    const herd = [];
    for (let i = 0, n = 2 + Math.floor(dr() * 3); i < n; i++) herd.push({ x: x + (dr() - 0.5) * 70, y: y + (dr() - 0.5) * 50, tx: x, ty: y, wait: dr() * 5, flee: 0, vx: 0, vy: 0, flip: dr() < 0.5, graze: dr() < 0.6 });
    herds.push(herd);
  }

  // Trading ships sail a ring round the island, just off the shallows.
  for (let i = 0; i < 240; i++) {
    const a = i / 240 * Math.PI * 2;
    let k = 1.2;
    for (let it = 0; it < 6; it++) {
      const x = ISLAND.x + Math.cos(a) * ISLAND.rx * k, y = ISLAND.y + Math.sin(a) * ISLAND.ry * k;
      k += (1.16 - shoreValue(x, y)) * 0.8;
    }
    shipPath.push({ x: Math.max(50, Math.min(WORLD_W - 50, ISLAND.x + Math.cos(a) * ISLAND.rx * k)), y: Math.max(60, Math.min(WORLD_H - 40, ISLAND.y + Math.sin(a) * ISLAND.ry * k)) });
  }
  for (let k = 0; k < 4; k++) ships.push({ u: k * 61 + 12, dir: k % 2 ? -1 : 1, x: 0, y: 0, flip: false });

  const cr = seeded(5150);
  for (let k = 0; k < 11; k++) clouds.push({ x: cr() * (WORLD_W + 900) - 450, y: cr() * WORLD_H, w: 260 + cr() * 320, h: 120 + cr() * 120, lumps: [cr(), cr(), cr()] });
}

function walkTo(o, speed, dt) {
  const d = dist(o.x, o.y, o.tx, o.ty);
  if (d < 2) return false;
  const step = Math.min(d, speed * dt);
  o.x += (o.tx - o.x) / d * step; o.y += (o.ty - o.y) / d * step;
  if (Math.abs(o.tx - o.x) > 1) o.flip = o.tx < o.x;
  return true;
}

// cam is the top-left of the screen on the map; P is where Gunther is; camping says he has made camp.
export function updateLife(dt, cam, P, camping) {
  if (!built) return;
  night += ((camping ? 1 : 0) - night) * Math.min(1, dt * 1.6);
  const near = (x, y, m) => x > cam.x - m && x < cam.x + view.W + m && y > cam.y - m && y < cam.y + view.H + m;
  for (const s of SETTLEMENTS) {
    const L = sites[s.id];
    if (!L || !near(s.x, s.y, 320)) continue;
    for (const f of L.folk) {
      f.walking = walkTo(f, 20, dt);
      if (f.walking) continue;
      f.wait -= dt;
      if (f.wait <= 0) { const to = pick(L.spots); f.tx = to.x + rand(-8, 8); f.ty = to.y + rand(-4, 6); f.wait = rand(1.5, 6); }
    }
    for (const a of L.sheep) {
      a.walking = walkTo(a, 9, dt);
      if (a.walking) continue;
      a.wait -= dt;
      if (a.wait <= 0) { a.tx = a.hx + rand(-44, 44); a.ty = a.hy + rand(-28, 28); a.wait = rand(2, 8); a.graze = Math.random() < 0.7; }
    }
  }
  for (const herd of herds) {
    if (!near(herd[0].x, herd[0].y, 500)) continue;
    const scared = herd.some(d => dist(d.x, d.y, P.x, P.y) < 130) || game.parties.some(p => dist(p.x, p.y, herd[0].x, herd[0].y) < 110);
    for (const d of herd) {
      if (scared && d.flee <= 0) {
        // Bolt away from whatever came too close.
        const a = Math.atan2(d.y - P.y, d.x - P.x) + rand(-0.5, 0.5);
        d.vx = Math.cos(a) * 130; d.vy = Math.sin(a) * 130; d.flee = rand(1.6, 2.6);
      }
      if (d.flee > 0) {
        d.flee -= dt;
        const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
        if (dry(nx, ny)) { d.x = nx; d.y = ny; } else { d.vx = -d.vx; d.vy = -d.vy; }
        d.flip = d.vx < 0; d.tx = d.x; d.ty = d.y; d.wait = rand(0.5, 2);
        continue;
      }
      d.walking = walkTo(d, 16, dt);
      if (d.walking) continue;
      d.wait -= dt;
      if (d.wait <= 0) {
        const tx = herd[0].x + rand(-70, 70), ty = herd[0].y + rand(-50, 50);
        if (dry(tx, ty)) { d.tx = tx; d.ty = ty; }
        d.wait = rand(2, 7); d.graze = Math.random() < 0.65;
      }
    }
  }
  for (const sh of ships) {
    sh.u = (sh.u + sh.dir * dt * 0.9 + 240) % 240;
    const i = Math.floor(sh.u), f = sh.u - i, a = shipPath[i], b = shipPath[(i + 1) % 240];
    sh.x = a.x + (b.x - a.x) * f; sh.y = a.y + (b.y - a.y) * f;
    sh.flip = (b.x - a.x) * sh.dir < 0;
  }
  const blow = weather() === 'wind' ? 46 : 14;
  for (const c of clouds) { c.x += blow * dt; if (c.x > WORLD_W + 450) { c.x = -450 - c.w; c.y = Math.random() * WORLD_H; } }
  // Birds cross the sky in small flocks.
  flockIn -= dt;
  if (flockIn <= 0 && flocks.length < 3) {
    flockIn = rand(5, 12);
    const left = Math.random() < 0.5, y = cam.y + rand(0, view.H);
    const f = { x: left ? cam.x - 60 : cam.x + view.W + 60, y, vx: (left ? 1 : -1) * rand(70, 110), vy: rand(-26, 26), birds: [] };
    for (let k = 0, n = 2 + Math.floor(Math.random() * 5); k < n; k++) f.birds.push({ dx: -Math.abs(k - n / 2) * 16 * (left ? 1 : -1) + rand(-5, 5), dy: (k - n / 2) * 14 + rand(-4, 4), ph: Math.random() * 6 });
    flocks.push(f);
  }
  for (let i = flocks.length - 1; i >= 0; i--) {
    const f = flocks[i];
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (!near(f.x, f.y, 260)) flocks.splice(i, 1);
  }
}

function quiet(s) { const st = game.sites[s.id]; return st && (st.raided > 0 || st.burned > 0); }

// Fields lie flat on the ground, so they are drawn before anything that stands up.
export function drawGroundLife(cam, t, onScreen) {
  for (const s of SETTLEMENTS) {
    const L = sites[s.id];
    if (!L || !onScreen(s.x, s.y, 420)) continue;
    for (const f of L.fields) drawField(f.x - cam.x, f.y - cam.y, f.w, f.h, t, f.h0);
  }
  // A ship's wake.
  ctx.fillStyle = 'rgba(228, 244, 238, 0.7)';
  for (const sh of ships) {
    if (!onScreen(sh.x, sh.y, 80)) continue;
    const x = sh.x - cam.x, y = sh.y - cam.y, back = sh.flip ? 1 : -1;
    for (let k = 1; k < 4; k++) ctx.fillRect(Math.round((x + back * (30 + k * 14)) / 3) * 3, Math.round((y + 4 + Math.sin(t * 3 + k) * 2) / 3) * 3, 9 - k * 2, 3);
  }
}

// Adds everything that stands on the map to the list the map sorts and draws back to front.
export function lifeThings(things, cam, t, onScreen) {
  for (const s of SETTLEMENTS) {
    const L = sites[s.id];
    if (!L || !onScreen(s.x, s.y, 700)) continue;
    const still = quiet(s);
    for (const p of L.props) {
      if (!onScreen(p.x, p.y, 80)) continue;
      things.push({ y: p.y, draw: () => { drawProp(p.name, p.x - cam.x, p.y - cam.y); if (p.mill) drawMillSails(p.x - cam.x, p.y - cam.y, still ? 0 : t); } });
    }
    for (const b of L.boats) {
      if (!onScreen(b.x, b.y, 60)) continue;
      const bx = b.x + Math.sin(t * 0.3 + b.ph) * 14, by = b.y + Math.round(Math.sin(t * 1.7 + b.ph)) * 3;
      things.push({ y: b.y, draw: () => {
        drawProp('boat', bx - cam.x, by - cam.y, b.flip);
        drawBird(bx - cam.x + Math.cos(t * 0.9 + b.ph) * 46, by - cam.y - 54 + Math.sin(t * 0.9 + b.ph) * 16, t + b.ph, true);
      } });
    }
    if (still || night > 0.6) continue;
    for (const a of L.sheep) if (onScreen(a.x, a.y, 40)) things.push({ y: a.y, draw: () => drawSheep(a.x - cam.x, a.y - cam.y, a.walking ? 1 : (a.graze ? 2 : 0), a.flip) });
    for (const f of L.folk) if (onScreen(f.x, f.y, 40)) things.push({ y: f.y, draw: () => drawFolk(f.x - cam.x, f.y - cam.y, L.people, f.k, f.walking, t + f.k, f.flip) });
  }
  for (const herd of herds) for (const d of herd) {
    if (!onScreen(d.x, d.y, 40)) continue;
    things.push({ y: d.y, draw: () => drawDeer(d.x - cam.x, d.y - cam.y, d.flee > 0 ? 2 + Math.floor(t * 9) % 2 : (d.walking ? 0 : (d.graze ? 1 : 0)), d.flip) });
  }
  for (const sh of ships) {
    if (!onScreen(sh.x, sh.y, 80)) continue;
    things.push({ y: sh.y, draw: () => {
      drawProp('ship', sh.x - cam.x, sh.y - cam.y + Math.round(Math.sin(t * 1.4 + sh.u)) * 3, sh.flip);
      drawBird(sh.x - cam.x + Math.cos(t * 0.8) * 50, sh.y - cam.y - 70 + Math.sin(t * 0.8) * 18, t, true);
    } });
  }
}

// Smoke from the chimneys of a town, or from the ruins if it has been raided.
export function siteSmoke(s, x, y, t) {
  const L = sites[s.id];
  if (!L) return;
  const seed = spotHash(s.x, s.y);
  if (quiet(s)) {
    drawSmoke(x - 20, y - 30, t, seed, true, true); drawSmoke(x + 40, y + 10, t, seed + 0.4, true, true);
    drawFlames(x - 20, y + 6, t, seed); drawFlames(x + 44, y + 30, t, seed + 0.3);
    return;
  }
  if (s.kind === 'town') for (const [dx, dy] of KEEP_SMOKE[L.people] || []) drawSmoke(x + dx, y + dy, t, seed + dx * 0.01, false, L.people === 'dwarf');
  else if (L.people === 'orc') drawSmoke(x, y - 56, t, seed, false);
}

// The darkness that falls when Gunther camps, with a pool of light round every fire and window.
let dark = null;
function drawNight(cam, P, t, onScreen) {
  const W = view.W, H = view.H, k = 4;
  if (!dark || dark.width !== Math.ceil(W / k) || dark.height !== Math.ceil(H / k)) { dark = document.createElement('canvas'); dark.width = Math.ceil(W / k); dark.height = Math.ceil(H / k); }
  const g = dark.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, dark.width, dark.height);
  g.fillStyle = 'rgba(10, 16, 44, ' + (0.62 * night) + ')';
  g.fillRect(0, 0, dark.width, dark.height);
  g.globalCompositeOperation = 'destination-out';
  const light = (wx, wy, r, power) => {
    if (!onScreen(wx, wy, r)) return;
    const x = (wx - cam.x) / k, y = (wy - cam.y) / k, rr = r / k;
    const grad = g.createRadialGradient(x, y, rr * 0.15, x, y, rr);
    grad.addColorStop(0, 'rgba(0,0,0,' + power + ')'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  };
  light(P.x + 30, P.y, 150 + Math.sin(t * 9) * 6, 0.95);
  for (const s of SETTLEMENTS) if (!quiet(s)) light(s.x, s.y + 10, s.kind === 'town' ? 190 : 130, 0.8);
  for (const p of game.parties) light(p.x, p.y - 10, 60, 0.6);
  ctx.drawImage(dark, 0, 0, dark.width * k, dark.height * k);
  // Fireflies in the warm months.
  if (season() < 2) {
    ctx.fillStyle = '#e8ff9a';
    for (let i = 0; i < 26; i++) {
      if (Math.sin(t * 2.2 + i * 1.9) < 0.2) continue;
      const wx = Math.floor(cam.x / 400) * 400 + ((i * 173.3) % (W + 400)), wy = Math.floor(cam.y / 400) * 400 + ((i * 97.7) % (H + 400));
      ctx.globalAlpha = night * 0.9;
      ctx.fillRect(Math.round(wx - cam.x + Math.sin(t * 0.7 + i) * 20), Math.round(wy - cam.y + Math.cos(t * 0.5 + i * 2) * 14), 3, 3);
    }
    ctx.globalAlpha = 1;
  }
}
export function nightAmount() { return night; }

// Everything above the ground: cloud shadows, birds, weather, and night.
export function drawSky(cam, P, t, onScreen) {
  const w = weather();
  ctx.fillStyle = 'rgba(24, 40, 60, ' + (w === 'cloud' || w === 'rain' || w === 'snow' ? 0.13 : 0.085) + ')';
  for (const c of clouds) {
    if (!onScreen(c.x + c.w / 2, c.y + c.h / 2, c.w)) continue;
    const x = c.x - cam.x, y = c.y - cam.y;
    // A cloud's shadow is three overlapping lumps, cut to the same chunky grid as the ground.
    ctx.beginPath();
    c.lumps.forEach((l, i) => ctx.ellipse(Math.round((x + c.w * (0.25 + i * 0.25)) / 6) * 6, Math.round((y + c.h * (0.4 + l * 0.2)) / 6) * 6, c.w * (0.22 + l * 0.1), c.h * (0.3 + l * 0.14), 0, 0, Math.PI * 2));
    ctx.fill();
  }
  for (const f of flocks) for (const b of f.birds) drawBird(f.x + b.dx - cam.x, f.y + b.dy - cam.y, t + b.ph, false, 46);
  drawWeather(t);
  if (night > 0.01) drawNight(cam, P, t, onScreen);
}
