// The world map: Gunther's warband travels the island while outlaw bands, the realms' lords and
// merchant caravans go about their own business, whether or not Gunther is watching. Time only passes while you are moving or
// camping, so you can always stop and think.

import { uiMin, ctx, view, pointer, clamp, dist, rand, randInt, pick, text, shadow, setHud, uiSet, uiBar, uiShow, setScene, panelOpen, onKeyPress, getScene, seeded, esc, FONT } from './core.js';
import { img, drawUnit, drawWagon, drawBanner } from './sprites.js';
import { year, lordDies } from './dynasty.js';
import { siegeTarget, isHeld, besiegers, peopleOf } from './sieges.js';
import { storyTick, storyPlaces } from './story.js';
import { WORLD_W, WORLD_H, DAY_SECONDS, YEAR_DAYS, SETTLEMENTS, FACTIONS, TROOPS, KINGDOMS, ORC_CHIEFS, LORDS, RACES, raceOf } from './data.js';
import { terrainCanvas, decor, waves, isLand, speedAt, nearestLand, terrainAt, T } from './terrain.js';
import { relationWord, campGarrison, game, log, note, hostile, strength, playerStrength, troopCount, partyLimit, partySpeed, foodStock, foodPerDay, dailyTick, site, save, lord, lordState, hasTrait, chronicle, prisonerCount } from './state.js';
import { openSettlement, openEncounter, openParty, autoResolve, openSuccession } from './menus.js';

const SIGHT = 360;

// ---------------------------------------------------------------- parties
export function partyById(id) { return game.parties.find(p => p.id === id); }

export function spawnParty(faction, kind, name, troops, x, y, extra) { return makeParty(faction, kind, name, troops, x, y, extra); }
function makeParty(faction, kind, name, troops, x, y, extra) {
  const pos = nearestLand(x, y);
  const p = Object.assign({ id: game.nextId++, faction, kind, name, troops, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, gold: 0, think: 0, mode: 'idle', flip: false, time: Math.random() * 3 }, extra || {});
  game.parties.push(p);
  return p;
}

// Outlaws: deserters and cutthroats of every people, who rob caravans and burn villages. They
// make camp in the wilds, away from the towns.
const OUTLAW_TAGS = ['the Red', 'Half-Ear', 'the Hound', 'Blackhand', 'the Tanner', 'Crowfoot', 'the Deserter', 'Ninefingers', 'the Grey', 'Nail'];
export function outlawName() {
  const race = RACES[pick(Object.keys(RACES))], sex = Math.random() < 0.7 ? 'm' : 'f';
  return pick(race.names[sex]) + ' ' + pick(OUTLAW_TAGS);
}
export function spawnOutlaws(x, y, extra) {
  const d = game.day;
  // A bit of everyone: human deserters, elf and dwarf exiles, orcs cast out of their clans.
  const raw = ['recruit', 'grunt', 'elfscout', 'dwarfminer'].filter(t => TROOPS[t]);
  const troops = {};
  const add = (t, n) => { if (n > 0 && TROOPS[t]) troops[t] = (troops[t] || 0) + n; };
  add(pick(raw), randInt(3, 5) + Math.floor(d / 5)); add(pick(raw), randInt(1, 3));
  add('bowman', randInt(1, 2) + Math.floor(d / 10)); add(pick(['spearman', 'brute', 'dwarfaxe']), Math.floor(d / 8));
  for (const t in troops) troops[t] = Math.min(troops[t], 18);
  const boss = outlawName();
  if (x === undefined) {
    const towns = SETTLEMENTS.filter(s => s.kind === 'town');
    for (let k = 0; k < 30; k++) {
      x = rand(200, WORLD_W - 200); y = rand(200, WORLD_H - 200);
      if (isLand(x, y) && towns.every(t => dist(t.x, t.y, x, y) > 420) && dist(x, y, mapScene.pos.x, mapScene.pos.y) > 500) break;
    }
  }
  return makeParty('outlaws', 'outlaws', boss + "'s outlaws", troops, x, y, Object.assign({ anchor: { x, y }, gold: randInt(40, 120), desc: 'Deserters and cutthroats of every people, with a price on their heads.' }, extra || {}));
}

export function spawnWarband(home, bonus, extra) {
  const d = game.day + (bonus || 0);
  const troops = { grunt: randInt(4, 6) + Math.floor(d / 3) };
  const brutes = Math.floor(d / 6) + randInt(0, 1);
  const shamans = Math.floor(d / 9) + (Math.random() < 0.3 ? 1 : 0);
  if (brutes) troops.brute = brutes;
  if (shamans) troops.shaman = shamans;
  troops.grunt = Math.min(troops.grunt, 22);
  // Each warband gets a chief whose name isn't already in use, so the chronicle stays readable.
  const used = game.parties.map(p => p.name);
  const free = ORC_CHIEFS.filter(c => !used.includes(c + "'s raiders"));
  const chief = free.length ? pick(free) : pick(ORC_CHIEFS) + ' the Younger';
  return makeParty('horde', 'warband', chief + "'s raiders", troops, home.x + rand(-60, 60), home.y + rand(40, 90), Object.assign({ home: home.id, gold: randInt(20, 60) }, extra || {}));
}

