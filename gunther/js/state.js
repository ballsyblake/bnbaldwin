// Everything about the current playthrough lives in one `game` object, which is saved to the
// browser's localStorage. This file also holds the rules that read or change it:
// party size, food, wages, prices, relations between realms and the daily tick.

import { clamp, randInt, rand, pick } from './core.js';
import { TROOPS, GOODS, SETTLEMENTS, FACTIONS, KINGDOMS } from './data.js';

const SAVE_KEY = 'gunther-save-v2';
const OLD_SAVE_KEY = 'gunther-save-v1';

export const game = {};

export function newGame(migrate) {
  for (const k in game) delete game[k];
  Object.assign(game, {
    version: 2,
    day: 1, dayTime: 0,
    gold: 120, health: 100, maxHealth: 100, bowLevel: 1, armourLevel: 1,
    renown: 0, morale: 70,
    troops: { recruit: { n: 4, wounded: 0, xp: 0 }, bowman: { n: 2, wounded: 0, xp: 0 } },
    goods: { grain: 6 },
    relations: { vale: 0, march: 0, free: 5 },
    atWar: false, warTimer: 12,
    sites: {},
    parties: [],
    player: { x: 1640, y: 1500 },
    quests: [],
    stats: { won: 0, lost: 0, orcsSlain: 0, campsBurned: 0 },
    hordeBroken: false,
    seenIntro: false,
    nextId: 1
  });
  for (const s of SETTLEMENTS) {
    game.sites[s.id] = { recruits: s.kind === 'town' ? 4 : 6, glut: {}, raided: 0, burned: 0, garrison: campGarrison(s) };
  }
  // Carry over gold and gear from the old one-camp version of the game.
  if (migrate) try {
    const old = JSON.parse(localStorage.getItem(OLD_SAVE_KEY));
    if (old && typeof old.gold === 'number') {
      game.gold += Math.min(old.gold, 500);
      game.bowLevel = old.bowLevel || 1;
      game.armourLevel = old.armourLevel || 1;
      game.maxHealth = old.maxHealth || 100;
      game.health = game.maxHealth;
      localStorage.removeItem(OLD_SAVE_KEY);
    }
  } catch (e) { /* ignore */ }
}

export function campGarrison(s) {
  if (s.kind === 'camp') return { grunt: 10, brute: 3, shaman: 2 };
  if (s.kind === 'stronghold') return { grunt: 26, brute: 12, shaman: 7, warlord: 1 };
  return null;
}

export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { /* private mode: play without saving */ }
}
export function hasSave() {
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); return !!(d && d.version === 2); } catch (e) { return false; }
}
export function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (d && d.version === 2) { for (const k in game) delete game[k]; Object.assign(game, d); return true; }
  } catch (e) { /* ignore */ }
  return false;
}

// ---------------------------------------------------------------- messages
// A short feed of recent events shown on the map.
export const log = [];
export function note(msg, colour) {
  log.push({ msg, colour: colour || '#fff', age: 0 });
  if (log.length > 5) log.shift();
}

// ---------------------------------------------------------------- the party
export function site(id) { return SETTLEMENTS.find(s => s.id === id); }

export function troopCount(fitOnly) {
  let n = 0;
  for (const t in game.troops) n += game.troops[t].n - (fitOnly ? game.troops[t].wounded : 0);
  return n;
}
export function partyLimit() { return Math.min(12 + Math.floor(game.renown / 8), 90); }
export function addTroops(type, n) {
  if (!game.troops[type]) game.troops[type] = { n: 0, wounded: 0, xp: 0 };
  game.troops[type].n += n;
}
export function removeTroops(type, n, wounded) {
  const st = game.troops[type];
  if (!st) return;
  st.n = Math.max(0, st.n - n);
  st.wounded = Math.min(st.wounded + (wounded || 0), st.n);
  if (st.n === 0) delete game.troops[type];
}
export function guntherPower() { return 5 + game.bowLevel * 1.5 + game.armourLevel; }
export function strength(troops) {
  let s = 0;
  for (const t in troops) s += TROOPS[t].power * troops[t];
  return s;
}
export function playerFit() {
  const out = {};
  for (const t in game.troops) { const n = game.troops[t].n - game.troops[t].wounded; if (n > 0) out[t] = n; }
  return out;
}
export function playerStrength() { return strength(playerFit()) + (game.health > 0 ? guntherPower() : 0); }
export function wages() {
  let w = 0;
  for (const t in game.troops) w += (TROOPS[t].wage || 0) * game.troops[t].n;
  return w;
}
export function foodStock() { let n = 0; for (const g in game.goods) if (GOODS[g].food) n += game.goods[g]; return n; }
export function foodPerDay() { return Math.ceil((troopCount() + 1) / 6); }
export function cargo() { let n = 0; for (const g in game.goods) n += game.goods[g]; return n; }
export function cargoLimit() { return 30 + troopCount() * 3; }
// Bigger parties are slower, like a real army on the march.
export function partySpeed() { return 170 * (1 - Math.min(0.4, troopCount() * 0.006)) * (game.morale < 30 ? 0.85 : 1); }

// "3 Spearmen", "1 Bowman", "2 Orc grunts".
export function troopName(type, n) {
  const name = TROOPS[type].name;
  if (n === 1 || type === 'warlord') return name;
  return name.endsWith('man') && !name.endsWith('shaman') ? name.slice(0, -3) + 'men' : name + 's';
}

