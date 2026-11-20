// All art is drawn with canvas code: no image files.
import { FRAMES } from './data.js';

const TAU = Math.PI * 2;

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function poly(ctx, n, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU + (n === 4 ? Math.PI / 4 : 0);
    const x = Math.cos(a) * r, y = Math.sin(a) * r * (n === 4 ? 0.9 : 1);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

const PLATE_STYLE = {
  tin: { c: '#8d939b', w: 2 },
  steel: { c: '#b9c2cc', w: 3 },
  ceramite: { c: '#ece7da', w: 3.5, inner: true },
  bastion: { c: '#d9a441', w: 4.5, rivets: true },
};

export function drawDrive(ctx, key, r, t, moving = 1) {
  ctx.save();
  if (key === 'rollers') {
    ctx.fillStyle = '#1b1d21';
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.fillRect(sx * r * 0.6 - r * 0.28, sy * r * 0.82 - r * 0.15, r * 0.56, r * 0.3);
    }
    ctx.fillStyle = '#4a4f57';
    const k = (t * 12 * moving) % 1;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) ctx.fillRect(sx * r * 0.6 - r * 0.28 + k * r * 0.4, sy * r * 0.82 - r * 0.15, 2, r * 0.3);
  } else if (key === 'treads') {
    for (const sy of [-1, 1]) {
      ctx.fillStyle = '#17181b';
      ctx.fillRect(-r * 1.05, sy * r * 0.82 - r * 0.24, r * 2.1, r * 0.48);
      ctx.fillStyle = '#3d4249';
      const off = ((t * 30 * moving) % 6);
      for (let x = -r * 1.05 + off; x < r * 1.05; x += 6) ctx.fillRect(x, sy * r * 0.82 - r * 0.24, 2, r * 0.48);
    }
  } else if (key === 'hover') {
    const p = 0.75 + Math.sin(t * 14) * 0.15;
    const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.45);
    g.addColorStop(0, `rgba(90,220,255,${0.55 * p})`);
    g.addColorStop(1, 'rgba(90,220,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2b6f86'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 0, TAU); ctx.stroke();
  } else if (key === 'strider') {
    ctx.strokeStyle = '#2a2d33'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const sw = Math.sin(t * 10 * moving + i * Math.PI) * 0.35 * moving;
      const fx = Math.cos(a + sw) * r * 1.35, fy = Math.sin(a + sw) * r * 1.35;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = '#4a4f57'; ctx.beginPath(); ctx.arc(fx, fy, 3, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

export function drawWeapon(ctx, key, r, t, firing = 0) {
  ctx.save();
  ctx.lineCap = 'butt';
  if (key === 'rivet') {
    ctx.fillStyle = '#cfd3d8'; ctx.fillRect(0, -1.6, r + 6, 3.2);
    ctx.fillStyle = '#6b7079'; ctx.fillRect(r + 2, -2.2, 4, 4.4);
  } else if (key === 'scatter') {
    ctx.fillStyle = '#9aa1aa'; ctx.fillRect(0, -3.5, r + 1, 7);
    ctx.fillStyle = '#5b6068';
    ctx.beginPath(); ctx.moveTo(r + 1, -3.5); ctx.lineTo(r + 6, -5.5); ctx.lineTo(r + 6, 5.5); ctx.lineTo(r + 1, 3.5); ctx.fill();
  } else if (key === 'grinder') {
    ctx.fillStyle = '#6b7079'; ctx.fillRect(0, -2, r + 1, 4);
    ctx.translate(r + 5, 0); ctx.rotate(t * 25);
    ctx.fillStyle = '#d6dade';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; const rr = i % 2 ? 5 : 7.5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.fill();
    ctx.fillStyle = '#3a3d43'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
  } else if (key === 'arc') {
    ctx.strokeStyle = '#c7b8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(r + 8, -3.5); ctx.moveTo(0, 3); ctx.lineTo(r + 8, 3.5); ctx.stroke();
    ctx.fillStyle = `rgba(170,140,255,${0.5 + Math.sin(t * 20) * 0.3})`;
    ctx.fillRect(r * 0.5, -2, r * 0.5 + 8, 4);
  } else if (key === 'lobber') {
    ctx.fillStyle = '#5d636c'; ctx.fillRect(-2, -4.5, r + 2, 9);
    ctx.fillStyle = '#2b2e33'; ctx.fillRect(r - 2, -5.5, 3, 11);
  } else if (key === 'swarm') {
    ctx.fillStyle = '#6a707a'; ctx.fillRect(-2, -6, 12, 12);
    ctx.fillStyle = '#e5484d';
    for (const [x, y] of [[5, -3], [5, 3], [9, -3], [9, 3]]) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); }
  } else if (key === 'rail') {
    ctx.fillStyle = '#a5adb7'; ctx.fillRect(0, -3.5, r + 14, 2); ctx.fillRect(0, 1.5, r + 14, 2);
    ctx.fillStyle = `rgba(80,230,255,${0.6 + firing * 0.4})`; ctx.fillRect(2, -1, r + 10, 2);
  }
  ctx.restore();
}

