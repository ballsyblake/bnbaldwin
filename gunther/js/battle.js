// Real-time battles. Gunther fights in person (move and shoot as before) while his troops follow
// simple orders: Charge, Hold or Follow. Each soldier is a small "agent" that picks a target,
// walks to it and attacks, which is enough to give the feel of two lines crashing together.

import { ctx, view, keys, pointer, clamp, dist, rand, text, shadow, bar, hint, setHud, onKeyPress, getScene, noise, seeded, onResize } from './core.js';
import { img, drawUnit } from './sprites.js';
import { TROOPS, FACTIONS } from './data.js';
import { game, playerFit, skill, trainSkill } from './state.js';

const PX = 3;

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
  if (camp) {
    P(0.5, 0.36, 'fire', 18);
    if (view.portrait) { P(0.22, 0.24, 'tent', 30); P(0.78, 0.24, 'tent', 30); } else { P(0.36, 0.24, 'tent', 30); P(0.64, 0.24, 'tent', 30); }
    if (kind === 'stronghold') { P(0.82, 0.62, 'tent', 30); P(0.18, 0.62, 'tent', 30); }
  } else {
    P(0.3, 0.3, 'rock', 20, 0); P(0.72, 0.74, 'rock', 20, 2);
    if (kind === 'forest') { P(0.5, 0.5, 'tree', 16, 2); P(0.2, 0.75, 'tree', 16, 1); }
  }
  ground = { canvas: c, trees, props, kind, W, H };
}

// ---------------------------------------------------------------- battle scene
const FIELD_CAP = () => view.portrait ? 18 : 24;     // most soldiers per side on the field at once

