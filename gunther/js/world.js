// The world map: Gunther's warband travels the island while orc warbands, kingdom patrols and
// merchant caravans go about their own business. Time only passes while you are moving or
// camping, so you can always stop and think.

import { ctx, view, pointer, clamp, dist, rand, randInt, pick, text, shadow, hint, setHud, setScene, panelOpen, bar, onKeyPress, getScene } from './core.js';
import { img, drawUnit, drawWagon, drawBanner } from './sprites.js';
import { WORLD_W, WORLD_H, DAY_SECONDS, SETTLEMENTS, FACTIONS, TROOPS, KINGDOMS, ORC_CHIEFS } from './data.js';
import { terrainCanvas, decor, waves, isLand, speedAt, nearestLand, terrainAt, T } from './terrain.js';
import { game, log, note, hostile, strength, playerStrength, troopCount, partyLimit, partySpeed, foodStock, foodPerDay, dailyTick, site, save } from './state.js';
import { openSettlement, openEncounter, openParty, autoResolve } from './menus.js';

const SIGHT = 360;

// ---------------------------------------------------------------- parties
export function partyById(id) { return game.parties.find(p => p.id === id); }

function makeParty(faction, kind, name, troops, x, y, extra) {
  const pos = nearestLand(x, y);
  const p = Object.assign({ id: game.nextId++, faction, kind, name, troops, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, gold: 0, think: 0, mode: 'idle', flip: false, time: Math.random() * 3 }, extra || {});
  game.parties.push(p);
  return p;
}

export function spawnWarband(home, bonus, extra) {
  const d = game.day + (bonus || 0);
  const troops = { grunt: randInt(4, 6) + Math.floor(d / 3) };
  const brutes = Math.floor(d / 6) + randInt(0, 1);
  const shamans = Math.floor(d / 9) + (Math.random() < 0.3 ? 1 : 0);
  if (brutes) troops.brute = brutes;
  if (shamans) troops.shaman = shamans;
  troops.grunt = Math.min(troops.grunt, 22);
  const chief = pick(ORC_CHIEFS);
  return makeParty('horde', 'warband', chief + "'s raiders", troops, home.x + rand(-60, 60), home.y + rand(40, 90), Object.assign({ home: home.id, gold: randInt(20, 60) }, extra || {}));
}

function spawnPatrol(kingdom) {
  const homes = SETTLEMENTS.filter(s => s.faction === kingdom);
  const home = pick(homes);
  const d = game.day;
  const troops = { recruit: randInt(2, 4), spearman: randInt(3, 5) + Math.floor(d / 8), bowman: randInt(2, 4) + Math.floor(d / 10) };
  if (d > 6) troops.knight = Math.floor(d / 8);
  if (d > 10) troops.ranger = Math.floor(d / 12);
  return makeParty(kingdom, 'patrol', FACTIONS[kingdom].short.replace('the ', '') + ' patrol', troops, home.x + rand(-80, 80), home.y + rand(60, 120), { home: home.id, gold: randInt(40, 90) });
}

function spawnCaravan() {
  const faction = pick(['vale', 'march', 'free']);
  const towns = SETTLEMENTS.filter(s => s.kind === 'town');
  const from = pick(towns.filter(t => !hostile(t.faction, faction) && (t.faction === faction || faction === 'free' || t.faction === 'free')).concat(towns.filter(t => t.faction === faction)));
  const to = pick(towns.filter(t => t !== from && !hostile(t.faction, faction)));
  if (!from || !to) return null;
  return makeParty(faction, 'caravan', (faction === 'free' ? 'Fairmeet' : FACTIONS[faction].short.replace('the ', '')) + ' caravan',
    { spearman: randInt(2, 4), bowman: randInt(1, 3) }, from.x + rand(-60, 60), from.y + 110, { home: from.id, dest: to.id, gold: randInt(120, 220) });
}