export function drawModule(ctx, key, r, t) {
  ctx.save();
  ctx.translate(-r * 0.5, 0);
  if (key === 'patch') {
    ctx.fillStyle = '#e9ecef'; ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#3fbf5f'; ctx.fillRect(-1, -3, 2, 6); ctx.fillRect(-3, -1, 6, 2);
  } else if (key === 'barrier') {
    ctx.strokeStyle = '#6cc4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.stroke();
  } else if (key === 'overclock') {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.moveTo(1, -5); ctx.lineTo(-3, 1); ctx.lineTo(0, 1); ctx.lineTo(-1, 5); ctx.lineTo(3, -1); ctx.lineTo(0, -1); ctx.fill();
  } else if (key === 'booster') {
    const f = 0.7 + Math.sin(t * 30) * 0.3;
    ctx.fillStyle = '#ff9a3c';
    for (const y of [-4, 4]) { ctx.beginPath(); ctx.moveTo(-r * 0.4, y - 2); ctx.lineTo(-r * 0.4 - 8 * f, y); ctx.lineTo(-r * 0.4, y + 2); ctx.fill(); }
    ctx.fillStyle = '#4a4f57'; ctx.fillRect(-r * 0.4, -6, 4, 4); ctx.fillRect(-r * 0.4, 2, 4, 4);
  }
  ctx.restore();
}

function drawHull(ctx, look, r, dead) {
  const F = FRAMES[look.frame];
  const base = dead ? '#3a3c40' : look.color;
  poly(ctx, F.shape, r);
  ctx.fillStyle = dead ? '#2a2c30' : shade(base, -0.35);
  ctx.fill();
  const ps = look.plate ? PLATE_STYLE[look.plate] : null;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ps ? (dead ? '#555' : ps.c) : '#0c0d0f';
  ctx.lineWidth = ps ? ps.w : 1.2;
  ctx.stroke();
  if (ps && ps.inner) { poly(ctx, F.shape, r - 4); ctx.lineWidth = 1; ctx.stroke(); }
  if (ps && ps.rivets) {
    ctx.fillStyle = '#5a4316';
    for (let i = 0; i < F.shape; i++) {
      const a = (i / F.shape) * TAU + (F.shape === 4 ? Math.PI / 4 : 0);
      ctx.beginPath(); ctx.arc(Math.cos(a) * (r - 1), Math.sin(a) * (r - 1) * (F.shape === 4 ? 0.9 : 1), 1.4, 0, TAU); ctx.fill();
    }
  }
  poly(ctx, F.shape, r * 0.62);
  ctx.fillStyle = dead ? '#34363a' : base;
  ctx.fill();
  // front marker
  ctx.fillStyle = dead ? '#222' : 'rgba(0,0,0,0.35)';
  ctx.fillRect(r * 0.35, -1.5, r * 0.4, 3);
}