// A lord takes the field with an army raised from their lands. A kingdom that has lost lords
// (beaten or captured) sends the rest out stronger, so one side can't snowball forever.
function spawnLordHost(l) {
  // Home is their own seat if the kingdom still holds it, otherwise anywhere it still holds.
  const home = [site(l.home)].concat(SETTLEMENTS.filter(s => s.faction === l.faction && s.kind === 'town'), SETTLEMENTS.filter(s => s.faction === l.faction)).find(s => s.faction === l.faction) || site(l.home);
  const d = game.day;
  const down = LORDS.filter(o => o.faction === l.faction && lordState(o.id).status !== 'free').length;
  const m = 1 + down * 0.25 + (l.ruler ? 0.3 : 0);
  const n = x => Math.round(x * m);
  // Each people fields its own troops: [raw recruits], [foot, bows], [elite foot, elite bows].
  const [t0, t1, t2] = RACES[raceOf(l.faction)].army;
  const troops = {};
  const add = (t, k) => { if (k > 0) troops[t] = (troops[t] || 0) + k; };
  add(t0[0], n(randInt(2, 4)));
  add(t1[0], n(randInt(3, 5) + d / 8)); add(t1[1], n(randInt(2, 4) + d / 10));
  if (d > 5) add(t2[0], n(1 + d / 9));
  if (d > 9) add(t2[1], n(d / 12));
  if (l.guard) for (const t in l.guard) add(t, l.guard[t]);
  return makeParty(l.faction, 'lord', l.name, troops, home.x + rand(-80, 80), home.y + rand(60, 120), { home: home.id, lord: l.id, gold: randInt(60, 140) });
}

function spawnCaravan() {
  const faction = pick(KINGDOMS.concat('free'));
  const towns = SETTLEMENTS.filter(s => s.kind === 'town');
  const from = pick(towns.filter(t => !hostile(t.faction, faction) && (t.faction === faction || faction === 'free' || t.faction === 'free')).concat(towns.filter(t => t.faction === faction)));
  const to = pick(towns.filter(t => t !== from && !hostile(t.faction, faction)));
  if (!from || !to) return null;
  return makeParty(faction, 'caravan', (faction === 'free' ? 'Fairmeet' : FACTIONS[faction].short.replace('the ', '')) + ' caravan',
    caravanGuard(faction), from.x + rand(-60, 60), from.y + 110, { home: from.id, dest: to.id, gold: randInt(120, 220) });
}

function caravanGuard(faction) {
  const [, [foot, bows]] = RACES[raceOf(faction)].army;
  return { [foot]: randInt(2, 4), [bows]: randInt(1, 3) };
}

