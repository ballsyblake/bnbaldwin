// Real-time battles. Gunther fights in person (move and shoot as before) while his troops follow
// simple orders: Charge, Hold or Follow. Each soldier is a small "agent" that picks a target,
// walks to it and attacks, which is enough to give the feel of two lines crashing together.

import { ctx, view, keys, pointer, clamp, dist, rand, pick, text, shadow, bar, setHud, uiSet, uiBar, onKeyPress, getScene, noise, seeded, onResize, esc } from './core.js';
import { img, drawUnit } from './sprites.js';
import { TROOPS, FACTIONS } from './data.js';
import { game, playerFit, skill, trainSkill, strength } from './state.js';

const PX = 3;
const HERO_SPEED = 115;      // soldiers walk at 58 to 100
const HERO_FOCUS = 0.6;      // chance an enemy near Gunther picks him over the nearest man
const HERO_HURT = 1.25;      // Gunther takes this much more damage than the raw blow (he is in the thick of it)

// ---------------------------------------------------------------- battlefield
let ground = null;
function buildGround(kind) {
  const W = view.W, H = view.H;
  const c = document.createElement('canvas');
  c.width = W / PX; c.height = H / PX;
  const g = c.getContext('2d');
  const data = g.createImageData(c.width, c.height);
  const rnd = seeded(23);
  const GRASS = [[188, 212, 88], [174, 204, 80], [158, 194, 76], [138, 178, 70]];
  const HILL = [[178, 186, 120], [162, 170, 110]];
  const DIRT = [[204, 170, 112], [192, 158, 102]], DIRT_EDGE = [178, 170, 92], TUFT = [206, 228, 112];
  const camp = kind === 'camp' || kind === 'stronghold';
  // A siege: a town wall across the field with two breaches. The town is on the enemy's side.
  const wall = kind === 'siege' ? (view.portrait
    ? { axis: 'y', pos: Math.round(H * 0.36), gaps: [[W * 0.28 - 34, W * 0.28 + 34], [W * 0.72 - 34, W * 0.72 + 34]] }
    : { axis: 'x', pos: Math.round(W * 0.62), gaps: [[H * 0.38 - 34, H * 0.38 + 34], [H * 0.72 - 34, H * 0.72 + 34]] }) : null;
  const COBBLE = [[150, 142, 124], [140, 132, 116], [160, 152, 132]];
  for (let py = 0; py < c.height; py++) {
    for (let px = 0; px < c.width; px++) {
      const x = px * PX + 1, y = py * PX + 1, i = (py * c.width + px) * 4;
      let col;
      const edge = Math.min(x, y, W - x, H - y);
      if (camp) {
        const dx = (x - W / 2) / (W * 0.44), dy = (y - H * 0.55) / (H * 0.44);
        const clearing = Math.hypot(dx, dy) + 0.3 * (noise(x / 70 + 3, y / 70 + 8) - 0.5);
        if (clearing < 0.64) col = noise(x / 40, y / 40) > 0.55 ? DIRT[1] : DIRT[0];
        else if (clearing < 0.72) col = DIRT_EDGE;
      }
      if (wall && (wall.axis === 'x' ? x > wall.pos : y < wall.pos)) {
        const n = noise(x / 30 + 5, y / 30 + 9);
        col = (Math.floor(x / 9) + Math.floor(y / 9)) % 2 ? COBBLE[n > 0.55 ? 2 : 0] : COBBLE[1];
      }
      if (!col) {
        const s = noise(x / 120 + 40, y / 120 + 40) - Math.max(0, (110 - edge) / 110) * 0.4;
        if (kind === 'hills') col = s < 0.45 ? HILL[1] : HILL[0];
        else col = s < 0.25 ? GRASS[3] : (s < 0.4 ? GRASS[2] : (s < 0.62 ? GRASS[1] : GRASS[0]));
        if (rnd() < 0.012) col = TUFT;
      }
      data.data[i] = col[0]; data.data[i + 1] = col[1]; data.data[i + 2] = col[2]; data.data[i + 3] = 255;
    }
  }
  g.putImageData(data, 0, 0);
  // A ring of trees around the edge, thicker in a forest.
  const trees = [];
  const tr = seeded(41);
  const thick = kind === 'forest' ? 0.95 : 0.7;
  for (let y = -10; y < H + 40; y += 30) {
    for (let x = -10; x < W + 40; x += 30) {
      const jx = x + (tr() - 0.5) * 18, jy = y + (tr() - 0.5) * 18;
      const inside = jx > 40 && jx < W - 40 && jy > 80 && jy < H - 24;
      if (inside) continue;
      if (tr() < thick) trees.push({ x: jx, y: jy, v: kind === 'hills' ? 0 : (tr() < 0.55 ? 2 : 1 + Math.floor(tr() * 3)), rock: kind === 'hills' && tr() < 0.5 });
    }
  }
  // Things to fight around.
  const props = [];
  const P = (fx, fy, kind2, r, v) => props.push({ x: fx * W, y: fy * H, kind: kind2, r, v });
  if (wall) {
    // Houses inside the walls, clear of the breaches.
    if (view.portrait) { P(0.14, 0.2, 'house', 26, 0); P(0.5, 0.2, 'house', 26, 1); P(0.86, 0.2, 'house', 26, 2); }
    else { P(0.86, 0.24, 'house', 26, 0); P(0.9, 0.55, 'house', 26, 1); P(0.84, 0.82, 'house', 26, 2); }
    P(view.portrait ? 0.5 : 0.3, view.portrait ? 0.62 : 0.55, 'rock', 20, 1);
  } else if (camp) {
    P(0.5, 0.36, 'fire', 18);
    if (view.portrait) { P(0.22, 0.24, 'tent', 30); P(0.78, 0.24, 'tent', 30); } else { P(0.36, 0.24, 'tent', 30); P(0.64, 0.24, 'tent', 30); }
    if (kind === 'stronghold') { P(0.82, 0.62, 'tent', 30); P(0.18, 0.62, 'tent', 30); }
  } else {
    P(0.3, 0.3, 'rock', 20, 0); P(0.72, 0.74, 'rock', 20, 2);
    if (kind === 'forest') { P(0.5, 0.5, 'tree', 16, 2); P(0.2, 0.75, 'tree', 16, 1); }
  }
  ground = { canvas: c, trees, props, kind, W, H, wall };
}

// ---------------------------------------------------------------- battle scene
const FIELD_CAP = () => view.portrait ? 18 : 24;     // most soldiers per side on the field at once