/**
 * look: { frame, drive, weapons:[key], plate, module, color }
 * a = body angle, ta = turret angle (both world space)
 */
export function drawBot(ctx, look, x, y, a, ta, t, o = {}) {
  const r = FRAMES[look.frame].r;
  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  ctx.rotate(a);
  if (look.drive && !o.dead) drawDrive(ctx, look.drive, r, t, o.moving ?? 1);
  drawHull(ctx, look, r, o.dead);
  if (look.module && !o.dead) drawModule(ctx, look.module, r, t);
  ctx.restore();
  if (!o.dead) {
    ctx.rotate(ta);
    const n = look.weapons.length;
    look.weapons.forEach((k, i) => {
      ctx.save(); ctx.translate(0, (i - (n - 1) / 2) * 7); drawWeapon(ctx, k, r, t, o.firing || 0); ctx.restore();
    });
    ctx.fillStyle = '#2c3036';
    ctx.beginPath(); ctx.arc(0, 0, Math.max(5, r * 0.36), 0, TAU); ctx.fill();
    ctx.fillStyle = shade(look.color, 0.25);
    ctx.beginPath(); ctx.arc(0, 0, Math.max(2.5, r * 0.16), 0, TAU); ctx.fill();
  }
  if (o.hit > 0) {
    ctx.globalAlpha = Math.min(1, o.hit * 6) * 0.7;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ---------- icons and thumbnails (cached data URLs) ----------
const cache = new Map();
function toURL(size, fn) {
  const c = document.createElement('canvas');
  const d = 2;
  c.width = c.height = size * d;
  const ctx = c.getContext('2d');
  ctx.scale(d, d);
  fn(ctx);
  return c.toDataURL();
}

export function partIcon(cat, key) {
  const id = cat + ':' + key;
  if (cache.has(id)) return cache.get(id);
  const url = toURL(40, (ctx) => {
    ctx.translate(20, 20);
    if (cat === 'frame') {
      ctx.scale(1.1, 1.1);
      drawBot(ctx, { frame: key, weapons: [], color: '#f2a33a' }, 0, 0, -Math.PI / 2, 0, 0, { dead: false });
    } else if (cat === 'drive') { ctx.rotate(-Math.PI / 4); drawDrive(ctx, key, 12, 0.2, 0); ctx.fillStyle = '#3a3e45'; ctx.fillRect(-7, -7, 14, 14); }
    else if (cat === 'weapon') { ctx.rotate(-Math.PI / 4); ctx.scale(1.25, 1.25); ctx.translate(-12, 0); drawWeapon(ctx, key, 14, 0.1); ctx.fillStyle = '#2c3036'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); }
    else if (cat === 'plate') {
      const ps = PLATE_STYLE[key];
      poly(ctx, 6, 13); ctx.fillStyle = '#2b2f35'; ctx.fill(); ctx.strokeStyle = ps.c; ctx.lineWidth = ps.w + 1; ctx.stroke();
      if (ps.inner) { poly(ctx, 6, 8); ctx.lineWidth = 1.5; ctx.stroke(); }
      if (ps.rivets) { ctx.fillStyle = '#5a4316'; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 1.6, 0, TAU); ctx.fill(); } }
    } else if (cat === 'module') { ctx.scale(2.2, 2.2); ctx.translate(5, 0); drawModule(ctx, key, 10, 0.1); }
  });
  cache.set(id, url);
  return url;
}

export function botThumb(look, size = 64) {
  return toURL(size, (ctx) => {
    ctx.translate(size / 2, size / 2);
    const s = (size * 0.32) / FRAMES[look.frame].r;
    ctx.scale(s, s);
    drawBot(ctx, look, 0, 0, -Math.PI / 2, -Math.PI / 2, 0.3, { moving: 0 });
  });
}

