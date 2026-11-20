// Battle simulation. Pure logic with a seeded random generator, so the same seed
// always plays out the same fight. The renderer only reads this state; it never changes it.
import { LAYOUTS, BATTLE_TIME } from './data.js';

export const LAND = { W: 900, H: 560 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const turn = (a, target, rate) => {
  const d = angDiff(a, target);
  return a + clamp(d, -rate, rate);
};

// Portrait screens rotate the arena a quarter turn so it fills a phone.
// The player always starts on the left (landscape) or bottom (portrait).
function rotObs(o) {
  if (o.t === 'c') return { t: 'c', x: o.y, y: LAND.W - o.x, r: o.r };
  return { t: 'r', x: o.y, y: LAND.W - o.x - o.w, w: o.h, h: o.w };
}

/**
 * teams: [[unit,...],[unit,...]] where unit = { st, tactic, color, name }
 */
export function createBattle({ teams, layout = 'pit', seed = 1, portrait = false }) {
  const W = portrait ? LAND.H : LAND.W;
  const H = portrait ? LAND.W : LAND.H;
  const obs = (LAYOUTS[layout] || []).map((o) => (portrait ? rotObs(o) : { ...o }));
  const rand = mulberry32(seed);
  const b = {
    W, H, obs, rand, t: 0, bots: [], shots: [], events: [], over: false, winner: -1,
    focus: [null, null], portrait,
  };
  let id = 0;
  teams.forEach((units, team) => {
    const n = units.length;
    units.forEach((u, i) => {
      // start positions vary a little each fight
      let x = (team === 0 ? 90 : LAND.W - 90) + (rand() - 0.5) * 70;
      let y = LAND.H / 2 + (i - (n - 1) / 2) * 120 + (rand() - 0.5) * 90;
      let a = team === 0 ? 0 : Math.PI;
      if (portrait) { const nx = y; y = LAND.W - x; x = nx; a -= Math.PI / 2; }
      const st = u.st;
      b.bots.push({
        id: id++, team, name: u.name, color: u.color, look: u.look, tactic: u.tactic || 'rush', st,
        x, y, vx: 0, vy: 0, a, ta: a, hp: st.hp, maxHp: st.hp, shield: st.shield, shieldT: 0,
        cd: st.weapons.map((w) => (rand() * 0.6) / w.rof), target: null, retarget: 0,
        alive: true, hitT: 0, side: rand() < 0.5 ? 1 : -1, dmgDone: 0, kills: 0, deadT: 0,
        // movement personality, rolled fresh every fight
        pref: 0.75 + rand() * 0.5, sway: 0.6 + rand() * 0.9, wa: rand() * Math.PI * 2,
        sideT: 1 + rand() * 2.5, jukeT: 0, jukeX: 0, jukeY: 0,
      });
    });
  });
  return b;
}

// ---------- geometry ----------
function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((cx - x1) * dx + (cy - y1) * dy) / l2, 0, 1);
  const px = x1 + dx * t - cx, py = y1 + dy * t - cy;
  return px * px + py * py < r * r;
}
function segRect(x1, y1, x2, y2, o, m) {
  const minX = o.x - m, maxX = o.x + o.w + m, minY = o.y - m, maxY = o.y + o.h + m;
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
function blocker(b, x1, y1, x2, y2, m = 2) {
  for (const o of b.obs) {
    if (o.t === 'c' ? segCircle(x1, y1, x2, y2, o.x, o.y, o.r + m) : segRect(x1, y1, x2, y2, o, m)) return o;
  }
  return null;
}
export const hasLOS = (b, x1, y1, x2, y2) => !blocker(b, x1, y1, x2, y2);
function inObs(b, x, y) {
  for (const o of b.obs) {
    if (o.t === 'c') { if ((x - o.x) ** 2 + (y - o.y) ** 2 < o.r * o.r) return true; }
    else if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return true;
  }
  return false;
}
// vector from obstacle surface to point, and its length
function obsGap(o, x, y) {
  let nx, ny, d;
  if (o.t === 'c') {
    nx = x - o.x; ny = y - o.y; const l = Math.hypot(nx, ny) || 1;
    d = l - o.r; nx /= l; ny /= l;
  } else {
    const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
    nx = x - cx; ny = y - cy; const l = Math.hypot(nx, ny);
    if (l === 0) { // centre inside the block: push out the short way
      const dl = x - o.x, dr = o.x + o.w - x, dt = y - o.y, db = o.y + o.h - y;
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) return { nx: -1, ny: 0, d: -dl };
      if (m === dr) return { nx: 1, ny: 0, d: -dr };
      if (m === dt) return { nx: 0, ny: -1, d: -dt };
      return { nx: 0, ny: 1, d: -db };
    }
    d = l; nx /= l; ny /= l;
  }
  return { nx, ny, d };
}