export const battleScene = {
  // opts: { enemy: { troops, faction, name }, kind: 'field' | 'forest' | 'hills' | 'camp' | 'stronghold', onEnd(result) }
  enter(opts) {
    this.opts = opts;
    this.siege = opts.kind === 'siege';
    this.enemyFaction = opts.enemy.faction;
    if (!ground || ground.kind !== opts.kind || ground.W !== view.W || ground.H !== view.H) buildGround(opts.kind);
    this.units = []; this.shots = []; this.effects = []; this.floats = [];
    this.drawT = 0; this.wasDown = false; this.blockHeld = false; pointer.tap = null;
    this.time = 0; this.over = false;
    // Orders are given to two groups: foot soldiers and bowmen. 'group' is who the next order goes to.
    this.orders = { foot: 'charge', bows: 'charge' }; this.group = 'all';
    this.fireTimer = 0; this.aim = 0;
    this.start = [0, 0];
    this.killed = [{}, {}];     // by side: type -> count
    this.wounded = [{}, {}];
    this.fled = [{}, {}];
    // Reserves wait off the field and come in as soldiers fall.
    // Each troop type is spread evenly through the queue, so the first wave is a fair mix
    // of spearmen, archers and so on rather than all of one kind.
    const expand = troops => {
      const list = [];
      for (const t in troops) for (let i = 0; i < troops[t]; i++) list.push({ t, k: t === 'warlord' ? -1 : (i + 0.5) / troops[t] });
      return list.sort((a, b) => a.k - b.k).map(e => e.t);
    };
    this.reserve = [expand(playerFit()), expand(opts.enemy.troops)];
    this.start = [this.reserve[0].length, this.reserve[1].length];
    // A battle never starts with Gunther below half health.
    game.health = Math.max(game.health, game.maxHealth * 0.5);
    const b = this.bounds();
    this.hero = this.addUnit(0, null, view.portrait ? view.W / 2 : b.x0 + 80, view.portrait ? b.y1 - 60 : view.H * 0.6);
    for (let s = 0; s < 2; s++) this.reinforce(s, true);
    this.routing = false;
    this.hud();
  },
  bounds() { return { x0: 40, y0: view.portrait ? 120 : 100, x1: view.W - 40, y1: view.H - (view.portrait ? 210 : 76) }; },
  // Battle HUD: a top bar with both sides and the odds, group cards bottom left, orders bottom right.
  hud() {
    const ORD = { charge: 'Charge', hold: 'Hold', follow: 'Follow', fallback: 'Fall back' };
    if (this.hero.dead && !this.over) {
      setHud(this.topBar() + '<div class="box abs finish"><button class="primary" data-act="finish">Let your men finish it</button></div>', { finish: () => this.autoFinish() });
      this.refreshHud(true);
      return;
    }
    const cur = this.group === 'all' ? (this.orders.foot === this.orders.bows ? this.orders.foot : '') : this.orders[this.group];
    const groups = ['all', 'foot', 'bows'].map((g, i) =>
      '<button data-act="group" data-arg="' + g + '" class="' + (this.group === g ? 'sel' : '') + '"><span class="gh"><span data-k="gn-' + g + '"></span><span>[' + (i + 1) + ']</span></span>' +
      { all: 'All', foot: 'Foot', bows: 'Bows' }[g] + '<small>' + (g === 'all' ? (this.orders.foot === this.orders.bows ? ORD[this.orders.foot] : 'Mixed') : ORD[this.orders[g]]) + '</small></button>').join('');
    const orders = ['charge', 'hold', 'follow', 'fallback'].map((o, i) =>
      '<button data-act="order" data-arg="' + o + '" class="' + (cur === o ? 'sel' : '') + '">' + ORD[o] + (pointer.touch ? '' : '<small>F' + (i + 1) + '</small>') + '</button>').join('');
    const sw = game.weapon === 'sword', touch = pointer.touch;
    const hero = '<div class="box abs herobox"><button data-act="weapon">' + (sw ? 'Sword' : 'Bow') + '<small>' + (touch ? 'tap to swap' : 'Q to swap') + '</small></button>' +
      (sw ? '<button data-act="block">Block<small>' + (touch ? 'hold' : 'hold right click') + '</small></button>' : '') + '</div>';
    setHud(this.topBar() + hero +
      '<div class="box abs groups" data-min="groups"><div class="mini">' + { all: 'All', foot: 'Foot', bows: 'Bows' }[this.group] + '</div>' + groups + '</div>' +
      '<div class="box abs orders" data-min="orders"><span class="lbl">Order for: <b>' + { all: 'All', foot: 'Foot', bows: 'Bows' }[this.group] + '</b></span><div>' + orders + '</div></div>',
      { order: o => this.setOrder(o), group: g => this.setGroup(g), weapon: () => this.swapWeapon(), block: () => {} });
    // The Block button works while held, so it listens for press and release itself.
    const bb = document.querySelector('#ui [data-act="block"]');
    if (bb) {
      const on = e => { e.preventDefault(); this.blockHeld = true; }, off = () => { this.blockHeld = false; };
      bb.addEventListener('pointerdown', on); bb.addEventListener('pointerup', off); bb.addEventListener('pointerleave', off); bb.addEventListener('pointercancel', off);
    }
    this.refreshHud(true);
  },
  topBar() {
    const foe = this.opts.enemy, fc = FACTIONS[this.enemyFaction].colour;
    return '<div class="box abs btop" data-min="btop"><div class="mini" data-k="bmini"></div>' +
      '<div class="side"><div class="meterhead"><b class="px name gold">Gunther</b><span data-k="hp"></span></div><div class="meter"><i data-k="hpbar"></i></div>' +
        '<div class="meterhead"><span class="lbl">Men standing</span><b class="px" data-k="mine"></b></div><div class="meter"><i data-k="minebar" style="background:var(--gold)"></i></div></div>' +
      '<div class="odds"><span class="lbl">Odds</span><b class="px" data-k="odds"></b><span data-k="oddsw"></span></div>' +
      '<div class="side right"><div class="meterhead"><b class="px name" style="color:' + fc + '">' + esc(foe.name) + '</b><span data-k="ehp"></span></div><div class="meter"><i data-k="ebar"></i></div>' +
        '<div class="meterhead"><span class="lbl">Men standing</span><b class="px" data-k="theirs"></b></div><div class="meter"><i data-k="theirbar" style="background:' + fc + '"></i></div></div>' +
    '</div>';
  },
  refreshHud(force) {
    this.hudT = (this.hudT || 0) - 1;
    if (!force && this.hudT > 0) return;
    this.hudT = 8;
    const count = (side, filter) => {
      const m = {};
      for (const u of this.alive(side)) if (!u.isHero && !u.fleeing && (!filter || filter(u))) m[u.type] = (m[u.type] || 0) + 1;
      for (const t of this.reserve[side]) if (!filter || filter({ def: TROOPS[t] })) m[t] = (m[t] || 0) + 1;
      return m;
    };
    const n = m => { let k = 0; for (const t in m) k += m[t]; return k; };
    const mine = count(0), theirs = count(1);
    const nm = n(mine), nt = n(theirs);
    const hp = game.health / game.maxHealth;
    uiSet('hp', this.hero.dead ? '<span class="dangerc">Down</span>' : 'You &middot; HP ' + Math.round(hp * 100) + '%');
    uiBar('hpbar', this.hero.dead ? 0 : hp, hp > 0.3 ? 'var(--good)' : 'var(--danger)');
    uiSet('mine', nm + ' / ' + this.start[0]);
    uiBar('minebar', nm / Math.max(1, this.start[0]));
    uiSet('theirs', nt + ' / ' + this.start[1]);
    uiBar('theirbar', nt / Math.max(1, this.start[1]));
    // The enemy's fighting strength left, against what they started with.
    if (!this.startPower) this.startPower = Math.max(1, strength(this.opts.enemy.troops));
    const ep = strength(theirs) / this.startPower;
    uiSet('ehp', 'Enemy &middot; Strength ' + Math.round(clamp(ep, 0, 1) * 100) + '%');
    uiBar('ebar', ep, 'var(--good)');
    // Odds compare fighting strength, Gunther included.
    const a = strength(mine) + (this.hero.dead ? 0 : 5), b = strength(theirs);
    let odds, word, cls;
    if (b <= 0) { odds = '-'; word = 'Won'; cls = 'goodc'; }
    else {
      const r = b / Math.max(0.1, a);
      const fmt = v => String(Math.round(v * 10) / 10);
      odds = r >= 1 ? '1 : ' + fmt(r) : fmt(1 / r) + ' : 1';
      if (r > 1.3) { word = 'Outnumbered'; cls = 'dangerc'; } else if (r < 0.77) { word = 'Advantage'; cls = 'goodc'; } else { word = 'Even fight'; cls = 'mutedc'; }
    }
    uiSet('odds', odds);
    uiSet('oddsw', '<span class="' + cls + '">' + word + '</span>');
    uiSet('bmini', '<b class="gold">You</b> <span class="num">' + nm + '</span> &middot; HP <span class="num">' + (this.hero.dead ? 'down' : Math.round(hp * 100) + '%') + '</span> &middot; <span class="' + cls + '">' + odds + '</span> &middot; <span class="num">' + nt + '</span> <b class="dangerc">Enemy</b>');
    const foot = n(count(0, u => !(u.def && u.def.ranged))), bows = n(count(0, u => u.def && u.def.ranged));
    uiSet('gn-all', nm + ' men'); uiSet('gn-foot', foot + ' men'); uiSet('gn-bows', bows + ' men');
  },
  setGroup(g) { this.group = g; this.hud(); },
  swapWeapon() {
    if (this.over || this.hero.dead) return;
    game.weapon = game.weapon === 'sword' ? 'bow' : 'sword';
    this.hero.swing = null; this.hero.drawing = false; this.drawT = 0; this.blockHeld = false;
    this.hud();
  },
  // Floating words over the field: Blocked, Parry!, Interrupted.
  float(x, y, msg, colour) { this.floats.push({ x, y, msg, colour, t: 0 }); },
  // Is the shot coming at u from the side it faces (towards its target, or the enemy's edge)?
  facesShot(u, s) {
    let fx, fy;
    if (u.target && !u.target.dead) { fx = u.target.x - u.x; fy = u.target.y - u.y; }
    else if (view.portrait) { fx = 0; fy = u.side === 1 ? 1 : -1; }
    else { fx = u.side === 1 ? -1 : 1; fy = 0; }
    const fl = Math.hypot(fx, fy) || 1, vl = Math.hypot(s.vx, s.vy) || 1;
    return (-s.vx * fx - s.vy * fy) / (fl * vl) > 0.34;      // within about 70 degrees of straight on
  },
  // Gunther's arrows bouncing off: say so, and after a few, suggest the sword.
  armourHint(u, why) {
    this.float(u.x, u.y - 70, why === 'Shield' ? 'Shield!' : 'Glances off', '#c9bb9c');
    this.bounced = (this.bounced || 0) + 1;
    if (this.bounced === 4 && game.weapon !== 'sword') this.banner = { msg: pointer.touch ? 'Arrows bounce off. Tap Bow to draw your sword.' : 'Arrows bounce off. Press Q for your sword.', t: 0 };
  },
  nextGroup() {
    this.group = { all: 'foot', foot: 'bows', bows: 'all' }[this.group];
    this.hud();
  },
  setOrder(o) {
    const groups = this.group === 'all' ? ['foot', 'bows'] : [this.group];
    for (const g of groups) this.orders[g] = o;
    const b = this.bounds();
    for (const u of this.units) if (u.side === 0 && !u.isHero && groups.includes(groupOf(u))) {
      // Fall back: pull back to your own edge of the field and hold there.
      if (o === 'fallback') { if (view.portrait) { u.holdX = u.x; u.holdY = b.y1 - 20 - Math.random() * 40; } else { u.holdX = b.x0 + 20 + Math.random() * 50; u.holdY = u.y; } }
      else { u.holdX = u.x; u.holdY = u.y; }
    }
    this.hud();
  },
  // Places a soldier on the field at its side's starting edge.
  addUnit(side, type, x, y) {
    const def = type ? TROOPS[type] : null;
    const u = { side, type, def, x, y, hp: def ? def.hp : game.health, max: def ? def.hp : game.maxHealth, cd: rand(0, 0.6), t: Math.random(), anim: 'idle', at: 0, flip: side === 1 && !view.portrait, retarget: 0, target: null, isHero: !type };
    if (!type) u.dead = game.health <= 0;
    this.units.push(u);
    return u;
  },
  reinforce(side, initial) {
    const b = this.bounds();
    const onField = this.units.filter(u => u.side === side && !u.dead && !u.isHero && !u.fled).length;
    let k = 0;
    while (this.reserve[side].length && onField + k < FIELD_CAP()) {
      const type = this.reserve[side].shift();
      const ranged = TROOPS[type].ranged;
      const row = ranged ? 1 : 0;
      let x, y;
      const lane = (k * 0.618 % 1);
      if (view.portrait) {
        x = b.x0 + 20 + lane * (b.x1 - b.x0 - 40);
        y = side === 0 ? b.y1 - 20 - (1 - row) * 50 : b.y0 + 20 + (1 - row) * 50;
        if (!initial) y = side === 0 ? view.H + 10 : 60;
      } else {
        y = b.y0 + 20 + lane * (b.y1 - b.y0 - 40);
        x = side === 0 ? b.x0 + 30 + (1 - row) * 60 : b.x1 - 30 - (1 - row) * 60;
        if (!initial) x = side === 0 ? -10 : view.W + 10;
      }
      if (type === 'warlord') { x = view.portrait ? view.W / 2 : b.x1 - 140; y = view.portrait ? b.y0 + 80 : view.H * 0.55; }
      const u = this.addUnit(side, type, x, y);
      u.holdX = clamp(x, b.x0, b.x1); u.holdY = clamp(y, b.y0, b.y1);
      // Defenders of a town: foot men guard the breaches, archers stand behind the wall.
      if (this.siege && side === 1) {
        const w = ground.wall, gap = w.gaps[k % 2], back = ranged ? rand(36, 70) : rand(30, 64);
        const al = ranged ? rand(w.axis === 'x' ? b.y0 + 10 : b.x0 + 10, w.axis === 'x' ? b.y1 - 10 : b.x1 - 10) : (gap[0] + gap[1]) / 2 + rand(-30, 30);
        if (w.axis === 'x') { u.holdX = w.pos + back; u.holdY = al; } else { u.holdX = al; u.holdY = w.pos - back; }
        if (initial) { u.x = u.holdX; u.y = u.holdY; }
      }
      k++;
    }
  },
  alive(side) { return this.units.filter(u => u.side === side && !u.dead && !u.fled); },
  nearestFoe(u, maxD) {
    let best = null, bd = maxD || Infinity;
    for (const o of this.units) {
      if (o.side === u.side || o.dead || o.fled) continue;
      const d = dist(u.x, u.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  },
  hurt(u, amount, source) {
    if (u.dead) return;
    if (u.isHero) amount *= HERO_HURT * (1 - Math.min(0.45, (game.armourLevel - 1) * 0.07));
    u.hp -= amount;
    u.flash = 0.12;
    if (u.isHero) game.health = Math.max(0, u.hp);
    if (u.hp <= 0) {
      u.dead = true; u.deadT = 0; u.anim = 'dead';
      if (u.isHero) { this.hud(); return; }
      const side = u.side;
      // Your men often survive their wounds; orcs and enemies who fall are counted as killed.
      const woundChance = side === 0 ? Math.min(0.9, (u.type === 'knight' ? 0.65 : 0.5) + skill('medicine') * 0.04) : 0;
      const bucket = Math.random() < woundChance ? this.wounded[side] : this.killed[side];
      bucket[u.type] = (bucket[u.type] || 0) + 1;
      if (side === 1 && source === 'hero') this.heroKills = (this.heroKills || 0) + 1;
    }
  },
  shoot(from, angle, dmg, kind, side, speed) {
    this.shots.push({ x: from.x + Math.cos(angle) * 20, y: from.y - 26 + Math.sin(angle) * 20, a: angle, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg, kind, side, life: 1.3, hero: from.isHero });
  },
  update(dt) {
    this.time += dt;
    const b = this.bounds();
    const H = this.hero;
    // ---- Gunther
    H.stagger = Math.max(0, (H.stagger || 0) - dt);
    // Desktop: the way the mouse last moved sets Gunther's stance, the side he swings from or guards.
    if (!pointer.touch) {
      this.sx = (this.sx || 0) * 0.8 + pointer.mvx; this.sy = (this.sy || 0) * 0.8 + pointer.mvy;
      if (!(H.swing && !H.swing.released) && Math.hypot(this.sx, this.sy) > 9) {
        H.stance = Math.abs(this.sx) > Math.abs(this.sy) * 1.1 ? (this.sx < 0 ? 'left' : 'right') : 'over';
      }
    }
    pointer.mvx = 0; pointer.mvy = 0;
    if (!H.stance) H.stance = 'over';
    const sword = game.weapon === 'sword';
    const wasBlocking = H.blocking;
    H.blocking = !H.dead && !this.over && sword && (pointer.rdown || this.blockHeld) && !(H.swing && H.swing.released);
    if (H.blocking && !wasBlocking) H.blockStart = this.time;
    // A short tap on a phone (no drag) is a sword stroke towards that spot.
    this.tap = pointer.tap || null; pointer.tap = null;
    if (!H.dead && !this.over) {
      let mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
      let my = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
      if (pointer.touch && pointer.down) {
        const jx = pointer.x - pointer.startX, jy = pointer.y - pointer.startY;
        if (Math.hypot(jx, jy) > 12) { mx = jx; my = jy; }
      }
      const len = Math.hypot(mx, my);
      // Gunther is a little quicker than a soldier in kit, not fast enough to outrun a battle,
      // and drawing a bow or winding up a blow slows him further.
      const slow = (H.blocking ? 0.5 : 1) * (H.swing && !H.swing.released ? 0.7 : 1) * (H.stagger > 0 ? 0.4 : 1) * (H.drawing ? 0.55 : 1);
      H.anim = len > 0 ? 'walk' : 'idle';
      if (len > 0) { H.x += mx / len * HERO_SPEED * slow * dt; H.y += my / len * HERO_SPEED * slow * dt; }
      if (pointer.touch) {
        const o = this.nearestFoe(H, sword ? 160 : 520);
        if (this.tap) this.aim = Math.atan2(this.tap.y - (H.y - 26), this.tap.x - H.x);
        else if (o) this.aim = Math.atan2(o.y - 16 - (H.y - 26), o.x - H.x);
      } else this.aim = Math.atan2(pointer.y - (H.y - 26), pointer.x - H.x);
      H.flip = Math.cos(this.aim) < 0;
      if (sword) this.updateSword(dt); else this.updateBow(dt);
    }
    this.wasDown = pointer.down;
    H.shootT = (H.shootT || 9) + dt;
    pointer.clicked = false;

    // ---- Soldiers
    const enemyAlive = this.alive(1).length + this.reserve[1].length;
    if (!this.routing && !this.over && this.opts.kind !== 'stronghold' && enemyAlive <= Math.max(1, Math.floor(this.start[1] * 0.25)) && this.start[1] >= 4) {
      this.routing = true;
      this.reserve[1].forEach(t => { this.fled[1][t] = (this.fled[1][t] || 0) + 1; });
      this.reserve[1] = [];
      for (const u of this.units) if (u.side === 1 && !u.dead) u.fleeing = true;
      this.banner = { msg: 'The enemy breaks and runs!', t: 0 };
    }
    for (const u of this.units) {
      u.t += dt; u.flash = Math.max(0, (u.flash || 0) - dt);
      if (u.dead) { u.deadT += dt; continue; }
      if (u.isHero || u.fled) continue;
      u.cd -= dt; u.at += dt;
      const def = u.def;
      if (u.stun > 0) { u.stun -= dt; u.anim = 'idle'; continue; }
      if (u.side === 1 && !def.ranged) this.guardAI(u, dt);
      const speed = def.speed * (u.fleeing ? 1.25 : 1);
      if (u.fleeing) {
        const ex = view.portrait ? u.x : (u.side === 1 ? view.W + 40 : -40);
        const ey = view.portrait ? (u.side === 1 ? -40 : view.H + 40) : u.y;
        this.walk(u, ex, ey, speed, dt);
        if (u.x < -30 || u.x > view.W + 30 || u.y < -30 || u.y > view.H + 30) { u.fled = true; this.fled[u.side][u.type] = (this.fled[u.side][u.type] || 0) + 1; }
        continue;
      }
      u.retarget -= dt;
      if (u.retarget <= 0 || !u.target || u.target.dead || u.target.fled) {
        u.retarget = rand(0.3, 0.6);
        let reach = Infinity;
        const order = u.side === 0 ? this.orders[groupOf(u)] : (this.siege ? 'hold' : 'charge');
        if (order === 'hold') reach = def.ranged ? def.range : 90;
        if (order === 'follow') reach = def.ranged ? def.range : 110;
        if (order === 'fallback') reach = dist(u.x, u.y, u.holdX, u.holdY) > 20 ? 30 : (def.ranged ? def.range : 60);
        u.target = this.nearestFoe(u, reach);
        // Enemies know who leads the warband: within reach, most of them go for Gunther.
        if (u.side === 1 && !H.dead && u.target !== H && dist(u.x, u.y, H.x, H.y) < (def.ranged ? def.range : 240) && Math.random() < HERO_FOCUS) u.target = H;
      }
      const T = u.target;
      const wind = u.windT || 0.16;
      if (u.anim === 'attack' && u.at < (def.ranged ? 0.35 : wind + 0.16)) {
        // Mid-swing: the blow lands part way through.
        if (!def.ranged && !u.struck && u.at > wind && T && !T.dead && dist(u.x, u.y, T.x, T.y) < def.range + 14) {
          u.struck = true;
          const dmg = def.dmg * rand(0.8, 1.2);
          if (T.isHero) this.strikeHero(u, dmg);
          else if (Math.random() < (T.def.guard || 0) * 0.3) { if (Math.random() < 0.3) this.effects.push({ x: (u.x + T.x) / 2, y: (u.y + T.y) / 2 - 26, t: 0, kind: 'block' }); }
          else this.hurt(T, dmg * (1 - (T.def && T.def.block || 0) * 0.15) * (1 - (T.def && T.def.armour || 0) * 0.2), 'melee');
        }
        continue;
      }
      if (T) {
        const d = dist(u.x, u.y, T.x, T.y);
        u.flip = T.x < u.x;
        if (def.ranged && d < def.range && d > 50) {
          u.anim = 'idle';
          if (u.cd <= 0) {
            u.cd = def.cd * rand(0.9, 1.2); u.anim = 'attack'; u.at = 0;
            // Aim where the target will be, a little wobbly.
            const speed2 = def.javelin ? 460 : def.bolt ? 760 : 620;
            const lead = d / speed2;
            const tx = T.x + (T.vx || 0) * lead, ty = T.y - 16 + (T.vy || 0) * lead;
            const a = Math.atan2(ty - (u.y - 26), tx - u.x) + rand(-0.07, 0.07);
            this.shoot(u, a, def.dmg, def.javelin ? 'javelin' : def.bolt ? 'bolt' : 'arrow', u.side, speed2);
          }
        } else if (d <= def.range + (def.scale ? 14 : 0)) {
          u.anim = 'idle';
          if (u.cd <= 0) {
            u.cd = def.cd * rand(0.9, 1.2); u.anim = 'attack'; u.at = 0; u.struck = false; u.windT = 0.16;
            // Against Gunther the blow is telegraphed: a slower wind-up from one side he can read and block.
            if (T.isHero) {
              const g = def.guard || 0;
              u.windT = clamp(0.62 - g * 0.3, 0.4, 0.62);
              u.atkDir = H.blocking && Math.random() < g ? pick(DIRS.filter(d => d !== H.stance)) : pick(DIRS);
            }
          }
        } else this.walk(u, T.x, T.y, speed, dt);
      } else if (u.side === 0 && this.orders[groupOf(u)] === 'follow' && !H.dead) {
        const k = this.units.indexOf(u);
        const ang = k * 2.4, r = 50 + (k % 3) * 22;
        if (dist(u.x, u.y, H.x + Math.cos(ang) * r, H.y + Math.sin(ang) * r * 0.6) > 12) this.walk(u, H.x + Math.cos(ang) * r, H.y + Math.sin(ang) * r * 0.6, speed * 1.1, dt);
        else u.anim = 'idle';
      } else if ((u.side === 0 && this.orders[groupOf(u)] !== 'charge') || (u.side === 1 && this.siege)) {
        if (dist(u.x, u.y, u.holdX, u.holdY) > 8) this.walk(u, u.holdX, u.holdY, speed, dt); else u.anim = 'idle';
      } else u.anim = 'idle';
    }
    // Keep everyone apart, out of tents and on the field.
    const live = this.units.filter(u => !u.dead && !u.fled);
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const c = live[j];
        const r = (a.def && a.def.scale || c.def && c.def.scale) ? 34 : 20;
        const dx = a.x - c.x, dy = a.y - c.y, d = Math.hypot(dx, dy);
        if (d > 0 && d < r) { const push = (r - d) / 2; a.x += dx / d * push; a.y += dy / d * push; c.x -= dx / d * push; c.y -= dy / d * push; }
      }
      for (const p of ground.props) pushOut(a, p.x, p.y, p.r + 10);
      if (ground.wall) wallBlock(a);
      if (!a.fleeing && (a.x > -5 && a.x < view.W + 5 && a.y > -5 && a.y < view.H + 5)) {
        // Units walking in from the edge are allowed outside the bounds until they arrive.
        if (a.x > b.x0 - 1 && a.x < b.x1 + 1 && a.y > b.y0 - 1 && a.y < b.y1 + 1) a.inside = true;
        if (a.inside || a.isHero) { a.x = clamp(a.x, b.x0, b.x1); a.y = clamp(a.y, b.y0, b.y1); }
      }
    }
    // ---- Arrows and fireballs
    for (const s of this.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0 || s.x < -40 || s.x > view.W + 40 || s.y < -40 || s.y > view.H + 40) { s.gone = true; continue; }
      for (const p of ground.props) if (p.kind !== 'fire' && dist(s.x, s.y, p.x, p.y - 14) < p.r) { s.gone = true; break; }
      if (s.gone) continue;
      for (const u of this.units) {
        if (u.side === s.side || u.dead || u.fled) continue;
        const big = u.def && u.def.scale ? 2.2 : 1;
        if (dist(s.x, s.y, u.x, u.y - 18 * big) < 16 * big) {
          s.gone = true;
          if (s.hero) trainSkill('archery', 1);
          // A shield catches arrows that come at its bearer from the front.
          if (u.def && u.def.shield && this.facesShot(u, s) && Math.random() < u.def.shield) {
            this.effects.push({ x: u.x, y: u.y - 26, t: 0, kind: 'block' });
            if (s.hero) this.armourHint(u, 'Shield');
            break;
          }
          // Armour turns arrows aside. Crossbow bolts and javelins punch through more of it.
          const armour = (u.def ? u.def.armour || 0 : 0) * (s.kind === 'bolt' ? 0.5 : s.kind === 'javelin' ? 0.7 : 1);
          // Defenders standing just behind the wall are hard to hit.
          const cover = ground.wall && u.side === 1 && behindWall(u) ? 0.5 : 1;
          this.hurt(u, s.dmg * (1 - armour) * cover, s.hero ? 'hero' : 'shot');
          if (s.hero && armour >= 0.45) this.armourHint(u, 'Armour');
          break;
        }
      }
    }
    this.shots = this.shots.filter(s => !s.gone);
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter(e => e.t < 0.4);
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter(f => f.t < 0.9);
    if (this.banner) this.banner.t += dt;
    // Remove bodies after a while so the field doesn't fill up.
    this.units = this.units.filter(u => u.isHero || !(u.dead && u.deadT > 6) && !u.fled);
    if (!this.over) { this.reinforce(0); this.reinforce(1); }

    // ---- How the battle ends
    if (!this.over) {
      const foes = this.alive(1).filter(u => !u.fleeing).length + this.reserve[1].length;
      const friends = this.alive(0).filter(u => !u.isHero).length + this.reserve[0].length + (H.dead ? 0 : 1);
      if (foes === 0 && this.alive(1).length === 0) this.finish(true);
      else if (foes === 0 && this.time > 2) this.finish(true);
      else if (friends === 0) this.finish(false);
    }
  },
  // ---- Sword: hold to wind up (stronger), release to strike from the stance side.
  updateSword(dt) {
    const H = this.hero, s = H.swing;
    const minWind = 0.26 - skill('blade') * 0.01;
    if (s) {
      s.t += dt;
      if (!s.released) {
        s.charge = Math.min(1, s.t / 0.65);
        if (pointer.rdown && !pointer.touch) { H.swing = null; return; }          // right click cancels: a feint
        if (!pointer.down || s.t > 1.5) { s.released = true; s.rt = 0; }
      } else {
        s.rt += dt;
        if (!s.hit && s.rt >= 0.08 && s.t >= minWind + 0.08) { s.hit = true; this.resolveSwing(s); }
        if (s.hit && s.rt > 0.3) H.swing = null;
      }
      return;
    }
    if (H.stagger > 0 || H.blocking) return;
    if (pointer.touch) {
      if (!this.tap) return;
      const dx = this.tap.x - H.x, dy = this.tap.y - (H.y - 26);
      const dir = Math.abs(dx) < 34 || dy < -Math.abs(dx) ? 'over' : dx < 0 ? 'left' : 'right';
      H.stance = dir;
      H.swing = { dir, t: 0, charge: 0.45, released: true, rt: 0 };
    } else if (pointer.down) H.swing = { dir: H.stance, t: 0, charge: 0, released: false };
  },
  resolveSwing(s) {
    const H = this.hero;
    const near = this.units.filter(u => u.side === 1 && !u.dead && !u.fled).map(u => ({ u, d: dist(H.x, H.y, u.x, u.y) }))
      .filter(o => o.d < 58 + (o.u.def.scale ? 26 : 0) && angleGap(Math.atan2(o.u.y - H.y, o.u.x - H.x), this.aim) < 1.4)
      .sort((a, b) => a.d - b.d).slice(0, s.dir === 'over' ? 1 : 2);
    for (const { u } of near) {
      const busy = u.anim === 'attack' && !u.struck && !u.def.ranged;     // a man mid-swing cannot guard
      if (u.guarding && u.guard === s.dir && !busy) {
        this.effects.push({ x: (H.x + u.x) / 2, y: (H.y + u.y) / 2 - 30, t: 0, kind: 'block' });
        this.float(u.x, u.y - 70, 'Blocked', '#c9bb9c');
        H.stagger = 0.45;
        trainSkill('blade', 0.5);
        return;
      }
      const dmg = (10 + 2 * (game.swordLevel - 1)) * (1 + skill('blade') * 0.05) * (0.55 + 0.8 * s.charge) * (s.dir === 'over' ? 1.2 : 1) * rand(0.9, 1.1);
      // A good blow gets through most armour; arrows mostly do not.
      this.hurt(u, dmg * (1 - (u.def.armour || 0) * 0.3), 'hero');
      this.effects.push({ x: u.x, y: u.y - 30, t: 0, kind: 'hit' });
      trainSkill('blade', 1);
      if (busy && !u.dead) { u.anim = 'idle'; u.struck = true; u.cd = Math.max(u.cd, 0.5); this.float(u.x, u.y - 70, 'Interrupted', '#f2c14e'); }
      if (s.charge > 0.8 && !u.def.scale && !u.dead) {
        const d = Math.max(1, dist(H.x, H.y, u.x, u.y));
        u.x += (u.x - H.x) / d * 12; u.y += (u.y - H.y) / d * 12; u.stun = Math.max(u.stun || 0, 0.4);
      }
    }
  },
  // ---- Bow: on a computer, hold to draw and release to loose. A full draw hits harder and flies true;
  // moving, or holding the draw too long, makes it shaky. On a phone Gunther shoots by himself.
  updateBow(dt) {
    const H = this.hero;
    if (pointer.touch) {
      this.fireTimer -= dt;
      if (this.nearestFoe(H, 520) && this.fireTimer <= 0) {
        this.fireTimer = Math.max(0.85 * Math.pow(0.9, game.bowLevel - 1) * (1 - skill('archery') * 0.02), 0.35);
        H.shootT = 0;
        this.shoot(H, this.aim + rand(-0.06, 0.06), (11 + 1.5 * (game.bowLevel - 1)) * (1 + skill('archery') * 0.04), 'arrow', 0, 700);
      }
      return;
    }
    const full = this.drawTime();
    if (pointer.down || keys[' ']) { this.drawT += dt; H.drawing = true; return; }
    if (!H.drawing) return;
    H.drawing = false;
    if (this.drawT > 0.1) {
      const p = Math.min(1, this.drawT / full);
      const shaky = Math.min(0.14, Math.max(0, this.drawT - full - 1.6) * 0.06);
      const spread = (1 - p) * 0.18 + (H.anim === 'walk' ? 0.07 : 0) + shaky;
      H.shootT = 0;
      this.shoot(H, this.aim + rand(-spread, spread), (15 + 2 * (game.bowLevel - 1)) * (1 + skill('archery') * 0.04) * (0.3 + 0.7 * p), 'arrow', 0, 480 + 340 * p);
    }
    this.drawT = 0;
  },
  drawTime() { return 0.8 * Math.pow(0.9, game.bowLevel - 1) * (1 - skill('archery') * 0.03); },
  // How an enemy guards against Gunther's sword: skilled troops read his swing and turn their
  // guard to meet it after a short reaction time; poor ones guess.
  guardAI(u, dt) {
    const H = this.hero, g = u.def.guard || 0;
    if (!u.guard) u.guard = pick(DIRS);
    if (H.swing && H.swing !== u.readSwing && dist(u.x, u.y, H.x, H.y) < 120) {
      u.readSwing = H.swing; u.react = 0.42 - g * 0.32 + rand(0, 0.08); u.willRead = Math.random() < g * 0.95 + 0.03;
    }
    if (u.react > 0) { u.react -= dt; if (u.react <= 0) u.guard = u.willRead ? u.readSwing.dir : pick(DIRS); }
    else if (!H.swing) { u.drift = (u.drift || rand(1, 2.5)) - dt; if (u.drift <= 0) { u.drift = rand(1, 2.5); if (Math.random() < 0.5) u.guard = pick(DIRS); } }
    u.guarding = g >= 0.1 || (u.react <= 0 && u.willRead);
  },
  strikeHero(u, dmg) {
    const H = this.hero;
    if (H.blocking && (pointer.touch || H.stance === u.atkDir)) {
      if (this.time - H.blockStart < 0.22 + skill('blade') * 0.012) {
        u.stun = 0.9;
        this.effects.push({ x: (u.x + H.x) / 2, y: (u.y + H.y) / 2 - 30, t: 0, kind: 'parry' });
        this.float(H.x, H.y - 76, 'Parry!', '#f2c14e');
        trainSkill('blade', 2);
      } else {
        this.effects.push({ x: (u.x + H.x) / 2, y: (u.y + H.y) / 2 - 30, t: 0, kind: 'block' });
        trainSkill('blade', 0.5);
      }
      return;
    }
    this.hurt(H, dmg, 'melee');
  },
  // Guard and attack markers: Gunther's stance in gold, each nearby enemy's guard in grey,
  // and red arrows on the side an enemy blow is coming from.
  drawCombatMarks() {
    const H = this.hero;
    if (H.dead || this.over) return;
    if (game.weapon !== 'sword') {
      if (H.drawing) {
        const p = Math.min(1, this.drawT / this.drawTime());
        ctx.strokeStyle = 'rgba(13,11,9,0.7)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(H.x, H.y - 28, 30, -Math.PI * 0.75, -Math.PI * 0.25); ctx.stroke();
        ctx.strokeStyle = p >= 1 ? '#3ddc84' : '#f2c14e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(H.x, H.y - 28, 30, -Math.PI * 0.75, -Math.PI * 0.75 + Math.PI * 0.5 * p); ctx.stroke();
      }
      return;
    }
    for (const u of this.units) {
      if (u.side !== 1 || u.dead || u.fled || u.def.ranged || dist(u.x, u.y, H.x, H.y) > 160) continue;
      const big = u.def.scale ? 1.5 : 1;
      dirMark(u.x, u.y, u.guard || 'over', 'guard', u.guarding ? '#c9bb9c' : 'rgba(201,187,156,0.35)', big);
      if (u.anim === 'attack' && !u.struck && u.target === H && u.atkDir) dirMark(H.x, H.y, u.atkDir, 'threat', '#e0533d', 1);
    }
    dirMark(H.x, H.y, H.stance, H.blocking ? 'guard' : 'stance', H.blocking ? '#f2c14e' : 'rgba(242,193,78,0.75)', 1);
    if (H.swing && !H.swing.released) {
      ctx.strokeStyle = 'rgba(13,11,9,0.7)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(H.x, H.y - 28, 30, Math.PI * 0.25, Math.PI * 0.75); ctx.stroke();
      ctx.strokeStyle = H.swing.charge >= 1 ? '#3ddc84' : '#f2c14e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(H.x, H.y - 28, 30, Math.PI * 0.75, Math.PI * 0.75 - Math.PI * 0.5 * H.swing.charge, true); ctx.stroke();
    }
  },
  walk(u, tx, ty, speed, dt) {
    if (ground.wall) ({ x: tx, y: ty } = routeAround(u, tx, ty));
    const d = dist(u.x, u.y, tx, ty);
    if (d < 1) return;
    const step = Math.min(speed * dt, d);
    u.vx = (tx - u.x) / d * speed; u.vy = (ty - u.y) / d * speed;
    u.x += (tx - u.x) / d * step; u.y += (ty - u.y) / d * step;
    u.anim = 'walk'; u.flip = tx < u.x;
  },
  // Skips to the end by rolling dice for everyone still standing.
  autoFinish() {
    if (this.over) return;
    const side = s => { const out = {}; for (const u of this.alive(s)) if (!u.isHero) out[u.type] = (out[u.type] || 0) + 1; for (const t of this.reserve[s]) out[t] = (out[t] || 0) + 1; return out; };
    import('./menus.js').then(m => {
      const a = side(0), e = side(1);
      const res = m.autoResolve(a, e, 0);
      for (const t in a) { const lost = a[t] - (res.a[t] || 0); for (let i = 0; i < lost; i++) { const bucket = Math.random() < 0.5 ? this.wounded[0] : this.killed[0]; bucket[t] = (bucket[t] || 0) + 1; } }
      for (const t in e) { const lost = e[t] - (res.b[t] || 0); this.killed[1][t] = (this.killed[1][t] || 0) + lost; }
      this.remainingEnemy = res.b;
      this.finish(res.aWins);
    });
  },
  finish(won) {
    if (this.over) return;
    this.over = true;
    this.banner = { msg: won ? 'Victory!' : 'Defeat', t: 0 };
    setHud('');
    let remaining = this.remainingEnemy;
    if (!remaining) {
      remaining = {};
      for (const u of this.alive(1)) if (!u.fleeing) remaining[u.type] = (remaining[u.type] || 0) + 1;
      for (const t of this.reserve[1]) remaining[t] = (remaining[t] || 0) + 1;
      for (const t in this.fled[1]) remaining[t] = (remaining[t] || 0) + this.fled[1][t];
      for (const u of this.alive(1)) if (u.fleeing) remaining[u.type] = (remaining[u.type] || 0) + 1;
    }
    const result = { won, killed: this.killed[0], wounded: this.wounded[0], enemyKilled: this.killed[1], enemyRemaining: remaining, heroDown: this.hero.dead, heroKills: this.heroKills || 0 };
    setTimeout(() => { if (getScene() === this) this.opts.onEnd(result); }, 1200);
  },
  draw() {
    const W = view.W, Hh = view.H;
    ctx.drawImage(ground.canvas, 0, 0, W, Hh);
    const things = [];
    if (ground.wall) { if (ground.wall.axis === 'x') drawWall(); else things.push({ y: ground.wall.pos + 12, draw: drawWall }); }
    for (const t of ground.trees) things.push({ y: t.y, draw: () => {
      shadow(t.x, t.y + 12, 16);
      if (t.rock) ctx.drawImage(img.rocks, (t.v % 3) * 16, 0, 16, 16, t.x - 24, t.y - 30, 48, 48);
      else ctx.drawImage(img.trees, t.v * 16, 0, 16, 16, t.x - 24, t.y - 34, 48, 48);
    } });
    for (const p of ground.props) things.push({ y: p.y, draw: () => {
      if (p.kind === 'tent') { shadow(p.x, p.y + 20, 38); ctx.drawImage(img['orc-tent'], 0, 0, 32, 32, p.x - 48, p.y - 66, 96, 96); }
      else if (p.kind === 'rock') { shadow(p.x, p.y + 8, 22); ctx.drawImage(img.rocks, p.v * 16, 0, 16, 16, p.x - 24, p.y - 34, 48, 48); }
      else if (p.kind === 'house') { shadow(p.x, p.y + 12, 30); ctx.drawImage(img.houses, p.v * 16, 16, 16, 16, p.x - 30, p.y - 44, 60, 60); }
      else if (p.kind === 'tree') { shadow(p.x, p.y + 10, 18); ctx.drawImage(img.trees, p.v * 16, 0, 16, 16, p.x - 24, p.y - 38, 48, 48); }
      else drawCampfire(p.x, p.y, this.time);
    } });
    const teamColour = [FACTIONS.player.colour, FACTIONS[this.enemyFaction].colour];
    for (const u of this.units) {
      if (u.fled) continue;
      things.push({ y: u.y - (u.dead ? 30 : 0), draw: () => {
        const scale = u.def && u.def.scale ? 3 : 2;
        if (u.dead) ctx.globalAlpha = clamp((6 - u.deadT) / 1.5, 0, 1);
        if (!u.dead) shadow(u.x, u.y + 4, 12 * scale / 2, u.isHero ? 'rgba(232,184,58,0.55)' : hexA(teamColour[u.side], 0.45));
        if (u.isHero) {
          const sw = game.weapon === 'sword';
          let anim = u.anim, at = u.t;
          if (sw && u.swing) { anim = 'attack'; at = u.swing.released && u.swing.rt > 0.05 ? 0.25 : 0; }
          else if (!sw && u.drawing) { anim = 'attack'; at = 0; }
          else if (!sw && u.shootT < 0.2) { anim = 'attack'; at = 0.25; }
          drawUnit('soldier', sw ? 'gunthersword' : 'gunther', '#f2c14e', u.x, u.y, 2, u.dead ? 'dead' : anim, u.dead ? u.deadT : at, u.flip);
        } else {
          const def = u.def;
          const anim = u.dead ? 'dead' : u.anim;
          const at = anim === 'attack' ? (u.at < (u.windT || 0.16) ? 0 : 0.25) : u.t;
          drawUnit(def.sprite, def.kind || '', teamColour[u.side], u.x, u.y, scale, anim, u.dead ? u.deadT : at, u.flip);
        }
        if (u.flash > 0 && !u.dead) { ctx.globalAlpha = 0.5; shadow(u.x, u.y - 18, 10, '#fff'); }
        ctx.globalAlpha = 1;
        if (!u.dead && u.hp < u.max) bar(u.x - 12 * scale / 2, u.y - 34 * scale + 2, 24 * scale / 2, 3, u.hp / u.max, u.side === 0 ? '#3ddc84' : '#e0533d');
      } });
    }
    things.sort((a, b) => a.y - b.y).forEach(t => t.draw());
    for (const s of this.shots) {
      if (s.kind === 'javelin') drawJavelin(s.x, s.y, s.a);
      else if (s.kind === 'bolt') drawBolt(s.x, s.y, s.a);
      else drawArrow(s.x, s.y, s.a);
    }
    for (const e of this.effects) {
      ctx.globalAlpha = 1 - e.t / 0.4;
      if (e.kind === 'block' || e.kind === 'parry') {
        // Sparks off steel: white for a block, a gold ring for a parry.
        ctx.strokeStyle = e.kind === 'parry' ? '#f2c14e' : '#f4ead2'; ctx.lineWidth = 3;
        const r = 6 + e.t * 60;
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.3; ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * r * 0.4, e.y + Math.sin(a) * r * 0.4); ctx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r); ctx.stroke(); }
        if (e.kind === 'parry') { ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke(); }
      } else {
        ctx.fillStyle = '#ffb04a';
        ctx.beginPath(); ctx.arc(e.x, e.y, 8 + e.t * 50, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    this.drawCombatMarks();
    for (const f of this.floats) { ctx.globalAlpha = clamp(1.4 - f.t * 1.6, 0, 1); text(f.msg, f.x, f.y - f.t * 26, 15, f.colour, 'center'); }
    ctx.globalAlpha = 1;
    // Hero's health, top left, and the head count for both sides.
    const H = this.hero;
    if (!this.over) this.refreshHud();
    if (pointer.touch && pointer.down && !this.over && !H.dead) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(pointer.startX, pointer.startY, 40, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    const top = this.bounds().y0, bot = this.bounds().y1;
    if (H.dead && !this.over) text('Gunther is down! Your men fight on.', W / 2, top + 24, 20, '#e0533d', 'center');
    if (this.banner && this.banner.t < (this.banner.msg.length > 24 ? 4 : 2.5)) text(this.banner.msg, W / 2, Hh / 2 - 40, this.banner.msg.length > 24 ? (view.portrait ? 18 : 24) : 34, '#f2c14e', 'center');
    if (this.time < 6 && !this.over) {
      const msg = pointer.touch ? (game.weapon === 'sword' ? 'Drag to move. Tap left, right or above Gunther to swing. Hold Block.' : view.portrait ? 'Drag to move. Buttons pick a group and give orders.' : 'Drag to move. Gunther shoots by himself. Buttons give orders.')
        : (game.weapon === 'sword' ? 'Move the mouse to pick a side, hold click to wind up. Right click blocks. Q: bow.' : 'WASD move, hold click to draw, release to shoot. Q: sword. 1 2 3 groups, F1 to F4 orders.');
      text(msg, W / 2, bot - (view.portrait ? 12 : -2), 14, '#f4ead2', 'center');
    }
  }
};

// ---------------------------------------------------------------- town walls (sieges)
const WALL_T = 12;      // half the wall's thickness
function wAcross(x, y) { return ground.wall.axis === 'x' ? x : y; }
function wAlong(x, y) { return ground.wall.axis === 'x' ? y : x; }
function inGap(a) { return ground.wall.gaps.some(([g0, g1]) => a > g0 + 6 && a < g1 - 6); }
function behindWall(u) { const w = ground.wall, d = wAcross(u.x, u.y) - w.pos; return (w.axis === 'x' ? d > 0 : d < 0) && Math.abs(d) < 90; }
// Nobody walks through the wall: only through a breach.
function wallBlock(u) {
  const w = ground.wall, d = wAcross(u.x, u.y) - w.pos;
  if (Math.abs(d) >= WALL_T) { u.ws = Math.sign(d); return; }
  if (inGap(wAlong(u.x, u.y))) return;
  const c = w.pos + (u.ws || Math.sign(d) || 1) * WALL_T;
  if (w.axis === 'x') u.x = c; else u.y = c;
}
// Someone heading for the other side of the wall makes for the nearest breach first.
function routeAround(u, tx, ty) {
  const w = ground.wall, c0 = wAcross(u.x, u.y) - w.pos, c1 = wAcross(tx, ty) - w.pos;
  if (Math.sign(c0) === Math.sign(c1) || Math.abs(c1) < WALL_T) return { x: tx, y: ty };
  const a = wAlong(u.x, u.y), ta = wAlong(tx, ty);
  let gc = 0, best = Infinity;
  for (const [g0, g1] of w.gaps) { const m = (g0 + g1) / 2, cost = Math.abs(a - m) + Math.abs(ta - m); if (cost < best) { best = cost; gc = m; } }
  const near = Math.abs(a - gc) < 22;
  // Line up with the breach on this side, then go through it to the far side.
  const across = near ? w.pos + Math.sign(c1) * (WALL_T + 16) : w.pos + Math.sign(c0) * (WALL_T + 18);
  return w.axis === 'x' ? { x: across, y: gc } : { x: gc, y: across };
}
function drawWall() {
  const w = ground.wall, len = w.axis === 'x' ? view.H : view.W;
  const segs = [];
  let from = -10;
  for (const [g0, g1] of w.gaps) { segs.push([from, g0]); from = g1; }
  segs.push([from, len + 10]);
  const rect = (a0, a1, c0, c1, col) => { ctx.fillStyle = col; if (w.axis === 'x') ctx.fillRect(c0, a0, c1 - c0, a1 - a0); else ctx.fillRect(a0, c0, a1 - a0, c1 - c0); };
  for (const [a0, a1] of segs) {
    rect(a0 - 3, a1 + 3, w.pos - WALL_T - 3, w.pos + WALL_T + 3, '#0d0b09');
    rect(a0, a1, w.pos - WALL_T, w.pos + WALL_T, '#9a9282');
    // Mortar lines and battlements on the attackers' side.
    for (let a = Math.ceil(a0 / 12) * 12; a < a1; a += 12) rect(a, a + 2, w.pos - WALL_T, w.pos + WALL_T, '#7d766a');
    const out = w.axis === 'x' ? -1 : 1;
    for (let a = Math.ceil(a0 / 18) * 18; a < a1 - 8; a += 18) {
      const c = w.pos + out * WALL_T;
      rect(a, a + 9, Math.min(c, c + out * 8), Math.max(c, c + out * 8), '#0d0b09');
      rect(a + 2, a + 7, Math.min(c, c + out * 6), Math.max(c, c + out * 6), '#b3ab99');
    }
  }
  // Rubble in the breaches.
  for (const [g0, g1] of w.gaps) for (let k = 0; k < 5; k++) {
    const a = g0 + 6 + ((k * 37) % Math.max(1, g1 - g0 - 12)), c = w.pos + ((k * 13) % 20) - 10;
    rect(a, a + 6, c, c + 5, '#7d766a');
  }
}

function hexA(h, a) { return 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')'; }

function pushOut(obj, cx, cy, r) {
  const d = dist(obj.x, obj.y, cx, cy);
  if (d < r && d > 0) { obj.x = cx + (obj.x - cx) / d * r; obj.y = cy + (obj.y - cy) / d * r; }
}

function drawArrow(x, y, angle) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(6, 0); ctx.stroke();
  ctx.fillStyle = '#cfd6e0';
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e9e4d8'; ctx.fillRect(-19, -3, 6, 6);
  ctx.restore();
}