// Keeps the island busy: tops up warbands, patrols and caravans each day.
export function populate() {
  const camps = SETTLEMENTS.filter(s => (s.kind === 'camp' || s.kind === 'stronghold') && !game.sites[s.id].burned);
  const warbands = game.parties.filter(p => p.kind === 'warband').length;
  const wantWarbands = game.hordeBroken ? 0 : Math.min(3 + Math.floor(game.day / 8), 7);
  for (let i = warbands; i < wantWarbands && camps.length; i++) spawnWarband(pick(camps));
  for (const k of KINGDOMS) {
    const n = game.parties.filter(p => p.kind === 'patrol' && p.faction === k).length;
    for (let i = n; i < 2; i++) spawnPatrol(k);
  }
  const caravans = game.parties.filter(p => p.kind === 'caravan').length;
  for (let i = caravans; i < 3; i++) spawnCaravan();
}

function partyStrength(p) { return p.faction === 'player' ? playerStrength() : strength(p.troops); }
function partySize(p) { let n = 0; for (const t in p.troops) n += p.troops[t]; return n; }

// A random spot on land near (x, y).
function landNear(x, y, r) {
  for (let k = 0; k < 20; k++) {
    const nx = clamp(x + rand(-r, r), 40, WORLD_W - 40), ny = clamp(y + rand(-r, r), 40, WORLD_H - 40);
    if (isLand(nx, ny)) return { x: nx, y: ny };
  }
  return { x, y };
}

// Each AI party decides what to do a couple of times a second.
function think(p) {
  const me = strength(p.troops);
  const player = { id: 'player', faction: 'player', x: mapScene.pos.x, y: mapScene.pos.y };
  let threat = null, prey = null, threatD = Infinity, preyD = Infinity;
  for (const o of game.parties.concat([player])) {
    if (o === p || !hostile(p.faction, o.faction)) continue;
    const d = dist(p.x, p.y, o.x, o.y);
    if (d > SIGHT) continue;
    const them = partyStrength(o);
    if (them > me * 1.15 && d < threatD) { threat = o; threatD = d; }
    else if (me > them * (p.kind === 'warband' ? 0.9 : 1.2) && p.kind !== 'caravan' && d < preyD) { prey = o; preyD = d; }
  }
  if (threat && threatD < 260) {
    // Run away.
    const a = Math.atan2(p.y - threat.y, p.x - threat.x);
    const spot = landNear(p.x + Math.cos(a) * 240, p.y + Math.sin(a) * 240, 60);
    p.tx = spot.x; p.ty = spot.y; p.mode = 'flee'; p.chase = null;
    return;
  }
  if (prey) { p.mode = 'chase'; p.chase = prey.id; p.tx = prey.x; p.ty = prey.y; return; }
  p.chase = null;
  const arrived = dist(p.x, p.y, p.tx, p.ty) < 12;
  if (p.kind === 'caravan') {
    const dest = site(p.dest);
    if (dist(p.x, p.y, dest.x, dest.y + 40) < 30) { p.gone = true; return; }
    p.tx = dest.x; p.ty = dest.y + 40; p.mode = 'travel';
    return;
  }
  if (p.kind === 'warband' && p.mode === 'raid') {
    const v = site(p.raid);
    if (dist(p.x, p.y, v.x, v.y) < 50) {
      game.sites[v.id].raided = 10; game.sites[v.id].recruits = 0;
      if (dist(v.x, v.y, mapScene.pos.x, mapScene.pos.y) < 1400) note(p.name + ' have raided ' + v.name + '!', '#ff9a8a');
      p.mode = 'idle'; p.raid = null; p.tx = p.x; p.ty = p.y;
    }
    return;
  }
  if (!arrived && p.mode !== 'idle') return;
  if (p.kind === 'warband' && !p.quest && Math.random() < 0.25) {
    const villages = SETTLEMENTS.filter(s => s.kind === 'village' && !game.sites[s.id].raided && dist(s.x, s.y, p.x, p.y) < 1100);
    if (villages.length) { const v = pick(villages); p.mode = 'raid'; p.raid = v.id; p.tx = v.x; p.ty = v.y; return; }
  }
  const home = p.kind === 'patrol' ? pick(SETTLEMENTS.filter(s => s.faction === p.faction)) : (p.anchor || site(p.home));
  const spot = landNear(home.x, home.y, p.kind === 'warband' ? 520 : 420);
  p.tx = spot.x; p.ty = spot.y; p.mode = 'wander';
}

