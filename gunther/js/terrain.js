// The island of Aldmoor: its coastline, roads, forests and hills.
// The whole map is worked out once at start into a grid, so asking "what ground is here?"
// is a quick lookup instead of maths every frame.

import { noise, seeded, dist } from './core.js';
import { WORLD_W, WORLD_H, SETTLEMENTS, ROADS, FACTIONS } from './data.js';

export const PX = 3;                       // one terrain pixel = 3 world pixels, same chunkiness as the sprites
const GW = WORLD_W / PX, GH = WORLD_H / PX;
export const ISLAND = { x: 1800, y: 1250, rx: 1660, ry: 1060 };

// Ground types stored in the grid.
export const T = { SEA: 0, SHALLOW: 1, BEACH: 2, GRASS: 3, FOREST: 4, HILLS: 5, ROAD: 6 };
// How fast parties move on each ground type.
const SPEED = [0, 0, 0.85, 1, 0.72, 0.78, 1.18];
export const TERRAIN_NAME = ['sea', 'shallows', 'beach', 'grassland', 'forest', 'hills', 'road'];

let grid = null;
export let terrainCanvas = null;
export const decor = [];                   // trees, rocks and houses, sorted top to bottom
export const waves = [];                   // spots where little wave glints appear

// How far a point is from the island's centre: under 1 is land, over 1 is sea.
export function shoreValue(x, y) {
  const dx = (x - ISLAND.x) / ISLAND.rx;
  const dy = (y - ISLAND.y) / ISLAND.ry;
  const angle = Math.atan2(dy, dx);
  const wobble = 0.08 * Math.sin(angle * 3 + 0.6) + 0.06 * Math.sin(angle * 5 + 2.1) +
    0.2 * (noise(x / 340, y / 340) - 0.5) + 0.07 * (noise(x / 110 + 17, y / 110 + 5) - 0.5);
  return Math.hypot(dx, dy) - wobble;
}

// Forests grow where this noise is high. Hills are mostly in the north.
function forestValue(x, y) { return noise(x / 260 + 9, y / 260 + 3); }
function hillValue(x, y) { return noise(x / 300 + 21, y / 300 + 30) * 0.7 + (1000 - y) / 1500; }

export function terrainAt(x, y) {
  if (!grid || x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return T.SEA;
  return grid[Math.floor(y / PX) * GW + Math.floor(x / PX)];
}
export function isLand(x, y) { return terrainAt(x, y) >= T.BEACH; }
export function speedAt(x, y) { return SPEED[terrainAt(x, y)]; }

// Roads are gentle curves between settlements, worked out from the list in data.js.
const byId = id => SETTLEMENTS.find(s => s.id === id);
export const roadLines = ROADS.map(([a, b], k) => {
  const A = byId(a), B = byId(b), r = seeded(100 + k);
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const nx = -(B.y - A.y), ny = B.x - A.x, nl = Math.hypot(nx, ny);
  const bend = (r() - 0.5) * 0.35 * nl;
  const C = { x: mx + nx / nl * bend, y: my + ny / nl * bend };
  const pts = [];
  const n = Math.ceil(dist(A.x, A.y, B.x, B.y) / 12);
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({ x: u * u * A.x + 2 * u * t * C.x + t * t * B.x, y: u * u * A.y + 2 * u * t * C.y + t * t * B.y });
  }
  return pts;
});