// Keeps the island busy: tops up warbands, patrols and caravans each day.
export function populate() {
  // The old orc raiders are gone: the clans field lords like everyone else.
  game.parties = game.parties.filter(p => p.kind !== 'warband' || p.story);
  const bands = game.parties.filter(p => p.kind === 'outlaws' && !p.quest).length;
  for (let i = bands; i < Math.min(2 + Math.floor(game.day / 10), 5); i++) spawnOutlaws();
  // Old saves had faceless patrols; lords lead the armies now.
  game.parties = game.parties.filter(p => p.kind !== 'patrol');
  for (const l of LORDS) {
    if (lordState(l.id).status !== 'free') continue;
    if (!game.parties.some(p => p.lord === l.id)) spawnLordHost(l);
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
// Does party p see `o` as an enemy? Lords can also hold a personal grudge against Gunther.
export function enemies(p, o) {
  if (hostile(p.faction, o.faction)) return true;
  if (o.faction === 'player' && p.lord) return grudge(p.lord);
  if (p.faction === 'player' && o.lord) return grudge(o.lord);
  return false;
}
export function grudge(lordId) { return lordState(lordId).opinion <= -40; }

function think(p) {
  const me = strength(p.troops);
  const player = { id: 'player', faction: 'player', x: mapScene.pos.x, y: mapScene.pos.y };
  // Traits change how brave a lord is.
  const bold = p.lord && hasTrait(p.lord, 'bold'), cautious = p.lord && hasTrait(p.lord, 'cautious');
  const attackOdds = p.kind === 'warband' ? 0.9 : bold ? 0.95 : cautious ? 1.5 : 1.2;
  const fleeOdds = bold ? 1.4 : 1.15;
  // A party sent to hunt Gunther down does nothing else.
  if (p.hunt) { p.mode = 'chase'; p.chase = 'player'; p.tx = player.x; p.ty = player.y; return; }
  let threat = null, prey = null, threatD = Infinity, preyD = Infinity;
  for (const o of game.parties.concat([player])) {
    if (o === p || !enemies(p, o)) continue;
    const d = dist(p.x, p.y, o.x, o.y);
    if (d > SIGHT) continue;
    const them = partyStrength(o);
    // Greedy lords go out of their way for caravans; honourable ones for orcs.
    const want = p.lord && ((hasTrait(p.lord, 'greedy') && o.kind === 'caravan') || (hasTrait(p.lord, 'honourable') && o.faction === 'outlaws')) ? 0.6 : 1;
    if (them > me * fleeOdds && d < threatD) { threat = o; threatD = d; }
    else if (me > them * attackOdds && p.kind !== 'caravan' && d * want < preyD) { prey = o; preyD = d * want; }
  }
  if (threat && threatD < 260) {
    // Run away.
    const a = Math.atan2(p.y - threat.y, p.x - threat.x);
    const spot = landNear(p.x + Math.cos(a) * 240, p.y + Math.sin(a) * 240, 60);
    p.tx = spot.x; p.ty = spot.y; p.mode = 'flee'; p.chase = null; p.siege = null;
    return;
  }
  // A party on its way to raid sticks to the plan unless something worth chasing is very close.
  if (prey && (!['raid', 'siege', 'besiege'].includes(p.mode) || preyD < 120)) { p.mode = 'chase'; p.chase = prey.id; p.tx = prey.x; p.ty = prey.y; return; }
  p.chase = null;
  const arrived = dist(p.x, p.y, p.tx, p.ty) < 12;
  if (p.kind === 'caravan') {
    const dest = site(p.dest);
    if (dist(p.x, p.y, dest.x, dest.y + 40) < 30) { p.gone = true; return; }
    p.tx = dest.x; p.ty = dest.y + 40; p.mode = 'travel';
    return;
  }
  if (p.mode === 'raid') {
    const v = site(p.raid);
    if (p.lord && !hostile(p.faction, v.faction)) { p.mode = 'idle'; p.raid = null; return; }   // peace broke out
    if (dist(p.x, p.y, v.x, v.y) < 50) {
      game.sites[v.id].raided = 10; game.sites[v.id].recruits = 0;
      const who = p.lord ? lord(p.lord).name : p.name;
      if (dist(v.x, v.y, mapScene.pos.x, mapScene.pos.y) < 1400 || p.lord) note(who + (p.lord ? ' has' : ' have') + ' raided ' + v.name + '!', '#ff9a8a');
      chronicle(who + ' burned the village of ' + v.name + '.');
      if (isHeld(v)) note('Your village ' + v.name + ' has been burned!', '#ff6a5a');
      p.mode = 'idle'; p.raid = null; p.tx = p.x; p.ty = p.y;
    }
    return;
  }
  // Marching on a town, then camped outside its walls (the storming happens in the daily tick).
  if (p.mode === 'siege') {
    const v = site(p.siege);
    if (!v || !hostile(p.faction, v.faction)) { p.mode = 'idle'; p.siege = null; return; }
    if (dist(p.x, p.y, v.x, v.y + 40) < 40) {
      p.mode = 'besiege'; p.siegeDay = game.day; p.tx = p.x; p.ty = p.y;
      const who = p.lord ? lord(p.lord).name : p.name;
      note(who + ' has laid siege to ' + v.name + '!', isHeld(v) ? '#ff6a5a' : '#ffd27a');
      chronicle(who + ' laid siege to ' + v.name + '.');
    } else { p.tx = v.x; p.ty = v.y + 40; }
    return;
  }
  if (p.mode === 'besiege') return;
  if (!arrived && p.mode !== 'idle') return;
  if ((p.kind === 'warband' || p.kind === 'outlaws') && !p.quest && Math.random() < 0.25) {
    const villages = SETTLEMENTS.filter(s => s.kind === 'village' && !game.sites[s.id].raided && dist(s.x, s.y, p.x, p.y) < 1100);
    if (villages.length) { const v = pick(villages); p.mode = 'raid'; p.raid = v.id; p.tx = v.x; p.ty = v.y; return; }
  }
  if (p.lord) {
    // A strong host at war marches on an enemy town.
    if (Math.random() < 0.2) {
      const t = siegeTarget(p);
      if (t) { p.mode = 'siege'; p.siege = t.id; p.tx = t.x; p.ty = t.y + 40; return; }
    }
    // A cruel lord at war goes burning the enemy's villages.
    if (hasTrait(p.lord, 'cruel') && Math.random() < 0.5) {
      const targets = SETTLEMENTS.filter(s => s.kind === 'village' && hostile(p.faction, s.faction) && !game.sites[s.id].raided);
      if (targets.length) { const v = targets.sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0]; p.mode = 'raid'; p.raid = v.id; p.tx = v.x; p.ty = v.y; return; }
    }
    // An honourable lord rides out after outlaws, wherever they are.
    if (hasTrait(p.lord, 'honourable') && Math.random() < 0.5) {
      const orcs = game.parties.filter(o => o.faction === 'outlaws' && dist(o.x, o.y, p.x, p.y) < 1300);
      if (orcs.length) { const o = pick(orcs); const spot = landNear(o.x, o.y, 40); p.tx = spot.x; p.ty = spot.y; p.mode = 'wander'; return; }
    }
  }
  // A lord wanders their own lands; a kingdom that has lost them all hangs about its old seat.
  const own = p.lord ? SETTLEMENTS.filter(s => s.faction === p.faction) : [];
  const home = p.lord ? (own.length ? pick(own) : site(lord(p.lord).home)) : (p.anchor || site(p.home));
  const spot = landNear(home.x, home.y, p.kind === 'warband' || p.kind === 'outlaws' ? 520 : 420);
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
  if (dist(win.x, win.y, mapScene.pos.x, mapScene.pos.y) < 1000 || win.lord || lose.lord) note(win.name + ' defeated ' + lose.name + '.', '#d8dce6');
  const near = nearestPlace(lose.x, lose.y);
  if (lose.lord) {
    // A beaten lord either escapes or is taken prisoner by a rival kingdom.
    const st = lordState(lose.lord);
    if (Math.random() < 0.05) lordDies(lose.lord, 'fell in battle near ' + near);
    else if (KINGDOMS.includes(win.faction) && Math.random() < 0.5) {
      st.status = 'held-' + win.faction; st.back = game.day + randInt(8, 14);
      chronicle((win.lord ? lord(win.lord).name : win.name) + ' defeated and captured ' + lord(lose.lord).name + ' near ' + near + '.');
    } else {
      st.status = 'routed'; st.back = game.day + randInt(4, 7);
      chronicle(lord(lose.lord).name + ' was beaten by ' + win.name + ' near ' + near + ' and fled home.');
    }
  } else if (win.lord && (lose.kind === 'warband' || lose.kind === 'caravan')) {
    chronicle(lord(win.lord).name + ' destroyed ' + lose.name + ' near ' + near + '.');
  }
  const q = game.quests.find(q => q.party === lose.id);
  if (q) { q.failed = true; note('Someone else got to ' + lose.name + ' first. Quest lost.', '#ff9a8a'); game.quests = game.quests.filter(x => !x.failed); }
}

export function nearestPlace(x, y) {
  let best = SETTLEMENTS[0], bd = Infinity;
  for (const s of SETTLEMENTS) { const d = dist(s.x, s.y, x, y); if (d < bd) { bd = d; best = s; } }
  return best.name;
}

// ---------------------------------------------------------------- the scene
export const mapScene = {
  get pos() { return game.player; },
  target: null,           // { x, y } spot, { site } or { party } Gunther is heading for
  camping: false,
  time: 0,
  hover: null,
  speed: 1,              // 0 paused, 1 normal, 3 fast
  bigMap: false,
  enter() {
    this.target = null;
    this.camping = false;
    this.bigMap = false;
    if (!this.speed) this.speed = 1;
    this.grace = 0.6;     // a moment after leaving a town or battle before anyone can catch you
    this.hud();
    save();
  },
  // Builds the map HUD once; refreshHud() then keeps the numbers current.
  hud() {
    const mm = this.minimap();
    const u = n => 'calc(var(--cu) * ' + n + ')';
    const sp = (v, label, hk) => '<button data-act="speed" data-arg="' + v + '" class="' + (this.speed === v ? 'primary' : '') + '" title="' + hk + '">' + label + '</button>';
    const act = (a, label, hk, cls) => '<button data-act="' + a + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + label + '<small>' + hk + '</small></button>';
    setHud(
      '<div class="box abs mstats" data-k="stats" data-min="stats"><div class="mini" data-k="statsmini"></div>' +
        '<div class="top"><b class="px" data-k="day"></b><span data-k="season"></span></div>' +
        '<div class="tiles">' +
          '<div class="tile"><span class="lbl">Gold</span><b class="px gold" data-k="gold"></b></div>' +
          '<div class="tile"><span class="lbl">Men</span><b class="px" data-k="men"></b></div>' +
          '<div class="tile"><span class="lbl">Food</span><b class="px" data-k="food"></b></div>' +
          '<div class="tile"><span class="lbl">Morale</span><b class="px" data-k="morale"></b></div>' +
        '</div>' +
        '<div class="bars2">' +
          '<div><div class="meterhead"><span class="lbl">Health</span><span data-k="hpp"></span></div><div class="meter"><i data-k="hpbar"></i></div></div>' +
          '<div><div class="meterhead"><span class="lbl" data-k="lvl"></span><span data-k="lvp"></span></div><div class="meter"><i data-k="lvbar" style="background:var(--gold)"></i></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="abs mapmm" data-min="minimap" data-k="mapmm" style="left:' + u(mm.x - 3) + ';top:' + u(mm.y - 3) + ';width:' + u(mm.w + 6) + ';height:' + u(mm.h + 6) + '"><div class="mini box">Minimap</div></div>' +
      '<div class="box abs legend" data-k="legend" style="left:' + u(mm.x - 3) + ';top:' + u(mm.y + mm.h + 6) + ';width:' + u(mm.w + 6) + '"></div>' +
      '<div class="box abs place" data-k="place" style="display:none"></div>' +
      '<div class="box abs speed">' + sp(0, 'II', 'Pause (Space)') + sp(1, '&gt;', 'Normal speed') + sp(3, '&gt;&gt;', 'Fast') + '</div>' +
      '<div class="box abs actions" data-min="actions">' + act('party', 'Party', 'P', 'primary') + act('quests', 'Quests', 'J') + act('map', 'Map', 'M', this.bigMap ? 'sel' : '') +
        act('camp', this.camping ? 'Break camp' : 'Camp', 'C', this.camping ? 'sel' : '') + '</div>',
      {
        party: () => openParty(),
        quests: () => openParty('', 'gunther'),
        map: () => { this.bigMap = !this.bigMap; this.hud(); },
        camp: () => this.toggleCamp(),
        speed: v => { this.speed = +v; this.hud(); },
        minChanged: () => this.refreshHud(),
        enter: () => this.enterNear()
      });
    this.hudTimer = 0;
    this.refreshHud();
  },
  toggleCamp() { this.camping = !this.camping; this.target = null; this.hud(); },
  // The settlement Gunther is standing beside, if any.
  nearSite() {
    if (this.target || this.moving) return null;
    let best = null, bd = 110;
    for (const s of SETTLEMENTS) { const d = dist(this.pos.x, this.pos.y, s.x, s.y + 30); if (d < bd) { bd = d; best = s; } }
    return best;
  },
  enterNear() { const s = this.nearSite(); if (s) { this.target = { site: s }; if (!this.speed) this.speed = 1; } },
  refreshHud() {
    const food = foodStock(), days = Math.floor(food / foodPerDay());
    uiSet('day', 'Day <span class="num">' + game.day + '</span>');
    uiSet('season', seasonText());
    uiSet('gold', game.gold.toLocaleString('en-AU'));
    uiSet('men', troopCount() + ' <small>/ ' + partyLimit() + ' cap</small>');
    uiSet('food', '<span class="' + (days < 2 ? 'dangerc' : '') + '">' + days + (days === 1 ? ' day' : ' days') + '</span>');
    const mo = Math.round(game.morale);
    uiSet('morale', '<span class="' + (mo >= 50 ? 'goodc' : mo >= 25 ? 'gold' : 'dangerc') + '">' + mo + '</span>');
    const hp = game.health / game.maxHealth;
    uiSet('hpp', Math.round(hp * 100) + '%');
    uiBar('hpbar', hp, hp > 0.3 ? 'var(--good)' : 'var(--danger)');
    const r = renownLevel();
    uiSet('lvl', 'Renown &middot; Lv ' + r.lv);
    uiSet('lvp', Math.round(r.frac * 100) + '%');
    uiBar('lvbar', r.frac);
    // Legend under the minimap.
    const leg = [['var(--gold)', 'You'], ['var(--blue)', game.contract ? FACTIONS[game.contract.faction].short.replace(/^the /, '') + ' (your lord)' : 'Friendly'], ['var(--danger)', 'Hostile'], ['#9a917f', 'Neutral']];
    uiSet('legend', leg.map(([c, l]) => '<span><i class="sw" style="background:' + c + '"></i>' + esc(l) + '</span>').join(''));
    uiShow('legend', !view.portrait && !this.bigMap && !uiMin('minimap'));
    uiShow('stats', !this.bigMap);
    uiShow('mapmm', !this.bigMap);
    uiSet('statsmini', '<b class="px gold">Day <span class="num">' + game.day + '</span></b> <span class="num gold">' + game.gold.toLocaleString('en-AU') + 'g</span> &middot; <span class="num">' + troopCount() + '/' + partyLimit() + '</span> men &middot; <span class="num ' + (days < 2 ? 'dangerc' : '') + '">' + days + '</span>d food &middot; HP <span class="num">' + Math.round(hp * 100) + '%</span>');
    // The card for the place Gunther stands beside.
    const s = this.bigMap ? null : this.nearSite();
    uiShow('place', !!s);
    if (s) {
      uiSet('place', placeCard(s));
      const el = document.querySelector('[data-k="place"]');
      if (el && !el.dataset.wired) {
        el.dataset.wired = '1';
        el.addEventListener('pointerdown', e => e.stopPropagation());
        el.addEventListener('click', e => { if (e.target.closest('button')) this.enterNear(); });
      }
      const cam = this.camera();
      const pos = view.portrait ? 'left:calc(var(--cu) * 120);top:calc(var(--cu) * ' + (view.H - 380) + ')'
        : (() => { const mm = this.minimap(), x = clamp(s.x - cam.x + 70, 10, view.W - 200);
            const minTop = uiMin('minimap') ? 60 : x + 190 > mm.x ? mm.y + mm.h + 60 : 140;   // keep clear of the minimap and its legend
            return 'left:calc(var(--cu) * ' + x + ');top:calc(var(--cu) * ' + clamp(s.y - cam.y - 100, minTop, view.H - 220) + ')'; })();
      if (el && el.dataset.pos !== pos) { el.dataset.pos = pos; el.style.cssText = pos; }
    }
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
    // Gunther died (of old age, in the night): the heir takes over before anything else.
    if (game.pendingDeath) { openSuccession(game.pendingDeath); return; }
    storyTick();
    if (panelOpen()) return;
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.15; this.refreshHud(); }
    const P = this.pos;
    // The full map: a click picks somewhere to travel and closes it.
    if (this.bigMap) {
      this.hover = null;
      if (pointer.clicked) {
        const r = this.bigMapRect();
        if (pointer.x > r.x && pointer.x < r.x + r.w && pointer.y > r.y && pointer.y < r.y + r.h) {
          this.target = nearestLand((pointer.x - r.x) / r.w * WORLD_W, (pointer.y - r.y) / r.h * WORLD_H);
          if (!this.speed) this.speed = 1;
          this.camping = false;
        }
        this.bigMap = false; this.hud();
      }
      pointer.clicked = false;
      return;
    }
    // Clicks: the minimap, a party, a settlement, or plain ground.
    this.hover = pointer.touch ? null : this.pickAt(pointer.x, pointer.y);
    if (pointer.clicked || (pointer.down && !pointer.touch && !this.target?.party && !this.target?.site)) {
      const mm = this.minimap();
      const cam = this.camera();
      if (!uiMin('minimap') && pointer.x > mm.x && pointer.y < mm.y + mm.h && pointer.y > mm.y && pointer.x < mm.x + mm.w) {
        const spot = nearestLand((pointer.x - mm.x) / mm.w * WORLD_W, (pointer.y - mm.y) / mm.h * WORLD_H);
        this.target = spot;
      } else if (pointer.clicked) {
        const hit = this.pickAt(pointer.x, pointer.y);
        this.target = hit || { x: pointer.x + cam.x, y: pointer.y + cam.y };
      } else this.target = { x: pointer.x + cam.x, y: pointer.y + cam.y };
      if (this.camping) { this.camping = false; this.hud(); }
      if (!this.speed) { this.speed = 1; this.hud(); }
    }
    pointer.clicked = false;
    if (!this.speed && !this.camping) { this.moving = false; return; }
    dt *= this.camping ? 1 : this.speed;

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
      const base = p.kind === 'caravan' ? 105 : (p.kind === 'warband' || p.kind === 'outlaws' ? 150 : 140);
      moveParty(p, base * (1 - Math.min(0.35, partySize(p) * 0.008)), wdt);
    }
    // Meetings between parties.
    for (let i = 0; i < game.parties.length; i++) {
      const a = game.parties[i];
      if (a.gone) continue;
      for (let j = i + 1; j < game.parties.length; j++) {
        const b = game.parties[j];
        if (b.gone || !hostile(a.faction, b.faction) || a.story || b.story) continue;   // story foes wait for Gunther   // grudges against Gunther don't count here
        if (dist(a.x, a.y, b.x, b.y) < 24) aiClash(a, b);
      }
    }
    game.parties = game.parties.filter(p => !p.gone);
    // Someone has caught Gunther.
    if (this.grace <= 0) {
      for (const p of game.parties) {
        if (p.chase === 'player' && enemies(p, { faction: 'player' }) && dist(p.x, p.y, P.x, P.y) < 26) {
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
      if (isHeld(s)) label += ' (yours)';
      if (s.kind === 'town' && besiegers(s).length) label += ' (besieged)';
      text(label, s.x - cam.x, s.y - cam.y + (s.kind === 'town' ? 54 : 40), 16, s.kind === 'camp' || s.kind === 'stronghold' ? '#ffb0a0' : '#fff', 'center');
    }

    // Where the story wants Gunther to go.
    for (const id of storyPlaces()) {
      const s = SETTLEMENTS.find(x => x.id === id);
      if (onScreen(s.x, s.y, 140)) text('!', s.x - cam.x + 34, s.y - cam.y - (s.kind === 'town' ? 70 : 44) + Math.sin(this.time * 4) * 3, 30, '#ffd34a', 'center');
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
    if (this.bigMap) this.drawBigMap();
  },
  bigMapRect() {
    const W = view.W, H = view.H, top = view.portrait ? 40 : 30, bottom = view.portrait ? 100 : 70;
    const w = Math.min(W - 40, (H - top - bottom) * WORLD_W / WORLD_H), h = w * WORLD_H / WORLD_W;
    return { x: (W - w) / 2, y: top + (H - top - bottom - h) / 2, w, h };
  },
  drawBigMap() {
    const r = this.bigMapRect();
    ctx.fillStyle = 'rgba(13, 11, 9, 0.7)'; ctx.fillRect(0, 0, view.W, view.H);
    frame(r.x, r.y, r.w, r.h);
    ctx.drawImage(terrainCanvas, r.x, r.y, r.w, r.h);
    const sx = r.w / WORLD_W, sy = r.h / WORLD_H;
    for (const s of SETTLEMENTS) {
      const x = r.x + s.x * sx, y = r.y + s.y * sy, big = s.kind === 'town' || s.kind === 'stronghold';
      ctx.fillStyle = '#0d0b09'; ctx.fillRect(x - (big ? 6 : 5), y - (big ? 6 : 5), big ? 12 : 10, big ? 12 : 10);
      ctx.fillStyle = siteColour(s); ctx.fillRect(x - (big ? 4 : 3), y - (big ? 4 : 3), big ? 8 : 6, big ? 8 : 6);
      text(s.name, x, y - 9, big ? 12 : 10, '#f4ead2', 'center');
    }
    for (const id of storyPlaces()) { const s = SETTLEMENTS.find(x => x.id === id); text('!', r.x + s.x * sx + 10, r.y + s.y * sy + 4, 18, '#ffd34a', 'center'); }
    for (const p of game.parties) {
      if (dist(p.x, p.y, this.pos.x, this.pos.y) > SIGHT * 2.2 && !p.quest && !p.lord) continue;
      ctx.fillStyle = partyColour(p); ctx.fillRect(r.x + p.x * sx - 2, r.y + p.y * sy - 2, 4, 4);
    }
    ctx.fillStyle = '#0d0b09'; ctx.fillRect(r.x + this.pos.x * sx - 5, r.y + this.pos.y * sy - 5, 10, 10);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(r.x + this.pos.x * sx - 3, r.y + this.pos.y * sy - 3, 6, 6);
    text(pointer.touch ? 'Tap a spot to travel there. Tap outside to close.' : 'Click a spot to travel there. M or click outside to close.', view.W / 2, r.y + r.h + 22, 13, '#c9bb9c', 'center');
  },
  drawSite(s, x, y) {
    const st = game.sites[s.id];
    const f = FACTIONS[s.faction];
    const orc = peopleOf(s) === 'orc';
    if (orc && (s.kind === 'town' || s.kind === 'village')) {
      // Orc places are hide tents round a fire, whoever holds them now.
      const big = s.kind === 'town';
      if (big) { ctx.drawImage(img['orc-tent'], 0, 0, 32, 32, x - 100, y - 50, 72, 72); ctx.drawImage(img['orc-tent'], 0, 0, 32, 32, x + 28, y - 50, 72, 72); }
      ctx.drawImage(img['orc-tent'], 0, 0, 32, 32, x - (big ? 52 : 40), y - (big ? 86 : 52), big ? 104 : 80, big ? 104 : 80);
    } else if (s.kind === 'town') ctx.drawImage(img.keep, s.art * 32, 0, 32, 32, x - 56, y - 76, 112, 112);
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
    const hostileToMe = enemies(p, { faction: 'player' });
    shadow(x, y + 4, 16, hostileToMe ? 'rgba(220, 60, 50, 0.45)' : 'rgba(20, 40, 20, 0.3)');
    const anim = p.moving ? 'walk' : 'idle';
    if (p.kind === 'caravan') drawWagon(x, y, f.colour, p.flip);
    else if (p.faction === 'horde' || (p.troops.grunt || 0) + (p.troops.brute || 0) > partySize(p) / 2) drawUnit(p.troops.brute ? 'brute' : 'grunt', '', '', x, y, 2, anim, p.time, p.flip);
    else drawUnit('soldier', p.lord || p.troops.knight ? 'sword' : 'spear', f.colour, x, y, 2, anim, p.time, p.flip);
    if (p.lord) text(lord(p.lord).name, x, y + 22, 13, '#fff', 'center');
    if (p.mode === 'besiege') { this.drawSiegeCamp(x, y); text('Besieging', x, y + 38, 12, '#ffd27a', 'center'); }
    drawBanner(x + 10, y - 66, f.colour);
    text(String(partySize(p)), x + 14, y - 72, 14, '#fff', 'center');
    if (p.quest || (p.lord && game.quests.some(q => q.lord === p.lord))) text('!', x - 14, y - 60, 22, '#ffd34a', 'center');
  },
  // A ladder and a little tent beside a besieging host.
  drawSiegeCamp(x, y) {
    ctx.fillStyle = '#0d0b09'; ctx.fillRect(x - 40, y - 30, 14, 30);
    ctx.fillStyle = '#8a6a3e'; ctx.fillRect(x - 38, y - 28, 3, 26); ctx.fillRect(x - 31, y - 28, 3, 26);
    for (let k = 0; k < 4; k++) ctx.fillRect(x - 35, y - 24 + k * 7, 4, 2);
    ctx.fillStyle = '#0d0b09'; ctx.beginPath(); ctx.moveTo(x + 24, y + 2); ctx.lineTo(x + 36, y - 18); ctx.lineTo(x + 48, y + 2); ctx.fill();
    ctx.fillStyle = '#c9bb9c'; ctx.beginPath(); ctx.moveTo(x + 27, y); ctx.lineTo(x + 36, y - 14); ctx.lineTo(x + 45, y); ctx.fill();
  },
  drawTooltip(h, cam) {
    let lines;
    if (h.party) {
      const p = h.party, mine = playerStrength(), theirs = strength(p.troops);
      const cmp = theirs > mine * 1.3 ? 'much stronger than you' : theirs > mine * 0.9 ? 'about your strength' : 'weaker than you';
      const mood = p.lord ? (grudge(p.lord) ? ', holds a grudge' : lordState(p.lord).opinion >= 30 ? ', thinks well of you' : '') : '';
      lines = [p.name + ' (' + partySize(p) + ')', FACTIONS[p.faction].name + (enemies(p, { faction: 'player' }) ? ', hostile' : '') + mood, 'Looks ' + cmp];
    } else {
      const s = h.site;
      const kind = siteKind(s);
      lines = [s.name, s.faction === 'player' ? kind + ', yours' : kind + ' of ' + FACTIONS[s.faction].short + (isHeld(s) ? ', held by you' : '')];
      if (s.kind === 'town' && besiegers(s).length) lines.push('Besieged by ' + besiegers(s).map(b => b.lord ? lord(b.lord).name : b.name).join(', '));
    }
    const x = clamp(pointer.x + 16, 8, view.W - 230), y = clamp(pointer.y + 12, 8, view.H - 80);
    frame(x, y, 220, 14 + lines.length * 18);
    lines.forEach((l, i) => plain(l, x + 10, y + 21 + i * 18, i ? 12 : 14, i ? '#c9bb9c' : '#f2c14e', i ? 500 : 700));
  },
  drawHud() {
    // Minimap (the stats and buttons are HTML, see hud()).
    if (!uiMin('minimap')) {
      const mm = this.minimap();
      frame(mm.x, mm.y, mm.w, mm.h);
      ctx.drawImage(terrainCanvas, mm.x, mm.y, mm.w, mm.h);
      const sx = mm.w / WORLD_W, sy = mm.h / WORLD_H;
      for (const s of SETTLEMENTS) {
        ctx.fillStyle = siteColour(s);
        ctx.fillRect(mm.x + s.x * sx - 3, mm.y + s.y * sy - 3, 6, 6);
      }
      for (const id of storyPlaces()) { const s = SETTLEMENTS.find(x => x.id === id); ctx.strokeStyle = '#ffd34a'; ctx.lineWidth = 2; ctx.strokeRect(mm.x + s.x * sx - 5, mm.y + s.y * sy - 5, 10, 10); }
      for (const p of game.parties) {
        if (dist(p.x, p.y, this.pos.x, this.pos.y) > SIGHT * 2.2 && !p.quest && !p.lord) continue;
        ctx.fillStyle = partyColour(p);
        ctx.fillRect(mm.x + p.x * sx - 1, mm.y + p.y * sy - 1, 3, 3);
      }
      const cam = this.camera();
      ctx.strokeStyle = '#f4ead2'; ctx.lineWidth = 1;
      ctx.strokeRect(mm.x + cam.x * sx, mm.y + cam.y * sy, view.W * sx, view.H * sy);
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(mm.x + this.pos.x * sx - 2, mm.y + this.pos.y * sy - 2, 5, 5);
    }
    // Event feed, above the speed controls.
    const base = view.H - (view.portrait ? 150 : 66);
    const feed = log.filter(m => m.age < 9);
    feed.forEach((m, i) => {
      ctx.globalAlpha = clamp((9 - m.age) / 1.5, 0, 1);
      text(m.msg, 12, base - (feed.length - 1 - i) * 20, 14, m.colour);
    });
    ctx.globalAlpha = 1;
    if (!feed.length && game.day < 3 && !this.moving && !this.bigMap && getScene() === this) text(pointer.touch ? 'Tap to travel. Tap towns and parties.' : 'Click to travel. Click a town to visit, or a party to meet it.', view.W / 2, base, 15, '#f4ead2', 'center');
  }
};

// Panel look from the style guide, drawn on the canvas: outline, bevel, dark fill.
function frame(x, y, w, h) {
  ctx.fillStyle = '#0d0b09'; ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
  ctx.fillStyle = '#4a3f31'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#1d1a16'; ctx.fillRect(x, y, w, h);
}
// Text without the dark outline, for use inside panels.
function plain(str, x, y, size, colour, weight) {
  ctx.font = (weight || 600) + ' ' + size + 'px ' + FONT;
  ctx.textAlign = 'left'; ctx.fillStyle = colour; ctx.fillText(str, x, y);
}

// Map colours follow the style guide: gold is you, blue is friendly, red is hostile, grey is neutral.
function friendly(f) { return (game.contract && game.contract.faction === f) || (game.relations[f] !== undefined && game.relations[f] >= 15); }
function siteColour(s) {
  if (game.sites[s.id].burned) return '#4a4036';
  if (isHeld(s) || s.faction === 'player') return '#f2c14e';
  if (hostile('player', s.faction)) return '#e0533d';
  return friendly(s.faction) ? '#3b7dd8' : '#9a917f';
}
function partyColour(p) {
  if (enemies(p, { faction: 'player' })) return '#e0533d';
  return friendly(p.faction) ? '#7fb0ff' : '#e8e0cc';
}

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const WEATHER = ['Clear skies', 'Clear skies', 'Overcast', 'Light rain', 'Windy', 'Morning fog'];
function seasonText() {
  const season = SEASONS[Math.floor((game.day - 1) / (YEAR_DAYS / 4)) % 4] + ', year ' + year();
  let w = WEATHER[Math.floor(seeded(game.day * 7919 + 13)() * WEATHER.length)];
  if (season.startsWith('Winter') && w === 'Light rain') w = 'Light snow';
  return season + ' &middot; ' + w;
}
// Renown turned into a level, so the HUD can show progress towards the next one.
export function renownLevel() {
  const r = Math.max(0, game.renown);
  const lv = Math.floor(Math.sqrt(r / 10)) + 1;
  const lo = 10 * (lv - 1) * (lv - 1), hi = 10 * lv * lv;
  return { lv, frac: (r - lo) / (hi - lo) };
}

function siteKind(s) {
  if (peopleOf(s) === 'orc' && (s.kind === 'town' || s.kind === 'village')) return s.kind === 'town' ? 'Orc stronghold' : 'Orc camp';
  return { town: 'Town', village: 'Village', camp: 'Orc camp', stronghold: 'Orc stronghold' }[s.kind];
}
function placeCard(s) {
  const st = game.sites[s.id], f = FACTIONS[s.faction];
  const kind = siteKind(s);
  const col = siteColour(s) === '#9a917f' ? 'var(--muted)' : siteColour(s);
  let rows = '';
  const row = (a, b) => '<div class="row"><span>' + a + '</span><b>' + b + '</b></div>';
  if (s.kind === 'camp' || s.kind === 'stronghold') {
    const g = campGarrison(s); let n = 0; for (const t in g) n += g[t];
    rows += st.burned ? row('State', 'Burned') : row('Defenders', 'about ' + n);
  } else {
    rows += row('Recruits', st.recruits);
    if (s.kind === 'town' && f.ruler) rows += row('Ruler', esc(f.ruler));
    if (s.kind === 'town') { let n = 0; for (const t in st.garrison || {}) n += st.garrison[t]; rows += row('Garrison', n); }
    if (isHeld(s)) rows += row('Held by', 'You');
    if (s.kind === 'town' && besiegers(s).length) rows += row('State', '<span class="dangerc">Besieged</span>');
    if (game.relations[s.faction] !== undefined) rows += row('Standing', relationWord(game.relations[s.faction]));
    if (st.raided) rows += row('State', '<span class="dangerc">Raided</span>');
  }
  const verb = s.kind === 'camp' || s.kind === 'stronghold' ? (st.burned ? 'Search the ruins' : 'Approach the camp') : 'Enter ' + s.kind;
  return '<div class="kind" style="color:' + col + '">' + kind + ' &middot; ' + esc(s.faction === 'player' ? 'Yours' : f.short.replace(/^the /, '')) + '</div><h3>' + esc(s.name) + '</h3>' + rows +
    '<button class="primary">' + verb + ' <small>(E)</small></button>';
}

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
  if (k === 'j') openParty('', 'gunther');
  if (k === 'm') { mapScene.bigMap = !mapScene.bigMap; mapScene.hud(); }
  if (k === 'e') mapScene.enterNear();
  if (k === 'c') mapScene.toggleCamp();
  if (k === ' ') { mapScene.speed = mapScene.speed ? 0 : 1; mapScene.hud(); }
});

export { TROOPS, terrainAt, T };
