// Everything about the current playthrough lives in one `game` object, which is saved to the
// browser's localStorage. This file also holds the rules that read or change it:
// party size, food, wages, prices, relations between realms and the daily tick.

import { clamp, randInt, rand, pick } from './core.js';
import { TROOPS, GOODS, SETTLEMENTS, FACTIONS, KINGDOMS, LORDS, SKILLS, RACES } from './data.js';

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
    relations: { vale: 0, march: 0, free: 5, elves: 0, dwarves: 0 },
    sites: {},
    parties: [],
    player: { x: 1640, y: 1500 },
    quests: [],
    stats: { won: 0, lost: 0, orcsSlain: 0, campsBurned: 0 },
    hordeBroken: false,
    seenIntro: false,
    nextId: 1
  });
  ensureFields();
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
    if (d && d.version === 2) { for (const k in game) delete game[k]; Object.assign(game, d); ensureFields(); return true; }
  } catch (e) { /* ignore */ }
  return false;
}

// Fills in anything a save from an older build doesn't have yet.
function ensureFields() {
  if (!game.skills) { game.skills = {}; for (const k in SKILLS) game.skills[k] = 0; }
  if (!game.prisoners) game.prisoners = {};
  if (!game.lordCaptives) game.lordCaptives = [];
  if (!game.chronicle) game.chronicle = [];
  if (game.contract === undefined) game.contract = null;
  for (const k of KINGDOMS) if (!(k in game.relations)) game.relations[k] = 0;
  for (const s of SETTLEMENTS) if (!game.sites[s.id]) game.sites[s.id] = { recruits: s.kind === 'town' ? 4 : 6, glut: {}, raided: 0, burned: 0, garrison: campGarrison(s) };
  // War and peace between each pair of kingdoms. Older saves only tracked the Vale and the March.
  if (!game.wars) {
    game.wars = {};
    for (let i = 0; i < KINGDOMS.length; i++) for (let j = i + 1; j < KINGDOMS.length; j++) game.wars[KINGDOMS[i] + '|' + KINGDOMS[j]] = { on: false, timer: randInt(8, 30) };
    if (game.atWar !== undefined) { game.wars['vale|march'] = { on: game.atWar, timer: game.warTimer || 10 }; delete game.atWar; delete game.warTimer; }
  }
  if (!game.lords) game.lords = {};
  for (const l of LORDS) if (!game.lords[l.id]) {
    game.lords[l.id] = { status: 'free', back: 0, opinion: 0, memories: [] };
  }
}

// ---------------------------------------------------------------- chronicle
// Notable things that happen on the island, by anyone. Shown on the party screen and in rumours.
export function chronicle(text) {
  game.chronicle.push({ day: game.day, text });
  if (game.chronicle.length > 30) game.chronicle.shift();
}

// ---------------------------------------------------------------- skills
// Each skill has hidden practice points; the level is worked out from them, so doing more
// of something makes you better at it. Level 1 needs 20 points, level 2 needs 80, level 3 180...
export function skill(k) { return Math.min(10, Math.floor(Math.sqrt((game.skills[k] || 0) / 20))); }
export function trainSkill(k, amount) {
  const before = skill(k);
  game.skills[k] = (game.skills[k] || 0) + amount;
  if (skill(k) > before) note('Your ' + SKILLS[k].name + ' improved to ' + skill(k) + '!', '#ffe08a');
}
export function skillProgress(k) {
  const lv = skill(k), now = game.skills[k] || 0, lo = 20 * lv * lv, hi = 20 * (lv + 1) * (lv + 1);
  return lv >= 10 ? 1 : (now - lo) / (hi - lo);
}

// ---------------------------------------------------------------- lords
export function lord(id) { return LORDS.find(l => l.id === id); }
export function lordState(id) { return game.lords[id]; }
// A lord remembers what you did, and their opinion of you shifts with it.
export function remember(id, text, opinion) {
  const st = game.lords[id];
  st.memories.push({ day: game.day, text });
  if (st.memories.length > 6) st.memories.shift();
  st.opinion = clamp(st.opinion + (opinion || 0), -100, 100);
}
export function hasTrait(id, t) { return lord(id).traits.includes(t); }

// ---------------------------------------------------------------- prisoners
export function prisonerCount() { let n = 0; for (const t in game.prisoners) n += game.prisoners[t]; return n + game.lordCaptives.length; }
export function prisonerLimit() { return 6 + Math.floor(troopCount() / 2) + skill('leadership') * 2; }
export function ransomPrice(type) { return Math.round(TROOPS[type].power * (TROOPS[type].orc ? 9 : 13)); }
export function lordRansom(id) { return lord(id).ruler ? 900 : 450; }

// ---------------------------------------------------------------- contracts
// Working for a kingdom: first as a paid mercenary, later as a sworn vassal with a village of your own.
export function contractPay() {
  const c = game.contract;
  if (!c) return 0;
  return c.kind === 'merc' ? 6 + Math.floor(game.renown / 8) : 0;
}
export function fiefRent() {
  const c = game.contract;
  if (!c || c.kind !== 'vassal' || !c.fief) return 0;
  return game.sites[c.fief].raided ? 0 : 40;
}
export function employer() { return game.contract ? game.contract.faction : null; }

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
export function partyLimit() { return Math.min(12 + Math.floor(game.renown / 8) + skill('leadership') * 2, 90); }
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
export function foodPerDay() { return Math.ceil((troopCount() + 1 + prisonerCount()) / 6); }
export function cargo() { let n = 0; for (const g in game.goods) n += game.goods[g]; return n; }
export function cargoLimit() { return 30 + troopCount() * 3; }
// Bigger parties are slower, like a real army on the march.
export function partySpeed() { return 170 * (1 - Math.min(0.42, troopCount() * 0.006 + prisonerCount() * 0.004)) * (game.morale < 30 ? 0.85 : 1); }