function drawJavelin(x, y, angle) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(8, 0); ctx.stroke();
  ctx.fillStyle = '#9aa2ac';
  ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(6, -3); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// A crossbow bolt: short, thick and fast.
function drawBolt(x, y, angle) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(4, 0); ctx.stroke();
  ctx.fillStyle = '#6a7078';
  ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(3, -3); ctx.lineTo(3, 3); ctx.closePath(); ctx.fill();
  ctx.restore();
}

const DIRS = ['left', 'over', 'right'];
function angleGap(a, b) { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; }
// A small marker on one side of a fighter. 'guard' is a bar (a raised guard), 'stance' a chevron
// pointing out (where Gunther will swing from), 'threat' a bigger chevron pointing in (an incoming blow).
function dirMark(x, y, dir, style, colour, big) {
  const cy = y - 28 * big, threat = style === 'threat';
  const side = (threat ? 46 : 34) * big, top = (threat ? 64 : 54) * big;
  ctx.fillStyle = colour; ctx.strokeStyle = 'rgba(13,11,9,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (style === 'guard') {
    if (dir === 'over') ctx.rect(x - 14, cy - top, 28, 6); else ctx.rect(x + (dir === 'left' ? -side - 3 : side - 3), cy - 14, 6, 28);
  } else {
    const s = threat ? 12 : 8, o = threat ? -1 : 1;     // threats point inwards, at Gunther
    if (dir === 'over') { const by = cy - top; ctx.moveTo(x - s, by + s * 0.7 * o); ctx.lineTo(x + s, by + s * 0.7 * o); ctx.lineTo(x, by - s * 0.7 * o); }
    else { const sx = dir === 'left' ? -1 : 1, bx = x + sx * side; ctx.moveTo(bx - sx * s * 0.7 * o, cy - s); ctx.lineTo(bx - sx * s * 0.7 * o, cy + s); ctx.lineTo(bx + sx * s * 0.7 * o, cy); }
    ctx.closePath();
  }
  ctx.fill(); ctx.stroke();
}

