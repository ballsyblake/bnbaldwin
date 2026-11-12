// The opening fight: the night Gunther leaves Ashby, the tithe-wardens' men come after him.
// It is a real battle, run in stages, each teaching one thing: moving, the bow, why arrows fail
// against shields, the sword, blocking, and giving orders. Enemies arrive one stage at a time,
// and Gunther cannot die here.

import { view, pointer, text } from './core.js';
import { game } from './state.js';

const touch = () => pointer.touch;

const STAGES = [
  {
    say: () => touch() ? 'Drag anywhere to move Gunther.' : 'Move with W A S D (or the arrow keys).',
    begin(B) { B.tutMoved = 0; B.tutFrom = { x: B.hero.x, y: B.hero.y }; },
    done(B) { return Math.hypot(B.hero.x - B.tutFrom.x, B.hero.y - B.tutFrom.y) > 90; }
  },
  {
    say: () => touch() ? 'Two wardens\' men. With the bow out, Gunther shoots by himself at whoever is closest. Get in range.'
      : 'Two wardens\' men. Aim with the mouse, hold click to draw the bow, release to shoot. A full draw flies truest.',
    begin(B) { spawn(B, 'recruit', 2, true, { weak: true }); },
    done(B) { return foesLeft(B) === 0; }
  },
  {
    text: () => touch() ? 'A warden with a shield. Arrows glance off shields and armour. Tap the Bow button to draw your sword.'
      : 'A warden with a shield. Arrows glance off shields and armour. Press Q to draw your sword.',
    begin(B) { spawn(B, 'spearman', 1, true, { hp: 30 }); },
    done() { return game.weapon === 'sword'; }
  },
  {
    text: () => touch() ? 'Tap left, right or above Gunther to swing from that side. The grey bar on a foe is the side he guards: strike another side.'
      : 'Move the mouse left, right or up to pick your side (gold). Hold click to wind up, release to strike. Hit the side he is not guarding (grey).',
    begin(B) { for (const u of foes(B)) { u.tutHold = false; u.dmgScale = 0.25; } },
    done(B) { return foesLeft(B) === 0; }
  },
  {
    text: () => touch() ? 'Red arrows show where a blow is coming. Hold the Block button to stop it. Block it twice.'
      : 'Red arrows show where a blow is coming. Move your gold marker to that side and hold right click. Block it twice; just before it lands is a parry.',
    begin(B) { B.tutBlocks = 0; this.keep(B); },
    keep(B) { spawn(B, 'recruit', 1, false, { dmgScale: 0.3, hp: 60 }); },
    done(B) { return B.tutBlocks >= 2; }
  },
  {
    text: () => 'Now finish him.',
    begin() {},
    done(B) { return foesLeft(B) === 0; }
  },
  {
    text: () => touch() ? 'More of them! Your lads are holding back. Tap Charge to send them in.'
      : 'More of them! Your lads are holding back. Press F1 (or click Charge) to send them in. 1, 2, 3 pick who gets the order.',
    begin(B) { spawn(B, 'recruit', 3, false, { dmgScale: 0.4 }); spawn(B, 'bowman', 1, false, { dmgScale: 0.3 }); },
    done(B) { return B.orders.foot === 'charge' || B.orders.bows === 'charge'; }
  },
  {
    text: () => 'Drive them off!',
    begin() {},
    done(B) { return foesLeft(B) === 0; }
  }
];

function foes(B) { return B.units.filter(u => u.side === 1 && !u.dead && !u.fled && !u.fleeing); }
function foesLeft(B) { return foes(B).length; }

function spawn(B, type, n, hold, opt) {
  const b = B.bounds();
  for (let i = 0; i < n; i++) {
    let x, y;
    if (view.portrait) { x = b.x0 + (b.x1 - b.x0) * (n === 1 ? 0.5 : 0.3 + 0.4 * i / (n - 1)); y = b.y0 + 190 + (i % 2) * 30; }
    else { x = b.x1 - 120 - (i % 2) * 40; y = b.y0 + (b.y1 - b.y0) * (n === 1 ? 0.5 : 0.3 + 0.4 * i / (n - 1)); }
    const u = B.addUnit(1, type, x, y);
    u.holdX = x; u.holdY = y; u.tutHold = hold;
    if (opt && opt.hp) { u.hp = u.max = opt.hp; }
    u.dmgScale = (opt && opt.dmgScale) || 0.35;
  }
}

export function tutorialStart(B) {
  B.tut = { i: 0, t: 0 };
  game.weapon = 'bow';
  // Your lads wait at the back until you send them in.
  B.orders = { foot: 'hold', bows: 'hold' };
  for (const u of B.units) if (u.side === 0 && !u.isHero) { u.holdX = u.x; u.holdY = u.y; }
  B.hud();
  STAGES[0].begin(B);
}

// Returns true while the tutorial is still running, so the battle does not end early.
export function tutorialTick(B, dt) {
  const T = B.tut;
  T.t += dt;
  // Gunther cannot fall here.
  B.hero.hp = Math.max(B.hero.hp, B.hero.max * 0.3); game.health = Math.max(game.health, game.maxHealth * 0.3);
  const st = STAGES[T.i];
  // A lesson that needs someone to fight never runs out of enemies: if Gunther or his lads kill
  // the warden before the lesson is learnt, another one steps up. The blocking lesson's warden
  // can't be killed until Gunther has blocked twice.
  B.tutShield = !!(st && st.keep && !st.done(B));
  if (B.tutShield && !foesLeft(B)) st.keep(B);
  if (st && T.t > 0.6 && st.done(B)) {
    T.i++; T.t = 0;
    if (STAGES[T.i]) STAGES[T.i].begin(B);
  }
  return T.i < STAGES.length;
}

export function tutorialText(B) {
  const st = STAGES[B.tut.i];
  if (!st) return '';
  return st.text ? st.text() : st.say();
}

// The instruction box at the top of the field.
export function tutorialDraw(B, ctx) {
  const msg = tutorialText(B);
  if (!msg) return;
  const W = view.W, maxW = Math.min(W - 40, 560), size = view.portrait ? 14 : 13;
  ctx.font = '600 ' + size + 'px Inter, sans-serif';
  const words = msg.split(' '), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW - 32) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  const h = 30 + lines.length * (size + 5), y = B.bounds().y0 + 4, x = (W - maxW) / 2;
  ctx.fillStyle = 'rgba(13, 11, 9, 0.82)'; ctx.fillRect(x, y, maxW, h);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, maxW - 2, h - 2);
  text('Training fight \u00b7 step ' + (B.tut.i + 1) + ' of ' + STAGES.length, W / 2, y + 14, 10, '#f2c14e', 'center');
  lines.forEach((l, i) => text(l, W / 2, y + 30 + i * (size + 5) + size * 0.4, size, '#f4ead2', 'center'));
}
