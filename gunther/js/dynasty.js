// Ageing, death and heirs. Everyone on Aldmoor gets older: a year passes every YEAR_DAYS days.
// Lords die of old age or, rarely, in battle, and a son or daughter of the house takes their place,
// inheriting some of their parent's feelings about Gunther. Gunther can die too: of old age, or
// when struck down in battle. Then an heir picks up the banner and the warband carries on.

import { clamp, pick, rand, randInt } from './core.js';
import { YEAR_DAYS, LORDS, FACTIONS, RACES, SKILLS, raceOf } from './data.js';
import { game, note, chronicle, lord, lordState, removeTroops } from './state.js';

const TRAITS = ['bold', 'cautious', 'honourable', 'cruel', 'greedy'];
const OPPOSITE = { bold: 'cautious', cautious: 'bold', honourable: 'cruel', cruel: 'honourable' };

export function ageOf(born) { return Math.floor((game.day - born) / YEAR_DAYS); }
export function year() { return Math.floor((game.day - 1) / YEAR_DAYS) + 1; }
export function heroAge() { return ageOf(game.hero.born); }
export function lordAge(id) { return ageOf(lordState(id).born); }

// ---------------------------------------------------------------- the original lords
// LORDS in data.js describes the island on day one. Heirs replace those entries in place, so the
// rest of the game can keep reading LORDS and always sees whoever holds each seat now.
const ORIGINAL = LORDS.map(l => ({ name: l.name, traits: l.traits.slice(), sex: l.sex, house: l.house }));
const RULER_NAMES = {};
for (const k in FACTIONS) RULER_NAMES[k] = FACTIONS[k].ruler;

export function newLordState(l) {
  return { status: 'free', back: 0, opinion: 0, memories: [], born: game.day - (l.age || 40) * YEAR_DAYS, gen: 1 };
}

// Copies heirs from the save onto LORDS and the realm's ruler names.
export function applyLords() {
  LORDS.forEach((l, i) => {
    const o = ORIGINAL[i], st = game.lords && game.lords[l.id];
    l.name = (st && st.name) || o.name;
    l.traits = (st && st.traits) || o.traits.slice();
    l.sex = (st && st.sex) || o.sex;
  });
  for (const k in RULER_NAMES) if (RULER_NAMES[k]) FACTIONS[k].ruler = RULER_NAMES[k];
  for (const l of LORDS) if (l.ruler) FACTIONS[l.faction].ruler = l.name;
}

// A new head of a lord's house: the eldest child, with a name and temper of their own.
function makeHeir(l) {
  const race = RACES[raceOf(l.faction)];
  const sex = Math.random() < 0.5 ? 'm' : 'f';
  const first = pick(race.names[sex]);
  const title = race.titles[l.ruler ? 'ruler' : 'lord'][sex === 'm' ? 0 : 1];
  const name = title + ' ' + first + (l.house ? ' ' + l.house : '');
  // One of the parent's traits runs in the family; the other is the heir's own.
  const kept = pick(l.traits);
  const other = pick(TRAITS.filter(t => t !== kept && OPPOSITE[kept] !== t));
  const age = race.adult + randInt(2, Math.max(4, Math.round(race.adult * 0.6)));
  return { name, sex, traits: [kept, other], age };
}

// A lord dies. Their heir takes the seat at once but needs a few days to raise an army.
export function lordDies(id, how) {
  const l = lord(id), st = lordState(id);
  const old = l.name, parent = l.sex === 'f' ? 'mother' : 'father';
  const h = makeHeir(l);
  st.name = h.name; st.sex = h.sex; st.traits = h.traits; st.born = game.day - h.age * YEAR_DAYS; st.gen = (st.gen || 1) + 1;
  // Children inherit grudges and friendships, half as strongly.
  const op = st.opinion;
  st.opinion = Math.round(op / 2);
  st.memories = [];
  if (op <= -20) st.memories.push({ day: game.day, text: 'Gunther wronged my late ' + parent });
  else if (op >= 20) st.memories.push({ day: game.day, text: 'my late ' + parent + ' spoke well of Gunther' });
  st.status = 'routed'; st.back = game.day + randInt(3, 6);
  game.parties.forEach(p => { if (p.lord === id) p.gone = true; });
  applyLords();
  const seat = l.ruler ? 'now rules ' + FACTIONS[l.faction].short : 'now leads ' + (l.house ? 'House ' + l.house : 'the house');
  chronicle(old + ' ' + how + '. ' + h.name + ' ' + seat + '.');
  note(old + ' ' + how + '. ' + h.name + ' ' + seat + '.', '#d8dce6');
}

// Each day, the old may not wake up. The chance climbs every year past old age.
function oldAgeChance(age, old) { return age < old ? 0 : (age - old + 1) * 0.03 / YEAR_DAYS; }

// ---------------------------------------------------------------- Gunther's family
export function newHero() { return { first: 'Gunther', name: 'Gunther', born: 1 - 26 * YEAR_DAYS, gen: 1, sex: 'm' }; }

export function canMarry() { return !game.spouse && heroAge() >= 16; }
// A match with a lord's house: their kin marries Gunther. Returns the new spouse.
export function marry(lordId) {
  const l = lord(lordId), race = RACES[raceOf(l.faction)];
  const sex = game.hero.sex === 'f' ? 'm' : 'f';
  const first = pick(race.names[sex]);
  const sp = { first, name: first + (l.house ? ' ' + l.house : ''), sex, from: lordId, faction: l.faction, day: game.day };
  game.spouse = sp;
  chronicle(game.hero.name + ' married ' + sp.name + ', kin of ' + l.name + '.');
  return sp;
}