// ---------- combat ----------
function damage(b, t, raw, pierce, src) {
  if (!t.alive) return;
  if (t.st.shield) {
    t.shieldT = 3;
    if (t.shield > 0) {
      const ab = Math.min(t.shield, raw);
      t.shield -= ab; raw -= ab;
      if (raw <= 0) { b.events.push({ k: 'shield', x: t.x, y: t.y, r: t.st.r }); return; }
    }
  }
  const arm = t.st.arm * (1 - (pierce || 0));
  const dealt = Math.max(raw * 0.3, raw - arm);
  t.hp -= dealt;
  t.hitT = 0.12;
  if (src) src.dmgDone += dealt;
  b.events.push({ k: 'dmg', x: t.x, y: t.y - t.st.r, v: dealt, team: t.team });
  if (t.hp <= 0) {
    t.hp = 0; t.alive = false;
    if (src) src.kills++;
    b.events.push({ k: 'die', x: t.x, y: t.y, r: t.st.r, color: t.color });
  }
}

function pickTarget(b, bot) {
  let best = null, bs = Infinity;
  for (const e of b.bots) {
    if (!e.alive || e.team === bot.team) continue;
    let s = Math.hypot(e.x - bot.x, e.y - bot.y);
    if (!hasLOS(b, bot.x, bot.y, e.x, e.y)) s += 150;
    s -= (1 - e.hp / e.maxHp) * 60;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}

function fire(b, bot, w, i) {
  const t = bot.target;
  const n = bot.st.weapons.length;
  const off = (i - (n - 1) / 2) * 7;
  const ca = Math.cos(bot.ta), sa = Math.sin(bot.ta);
  const mx = bot.x + ca * (bot.st.r + 4) - sa * off;
  const my = bot.y + sa * (bot.st.r + 4) + ca * off;
  const r = b.rand;
  switch (w.kind) {
    case 'bullet':
      for (let p = 0; p < (w.pellets || 1); p++) {
        const a = bot.ta + (r() - 0.5) * 2 * w.spread;
        b.shots.push({ k: 'b', x: mx, y: my, vx: Math.cos(a) * w.pspd, vy: Math.sin(a) * w.pspd,
          dmg: w.dmg, team: bot.team, life: (w.range + 60) / w.pspd, src: bot, wk: w.key });
      }
      b.events.push({ k: 'muzzle', x: mx, y: my, a: bot.ta, wk: w.key });
      break;
    case 'melee':
      damage(b, t, w.dmg, 0, bot);
      b.events.push({ k: 'spark', x: (mx + t.x) / 2, y: (my + t.y) / 2 });
      break;
    case 'beam':
      damage(b, t, w.dmg, w.pierce, bot);
      b.events.push({ k: 'beam', x: mx, y: my, x2: t.x, y2: t.y });
      break;
    case 'shell': {
      const d = Math.hypot(t.x - mx, t.y - my);
      const T = d / w.pspd;
      let tx = t.x + t.vx * T + (r() - 0.5) * 24, ty = t.y + t.vy * T + (r() - 0.5) * 24;
      b.shots.push({ k: 's', sx: mx, sy: my, x: mx, y: my, tx, ty, t: 0, T: Math.max(0.3, T), dmg: w.dmg,
        splash: w.splash, team: bot.team, src: bot });
      b.events.push({ k: 'muzzle', x: mx, y: my, a: bot.ta, wk: w.key });
      break;
    }
    case 'missile':
      for (let p = 0; p < (w.pellets || 1); p++) {
        const a = bot.ta + (p - ((w.pellets || 1) - 1) / 2) * 0.5;
        b.shots.push({ k: 'm', x: mx, y: my, a, spd: w.pspd, dmg: w.dmg, team: bot.team, life: 2.6,
          tgt: t, src: bot });
      }
      break;
    case 'rail':
      b.shots.push({ k: 'r', x: mx, y: my, vx: ca * w.pspd, vy: sa * w.pspd, dmg: w.dmg, team: bot.team,
        life: (w.range + 80) / w.pspd, src: bot, hit: new Set(), sx: mx, sy: my });
      b.events.push({ k: 'muzzle', x: mx, y: my, a: bot.ta, wk: w.key });
      break;
  }
}

function think(b, bot, dt) {
  const st = bot.st;
  if (st.regen && bot.hp < bot.maxHp) bot.hp = Math.min(bot.maxHp, bot.hp + st.regen * dt);
  if (st.shield) {
    bot.shieldT -= dt;
    if (bot.shieldT <= 0) bot.shield = Math.min(st.shield, bot.shield + 14 * dt);
  }
  if (bot.hitT > 0) bot.hitT -= dt;

  const f = b.focus[bot.team];
  bot.retarget -= dt;
  if (f && f.alive) bot.target = f;
  else if (!bot.target || !bot.target.alive || bot.retarget <= 0) {
    bot.target = pickTarget(b, bot);
    bot.retarget = 0.5 + b.rand() * 0.6;
  }
  const t = bot.target;
  let mx = 0, my = 0;
  let aimA = bot.ta, edge = Infinity, los = false;

  if (t) {
    const dx = t.x - bot.x, dy = t.y - bot.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    edge = d - st.r - t.st.r;
    los = hasLOS(b, bot.x, bot.y, t.x, t.y);
    const minNeed = Math.max(0, ...st.weapons.map((w) => w.min || 0));
    let want;
    if (bot.tactic === 'range') want = Math.max(minNeed + 10, st.minRange * Math.min(0.95, 0.85 * bot.pref));
    else if (bot.tactic === 'flank') want = Math.max(minNeed + 10, st.minRange * 0.7 * bot.pref);
    else want = Math.max(minNeed + 10, st.minRange * 0.45 * bot.pref);
    // now and then switch strafe direction
    bot.sideT -= dt;
    if (bot.sideT <= 0) { if (b.rand() < 0.45) bot.side = -bot.side; bot.sideT = 1.2 + b.rand() * 2.8; }
    const px = -uy * bot.side, py = ux * bot.side;
    if (!los) {
      mx += ux; my += uy;
      const o = blocker(b, bot.x, bot.y, t.x, t.y);
      if (o) {
        const ox = o.t === 'c' ? o.x : o.x + o.w / 2, oy = o.t === 'c' ? o.y : o.y + o.h / 2;
        let qx = -uy, qy = ux;
        if (qx * (ox - bot.x) + qy * (oy - bot.y) > 0) { qx = -qx; qy = -qy; }
        mx += qx * 1.1; my += qy * 1.1;
      }
    } else {
      let strafe = (bot.tactic === 'flank' ? 0.9 : bot.tactic === 'range' ? 0.35 : 0.2) * bot.sway;
      if (edge > want) { mx += ux; my += uy; }
      else if (edge < minNeed || (bot.tactic !== 'rush' && edge < want * 0.6)) { mx -= ux; my -= uy; }
      else strafe *= 1.4;
      mx += px * strafe; my += py * strafe;
    }
    // aim with lead for travelling shots
    const w0 = st.weapons[0];
    const lead = w0.pspd && w0.kind !== 'shell' ? d / w0.pspd : 0;
    aimA = Math.atan2(t.y + t.vy * lead - bot.y, t.x + t.vx * lead - bot.x);
  }

  // random wander, plus the odd sideways juke
  bot.wa += (b.rand() - 0.5) * 6 * dt;
  const wk = los ? 0.45 : 0.2;
  mx += Math.cos(bot.wa) * wk; my += Math.sin(bot.wa) * wk;
  if (bot.jukeT > 0) { bot.jukeT -= dt; mx += bot.jukeX; my += bot.jukeY; }
  else if (t && los && b.rand() < dt * 0.3) {
    const s2 = b.rand() < 0.5 ? 1 : -1;
    const ang = Math.atan2(t.y - bot.y, t.x - bot.x) + s2 * (Math.PI / 2) + (b.rand() - 0.5) * 0.8;
    bot.jukeT = 0.35 + b.rand() * 0.45; bot.jukeX = Math.cos(ang) * 1.6; bot.jukeY = Math.sin(ang) * 1.6;
  }

  // keep clear of obstacles, walls and other bots
  for (const o of b.obs) {
    const g = obsGap(o, bot.x, bot.y);
    const s = g.d - st.r;
    if (s < 34) { const k = (34 - s) / 34; mx += g.nx * k * 1.3; my += g.ny * k * 1.3; }
  }
  const wm = 40;
  if (bot.x < wm + st.r) mx += (wm + st.r - bot.x) / wm;
  if (bot.x > b.W - wm - st.r) mx -= (bot.x - (b.W - wm - st.r)) / wm;
  if (bot.y < wm + st.r) my += (wm + st.r - bot.y) / wm;
  if (bot.y > b.H - wm - st.r) my -= (bot.y - (b.H - wm - st.r)) / wm;
  for (const o of b.bots) {
    if (o === bot || !o.alive) continue;
    const dx = bot.x - o.x, dy = bot.y - o.y, d = Math.hypot(dx, dy) || 1;
    const m = st.r + o.st.r + 12;
    if (d < m) { const k = ((m - d) / m) * (o.team === bot.team ? 1.4 : 0.6); mx += (dx / d) * k; my += (dy / d) * k; }
  }

  const ml = Math.hypot(mx, my);
  const sp = st.spd;
  const tvx = ml > 0.05 ? (mx / ml) * sp * Math.min(1, ml) : 0;
  const tvy = ml > 0.05 ? (my / ml) * sp * Math.min(1, ml) : 0;
  const acc = Math.min(1, dt * 5);
  bot.vx += (tvx - bot.vx) * acc;
  bot.vy += (tvy - bot.vy) * acc;
  if (Math.hypot(bot.vx, bot.vy) > 6) bot.a = turn(bot.a, Math.atan2(bot.vy, bot.vx), 6 * dt);
  bot.ta = turn(bot.ta, aimA, 5 * dt);

  if (!t) return;
  const aligned = Math.abs(angDiff(bot.ta, aimA));
  st.weapons.forEach((w, i) => {
    bot.cd[i] -= dt;
    if (bot.cd[i] > 0) return;
    if (edge > w.range || edge < (w.min || 0) - 20) return;
    if (aligned > (w.kind === 'melee' ? 0.7 : w.kind === 'missile' ? 0.5 : 0.2)) return;
    if (!los && w.kind !== 'shell' && w.kind !== 'missile') return;
    fire(b, bot, w, i);
    bot.cd[i] = 1 / w.rof;
  });
}

function moveBot(b, bot, dt) {
  bot.x += bot.vx * dt;
  bot.y += bot.vy * dt;
  const r = bot.st.r;
  for (const o of b.obs) {
    const g = obsGap(o, bot.x, bot.y);
    if (g.d < r) { bot.x += g.nx * (r - g.d); bot.y += g.ny * (r - g.d); }
  }
  bot.x = clamp(bot.x, r + 4, b.W - r - 4);
  bot.y = clamp(bot.y, r + 4, b.H - r - 4);
}

function hitBot(b, shot, x1, y1, x2, y2, skip) {
  for (const e of b.bots) {
    if (!e.alive || e.team === shot.team || (skip && skip.has(e))) continue;
    if (segCircle(x1, y1, x2, y2, e.x, e.y, e.st.r + 2)) return e;
  }
  return null;
}

function updateShots(b, dt) {
  const keep = [];
  for (const s of b.shots) {
    s.life -= dt;
    if (s.k === 'b' || s.k === 'r') {
      const x1 = s.x, y1 = s.y;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.k === 'r') {
        let e;
        while ((e = hitBot(b, s, x1, y1, s.x, s.y, s.hit))) { s.hit.add(e); damage(b, e, s.dmg, 0.5, s.src); }
      } else {
        const e = hitBot(b, s, x1, y1, s.x, s.y);
        if (e) { damage(b, e, s.dmg, 0, s.src); b.events.push({ k: 'hit', x: s.x, y: s.y }); continue; }
      }
      if (blocker(b, x1, y1, s.x, s.y, 0)) { b.events.push({ k: 'hit', x: s.x, y: s.y }); continue; }
      if (s.life <= 0 || s.x < 0 || s.y < 0 || s.x > b.W || s.y > b.H) continue;
      keep.push(s);
    } else if (s.k === 'm') {
      if (s.tgt && s.tgt.alive) s.a = turn(s.a, Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x), 3.2 * dt);
      const x1 = s.x, y1 = s.y;
      s.x += Math.cos(s.a) * s.spd * dt; s.y += Math.sin(s.a) * s.spd * dt;
      const e = hitBot(b, s, x1, y1, s.x, s.y);
      if (e) { damage(b, e, s.dmg, 0, s.src); b.events.push({ k: 'boom', x: s.x, y: s.y, r: 14 }); continue; }
      if (inObs(b, s.x, s.y) || s.life <= 0) { b.events.push({ k: 'boom', x: s.x, y: s.y, r: 10 }); continue; }
      keep.push(s);
    } else if (s.k === 's') {
      s.t += dt;
      const f = Math.min(1, s.t / s.T);
      s.x = s.sx + (s.tx - s.sx) * f; s.y = s.sy + (s.ty - s.sy) * f;
      s.h = Math.sin(f * Math.PI) * Math.min(60, s.T * 50);
      if (f >= 1) {
        for (const e of b.bots) {
          if (!e.alive || e.team === s.team) continue;
          const d = Math.hypot(e.x - s.tx, e.y - s.ty) - e.st.r;
          if (d < s.splash) damage(b, e, s.dmg * (1 - 0.5 * Math.max(0, d) / s.splash), 0, s.src);
        }
        b.events.push({ k: 'boom', x: s.tx, y: s.ty, r: s.splash });
        continue;
      }
      keep.push(s);
    }
  }
  b.shots = keep;
}