export function buildTerrain() {
  grid = new Uint8Array(GW * GH);
  const rnd = seeded(11);
  // 1. Ground type for every terrain pixel.
  for (let py = 0; py < GH; py++) {
    for (let px = 0; px < GW; px++) {
      const x = px * PX + 1, y = py * PX + 1;
      const v = shoreValue(x, y);
      let t;
      if (v > 1.12) t = T.SEA;
      else if (v > 1.0) t = T.SHALLOW;
      else if (v > 0.965) t = T.BEACH;
      else if (hillValue(x, y) > 0.78) t = T.HILLS;
      else if (forestValue(x, y) > 0.6) t = T.FOREST;
      else t = T.GRASS;
      grid[py * GW + px] = t;
    }
  }
  // 2. Stamp the roads on top.
  for (const line of roadLines) {
    for (const p of line) {
      const cx = Math.floor(p.x / PX), cy = Math.floor(p.y / PX);
      for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
        if (i * i + j * j > 26) continue;
        const k = (cy + j) * GW + (cx + i);
        if (grid[k] >= T.BEACH) grid[k] = T.ROAD;
      }
    }
  }
  // 3. Paint the picture.
  terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = GW; terrainCanvas.height = GH;
  const tctx = terrainCanvas.getContext('2d');
  const data = tctx.createImageData(GW, GH);
  const DEEP = [46, 128, 160], MID = [58, 156, 176], SHALLOW = [96, 190, 186], FOAM = [214, 238, 226];
  const SAND = [232, 214, 150], SAND_DARK = [214, 192, 128];
  const GRASS = [[188, 212, 88], [174, 204, 80], [158, 194, 76]], TUFT = [206, 228, 112];
  const FOREST = [[132, 178, 70], [120, 168, 66]], HILLS = [[178, 186, 120], [162, 170, 110], [196, 198, 140]];
  const DIRT = [196, 160, 104], DIRT_EDGE = [178, 170, 92];
  for (let py = 0; py < GH; py++) {
    for (let px = 0; px < GW; px++) {
      const x = px * PX + 1, y = py * PX + 1, k = py * GW + px, t = grid[k];
      let c;
      if (t === T.SEA) { const v = shoreValue(x, y); c = v < 1.25 ? MID : DEEP; }
      else if (t === T.SHALLOW) c = shoreValue(x, y) < 1.02 ? FOAM : SHALLOW;
      else if (t === T.BEACH) c = shoreValue(x, y) > 0.99 ? SAND_DARK : SAND;
      else if (t === T.ROAD) {
        const edge = grid[k - 1] !== T.ROAD || grid[k + 1] !== T.ROAD || grid[k - GW] !== T.ROAD || grid[k + GW] !== T.ROAD;
        c = edge ? DIRT_EDGE : DIRT;
      } else if (t === T.HILLS) {
        const s = noise(x / 90 + 5, y / 90 + 5);
        c = s < 0.35 ? HILLS[1] : (s > 0.7 ? HILLS[2] : HILLS[0]);
        if (rnd() < 0.01) c = [140, 146, 104];
      } else if (t === T.FOREST) c = noise(x / 120, y / 120) < 0.5 ? FOREST[1] : FOREST[0];
      else {
        const s = noise(x / 150 + 40, y / 150 + 40);
        c = s < 0.4 ? GRASS[2] : (s < 0.62 ? GRASS[1] : GRASS[0]);
        if (rnd() < 0.012) c = TUFT;
      }
      const i = k * 4;
      data.data[i] = c[0]; data.data[i + 1] = c[1]; data.data[i + 2] = c[2]; data.data[i + 3] = 255;
    }
  }
  tctx.putImageData(data, 0, 0);

  // 4. Wave glints in the shallows.
  const wr = seeded(5);
  for (let k = 0; k < 4000 && waves.length < 420; k++) {
    const x = wr() * WORLD_W, y = wr() * WORLD_H, v = shoreValue(x, y);
    if (v > 1.05 && v < 1.5) waves.push({ x, y, phase: wr() * Math.PI * 2 });
  }

  // 5. Trees in forests, rocks on hills, houses around settlements.
  const tr = seeded(7);
  for (let y = 30; y < WORLD_H; y += 30) {
    for (let x = 30; x < WORLD_W; x += 30) {
      const jx = x + (tr() - 0.5) * 22, jy = y + (tr() - 0.5) * 22;
      const t = terrainAt(jx, jy), r = tr();
      if (t < T.GRASS || t === T.ROAD) continue;
      if (terrainAt(jx, jy + 20) === T.ROAD || terrainAt(jx, jy - 20) === T.ROAD) continue;
      if (SETTLEMENTS.some(s => dist(jx, jy, s.x, s.y) < 130)) continue;
      // Kinds of tree: 0 pine, 1 oak, 2 birch, 3 the silver trees of the elf woods. Pines keep to
      // the north and the hills, and each wood is mostly one kind.
      const elfWood = SETTLEMENTS.some(s => (s.race || FACTIONS[s.faction].race) === 'elf' && dist(jx, jy, s.x, s.y) < 520);
      const mix = noise(jx / 420 + 60, jy / 420 + 12) + (900 - jy) / 2600;
      const kind = elfWood && tr() < 0.7 ? 3 : (mix > 0.62 ? (tr() < 0.8 ? 0 : 2) : (mix > 0.4 ? (tr() < 0.75 ? 1 : 2) : (tr() < 0.6 ? 2 : 1)));
      const h = tr();
      if (t === T.FOREST && r < 0.72) decor.push({ x: jx, y: jy, kind: 'tree', v: kind, h });
      else if (t === T.GRASS && r < 0.02) decor.push({ x: jx, y: jy, kind: 'tree', v: kind === 0 ? 1 : kind, h });
      else if (t === T.HILLS && r < 0.07) decor.push({ x: jx, y: jy, kind: 'rock', v: Math.floor(tr() * 3), h });
      else if (t === T.HILLS && r < 0.1) decor.push({ x: jx, y: jy, kind: 'tree', v: 0, h });
    }
  }
  for (const s of SETTLEMENTS) {
    if (s.kind !== 'town' && s.kind !== 'village') continue;
    const spots = s.kind === 'town' ? [[-104, 0], [104, -4], [-84, 66], [88, 64]] : [[-50, -8], [48, -12], [-40, 46], [44, 42]];
    spots.forEach(([dx, dy], k) => decor.push({ x: s.x + dx, y: s.y + dy, kind: 'house', v: (k + s.x) % 3, row: s.kind === 'village' ? 1 : 0, site: s, h: ((k * 37 + s.x) % 100) / 100 }));
  }
  decor.sort((a, b) => a.y - b.y);
}