export const battleScene = {
  // opts: { enemy: { troops, faction, name }, kind: 'field' | 'forest' | 'hills' | 'camp' | 'stronghold', onEnd(result) }
  enter(opts) {
    this.opts = opts;
    this.enemyFaction = opts.enemy.faction;
    if (!ground || ground.kind !== opts.kind || ground.W !== view.W || ground.H !== view.H) buildGround(opts.kind);
    this.units = []; this.shots = []; this.effects = [];
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
  bounds() { return { x0: 40, y0: 96, x1: view.W - 40, y1: view.H - (view.portrait ? 70 : 54) }; },
  hud() {
    const cur = this.group === 'all' ? (this.orders.foot === this.orders.bows ? this.orders.foot : '') : this.orders[this.group];
    const b = o => '<button data-act="order" data-arg="' + o + '"' + (cur === o ? ' class="on"' : '') + '>' + { charge: 'Charge', hold: 'Hold', follow: 'Follow' }[o] + '</button>';
    const g = '<button data-act="group">' + { all: 'All', foot: 'Foot', bows: 'Bows' }[this.group] + '</button>';
    let html = g + b('charge') + b('hold') + b('follow');
    if (this.hero.dead && !this.over) html = '<button data-act="finish">Let your men finish it</button>';
    setHud(html, { order: o => this.setOrder(o), group: () => this.nextGroup(), finish: () => this.autoFinish() });
  },
  nextGroup() {
    this.group = { all: 'foot', foot: 'bows', bows: 'all' }[this.group];
    this.hud();
  },
  setOrder(o) {
    const groups = this.group === 'all' ? ['foot', 'bows'] : [this.group];
    for (const g of groups) this.orders[g] = o;
    for (const u of this.units) if (u.side === 0 && !u.isHero && groups.includes(groupOf(u))) { u.holdX = u.x; u.holdY = u.y; }
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
    if (u.isHero) amount *= 1 - Math.min(0.5, (game.armourLevel - 1) * 0.08);
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
    if (!H.dead && !this.over) {
      let mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
      let my = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
      if (pointer.touch && pointer.down) {
        const jx = pointer.x - pointer.startX, jy = pointer.y - pointer.startY;
        if (Math.hypot(jx, jy) > 12) { mx = jx; my = jy; }
      }
      const len = Math.hypot(mx, my);
      H.anim = len > 0 ? 'walk' : 'idle';
      if (len > 0) { H.x += mx / len * 190 * dt; H.y += my / len * 190 * dt; }
      let wantFire = false;
      if (pointer.touch) {
        const o = this.nearestFoe(H, 520);
        if (o) { this.aim = Math.atan2(o.y - 16 - (H.y - 26), o.x - H.x); wantFire = true; }
      } else {
        this.aim = Math.atan2(pointer.y - (H.y - 26), pointer.x - H.x);
        wantFire = pointer.down || keys[' '];
      }
      H.flip = Math.cos(this.aim) < 0;
      this.fireTimer -= dt;
      if (wantFire && this.fireTimer <= 0) {
        this.fireTimer = Math.max(0.5 * Math.pow(0.8, game.bowLevel - 1) * (1 - skill('archery') * 0.02), 0.13);
        H.shootT = 0;
        this.shoot(H, this.aim, (14 + 2 * (game.bowLevel - 1)) * (1 + skill('archery') * 0.04), 'arrow', 0, 760);
      }
    }
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
        const order = u.side === 0 ? this.orders[groupOf(u)] : 'charge';
        if (order === 'hold') reach = def.ranged ? def.range : 90;
        if (order === 'follow') reach = def.ranged ? def.range : 110;
        u.target = this.nearestFoe(u, reach);
      }
      const T = u.target;
      if (u.anim === 'attack' && u.at < (def.ranged ? 0.35 : 0.32)) {
        // Mid-swing: the blow lands part way through.
        if (!def.ranged && !u.struck && u.at > 0.16 && T && !T.dead && dist(u.x, u.y, T.x, T.y) < def.range + 14) {
          u.struck = true;
          this.hurt(T, def.dmg * rand(0.8, 1.2) * (1 - (T.def && T.def.block || 0) * 0.3), 'melee');
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
            const speed2 = def.javelin ? 460 : 620;
            const lead = d / speed2;
            const tx = T.x + (T.vx || 0) * lead, ty = T.y - 16 + (T.vy || 0) * lead;
            const a = Math.atan2(ty - (u.y - 26), tx - u.x) + rand(-0.07, 0.07);
            this.shoot(u, a, def.dmg, def.javelin ? 'javelin' : 'arrow', u.side, speed2);
          }
        } else if (d <= def.range + (def.scale ? 14 : 0)) {
          u.anim = 'idle';
          if (u.cd <= 0) { u.cd = def.cd * rand(0.9, 1.2); u.anim = 'attack'; u.at = 0; u.struck = false; }
        } else this.walk(u, T.x, T.y, speed, dt);
      } else if (u.side === 0 && this.orders[groupOf(u)] === 'follow' && !H.dead) {
        const k = this.units.indexOf(u);
        const ang = k * 2.4, r = 50 + (k % 3) * 22;
        if (dist(u.x, u.y, H.x + Math.cos(ang) * r, H.y + Math.sin(ang) * r * 0.6) > 12) this.walk(u, H.x + Math.cos(ang) * r, H.y + Math.sin(ang) * r * 0.6, speed * 1.1, dt);
        else u.anim = 'idle';
      } else if (u.side === 0 && this.orders[groupOf(u)] !== 'charge') {
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
          const block = u.def && u.def.block || 0;
          this.hurt(u, s.dmg * (1 - block * 0.55), s.hero ? 'hero' : 'shot');
          if (s.hero) trainSkill('archery', 1);
          break;
        }
      }
    }
    this.shots = this.shots.filter(s => !s.gone);
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter(e => e.t < 0.4);
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
  walk(u, tx, ty, speed, dt) {
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
    for (const t of ground.trees) things.push({ y: t.y, draw: () => {
      shadow(t.x, t.y + 12, 16);
      if (t.rock) ctx.drawImage(img.rocks, (t.v % 3) * 16, 0, 16, 16, t.x - 24, t.y - 30, 48, 48);
      else ctx.drawImage(img.trees, t.v * 16, 0, 16, 16, t.x - 24, t.y - 34, 48, 48);
    } });
    for (const p of ground.props) things.push({ y: p.y, draw: () => {
      if (p.kind === 'tent') { shadow(p.x, p.y + 20, 38); ctx.drawImage(img['orc-tent'], 0, 0, 32, 32, p.x - 48, p.y - 66, 96, 96); }
      else if (p.kind === 'rock') { shadow(p.x, p.y + 8, 22); ctx.drawImage(img.rocks, p.v * 16, 0, 16, 16, p.x - 24, p.y - 34, 48, 48); }
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
          const shooting = !u.dead && u.shootT < 0.25;
          drawUnit('gunther', '', '', u.x, u.y, 2, u.dead ? 'dead' : shooting ? 'attack' : u.anim, u.dead ? u.deadT : shooting ? u.shootT : u.t, u.flip);
        } else {
          const def = u.def;
          const anim = u.dead ? 'dead' : u.anim;
          drawUnit(def.sprite, def.kind || '', teamColour[u.side], u.x, u.y, scale, anim, u.dead ? u.deadT : (anim === 'attack' || anim === 'cast' ? u.at : u.t), u.flip);
        }
        if (u.flash > 0 && !u.dead) { ctx.globalAlpha = 0.5; shadow(u.x, u.y - 18, 10, '#fff'); }
        ctx.globalAlpha = 1;
        if (!u.dead && u.hp < u.max) bar(u.x - 12 * scale / 2, u.y - 34 * scale + 2, 24 * scale / 2, 3, u.hp / u.max, u.side === 0 ? '#50f08b' : '#f05a50');
      } });
    }
    things.sort((a, b) => a.y - b.y).forEach(t => t.draw());
    for (const s of this.shots) {
      if (s.kind === 'javelin') drawJavelin(s.x, s.y, s.a);
      else drawArrow(s.x, s.y, s.a);
    }
    for (const e of this.effects) {
      ctx.globalAlpha = 1 - e.t / 0.4; ctx.fillStyle = '#ffb04a';
      ctx.beginPath(); ctx.arc(e.x, e.y, 8 + e.t * 50, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    // Hero's health, top left, and the head count for both sides.
    const H = this.hero;
    const mine = this.alive(0).filter(u => !u.isHero).length + this.reserve[0].length;
    const theirs = this.alive(1).filter(u => !u.fleeing).length + this.reserve[1].length;
    text('Gunther', 12, 24, 15, '#ffe08a');
    bar(80, 14, 120, 8, game.health / game.maxHealth, game.health > game.maxHealth * 0.3 ? '#50f08b' : '#f05a50');
    text('Your men ' + mine, 12, 46, 15, '#ffe08a');
    text(this.opts.enemy.name + ' ' + theirs, W - 12, 24, 15, '#ffb0a0', 'right');
    text('Foot: ' + this.orders.foot + '   Bows: ' + this.orders.bows, 12, 66, 13, '#d8dce6');
    if (pointer.touch && pointer.down && !this.over && !H.dead) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(pointer.startX, pointer.startY, 40, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (H.dead && !this.over) text('Gunther is down! Your men fight on.', W / 2, 100, 20, '#ff9a8a', 'center');
    if (this.banner && this.banner.t < 2.5) text(this.banner.msg, W / 2, Hh / 2 - 40, 30, '#ffe08a', 'center');
    if (this.time < 5 && !this.over) {
      if (pointer.touch) hint('Drag to move. Gunther shoots by himself. Buttons give orders.', 'Drag to move. Buttons give orders.');
      else hint('WASD move, hold click to shoot. G: Foot/Bows. 1/2/3: orders.', 'WASD, click to shoot, G group, 1/2/3 orders.');
    }
  }
};

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
  if (k === '1') battleScene.setOrder('charge');
  if (k === '2') battleScene.setOrder('hold');
  if (k === '3') battleScene.setOrder('follow');
});

// Rotating the phone mid-battle: rebuild the ground and keep everyone on the field.
onResize(() => {
  if (getScene() !== battleScene) return;
  buildGround(battleScene.opts.kind);
});