function moveParty(p, speed, dt) {
  const d = dist(p.x, p.y, p.tx, p.ty);
  if (d < 2) { p.moving = false; return; }
  const step = Math.min(speed * speedAt(p.x, p.y) * dt, d);
  const vx = (p.tx - p.x) / d * step, vy = (p.ty - p.y) / d * step;
  if (Math.abs(vx) > 0.05) p.flip = vx < 0;
  let moved = false;
  // Move one axis at a time so parties slide along the shore instead of sticking.
  if (isLand(p.x + vx, p.y)) { p.x += vx; moved = true; }
  if (isLand(p.x, p.y + vy)) { p.y += vy; moved = true; }
  p.moving = moved;
  if (!moved) { p.tx = p.x; p.ty = p.y; p.mode = 'idle'; }
}

// Two AI parties meet: the battle is settled with dice, off screen.
function aiClash(a, b) {
  const res = autoResolve(a.troops, b.troops, 0);
  const [win, lose] = res.aWins ? [a, b] : [b, a];
  win.troops = res.aWins ? res.a : res.b;
  lose.gone = true;
  win.gold += lose.gold;
  if (dist(win.x, win.y, mapScene.pos.x, mapScene.pos.y) < 1000) note(win.name + ' defeated ' + lose.name + '.', '#d8dce6');
  const q = game.quests.find(q => q.party === lose.id);
  if (q) { q.failed = true; note('Someone else got to ' + lose.name + ' first. Quest lost.', '#ff9a8a'); game.quests = game.quests.filter(x => !x.failed); }
}

