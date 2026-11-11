// Shared plumbing used by every part of the game: the canvas, input, small maths helpers,
// drawing helpers, the HTML menu panel and the scene switcher.
//
// The game is split into "ES modules": each file lists what it shares with `export`, and other
// files pull those pieces in with `import`. The browser loads them directly, so there is still
// no build step.

export const canvas = document.getElementById('game');
export const ctx = canvas.getContext('2d');
export const overlay = document.getElementById('overlay');
export const hud = document.getElementById('hud');
const stage = document.getElementById('stage');

// Logical size of the play area. Wide on desktop and sideways phones, tall on upright phones.
export const view = { W: 960, H: 540, portrait: false };
const resizeListeners = [];
export function onResize(fn) { resizeListeners.push(fn); }

export function resize() {
  view.portrait = window.innerHeight > window.innerWidth * 1.15;
  view.W = view.portrait ? 540 : 960;
  view.H = view.portrait ? 900 : 540;
  if (canvas.width !== view.W || canvas.height !== view.H) { canvas.width = view.W; canvas.height = view.H; }
  stage.classList.toggle('portrait', view.portrait);
  pointer.down = false;
  resizeListeners.forEach(fn => fn());
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- input
export const keys = {};
export const pointer = { x: 480, y: 270, down: false, startX: 0, startY: 0, clicked: false, moved: false,
  // Phones and tablets start in touch mode, so hints and auto-aim are right before the first tap.
  touch: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) };
const keyPressListeners = [];
export function onKeyPress(fn) { keyPressListeners.push(fn); }

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!keys[k]) keyPressListeners.forEach(fn => fn(k));
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) && !overlay.classList.contains('show')) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; pointer.down = false; });

function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  pointer.x = (e.clientX - r.left) * view.W / r.width;
  pointer.y = (e.clientY - r.top) * view.H / r.height;
}
canvas.addEventListener('pointerdown', e => {
  pointerPos(e);
  pointer.touch = e.pointerType === 'touch';
  pointer.down = true;
  pointer.clicked = true;
  pointer.moved = false;
  pointer.startX = pointer.x;
  pointer.startY = pointer.y;
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') pointer.touch = false;
  pointerPos(e);
  if (pointer.down && Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > 12) pointer.moved = true;
});
canvas.addEventListener('pointerup', () => { pointer.down = false; });
canvas.addEventListener('pointercancel', () => { pointer.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------------------------------------------------------------- maths helpers
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
export function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
export function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
export function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
// Small deterministic random generator so the island looks the same every visit.
export function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

// Smooth random noise: random values on a grid, blended between grid points.
const NOISE = [];
{ const r = seeded(31); for (let i = 0; i < 64 * 64; i++) NOISE.push(r()); }
export function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n = (i, j) => NOISE[((j & 63) * 64) + (i & 63)];
  const top = n(xi, yi) + (n(xi + 1, yi) - n(xi, yi)) * sx;
  const bot = n(xi, yi + 1) + (n(xi + 1, yi + 1) - n(xi, yi + 1)) * sx;
  return top + (bot - top) * sy;
}

// ---------------------------------------------------------------- drawing helpers
// Draws one frame from a sprite sheet, centred on x, y.
export function drawFrame(image, fw, fh, col, row, x, y, scale, flip) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(image, col * fw, row * fh, fw, fh, -fw * scale / 2, -fh * scale / 2, fw * scale, fh * scale);
  ctx.restore();
}

// Soft oval shadow so characters and trees look planted on the ground.
export function shadow(x, y, r, colour) {
  ctx.fillStyle = colour || 'rgba(20, 40, 20, 0.28)';
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
}

export function text(str, x, y, size, colour, align) {
  ctx.font = '600 ' + size + 'px system-ui, sans-serif';
  ctx.textAlign = align || 'left';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = colour || '#fff';
  ctx.fillText(str, x, y);
}

// Bottom-of-screen hint. Pass a shorter string for tall screens.
export function hint(wide, tall) { text(view.portrait ? tall : wide, view.W / 2, view.H - (view.portrait ? 66 : 14), 15, '#fff', 'center'); }

export function bar(x, y, w, h, frac, colour) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = colour; ctx.fillRect(x, y, Math.max(0, w * clamp(frac, 0, 1)), h);
}

// ---------------------------------------------------------------- menus (HTML drawn over the canvas)
// `handlers` maps each button's data-act to a function. Buttons can pass an argument with data-arg.
export function showPanel(html, handlers, wide) {
  overlay.innerHTML = '<div class="panel' + (wide ? ' wide' : '') + '">' + html + '</div>';
  overlay.classList.add('show');
  overlay.querySelectorAll('[data-act]').forEach(b => {
    b.addEventListener('click', () => {
      const fn = handlers[b.dataset.act];
      if (fn) fn(b.dataset.arg);
    });
  });
  const first = overlay.querySelector('button:not(:disabled)');
  if (first && !pointer.touch) first.focus({ preventScroll: true });
}
export function hidePanel() { overlay.classList.remove('show'); overlay.innerHTML = ''; }
export function panelOpen() { return overlay.classList.contains('show'); }

// Buttons drawn as HTML along the bottom of the play area (Party, Camp, battle orders...).
export function setHud(html, handlers) {
  hud.innerHTML = html || '';
  hud.querySelectorAll('[data-act]').forEach(b => {
    b.addEventListener('click', e => { e.stopPropagation(); handlers[b.dataset.act](b.dataset.arg); });
  });
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------- scenes
// A scene is an object with update(dt) and draw(), plus optional enter() and leave().
let scene = null;
export function setScene(next, arg) {
  if (scene && scene.leave) scene.leave();
  hidePanel();
  setHud('');
  pointer.clicked = false; pointer.down = false;
  scene = next;
  if (scene.enter) scene.enter(arg);
}
export function getScene() { return scene; }