// Children get a knack for one skill, which the heir starts with.
const TALENTS = ['archery', 'blade', 'leadership', 'trade', 'tactics', 'medicine'];
function birth() {
  const sex = Math.random() < 0.5 ? 'm' : 'f';
  const names = RACES.human.names[sex].filter(n => !game.children.some(c => c.first === n) && n !== game.spouse.first && n !== game.hero.first);
  const c = { first: pick(names.length ? names : RACES.human.names[sex]), sex, born: game.day, talent: pick(TALENTS) };
  game.children.push(c);
  note(game.spouse.first + ' has given birth to ' + (sex === 'm' ? 'a son' : 'a daughter') + ', ' + c.first + '.', '#ffe08a');
  chronicle('A child, ' + c.first + ', was born to ' + game.hero.name + ' and ' + game.spouse.name + '.');
}

export function adultHeirs() {
  return game.children.filter(c => ageOf(c.born) >= RACES.human.adult).sort((a, b) => a.born - b.born);
}

// ---------------------------------------------------------------- the daily tick
// Returns 'hero' if Gunther died in the night.
export function dynastyTick() {
  for (const l of LORDS) {
    const st = lordState(l.id);
    if (st.status.startsWith('held-')) continue;     // captives are looked after
    const race = RACES[raceOf(l.faction)];
    if (Math.random() < oldAgeChance(lordAge(l.id), race.old)) lordDies(l.id, 'died of old age');
  }
  // A new season: maybe a child.
  if (game.spouse && game.day % 10 === 0 && game.children.length < 5 && heroAge() < 50 && Math.random() < 0.4) birth();
  // Children come of age.
  for (const c of game.children) if (ageOf(c.born) === RACES.human.adult && !c.grown) {
    c.grown = true;
    note(c.first + ' has come of age and could lead the warband after you.', '#ffe08a');
  }
  if (Math.random() < oldAgeChance(heroAge(), RACES.human.old)) return 'hero';
  return null;
}

// Chance Gunther dies when knocked down in battle. Armour and youth help.
export function deathChance(lost) {
  if (!game.battleDeath) return 0;
  const base = lost ? 0.2 : 0.04;
  return clamp(base - (game.armourLevel - 1) * 0.015 + Math.max(0, heroAge() - 40) * 0.01, lost ? 0.06 : 0.01, 0.6);
}

// ---------------------------------------------------------------- succession
// Who could take over: grown children, eldest first. With none, a cousin steps in.
export function heirChoices() {
  const kids = adultHeirs().map(c => ({ child: c, first: c.first, sex: c.sex, age: ageOf(c.born), talent: c.talent }));
  if (kids.length) return kids;
  const sex = Math.random() < 0.5 ? 'm' : 'f';
  return [{ cousin: true, first: pick(RACES.human.names[sex]), sex, age: randInt(18, 26), talent: pick(TALENTS) }];
}

// The heir takes over. Some of what Gunther built is lost with them.
export function succeed(h, cause) {
  const old = game.hero, lines = [];
  game.dynasty.push({ name: old.name, from: old.since || 1, to: game.day, age: heroAge(), cause });
  const name = h.first + ' Gunther';
  game.hero = { first: h.first, name, born: game.day - h.age * YEAR_DAYS, gen: old.gen + 1, sex: h.sex, since: game.day };
  if (h.child) game.children = game.children.filter(c => c !== h.child);
  game.spouse = null;
  // Skills are the dead captain's own; the heir keeps a quarter of them, plus their knack.
  for (const k in SKILLS) game.skills[k] = Math.round((game.skills[k] || 0) * 0.25);
  game.skills[h.talent] = (game.skills[h.talent] || 0) + 80;
  const gold = Math.round(game.gold * 0.2);
  game.gold -= gold;
  game.renown = Math.round(game.renown * (h.cousin ? 0.5 : 0.65));
  let left = 0;
  for (const t of Object.keys(game.troops)) { const n = Math.floor(game.troops[t].n * (h.cousin ? 0.35 : 0.2)); if (n) { removeTroops(t, n); left += n; } }
  game.morale = 45;
  game.health = game.maxHealth = 100 + (game.armourLevel - 1) * 25;
  for (const id in game.lords) game.lords[id].opinion = Math.round(game.lords[id].opinion * 0.6);
  chronicle(old.name + ' ' + cause + ' at ' + heroAgeAt(old) + '. ' + name + ' took up the banner.');
  lines.push((h.cousin ? 'With no grown child to follow, a cousin, ' : 'Your ' + (h.sex === 'm' ? 'son ' : 'daughter ') ) + name + (h.cousin ? ',' : '') + ' takes up the banner, aged ' + h.age + '.');
  lines.push('Funeral and death duties cost ' + gold + ' gold. ' + (left ? left + ' men would not follow a new captain and went home. ' : '') + 'Renown is now ' + game.renown + '.');
  lines.push('The new captain keeps the old gear, a quarter of the old skills, and a knack for ' + SKILLS[h.talent].name + '. The lords remember the family, a little less warmly or bitterly.');
  return lines;
}
function heroAgeAt(h) { return ageOf(h.born); }