// The same island in each season. Summer is the picture painted above; the others are made from it
// the first time they are needed: flowers in spring, yellowing grass in autumn, snow in winter.
const looks = {};
export function terrainLook(season) {
  if (season === 1 || !terrainCanvas) return terrainCanvas;
  if (looks[season]) return looks[season];
  const c = document.createElement('canvas');
  c.width = GW; c.height = GH;
  const g = c.getContext('2d');
  g.drawImage(terrainCanvas, 0, 0);
  const img = g.getImageData(0, 0, GW, GH), d = img.data, rnd = seeded(90 + season);
  const FLOWERS = [[250, 240, 250], [255, 214, 232], [250, 226, 120]];
  for (let k = 0; k < GW * GH; k++) {
    const t = grid[k], i = k * 4;
    if (t < T.BEACH) continue;
    let to = null, f = 0;
    if (season === 0) { if (t !== T.ROAD && t !== T.BEACH && rnd() < 0.012) { to = FLOWERS[Math.floor(rnd() * 3)]; f = 1; } else if (t === T.GRASS || t === T.FOREST) { to = [200, 232, 110]; f = 0.18; } }
    else if (season === 2) { if (t === T.GRASS || t === T.FOREST || t === T.HILLS) { to = [206, 178, 84]; f = t === T.FOREST ? 0.42 : 0.34; if (t === T.FOREST && rnd() < 0.03) { to = [214, 120, 48]; f = 0.8; } } }
    else { to = [238, 243, 247]; f = t === T.ROAD ? 0.38 : (t === T.BEACH ? 0.3 : 0.74 + (rnd() < 0.04 ? 0.2 : 0)); if (t === T.FOREST) f -= 0.08; }
    if (!to) continue;
    d[i] += (to[0] - d[i]) * f; d[i + 1] += (to[1] - d[i + 1]) * f; d[i + 2] += (to[2] - d[i + 2]) * f;
  }
  g.putImageData(img, 0, 0);
  return (looks[season] = c);
}

// Finds the nearest land spot to (x, y), searching outwards. Used to keep parties on the island.
export function nearestLand(x, y) {
  if (isLand(x, y)) return { x, y };
  for (let r = 20; r < 1200; r += 20) {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
      if (isLand(nx, ny) && terrainAt(nx, ny) !== T.BEACH) return { x: nx, y: ny };
    }
  }
  return { x: ISLAND.x, y: ISLAND.y };
}