// "3 Spearmen", "1 Bowman", "2 Orc grunts".
export function troopName(type, n) {
  const name = TROOPS[type].name;
  if (n === 1 || type === 'warlord') return name;
  return name.endsWith('man') && !name.endsWith('shaman') ? name.slice(0, -3) + 'men' : name + 's';
}

// ---------------------------------------------------------------- realms
function warKey(a, b) { return KINGDOMS.indexOf(a) < KINGDOMS.indexOf(b) ? a + '|' + b : b + '|' + a; }
export function atWar(a, b) { const w = game.wars && game.wars[warKey(a, b)]; return !!(w && w.on); }
export function enemiesOf(k) { return KINGDOMS.filter(o => o !== k && atWar(k, o)); }
export function anyWar() { return Object.keys(game.wars).filter(k => game.wars[k].on).map(k => k.split('|')); }
export function realmName(k) { return FACTIONS[k].short.replace(/^the /, 'the '); }
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
export function warsText() {
  const w = anyWar();
  if (!w.length) return 'All the kingdoms are at peace.';
  return w.map(([a, b]) => cap(FACTIONS[a].short) + ' and ' + FACTIONS[b].short + ' are at war.').join(' ');
}
// What people a faction's volunteers are.
export function raceOfSite(s) { return s.race || (FACTIONS[s.faction] && FACTIONS[s.faction].race) || 'human'; }
export function recruitType(s) { return RACES[raceOfSite(s)].recruit; }

export function hostile(a, b) {
  if (a === b) return false;
  if (a === 'horde' || b === 'horde') return true;
  if (a === 'player' || b === 'player') {
    const other = a === 'player' ? b : a;
    if ((game.relations[other] || 0) <= -20) return true;
    // Sworn to one kingdom while it is at war with the other: its enemies are yours.
    const boss = employer();
    return !!(boss && boss !== other && KINGDOMS.includes(other) && atWar(boss, other));
  }
  if (a === 'free' || b === 'free') return false;
  return atWar(a, b);
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
export function buyPrice(siteId, good) { return Math.max(1, Math.round(price(siteId, good) * (1.08 - skill('trade') * 0.02))); }
export function sellPrice(siteId, good) { return Math.max(1, Math.round(price(siteId, good) * (0.92 + skill('trade') * 0.02))); }
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
  else game.morale = clamp(game.morale + (72 + skill('leadership') * 2 - game.morale) * 0.12, 0, 100);
  // Healing. Every man patched up is practice for Gunther's Medicine.
  for (const t in game.troops) {
    const st = game.troops[t];
    if (!st.wounded) continue;
    const healed = Math.min(st.wounded, Math.max(1, Math.ceil(st.wounded * (0.3 + skill('medicine') * 0.03))));
    st.wounded -= healed;
    trainSkill('medicine', healed * 2);
  }
  // Prisoners eat, and a few slip their ropes.
  for (const t in game.prisoners) {
    if (Math.random() < 0.06) { game.prisoners[t]--; msgs.push(['A prisoner escaped in the night.', '#ffd27a']); }
    if (game.prisoners[t] <= 0) delete game.prisoners[t];
  }
  // Pay from your employer, and rent from your village.
  const pay = contractPay() + fiefRent();
  if (pay) game.gold += pay;
  if (game.contract && game.contract.kind === 'vassal' && game.contract.fief && game.sites[game.contract.fief].raided && game.day % 3 === 0) msgs.push([site(game.contract.fief).name + ' lies raided and pays no rent.', '#ff9a8a']);
  if (game.contract && (game.relations[game.contract.faction] || 0) < -5) {
    msgs.push([FACTIONS[game.contract.faction].name + ' has dismissed you from its service.', '#ff9a8a']);
    chronicle(FACTIONS[game.contract.faction].short + ' cast Gunther out of its service.');
    game.contract = null;
  }
  // Lords who were beaten or captured come back with fresh troops.
  for (const id in game.lords) {
    const st = game.lords[id];
    if (st.status === 'routed' && game.day >= st.back) st.status = 'free';
    if (st.status.startsWith('held-') && game.day >= st.back) {
      st.status = 'free';
      chronicle(lord(id).name + ' was ransomed and returned home.');
    }
  }
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
  // War and peace between each pair of kingdoms. A kingdom with most of its lords beaten or
  // captured sues for peace sooner, and no kingdom picks a second war while it is fighting one.
  const beaten = k => { const ls = LORDS.filter(l => l.faction === k); return ls.filter(l => game.lords[l.id].status !== 'free').length >= Math.ceil(ls.length * 0.6); };
  for (const key in game.wars) {
    const w = game.wars[key], [a, b] = key.split('|');
    w.timer--;
    if (w.on && (beaten(a) || beaten(b))) w.timer--;
    if (w.timer > 0) continue;
    if (!w.on && (enemiesOf(a).length || enemiesOf(b).length)) { w.timer = randInt(4, 8); continue; }
    w.on = !w.on;
    w.timer = w.on ? randInt(12, 22) : randInt(14, 32);
    const A = cap(FACTIONS[a].short), B = FACTIONS[b].short;
    msgs.push([w.on ? 'War! ' + A + ' and ' + B + ' are fighting.' : A + ' and ' + B + ' have made peace.', '#ffd27a']);
    chronicle(w.on ? 'War broke out between ' + FACTIONS[a].short + ' and ' + B + '.' : cap(FACTIONS[a].short) + ' and ' + B + ' made peace.');
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