// ---------------------------------------------------------------- realms
export function hostile(a, b) {
  if (a === b) return false;
  if (a === 'horde' || b === 'horde') return true;
  if (a === 'player' || b === 'player') { const other = a === 'player' ? b : a; return (game.relations[other] || 0) <= -20; }
  if (a === 'free' || b === 'free') return false;
  return game.atWar;            // the two kingdoms
}
export function changeRelation(f, d) {
  if (!(f in game.relations) || !d) return;
  const before = game.relations[f];
  game.relations[f] = clamp(before + d, -100, 100);
  note('Relation with ' + FACTIONS[f].short + (d > 0 ? ' improved' : ' worsened') + ' (' + (d > 0 ? '+' : '') + d + ')', d > 0 ? '#9fd99a' : '#ff9a8a');
  if (before > -20 && game.relations[f] <= -20) note(FACTIONS[f].name + ' now treats you as an enemy!', '#ff6a5a');
  if (before <= -20 && game.relations[f] > -20) note(FACTIONS[f].name + ' no longer counts you an enemy.', '#9fd99a');
}
export function relationWord(v) {
  if (v <= -20) return 'Hostile';
  if (v < 0) return 'Wary';
  if (v < 15) return 'Neutral';
  if (v < 40) return 'Friendly';
  return 'Honoured';
}

// ---------------------------------------------------------------- market
export function price(siteId, good) {
  const s = site(siteId), st = game.sites[siteId], g = GOODS[good];
  let m = 1;
  if (s.makes && s.makes.includes(good)) m = st.raided > 0 ? 1.3 : 0.6;
  else if (s.wants && s.wants.includes(good)) m = 1.55;
  return g.base * m * (1 + (st.glut[good] || 0));
}
export function buyPrice(siteId, good) { return Math.max(1, Math.round(price(siteId, good) * 1.07)); }
export function sellPrice(siteId, good) { return Math.max(1, Math.round(price(siteId, good) * 0.93)); }
// Buying makes things dearer and selling makes them cheaper, so one trade route can't be milked forever.
export function nudgePrice(siteId, good, dir) {
  const st = game.sites[siteId];
  st.glut[good] = clamp((st.glut[good] || 0) + dir * 0.045, -0.55, 1.2);
}

// ---------------------------------------------------------------- one day passes
export function dailyTick() {
  game.day++;
  const msgs = [];
  // Food.
  let need = foodPerDay();
  for (const g of ['fish', 'grain']) {
    const eat = Math.min(need, game.goods[g] || 0);
    if (eat) { game.goods[g] -= eat; need -= eat; if (!game.goods[g]) delete game.goods[g]; }
  }
  if (need > 0) { game.morale = clamp(game.morale - 12, 0, 100); msgs.push(['Your men have no food! Morale falls.', '#ff9a8a']); }
  else game.morale = clamp(game.morale + (72 - game.morale) * 0.12, 0, 100);
  // Healing.
  for (const t in game.troops) { const st = game.troops[t]; if (st.wounded) st.wounded = Math.max(0, st.wounded - Math.max(1, Math.ceil(st.wounded * 0.3))); }
  game.health = Math.min(game.maxHealth, game.health + game.maxHealth * 0.15);
  // Wages, once a week.
  if (game.day % 7 === 0) {
    const w = wages();
    if (game.gold >= w) { game.gold -= w; if (w) msgs.push(['You paid your men ' + w + ' gold in wages.', '#ffe08a']); }
    else { game.gold = 0; game.morale = clamp(game.morale - 25, 0, 100); msgs.push(['You could not pay full wages. The men grumble.', '#ff9a8a']); }
  }
  // Low morale: deserters slip away in the night.
  if (game.morale < 25 && troopCount() > 0) {
    const types = Object.keys(game.troops);
    const t = pick(types), n = Math.min(game.troops[t].n, randInt(1, 2));
    removeTroops(t, n);
    msgs.push([n + ' ' + troopName(t, n) + ' deserted in the night.', '#ff9a8a']);
  }
  // Settlements recover.
  for (const s of SETTLEMENTS) {
    const st = game.sites[s.id];
    for (const g in st.glut) { st.glut[g] *= 0.85; if (Math.abs(st.glut[g]) < 0.01) delete st.glut[g]; }
    if (st.raided > 0) st.raided--;
    if ((s.kind === 'town' || s.kind === 'village') && game.day % 3 === 0 && st.raided === 0) st.recruits = Math.min(st.recruits + randInt(1, 2), s.kind === 'town' ? 6 : 8);
    if (st.burned > 0 && !game.hordeBroken) { st.burned--; if (st.burned === 0) { st.garrison = campGarrison(s); msgs.push(['The orcs have rebuilt ' + s.name + '.', '#ff9a8a']); } }
    if (st.garrison && st.burned === 0 && s.kind === 'camp' && game.day % 4 === 0) st.garrison.grunt = Math.min(st.garrison.grunt + 2, 10 + Math.floor(game.day / 6));
  }
  // War and peace between the two kingdoms.
  game.warTimer--;
  if (game.warTimer <= 0) {
    game.atWar = !game.atWar;
    game.warTimer = game.atWar ? randInt(14, 24) : randInt(10, 18);
    msgs.push([game.atWar ? 'War! The Vale and the March are fighting each other.' : 'The Vale and the March have made peace.', '#ffd27a']);
  }
  // Quests that ran out of time.
  for (const q of game.quests) {
    if (!q.done && game.day > q.deadline) { q.failed = true; msgs.push(['Quest failed: ' + q.title, '#ff9a8a']); changeRelation(site(q.giver).faction, -4); }
  }
  game.quests = game.quests.filter(q => !q.failed);
  msgs.forEach(m => note(m[0], m[1]));
  save();
  return msgs.some(m => m[1] === '#ff9a8a');   // true if something bad happened
}

// Rough loot for beating a party.
export function lootFor(troops, kind) {
  const s = strength(troops);
  return Math.round(s * rand(2.5, 4) + (kind === 'caravan' ? rand(80, 160) : 0));
}

export { KINGDOMS };