// ---------- battle view ----------
export function createView(canvas) {
  return { canvas, ctx: canvas.getContext('2d'), parts: [], floats: [], shake: 0, scale: 1, ox: 0, oy: 0, beams: [], floor: null };
}

function floorPattern(b) {
  const c = document.createElement('canvas');
  c.width = b.W; c.height = b.H;
  const g = c.getContext('2d');
  g.fillStyle = '#23262b'; g.fillRect(0, 0, b.W, b.H);
  // plates
  g.strokeStyle = '#2c3036'; g.lineWidth = 1;
  for (let x = 0; x <= b.W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, b.H); g.stroke(); }
  for (let y = 0; y <= b.H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(b.W, y); g.stroke(); }
  // scuffs from a fixed pseudo random sequence
  let s = 9;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(0,0,0,${0.1 + r() * 0.15})`;
    g.lineWidth = 1 + r() * 3;
    const x = r() * b.W, y = r() * b.H, a = r() * TAU, l = 10 + r() * 50;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // centre ring
  g.strokeStyle = 'rgba(242,163,58,0.18)'; g.lineWidth = 3;
  g.beginPath(); g.arc(b.W / 2, b.H / 2, 70, 0, TAU); g.stroke();
  // hazard border
  g.save();
  g.beginPath(); g.rect(0, 0, b.W, b.H); g.rect(8, 8, b.W - 16, b.H - 16); g.clip('evenodd');
  g.fillStyle = '#1a1b1e'; g.fillRect(0, 0, b.W, b.H);
  g.fillStyle = '#c98a2c';
  for (let i = -b.H; i < b.W + b.H; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 11, 0); g.lineTo(i + 11 - b.H, b.H); g.lineTo(i - b.H, b.H); g.fill(); }
  g.restore();
  // obstacles
  for (const o of b.obs) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
    if (o.t === 'c') {
      g.fillStyle = '#4a4f57'; g.beginPath(); g.arc(o.x, o.y, o.r, 0, TAU); g.fill();
      g.shadowColor = 'transparent';
      g.fillStyle = '#5c626b'; g.beginPath(); g.arc(o.x, o.y, o.r * 0.72, 0, TAU); g.fill();
      g.strokeStyle = '#2f3237'; g.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.beginPath(); g.arc(o.x + Math.cos(a) * o.r * 0.86, o.y + Math.sin(a) * o.r * 0.86, 1.6, 0, TAU); g.stroke(); }
    } else {
      g.fillStyle = '#4a4f57'; g.fillRect(o.x, o.y, o.w, o.h);
      g.shadowColor = 'transparent';
      g.fillStyle = '#565c65'; g.fillRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
      g.strokeStyle = '#3a3e45'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(o.x + 4, o.y + 4); g.lineTo(o.x + o.w - 4, o.y + o.h - 4); g.moveTo(o.x + o.w - 4, o.y + 4); g.lineTo(o.x + 4, o.y + o.h - 4); g.stroke();
    }
    g.restore();
  }
  return c;
}

// Camera: frames the living bots, zooming in when they are close together.
export function fitView(v, b, dt = 0) {
  const c = v.canvas;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  v.dpr = dpr;
  const fit = Math.min(w / b.W, h / b.H);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const bot of b.bots) {
    if (!bot.alive) continue;
    x0 = Math.min(x0, bot.x); y0 = Math.min(y0, bot.y); x1 = Math.max(x1, bot.x); y1 = Math.max(y1, bot.y);
  }
  let tz = fit, tx = b.W / 2, ty = b.H / 2;
  if (x0 !== Infinity) {
    const pad = 150;
    tz = Math.max(fit, Math.min(fit * 1.8, w / (x1 - x0 + pad * 2), h / (y1 - y0 + pad * 2)));
    tx = (x0 + x1) / 2; ty = (y0 + y1) / 2;
  }
  if (!v.cam) v.cam = { x: b.W / 2, y: b.H / 2, z: fit };
  const k = dt ? Math.min(1, dt * 2.5) : 1;
  const cam = v.cam;
  cam.z += (tz - cam.z) * k; cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  // keep the view inside the arena
  const hw = w / (2 * cam.z), hh = h / (2 * cam.z);
  const cx = hw * 2 >= b.W ? b.W / 2 : Math.min(Math.max(cam.x, hw), b.W - hw);
  const cy = hh * 2 >= b.H ? b.H / 2 : Math.min(Math.max(cam.y, hh), b.H - hh);
  v.scale = cam.z;
  v.ox = w / 2 - cx * cam.z;
  v.oy = h / 2 - cy * cam.z;
}

export function screenToWorld(v, sx, sy) {
  return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale };
}

function addParts(v, x, y, n, color, spd, life, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = spd * (0.3 + Math.random());
    v.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: size * (0.5 + Math.random()) });
  }
}

// turn simulation events into particles
export function absorbEvents(v, b) {
  for (const e of b.events) {
    switch (e.k) {
      case 'hit': addParts(v, e.x, e.y, 3, '#ffd27a', 60, 0.25, 2); break;
      case 'spark': addParts(v, e.x, e.y, 4, '#fff1b0', 90, 0.2, 1.6); break;
      case 'muzzle': v.parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.06, max: 0.06, color: '#fff3c4', size: e.wk === 'scatter' || e.wk === 'lobber' ? 7 : 4 }); break;
      case 'beam': v.beams.push({ ...e, life: 0.14 }); addParts(v, e.x2, e.y2, 4, '#c7b8ff', 70, 0.25, 2); break;
      case 'boom':
        v.parts.push({ ring: true, x: e.x, y: e.y, r: e.r, life: 0.35, max: 0.35 });
        addParts(v, e.x, e.y, Math.min(14, 4 + e.r / 4), '#ff9a3c', e.r * 2, 0.4, 3);
        if (e.r > 30) v.shake = Math.max(v.shake, 3);
        break;
      case 'shield': v.parts.push({ ring: true, blue: true, x: e.x, y: e.y, r: e.r + 6, life: 0.2, max: 0.2 }); break;
      case 'die':
        v.parts.push({ ring: true, x: e.x, y: e.y, r: e.r * 3, life: 0.5, max: 0.5 });
        addParts(v, e.x, e.y, 22, '#ff8a2a', 150, 0.7, 3.5);
        addParts(v, e.x, e.y, 10, e.color, 110, 0.9, 3);
        v.shake = 7;
        break;
      case 'dmg':
        if (e.v >= 8) v.floats.push({ x: e.x + (Math.random() - 0.5) * 10, y: e.y, v: Math.round(e.v), life: 0.7, team: e.team });
        break;
    }
  }
}

export function drawBattle(v, b, rt, dt = 0) {
  const { ctx } = v;
  fitView(v, b, dt);
  if (!v.floor || v.floorFor !== b) { v.floor = floorPattern(b); v.floorFor = b; }
  const dpr = v.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0f1013';
  ctx.fillRect(0, 0, v.canvas.width, v.canvas.height);
  const sh = v.shake > 0 ? v.shake : 0;
  ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * (v.ox + (Math.random() - 0.5) * sh), dpr * (v.oy + (Math.random() - 0.5) * sh));
  ctx.drawImage(v.floor, 0, 0);

  // wrecks first, then living bots
  const order = [...b.bots].sort((p, q) => (p.alive ? 1 : 0) - (q.alive ? 1 : 0));
  for (const bot of order) {
    const look = bot.look;
    if (!bot.alive) {
      drawBot(ctx, look, bot.x, bot.y, bot.a, bot.ta, rt, { dead: true });
      if (bot.deadT < 6 && Math.random() < 0.2) v.parts.push({ smoke: true, x: bot.x, y: bot.y, vx: 6, vy: -14, life: 1.2, max: 1.2, size: 5 });
      continue;
    }
    const mv = Math.min(1, Math.hypot(bot.vx, bot.vy) / 30);
    if (bot.shield > 1) {
      ctx.strokeStyle = `rgba(108,196,255,${0.25 + 0.5 * bot.shield / bot.st.shield})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bot.x, bot.y, bot.st.r + 7, 0, TAU); ctx.stroke();
    }
    drawBot(ctx, look, bot.x, bot.y, bot.a, bot.ta, rt + bot.id, { moving: mv, hit: bot.hitT });
  }
  // focus marker
  const f = b.focus[0];
  if (f && f.alive) {
    const r = f.st.r + 10 + Math.sin(rt * 8) * 2;
    ctx.strokeStyle = '#f2a33a'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + rt;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, a, a + 0.8); ctx.stroke();
    }
  }
  // shots
  for (const s of b.shots) {
    if (s.k === 'b') {
      ctx.strokeStyle = s.team === 0 ? '#ffe08a' : '#ffb0a0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.02, s.y - s.vy * 0.02); ctx.stroke();
    } else if (s.k === 'r') {
      ctx.strokeStyle = 'rgba(80,230,255,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.sx, s.sy); ctx.lineTo(s.x, s.y); ctx.stroke();
    } else if (s.k === 'm') {
      ctx.fillStyle = '#e9ecef';
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.fillRect(-4, -1.5, 8, 3); ctx.restore();
      if (Math.random() < 0.6) v.parts.push({ smoke: true, x: s.x, y: s.y, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 2.5 });
    } else if (s.k === 's') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(s.x, s.y - (s.h || 0), 4 + (s.h || 0) / 20, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,60,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(s.tx, s.ty, s.splash * 0.6, 0, TAU); ctx.stroke();
    }
  }
  // beams
  for (const e of v.beams) {
    ctx.strokeStyle = `rgba(190,170,255,${e.life / 0.14})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(e.x, e.y);
    const n = 6;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      ctx.lineTo(e.x + (e.x2 - e.x) * k + (Math.random() - 0.5) * 8, e.y + (e.y2 - e.y) * k + (Math.random() - 0.5) * 8);
    }
    ctx.lineTo(e.x2, e.y2); ctx.stroke();
  }
  // particles
  for (const p of v.parts) {
    const k = p.life / p.max;
    if (p.ring) {
      ctx.strokeStyle = p.blue ? `rgba(108,196,255,${k})` : `rgba(255,170,80,${k})`;
      ctx.lineWidth = 3 * k + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.1 - k * 0.6), 0, TAU); ctx.stroke();
    } else if (p.smoke) {
      ctx.fillStyle = `rgba(120,120,125,${0.35 * k})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - k), 0, TAU); ctx.fill();
    } else {
      ctx.globalAlpha = k; ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }
  }
  // health bars
  for (const bot of b.bots) {
    if (!bot.alive) continue;
    const w = bot.st.r * 2.2, x = bot.x - w / 2, y = bot.y - bot.st.r - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = bot.team === 0 ? '#6fd36f' : '#e5484d';
    ctx.fillRect(x, y, w * Math.max(0, bot.hp / bot.maxHp), 3);
  }
  // damage numbers
  ctx.font = 'bold 11px "Chakra Petch", system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const f2 of v.floats) {
    ctx.globalAlpha = Math.min(1, f2.life * 2);
    ctx.fillStyle = f2.team === 0 ? '#ff9b9b' : '#fff';
    ctx.fillText(f2.v, f2.x, f2.y);
  }
  ctx.globalAlpha = 1;
}

export function tickView(v, dt) {
  v.shake = Math.max(0, v.shake - dt * 25);
  for (const p of v.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
  v.parts = v.parts.filter((p) => p.life > 0);
  if (v.parts.length > 600) v.parts.splice(0, v.parts.length - 600);
  for (const e of v.beams) e.life -= dt;
  v.beams = v.beams.filter((e) => e.life > 0);
  for (const f of v.floats) { f.life -= dt; f.y -= 22 * dt; }
  v.floats = v.floats.filter((f) => f.life > 0);
}
