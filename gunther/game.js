// Gunther: a small canvas action game.
// Structure: one shared `game` state object, and three scenes (map, battle, town/menus).
// Menus are ordinary HTML drawn over the canvas; the action is drawn on the canvas.
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const stage = document.getElementById('stage');
  // Logical size of the play area. Wide on desktop and sideways phones, tall on upright phones.
  let W = 960;
  let H = 540;
  let portrait = false;

  // ---------------------------------------------------------------- assets
  const ASSET_NAMES = ['gunther', 'orc-yellow', 'orc-red',
    'trees', 'keep', 'houses', 'grass', 'orc-tent', 'big-tree'];
  const img = {};

  function loadAssets() {
    return Promise.all(ASSET_NAMES.map(name => new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = resolve;
      i.onerror = () => reject(new Error('Could not load ' + name));
      i.src = 'assets/' + name + '.png';
      img[name] = i;
    })));
  }

  // ---------------------------------------------------------------- saved state
  const SAVE_KEY = 'gunther-save-v1';
  const START = { gold: 0, maxHealth: 100, health: 100, bowLevel: 1, armourLevel: 1, campsCleared: 0, visitedTown: false };
  const game = Object.assign({}, START);

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { /* private mode: play without saving */ }
  }
  function loadSave() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (data && typeof data.gold === 'number') { Object.assign(game, START, data); return true; }
    } catch (e) { /* ignore */ }
    return false;
  }

  // Difficulty and prices. Each cleared camp makes the next one harder.
  const rules = {
    fireDelay: () => Math.max(0.5 * Math.pow(0.8, game.bowLevel - 1), 0.12),
    bowMaxed: () => rules.fireDelay() <= 0.12,
    waveTarget: () => 10 + game.campsCleared * 5,
    spawnInterval: () => Math.max(1.2 - game.campsCleared * 0.12, 0.35),
    orcSpeed: () => 70 + Math.min(game.campsCleared, 8) * 8,
    redOrcChance: () => Math.min(game.campsCleared * 0.15, 0.6),
    campReward: () => 20 + game.campsCleared * 10,
    restCost: () => 5,
    bowCost: () => 15 * game.bowLevel,
    armourCost: () => 20 * game.armourLevel
  };

  // ---------------------------------------------------------------- input
  const keys = {};
  const pointer = { x: 480, y: 270, down: false, startX: 0, startY: 0, touch: false, clicked: false };

  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; pointer.down = false; });

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) * W / r.width;
    pointer.y = (e.clientY - r.top) * H / r.height;
  }
  canvas.addEventListener('pointerdown', e => {
    pointerPos(e);
    pointer.touch = e.pointerType === 'touch';
    pointer.down = true;
    pointer.clicked = true;
    pointer.startX = pointer.x;
    pointer.startY = pointer.y;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', pointerPos);
  canvas.addEventListener('pointerup', () => { pointer.down = false; });
  canvas.addEventListener('pointercancel', () => { pointer.down = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---------------------------------------------------------------- helpers
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  // Small deterministic random generator so the island looks the same every visit.
  function seeded(seed) {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  }

  // Draws one frame from a horizontal sprite strip or grid.
  function drawFrame(image, fw, fh, col, row, x, y, scale, flip) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(image, col * fw, row * fh, fw, fh, -fw * scale / 2, -fh * scale / 2, fw * scale, fh * scale);
    ctx.restore();
  }

  // Gunther and the orcs share one sheet layout: 32x32 frames, 10 columns,
  // rows for idle (0), walk (2), attack (3) and death (4). Feet are at the bottom of the frame.
  function drawGunther(x, y, scale, anim, time, flip) {
    let row = 0, col = Math.floor(time * 8) % 10;
    if (anim === 'run') { row = 2; col = Math.floor(time * 12) % 10; }
    else if (anim === 'shoot') { row = 3; col = 3 + Math.min(Math.floor(time * 24), 5); }
    else if (anim === 'death') { row = 4; col = Math.min(Math.floor(time * 10), 9); }
    shadow(x, y + 2 * scale, 7 * scale);
    drawFrame(img.gunther, 32, 32, col, row, x, y - 13 * scale, scale, flip);
  }

  // Soft oval shadow so characters and trees look planted on the ground.
  function shadow(x, y, r) {
    ctx.fillStyle = 'rgba(20, 40, 20, 0.28)';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  }

  // One grass tile. Mostly plain, with a few tufts picked by a hash so it doesn't look like a chessboard.
  function drawGrass(sx, sy, tx, ty) {
    const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    const v = h % 11;
    ctx.drawImage(img.grass, v === 0 ? 16 : (v === 1 ? 32 : 0), 0, 16, 16, sx, sy, 48, 48);
  }

  function text(str, x, y, size, colour, align) {
    ctx.font = '600 ' + size + 'px system-ui, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = colour || '#fff';
    ctx.fillText(str, x, y);
  }

  function statsParts() {
    return ['Gold ' + game.gold + '   Health ' + Math.ceil(game.health) + '/' + game.maxHealth,
      'Bow Lv ' + game.bowLevel + '   Armour Lv ' + game.armourLevel + '   Camps cleared ' + game.campsCleared];
  }
  function statsLine() { return statsParts().join('   '); }
  // Draws the stats on one line when wide and two lines when tall. Returns the y of the last line.
  function drawStats(y, size) {
    if (!portrait) { text(statsLine(), 12, y, size); return y; }
    const parts = statsParts();
    text(parts[0], 12, y, size);
    text(parts[1], 12, y + size + 6, size);
    return y + size + 6;
  }
  // Bottom-of-screen hint. Pass a shorter string for tall screens.
  function hint(wide, tall) { text(portrait ? tall : wide, W / 2, H - 16, 15, '#fff', 'center'); }

  // ---------------------------------------------------------------- menus (HTML overlay)
  function showPanel(html, handlers) {
    overlay.innerHTML = '<div class="panel">' + html + '</div>';
    overlay.classList.add('show');
    overlay.querySelectorAll('button[data-act]').forEach(b => {
      b.addEventListener('click', () => handlers[b.dataset.act]());
    });
  }
  function hidePanel() { overlay.classList.remove('show'); overlay.innerHTML = ''; }

  // ---------------------------------------------------------------- scenes
  let scene = null;
  function setScene(next) { hidePanel(); pointer.clicked = false; pointer.down = false; scene = next; if (scene.enter) scene.enter(); }

  // ---- Title
  const titleScene = {
    enter() {
      const hasSave = loadSave();
      showPanel(
        '<h1>GUNTHER</h1>' +
        '<p>Orcs are raiding the island. Clear their camps, earn gold, and gear up in town before the next fight.</p>' +
        (hasSave ? '<button data-act="continue">Continue</button>' : '') +
        '<button data-act="new"' + (hasSave ? ' class="secondary"' : '') + '>New game</button>' +
        '<p>Map: click or tap to walk.<br>Battle: WASD to move, mouse to aim, hold click to shoot.<br>On a phone: drag to move, Gunther aims and shoots by himself.</p>',
        {
          continue: () => setScene(mapScene),
          new: () => { Object.assign(game, START); mapScene.reset(); save(); setScene(mapScene); }
        });
    },
    update() {},
    draw() { mapScene.draw(); }
  };

  // ---- World map
  const TILE = 48;
  const MAP_W = 44;
  const MAP_H = 30;
  const TOWN = { tx: 14, ty: 17, label: 'Town', colour: '#ffd95a' };
  const CAMP = { tx: 30, ty: 11, label: 'Orc Camp', colour: '#ff5a4a' };
  const land = [];      // land[y][x] = true where Gunther can walk
  const decor = [];     // trees and houses scattered on the island

  function buildMap() {
    const rnd = seeded(7);
    const wobble = [];
    for (let i = 0; i < 64; i++) wobble.push(rnd());
    for (let y = 0; y < MAP_H; y++) {
      land.push([]);
      for (let x = 0; x < MAP_W; x++) {
        const dx = (x - 22) / 18;
        const dy = (y - 15) / 11.5;
        const angle = Math.atan2(dy, dx);
        const bump = 0.12 * Math.sin(angle * 5 + 1) + 0.08 * Math.sin(angle * 9 + 2);
        land[y].push(Math.hypot(dx, dy) < 0.86 + bump);
      }
    }
    const places = [TOWN, CAMP];
    for (let y = 1; y < MAP_H - 1; y++) {
      for (let x = 1; x < MAP_W - 1; x++) {
        if (!land[y][x]) continue;
        const nearPlace = places.some(p => Math.abs(p.tx - x) < 3 && Math.abs(p.ty - y) < 3);
        const r = rnd();
        if (!nearPlace && r < 0.13) decor.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, kind: 'tree', variant: 1 + Math.floor(rnd() * 3) });
      }
    }
    // A few houses around the keep so the town reads as a town.
    [[-2, 0, 0], [2, 0, 1], [-1, 1.4, 2], [1.2, 1.5, 0]].forEach(h => {
      decor.push({ x: (TOWN.tx + 0.5 + h[0]) * TILE, y: (TOWN.ty + 0.5 + h[1]) * TILE, kind: 'house', variant: h[2] });
    });
    decor.sort((a, b) => a.y - b.y);
  }

  function isLand(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    return ty >= 0 && ty < MAP_H && tx >= 0 && tx < MAP_W && land[ty][tx];
  }
  function placePos(p) { return { x: (p.tx + 0.5) * TILE, y: (p.ty + 0.5) * TILE }; }

  const mapScene = {
    player: { x: 0, y: 0, tx: 0, ty: 0, moving: false, flip: false, time: 0 },
    armed: false,
    time: 0,
    reset() {
      const t = placePos(TOWN);
      this.player.x = t.x + 150; this.player.y = t.y - 90;
      this.player.moving = false;
    },
    enter() { this.armed = false; this.armTimer = 0.5; pointer.clicked = false; },
    camera() {
      return {
        x: clamp(this.player.x - W / 2, 0, MAP_W * TILE - W),
        y: clamp(this.player.y - H / 2, 0, MAP_H * TILE - H)
      };
    },
    update(dt) {
      this.time += dt;
      const p = this.player;
      p.time += dt;
      if (this.armTimer > 0) { this.armTimer -= dt; if (this.armTimer <= 0) this.armed = true; }
      const cam = this.camera();
      if (pointer.clicked || (pointer.down && !pointer.touch)) {
        p.tx = pointer.x + cam.x; p.ty = pointer.y + cam.y; p.moving = true;
      }
      pointer.clicked = false;
      if (p.moving) {
        const d = dist(p.x, p.y, p.tx, p.ty);
        if (d < 4) { p.moving = false; }
        else {
          const step = Math.min(170 * dt, d);
          const vx = (p.tx - p.x) / d * step;
          const vy = (p.ty - p.y) / d * step;
          if (Math.abs(vx) > 0.05) p.flip = vx < 0;
          // Move one axis at a time so Gunther slides along the shore instead of sticking.
          let moved = false;
          if (isLand(p.x + vx, p.y)) { p.x += vx; moved = true; }
          if (isLand(p.x, p.y + vy)) { p.y += vy; moved = true; }
          if (!moved) p.moving = false;
        }
      }
      if (this.armed) {
        const t = placePos(TOWN);
        const c = placePos(CAMP);
        if (dist(p.x, p.y, t.x, t.y + 20) < 44) { p.x = t.x + 110; p.y = t.y + 70; p.moving = false; setScene(townScene); }
        else if (dist(p.x, p.y, c.x, c.y + 10) < 44) { p.x = c.x - 100; p.y = c.y + 70; p.moving = false; setScene(battleScene); }
      }
    },
    draw() {
      const cam = this.camera();
      ctx.fillStyle = '#42acaf';
      ctx.fillRect(0, 0, W, H);
      const x0 = Math.floor(cam.x / TILE), y0 = Math.floor(cam.y / TILE);
      for (let ty = y0; ty <= y0 + Math.ceil(H / TILE); ty++) {
        for (let tx = x0; tx <= x0 + Math.ceil(W / TILE); tx++) {
          const sx = tx * TILE - Math.round(cam.x), sy = ty * TILE - Math.round(cam.y);
          const here = ty >= 0 && ty < MAP_H && tx >= 0 && tx < MAP_W && land[ty][tx];
          if (!here) {
            // Light water next to the shore.
            const nearLand = isLand((tx + 1.5) * TILE, (ty + 0.5) * TILE) || isLand((tx - 0.5) * TILE, (ty + 0.5) * TILE) ||
              isLand((tx + 0.5) * TILE, (ty + 1.5) * TILE) || isLand((tx + 0.5) * TILE, (ty - 0.5) * TILE);
            if (nearLand) { ctx.fillStyle = '#77c0b4'; ctx.fillRect(sx, sy, TILE, TILE); }
            continue;
          }
          const edge = !isLand((tx + 1.5) * TILE, (ty + 0.5) * TILE) || !isLand((tx - 0.5) * TILE, (ty + 0.5) * TILE) ||
            !isLand((tx + 0.5) * TILE, (ty + 1.5) * TILE) || !isLand((tx + 0.5) * TILE, (ty - 0.5) * TILE);
          if (edge) { ctx.fillStyle = '#e7d593'; ctx.fillRect(sx, sy, TILE, TILE); }
          else {
            drawGrass(sx, sy, tx, ty);
          }
        }
      }
      // Places, scenery and Gunther, sorted so things lower on screen draw in front.
      const things = decor.map(d => ({ y: d.y, draw: () => {
        shadow(d.x - cam.x, d.y - cam.y + 12, 16);
        if (d.kind === 'tree') ctx.drawImage(img.trees, d.variant * 16, 0, 16, 16, d.x - cam.x - 24, d.y - cam.y - 34, 48, 48);
        else ctx.drawImage(img.houses, d.variant * 16, 0, 16, 16, d.x - cam.x - 24, d.y - cam.y - 30, 48, 48);
      } }));
      [TOWN, CAMP].forEach(place => {
        const pos = placePos(place);
        things.push({ y: pos.y - 6, draw: () => {
          const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
          ctx.beginPath();
          ctx.ellipse(pos.x - cam.x, pos.y - cam.y + 24, 52, 26, 0, 0, Math.PI * 2);
          ctx.globalAlpha = 0.25 + 0.2 * pulse; ctx.fillStyle = place.colour; ctx.fill();
          ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = place.colour; ctx.stroke();
          if (place === TOWN) ctx.drawImage(img.keep, 0, 0, 32, 32, pos.x - cam.x - 48, pos.y - cam.y - 62, 96, 96);
          else ctx.drawImage(img['orc-tent'], 0, 0, 32, 32, pos.x - cam.x - 40, pos.y - cam.y - 50, 80, 80);
          text(place.label, pos.x - cam.x, pos.y - cam.y - 68, 18, '#fff', 'center');
        } });
      });
      const p = this.player;
      things.push({ y: p.y, draw: () => drawGunther(p.x - cam.x, p.y - cam.y, 2, p.moving ? 'run' : 'idle', p.time, p.flip) });
      things.sort((a, b) => a.y - b.y).forEach(t => t.draw());

      drawStats(24, 16);
      hint('Click or tap to walk. Town: heal and upgrade. Orc Camp: fight for gold.', 'Tap to walk. Visit the Town or the Orc Camp.');
    }
  };

  // ---- Battle
  const ARENA = { x0: 30, y0: 60, x1: 930, y1: 520 };
  const TREE_SPOTS = [[0.21, 0.33], [0.79, 0.28], [0.31, 0.8], [0.73, 0.78]]; // as fractions of the play area
  const TREES = TREE_SPOTS.map(() => ({ x: 0, y: 0 }));

  // Called at start and whenever the window changes shape (for example the phone is rotated).
  function resize() {
    portrait = window.innerHeight > window.innerWidth * 1.15;
    W = portrait ? 540 : 960;
    H = portrait ? 900 : 540;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    stage.classList.toggle('portrait', portrait);
    ARENA.x1 = W - 30; ARENA.y1 = H - 20;
    TREE_SPOTS.forEach((spot, i) => { TREES[i].x = spot[0] * W; TREES[i].y = spot[1] * H; });
    pointer.down = false;
  }
  window.addEventListener('resize', resize);
  const TREE_R = 20;

  const battleScene = {
    enter() {
      // A battle never starts below half health, so a loss can never leave you stuck.
      game.health = Math.max(game.health, game.maxHealth * 0.5);
      this.p = { x: W / 2, y: H / 2, flip: false, time: 0, moving: false, dead: false, deadTime: 0, hurtFlash: 0, shootTime: 9 };
      this.orcs = [];
      this.arrows = [];
      this.kills = 0;
      this.spawned = 0;
      this.target = rules.waveTarget();
      this.spawnTimer = 0.6;
      this.fireTimer = 0;
      this.aim = 0;
      this.over = false;
      this.time = 0;
    },
    spawnOrc() {
      const side = Math.floor(Math.random() * 4);
      const o = { time: Math.random(), state: 'walk', stateTime: 0, attackTimer: 0, flash: 0 };
      if (side === 0) { o.x = -30; o.y = Math.random() * H; }
      else if (side === 1) { o.x = W + 30; o.y = Math.random() * H; }
      else if (side === 2) { o.x = Math.random() * W; o.y = -30; }
      else { o.x = Math.random() * W; o.y = H + 30; }
      o.red = Math.random() < rules.redOrcChance();
      o.hp = o.red ? 3 : 1 + Math.floor(game.campsCleared / 3);
      o.speed = rules.orcSpeed() * (o.red ? 1.2 : 1) * (0.9 + Math.random() * 0.2);
      this.orcs.push(o);
      this.spawned++;
    },
    nearestOrc() {
      let best = null, bestD = Infinity;
      for (const o of this.orcs) {
        if (o.state === 'dead') continue;
        const d = dist(o.x, o.y, this.p.x, this.p.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best;
    },
    update(dt) {
      this.time += dt;
      const p = this.p;
      p.time += dt;
      p.hurtFlash = Math.max(0, p.hurtFlash - dt);
      p.shootTime += dt;
      if (p.dead) { p.deadTime += dt; }

      if (!this.over) {
        // Movement: keyboard, or drag on a touch screen.
        let mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
        let my = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
        if (pointer.touch && pointer.down) {
          const jx = pointer.x - pointer.startX, jy = pointer.y - pointer.startY;
          if (Math.hypot(jx, jy) > 12) { mx = jx; my = jy; }
        }
        const len = Math.hypot(mx, my);
        p.moving = len > 0;
        if (p.moving) {
          p.x += mx / len * 190 * dt;
          p.y += my / len * 190 * dt;
        }
        for (const t of TREES) pushOut(p, t.x, t.y, TREE_R + 12);
        p.x = clamp(p.x, ARENA.x0, ARENA.x1);
        p.y = clamp(p.y, ARENA.y0, ARENA.y1);

        // Aiming and shooting.
        let wantFire = false;
        if (pointer.touch) {
          const o = this.nearestOrc();
          if (o) { this.aim = Math.atan2(o.y - 16 - (p.y - 28), o.x - p.x); wantFire = dist(o.x, o.y, p.x, p.y) < 520; }
        } else {
          this.aim = Math.atan2(pointer.y - (p.y - 28), pointer.x - p.x);
          wantFire = pointer.down || keys[' '];
        }
        p.flip = Math.cos(this.aim) < 0;
        this.fireTimer -= dt;
        if (wantFire && this.fireTimer <= 0) {
          this.fireTimer = rules.fireDelay();
          p.shootTime = 0;
          this.arrows.push({ x: p.x + Math.cos(this.aim) * 26, y: p.y - 28 + Math.sin(this.aim) * 26, a: this.aim, travelled: 0 });
        }

        // Spawning.
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.spawned < this.target) {
          this.spawnTimer = rules.spawnInterval();
          this.spawnOrc();
        }
      }

      // Arrows.
      for (const a of this.arrows) {
        const step = 760 * dt;
        a.x += Math.cos(a.a) * step; a.y += Math.sin(a.a) * step; a.travelled += step;
        if (a.travelled > 900) a.gone = true;
        for (const t of TREES) if (dist(a.x, a.y, t.x, t.y - 10) < TREE_R) a.gone = true;
        for (const o of this.orcs) {
          if (a.gone || o.state === 'dead') continue;
          if (dist(a.x, a.y, o.x, o.y - 18) < 22) {
            a.gone = true;
            o.hp -= 1; o.flash = 0.15;
            if (o.hp <= 0) { o.state = 'dead'; o.stateTime = 0; this.kills++; }
          }
        }
      }
      this.arrows = this.arrows.filter(a => !a.gone);

      // Orcs.
      for (const o of this.orcs) {
        o.time += dt; o.stateTime += dt; o.flash = Math.max(0, o.flash - dt);
        if (o.state === 'dead') continue;
        const d = dist(o.x, o.y, p.x, p.y);
        o.flip = p.x < o.x;
        if (d < 34 && !p.dead) {
          if (o.state !== 'attack') { o.state = 'attack'; o.stateTime = 0; o.attackTimer = 0.3; }
          o.attackTimer -= dt;
          if (o.attackTimer <= 0) {
            o.attackTimer = 0.45;
            game.health = Math.max(0, game.health - (o.red ? 7 : 4));
            p.hurtFlash = 0.15;
          }
        } else {
          o.state = 'walk';
          if (!p.dead && d > 1) { o.x += (p.x - o.x) / d * o.speed * dt; o.y += (p.y - o.y) / d * o.speed * dt; }
          for (const t of TREES) pushOut(o, t.x, t.y, TREE_R + 10);
        }
      }
      // Keep orcs from stacking on one spot.
      for (let i = 0; i < this.orcs.length; i++) {
        for (let j = i + 1; j < this.orcs.length; j++) {
          const a = this.orcs[i], b = this.orcs[j];
          if (a.state === 'dead' || b.state === 'dead') continue;
          const d = dist(a.x, a.y, b.x, b.y);
          if (d > 0 && d < 22) {
            const push = (22 - d) / 2;
            a.x += (a.x - b.x) / d * push; a.y += (a.y - b.y) / d * push;
            b.x -= (a.x - b.x) / d * push; b.y -= (a.y - b.y) / d * push;
          }
        }
      }
      this.orcs = this.orcs.filter(o => !(o.state === 'dead' && o.stateTime > 1.6));

      if (!this.over && game.health <= 0) { this.over = true; p.dead = true; p.time = 0; p.moving = false; setTimeout(() => this.lose(), 1100); }
      else if (!this.over && this.kills >= this.target) { this.over = true; setTimeout(() => this.win(), 700); }
    },
    win() {
      if (scene !== this) return;
      const reward = rules.campReward();
      game.gold += reward;
      game.campsCleared += 1;
      save();
      showPanel('<h2>Camp cleared!</h2><p>You earned ' + reward + ' gold. The orcs will rebuild, and the next camp will be tougher.</p>' +
        '<p class="stats">' + statsLine() + '</p>' +
        '<button data-act="map">Return to map</button><button data-act="again" class="secondary">Fight again</button>',
        { map: () => setScene(mapScene), again: () => setScene(battleScene) });
    },
    lose() {
      if (scene !== this) return;
      const lost = Math.floor(game.gold / 2);
      game.gold -= lost;
      game.health = game.maxHealth;
      save();
      showPanel('<h2>Gunther has fallen</h2><p>The townsfolk drag you home and patch you up. You lost ' + lost + ' gold.</p>' +
        '<button data-act="again">Try again</button><button data-act="town" class="secondary">Back to town</button>',
        { again: () => setScene(battleScene), town: () => setScene(townScene) });
    },
    draw() {
      const p = this.p;
      for (let y = 0; y < H; y += 48) {
        for (let x = 0; x < W; x += 48) {
          drawGrass(x, y, x / 48, y / 48);
        }
      }
      const things = [];
      // Darker ground towards the edges so the arena reads as a forest clearing.
      const shade = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
      shade.addColorStop(0, 'rgba(30, 70, 30, 0)');
      shade.addColorStop(1, 'rgba(30, 70, 30, 0.45)');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
      for (const t of TREES) things.push({ y: t.y, draw: () => { shadow(t.x, t.y + 6, 44); ctx.drawImage(img['big-tree'], t.x - 65, t.y - 176, 130, 188); } });
      for (const o of this.orcs) {
        things.push({ y: o.y, draw: () => {
          let col, row;
          if (o.state === 'dead') { row = 4; col = Math.min(Math.floor(o.stateTime * 10), 9); ctx.globalAlpha = clamp((1.6 - o.stateTime) / 0.6, 0, 1); }
          else if (o.state === 'attack') { row = 3; col = 5 + Math.floor(o.stateTime * 12) % 5; }
          else { row = 2; col = Math.floor(o.time * 8) % 10; }
          if (o.state !== 'dead') shadow(o.x, o.y + 6, 13);
          if (o.flash > 0) ctx.filter = 'brightness(2.2)';
          drawFrame(img[o.red ? 'orc-red' : 'orc-yellow'], 32, 32, col, row, o.x, o.y - 26, 2, o.flip);
          ctx.filter = 'none';
          ctx.globalAlpha = 1;
        } });
      }
      things.push({ y: p.y, draw: () => {
        if (p.hurtFlash > 0) ctx.filter = 'brightness(1.7)';
        const shooting = !p.dead && p.shootTime < 0.25;
        drawGunther(p.x, p.y, 2, p.dead ? 'death' : (shooting ? 'shoot' : (p.moving ? 'run' : 'idle')),
          p.dead ? p.deadTime : (shooting ? p.shootTime : p.time), p.flip);
        ctx.filter = 'none';
        // Health bar above his head.
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - 26, p.y - 74, 52, 7);
        ctx.fillStyle = game.health > game.maxHealth * 0.3 ? '#50f08b' : '#f05a50';
        ctx.fillRect(p.x - 25, p.y - 73, 50 * game.health / game.maxHealth, 5);
      } });
      things.sort((a, b) => a.y - b.y).forEach(t => t.draw());
      for (const a of this.arrows) drawArrow(a.x, a.y, a.a);

      text('Orcs slain ' + this.kills + ' / ' + this.target, 12, 24, 18, '#ffe08a');
      drawStats(46, 14);
      if (pointer.touch && pointer.down && !this.over) {
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(pointer.startX, pointer.startY, 40, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 18, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (this.time < 4) {
        if (pointer.touch) hint('Drag to move. Gunther shoots by himself.', 'Drag to move. Gunther shoots by himself.');
        else hint('WASD to move, aim with the mouse, hold click to shoot.', 'WASD to move, hold click to shoot.');
      }
    }
  };

  // Push a point out of a circle (used for trees).
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

  // ---- Town
  const townScene = {
    message: '',
    enter() {
      this.message = game.visitedTown ? 'Back again, Gunther? What will it be?' :
        'Welcome, Gunther. Orcs have camped to the north east. Clear them out and we will pay you in gold.';
      game.visitedTown = true;
      save();
      this.render();
    },
    render() {
      const act = (ok, yes, no) => { this.message = ok ? yes : no; save(); this.render(); };
      const spend = cost => { if (game.gold < cost) return false; game.gold -= cost; return true; };
      showPanel(
        '<h2>Town</h2>' +
        '<p class="stats">' + statsLine() + '</p>' +
        '<p class="msg">' + this.message + '</p>' +
        '<button data-act="rest"' + (game.health >= game.maxHealth || game.gold < rules.restCost() ? ' disabled' : '') + '>Rest at the inn, full heal (' + rules.restCost() + ' gold)</button>' +
        '<button data-act="armour"' + (game.gold < rules.armourCost() ? ' disabled' : '') + '>Buy armour, +25 max health (' + rules.armourCost() + ' gold)</button>' +
        (rules.bowMaxed() ? '<button disabled>Bow is fully upgraded</button>' :
          '<button data-act="bow"' + (game.gold < rules.bowCost() ? ' disabled' : '') + '>Upgrade bow, shoot faster (' + rules.bowCost() + ' gold)</button>') +
        '<button data-act="leave" class="secondary">Leave town</button>',
        {
          rest: () => { const ok = spend(rules.restCost()); if (ok) game.health = game.maxHealth; act(ok, 'You sleep well and wake fully healed.', 'Not enough gold.'); },
          armour: () => { const ok = spend(rules.armourCost()); if (ok) { game.armourLevel++; game.maxHealth += 25; game.health = game.maxHealth; } act(ok, 'The smith fits new plates. You feel sturdier.', 'Not enough gold.'); },
          bow: () => { const ok = spend(rules.bowCost()); if (ok) game.bowLevel++; act(ok, 'The bowyer restrings your bow. It fires faster now.', 'Not enough gold.'); },
          leave: () => setScene(mapScene)
        });
    },
    update() {},
    draw() { mapScene.draw(); }
  };

  // ---------------------------------------------------------------- main loop
  let last = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); // cap so a paused tab doesn't teleport everything
    last = now;
    scene.update(dt);
    ctx.imageSmoothingEnabled = false;
    scene.draw();
    requestAnimationFrame(frame);
  }

  loadAssets().then(() => {
    resize();
    buildMap();
    mapScene.reset();
    setScene(titleScene);
    last = performance.now();
    requestAnimationFrame(frame);
    // Handy for testing from the browser console.
    window.__gunther = { game, rules, scenes: { titleScene, mapScene, battleScene, townScene }, getScene: () => scene, setScene };
  }).catch(err => {
    overlay.classList.add('show');
    overlay.innerHTML = '<div class="panel"><h2>Could not start</h2><p>' + err.message + '</p></div>';
  });
})();