// Foot soldiers and bowmen take orders separately.
function groupOf(u) { return u.def && u.def.ranged ? 'bows' : 'foot'; }

function drawCampfire(x, y, t) {
  const glow = ctx.createRadialGradient(x, y - 8, 4, x, y - 8, 70);
  glow.addColorStop(0, 'rgba(255, 190, 90, 0.35)');
  glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = glow; ctx.fillRect(x - 70, y - 78, 140, 140);
  ctx.fillStyle = '#7a8088';
  for (let a = 0; a < 8; a++) ctx.fillRect(Math.round((x + Math.cos(a * 0.785) * 18) / 3) * 3 - 3, Math.round((y + Math.sin(a * 0.785) * 9) / 3) * 3 - 3, 6, 6);
  ctx.fillStyle = '#6b4424'; ctx.fillRect(x - 15, y - 3, 30, 6);
  ctx.fillStyle = '#58371d'; ctx.fillRect(x - 3, y - 9, 6, 15);
  [['#e8572a', 12, 18], ['#f39a2b', 9, 13], ['#ffe08a', 5, 8]].forEach(([col, wdt, ht], k) => {
    const flick = Math.round(Math.sin(t * 14 + k * 2) * 1.5) * 3;
    ctx.fillStyle = col;
    ctx.fillRect(x - wdt, y - ht - 3 + Math.abs(flick), wdt * 2, ht);
    ctx.fillRect(x - wdt / 2 + flick, y - ht - 9, wdt, 6);
  });
}

onKeyPress(k => {
  if (getScene() !== battleScene || battleScene.over) return;
  if (k === 'g' || k === 'tab') battleScene.nextGroup();
  if (k === 'q') battleScene.swapWeapon();
  if (k === '1') battleScene.setGroup('all');
  if (k === '2') battleScene.setGroup('foot');
  if (k === '3') battleScene.setGroup('bows');
  const o = { f1: 'charge', f2: 'hold', f3: 'follow', f4: 'fallback' }[k];
  if (o) battleScene.setOrder(o);
});

// Rotating the phone mid-battle: rebuild the ground and keep everyone on the field.
onResize(() => {
  if (getScene() !== battleScene) return;
  buildGround(battleScene.opts.kind);
});