export function step(b, dt) {
  if (b.over) return;
  b.t += dt;
  for (const bot of b.bots) if (bot.alive) think(b, bot, dt);
  for (const bot of b.bots) {
    if (bot.alive) moveBot(b, bot, dt);
    else bot.deadT += dt;
  }
  // bots push each other apart
  const L = b.bots;
  for (let i = 0; i < L.length; i++) {
    const p = L[i]; if (!p.alive) continue;
    for (let j = i + 1; j < L.length; j++) {
      const q = L[j]; if (!q.alive) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
      const m = p.st.r + q.st.r;
      if (d < m) { const k = (m - d) / 2; p.x -= (dx / d) * k; p.y -= (dy / d) * k; q.x += (dx / d) * k; q.y += (dy / d) * k; }
    }
  }
  updateShots(b, dt);

  const alive = [0, 0], frac = [0, 0], tot = [0, 0];
  for (const bot of L) {
    if (bot.alive) alive[bot.team]++;
    frac[bot.team] += Math.max(0, bot.hp); tot[bot.team] += bot.maxHp;
  }
  if (!alive[0] || !alive[1]) { b.over = true; b.winner = alive[0] ? 0 : 1; }
  else if (b.t >= BATTLE_TIME) { b.over = true; b.timeout = true; b.winner = frac[0] / tot[0] > frac[1] / tot[1] ? 0 : 1; }
}

// Runs a whole fight without drawing. Used by the balance tool.
export function runHeadless(opts, dt = 1 / 60) {
  const b = createBattle(opts);
  while (!b.over) { step(b, dt); b.events.length = 0; }
  return b;
}