// ---------------------------------------------------------------- the scene
export const mapScene = {
  get pos() { return game.player; },
  target: null,           // { x, y } spot, { site } or { party } Gunther is heading for
  camping: false,
  time: 0,
  hover: null,
  enter() {
    this.target = null;
    this.camping = false;
    this.grace = 0.6;     // a moment after leaving a town or battle before anyone can catch you
    this.hud();
    save();
  },
  hud() {
    setHud('<button data-act="party">Party</button><button data-act="camp">' + (this.camping ? 'Break camp' : 'Camp') + '</button>', {
      party: () => openParty(),
      camp: () => { this.camping = !this.camping; this.target = null; this.hud(); }
    });
  },
  camera() {
    return { x: clamp(this.pos.x - view.W / 2, 0, WORLD_W - view.W), y: clamp(this.pos.y - view.H / 2, 0, WORLD_H - view.H) };
  },
  minimap() {
    const w = view.portrait ? 150 : 180, h = w * WORLD_H / WORLD_W;
    return { x: view.W - w - 10, y: 10, w, h };
  },
  // What is under the pointer: a party, a settlement or nothing.
  pickAt(sx, sy) {
    const cam = this.camera(), wx = sx + cam.x, wy = sy + cam.y;
    let best = null, bd = 34;
    for (const p of game.parties) { const d = dist(wx, wy, p.x, p.y - 18); if (d < bd) { bd = d; best = { party: p }; } }
    if (best) return best;
    for (const s of SETTLEMENTS) if (dist(wx, wy, s.x, s.y - 10) < 60) return { site: s };
    return null;
  },
  update(dt) {
    this.time += dt;
    for (const m of log) m.age += dt;
    if (panelOpen()) return;
    const P = this.pos;
    // Clicks: the minimap, a party, a settlement, or plain ground.
    this.hover = pointer.touch ? null : this.pickAt(pointer.x, pointer.y);
    if (pointer.clicked || (pointer.down && !pointer.touch && !this.target?.party && !this.target?.site)) {
      const mm = this.minimap();
      const cam = this.camera();
      if (pointer.x > mm.x && pointer.y < mm.y + mm.h && pointer.y > mm.y && pointer.x < mm.x + mm.w) {
        const spot = nearestLand((pointer.x - mm.x) / mm.w * WORLD_W, (pointer.y - mm.y) / mm.h * WORLD_H);
        this.target = spot;
      } else if (pointer.clicked) {
        const hit = this.pickAt(pointer.x, pointer.y);
        this.target = hit || { x: pointer.x + cam.x, y: pointer.y + cam.y };
      } else this.target = { x: pointer.x + cam.x, y: pointer.y + cam.y };
      if (this.camping) { this.camping = false; this.hud(); }
    }
    pointer.clicked = false;

    // Where Gunther is heading.
    let tx = null, ty = null;
    if (this.target) {
      if (this.target.party) {
        const p = partyById(this.target.party.id);
        if (!p || p.gone) this.target = null; else { tx = p.x; ty = p.y; }
      } else if (this.target.site) { tx = this.target.site.x; ty = this.target.site.y + 30; }
      else { tx = this.target.x; ty = this.target.y; }
    }
    let moving = false;
    if (tx !== null) {
      const d = dist(P.x, P.y, tx, ty);
      const reach = this.target.site ? 24 : (this.target.party ? 22 : 4);
      if (d <= reach) {
        const t = this.target; this.target = null;
        if (t.site) { setScene(siteScene, t.site); return; }
        if (t.party) { const p = partyById(t.party.id); if (p) { openEncounter(p, false); return; } }
      } else {
        const step = Math.min(partySpeed() * speedAt(P.x, P.y) * dt, d);
        const vx = (tx - P.x) / d * step, vy = (ty - P.y) / d * step;
        if (Math.abs(vx) > 0.05) P.flip = vx < 0;
        if (isLand(P.x + vx, P.y)) { P.x += vx; moving = true; }
        if (isLand(P.x, P.y + vy)) { P.y += vy; moving = true; }
        if (!moving) this.target = null;
      }
    }
    this.moving = moving;

    // The world only moves while you do (or while camping, which runs time faster).
    if (!moving && !this.camping) return;
    const wdt = dt * (this.camping ? 4 : 1);
    this.grace = Math.max(0, this.grace - wdt);
    game.dayTime += wdt;
    if (game.dayTime >= DAY_SECONDS) {
      game.dayTime -= DAY_SECONDS;
      const bad = dailyTick();
      populate();
      // Wake up from camp when something goes wrong, like running out of food.
      if (bad && this.camping) { this.camping = false; this.hud(); }
    }

    for (const p of game.parties) {
      p.time += wdt;
      p.think -= wdt;
      if (p.think <= 0) { p.think = 0.4 + Math.random() * 0.3; think(p); }
      if (p.mode === 'chase' && p.chase) {
        const prey = p.chase === 'player' ? this.pos : partyById(p.chase);
        if (prey) { p.tx = prey.x; p.ty = prey.y; }
      }
      const base = p.kind === 'caravan' ? 105 : (p.kind === 'warband' ? 150 : 140);
      moveParty(p, base * (1 - Math.min(0.35, partySize(p) * 0.008)), wdt);
    }
    // Meetings between parties.
    for (let i = 0; i < game.parties.length; i++) {
      const a = game.parties[i];
      if (a.gone) continue;
      for (let j = i + 1; j < game.parties.length; j++) {
        const b = game.parties[j];
        if (b.gone || !hostile(a.faction, b.faction)) continue;
        if (dist(a.x, a.y, b.x, b.y) < 24) aiClash(a, b);
      }
    }
    game.parties = game.parties.filter(p => !p.gone);
    // Someone has caught Gunther.
    if (this.grace <= 0) {
      for (const p of game.parties) {
        if (p.chase === 'player' && hostile(p.faction, 'player') && dist(p.x, p.y, P.x, P.y) < 26) {
          this.camping = false; this.target = null; this.hud();
          openEncounter(p, true);
          return;
        }
      }
    }
  },
  draw() {
    const cam = this.camera();
    const W = view.W, H = view.H;
    ctx.fillStyle = '#2e80a0';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(terrainCanvas, Math.round(-cam.x), Math.round(-cam.y), WORLD_W, WORLD_H);
    ctx.fillStyle = '#e4f4ee';
    for (const w of waves) {
      const sx = w.x - cam.x, sy = w.y - cam.y;
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      const a = Math.sin(this.time * 1.6 + w.phase);
      if (a < 0.3) continue;
      ctx.globalAlpha = (a - 0.3) * 1.2;
      ctx.fillRect(Math.round(sx / 3) * 3, Math.round(sy / 3) * 3, 9 + Math.round(a * 3) * 3, 3);
    }
    ctx.globalAlpha = 1;
    const onScreen = (x, y, m) => x - cam.x > -m && x - cam.x < W + m && y - cam.y > -m && y - cam.y < H + m;

    // Everything standing on the map, drawn back to front.
    const things = [];
    for (const d of decor) {
      if (!onScreen(d.x, d.y, 60)) continue;
      things.push({ y: d.y, draw: () => {
        const x = d.x - cam.x, y = d.y - cam.y;
        shadow(x, y + 12, 16);
        if (d.kind === 'tree') ctx.drawImage(img.trees, d.v * 16, 0, 16, 16, x - 24, y - 34, 48, 48);
        else if (d.kind === 'rock') ctx.drawImage(img.rocks, d.v * 16, 0, 16, 16, x - 24, y - 30, 48, 48);
        else ctx.drawImage(img.houses, d.v * 16, 16 + d.row * 16, 16, 16, x - 24, y - 30, 48, 48);
      } });
    }
    for (const s of SETTLEMENTS) {
      if (!onScreen(s.x, s.y, 140)) continue;
      things.push({ y: s.y, draw: () => this.drawSite(s, s.x - cam.x, s.y - cam.y) });
    }
    for (const p of game.parties) {
      if (!onScreen(p.x, p.y, 80)) continue;
      things.push({ y: p.y, draw: () => this.drawParty(p, p.x - cam.x, p.y - cam.y) });
    }
    const P = this.pos;
    things.push({ y: P.y, draw: () => {
      const x = P.x - cam.x, y = P.y - cam.y;
      shadow(x, y + 4, 16, 'rgba(232, 184, 58, 0.45)');
      drawUnit('gunther', '', '', x, y, 2, this.moving ? 'walk' : 'idle', this.time, P.flip);
      drawBanner(x + 10, y - 66, FACTIONS.player.colour);
      text(String(troopCount() + 1), x + 14, y - 72, 14, '#fff', 'center');
    } });
    things.sort((a, b) => a.y - b.y).forEach(t => t.draw());
    // Place names go on top of everything so trees and houses never hide them.
    for (const s of SETTLEMENTS) {
      if (!onScreen(s.x, s.y, 140)) continue;
      const st = game.sites[s.id];
      let label = s.name;
      if (st.raided) label += ' (raided)';
      if (st.burned) label += ' (burned)';
      text(label, s.x - cam.x, s.y - cam.y + (s.kind === 'town' ? 54 : 40), 16, s.kind === 'camp' || s.kind === 'stronghold' ? '#ffb0a0' : '#fff', 'center');
    }

    // Where Gunther is going.
    if (this.target && !this.target.party) {
      const tx = (this.target.site ? this.target.site.x : this.target.x) - cam.x;
      const ty = (this.target.site ? this.target.site.y + 30 : this.target.y) - cam.y;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(tx, ty, 10 + Math.sin(this.time * 6) * 2, 5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.hover) this.drawTooltip(this.hover, cam);
    if (this.camping) {
      ctx.fillStyle = 'rgba(10, 20, 40, 0.25)'; ctx.fillRect(0, 0, W, H);
      text('Camping... time passes', W / 2, H / 2 - 80, 22, '#ffe08a', 'center');
    }
    this.drawHud();
  },
  drawSite(s, x, y) {
    const st = game.sites[s.id];
    const f = FACTIONS[s.faction];
    if (s.kind === 'town') ctx.drawImage(img.keep, s.art * 32, 0, 32, 32, x - 56, y - 76, 112, 112);
    else if (s.kind === 'village') { ctx.drawImage(img.houses, 0, 32, 16, 16, x - 24, y - 34, 48, 48); }
    else if (s.kind === 'camp' || s.kind === 'stronghold') {
      const big = s.kind === 'stronghold';
      if (st.burned) {
        ctx.fillStyle = '#4a3e34'; ctx.beginPath(); ctx.ellipse(x, y + 4, 44, 18, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2c2420'; ctx.fillRect(x - 18, y - 6, 12, 6); ctx.fillRect(x + 6, y - 2, 14, 5);
      } else {
        if (big) { ctx.drawImage(img['orc-tent'], 0, 0, 32, 32, x - 100, y - 50, 72, 72); ctx.drawImage(img['orc-tent'], 0, 0, 32, 32, x + 28, y - 50, 72, 72); }
        ctx.drawImage(img['orc-tent'], 0, 0, 32, 32, x - (big ? 52 : 40), y - (big ? 86 : 52), big ? 104 : 80, big ? 104 : 80);
      }
    }
    drawBanner(x - 8, y - (s.kind === 'town' ? 104 : s.kind === 'stronghold' ? 112 : s.kind === 'camp' ? 80 : 62), f.colour);
  },
  drawParty(p, x, y) {
    const f = FACTIONS[p.faction];
    const hostileToMe = hostile(p.faction, 'player');
    shadow(x, y + 4, 16, hostileToMe ? 'rgba(220, 60, 50, 0.45)' : 'rgba(20, 40, 20, 0.3)');
    const anim = p.moving ? 'walk' : 'idle';
    if (p.kind === 'caravan') drawWagon(x, y, f.colour, p.flip);
    else if (p.faction === 'horde') drawUnit(p.troops.brute ? 'orc-red' : 'orc-yellow', '', '', x, y, 2, anim, p.time, p.flip);
    else drawUnit('soldier', p.troops.knight ? 'sword' : 'spear', f.colour, x, y, 2, anim, p.time, p.flip);
    drawBanner(x + 10, y - 66, f.colour);
    text(String(partySize(p)), x + 14, y - 72, 14, '#fff', 'center');
    if (p.quest) text('!', x - 14, y - 60, 22, '#ffd34a', 'center');
  },
  drawTooltip(h, cam) {
    let lines;
    if (h.party) {
      const p = h.party, mine = playerStrength(), theirs = strength(p.troops);
      const cmp = theirs > mine * 1.3 ? 'much stronger than you' : theirs > mine * 0.9 ? 'about your strength' : 'weaker than you';
      lines = [p.name + ' (' + partySize(p) + ')', FACTIONS[p.faction].name + (hostile(p.faction, 'player') ? ', hostile' : ''), 'Looks ' + cmp];
    } else {
      const s = h.site;
      const kind = { town: 'Town', village: 'Village', camp: 'Orc camp', stronghold: 'Orc stronghold' }[s.kind];
      lines = [s.name, kind + ' of ' + FACTIONS[s.faction].short];
    }
    const x = clamp(pointer.x + 16, 8, view.W - 230), y = clamp(pointer.y + 12, 8, view.H - 80);
    ctx.fillStyle = 'rgba(20, 22, 28, 0.88)'; ctx.fillRect(x, y, 220, 14 + lines.length * 18);
    lines.forEach((l, i) => text(l, x + 8, y + 20 + i * 18, 13, i ? '#c5cad6' : '#ffe08a'));
  },
  drawHud() {
    const W = view.W;
    // Top-left status.
    const food = foodStock(), days = Math.floor(food / foodPerDay());
    const parts = ['Day ' + game.day, 'Gold ' + game.gold, 'Men ' + troopCount() + '/' + partyLimit(), 'Food ' + days + 'd', 'Morale ' + Math.round(game.morale)];
    if (view.portrait) { text(parts.slice(0, 3).join('   '), 12, 24, 15); text(parts.slice(3).join('   '), 12, 44, 15, days < 2 ? '#ff9a8a' : '#fff'); }
    else text(parts.join('   '), 12, 24, 16, days < 2 ? '#ffcfa0' : '#fff');
    bar(12, view.portrait ? 54 : 34, 120, 5, game.health / game.maxHealth, '#50f08b');
    bar(12, view.portrait ? 62 : 42, 120, 4, game.dayTime / DAY_SECONDS, '#ffe08a');
    // Minimap.
    const mm = this.minimap();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#20262e'; ctx.fillRect(mm.x - 3, mm.y - 3, mm.w + 6, mm.h + 6);
    ctx.drawImage(terrainCanvas, mm.x, mm.y, mm.w, mm.h);
    ctx.globalAlpha = 1;
    const sx = mm.w / WORLD_W, sy = mm.h / WORLD_H;
    for (const s of SETTLEMENTS) {
      ctx.fillStyle = FACTIONS[s.faction].colour;
      if (game.sites[s.id].burned) ctx.fillStyle = '#555';
      ctx.fillRect(mm.x + s.x * sx - 3, mm.y + s.y * sy - 3, 6, 6);
    }
    for (const p of game.parties) {
      if (dist(p.x, p.y, this.pos.x, this.pos.y) > SIGHT * 2.2 && !p.quest) continue;
      ctx.fillStyle = hostile(p.faction, 'player') ? '#ff4a3a' : '#f4f4f4';
      ctx.fillRect(mm.x + p.x * sx - 1, mm.y + p.y * sy - 1, 3, 3);
    }
    const cam = this.camera();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.strokeRect(mm.x + cam.x * sx, mm.y + cam.y * sy, view.W * sx, view.H * sy);
    ctx.fillStyle = FACTIONS.player.colour; ctx.fillRect(mm.x + this.pos.x * sx - 2, mm.y + this.pos.y * sy - 2, 5, 5);
    // Event feed.
    const feed = log.filter(m => m.age < 9);
    feed.forEach((m, i) => {
      ctx.globalAlpha = clamp((9 - m.age) / 1.5, 0, 1);
      text(m.msg, 12, view.H - (view.portrait ? 92 : 44) - (feed.length - 1 - i) * 20, 14, m.colour);
    });
    ctx.globalAlpha = 1;
    if (!feed.length && game.day < 3 && !this.moving) hint('Click to travel. Click a town to visit, or a party to meet it.', 'Tap to travel. Tap towns and parties.');
  }
};

// Standing in a settlement: the map stays drawn behind the menu.
export const siteScene = {
  enter(s) { this.site = s; setHud(''); openSettlement(s); },
  update(dt) { mapScene.time += dt; },
  draw() { mapScene.draw(); }
};

// Keyboard shortcuts on the map.
onKeyPress(k => {
  if (getScene() !== mapScene || panelOpen()) return;
  if (k === 'p') openParty();
  if (k === ' ' || k === 'c') { mapScene.camping = !mapScene.camping; mapScene.target = null; mapScene.hud(); }
});

export { TROOPS, terrainAt, T };
