// War, peace and alliances between the realms of Aldmoor. Every realm (the orc clans too) has its
// own interests: they fall out, make common cause against a shared enemy, call their allies to
// arms, and sometimes turn on an ally when it suits them. Each pair of realms has one entry in
// game.wars: { on: at war, ally: allied, timer: days until they reconsider, grudge: no alliance
// until this day }.

import { randInt } from './core.js';
import { FACTIONS, KINGDOMS, LORDS } from './data.js';
import { game, chronicle, note, lordState } from './state.js';

export function warKey(a, b) { return KINGDOMS.indexOf(a) < KINGDOMS.indexOf(b) ? a + '|' + b : b + '|' + a; }
function pair(a, b) { return game.wars[warKey(a, b)]; }
export function atWar(a, b) { const w = game.wars && pair(a, b); return !!(w && w.on); }
export function allied(a, b) { const w = game.wars && pair(a, b); return !!(w && w.ally); }
export function enemiesOf(k) { return KINGDOMS.filter(o => o !== k && atWar(k, o)); }
export function alliesOf(k) { return KINGDOMS.filter(o => o !== k && allied(k, o)); }
export function anyWar() { return Object.keys(game.wars).filter(k => game.wars[k].on).map(k => k.split('|')); }
export function anyAlliance() { return Object.keys(game.wars).filter(k => game.wars[k].ally).map(k => k.split('|')); }

const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const name = k => FACTIONS[k].short;
// "the Clans" and "the Dunmar Holds" are plural: they march, the Vale marches.
const many = k => /s$/.test(FACTIONS[k].short);
const poss = k => name(k) + (many(k) ? '\'' : '\'s');

// Sets up the table, keeping whatever an older save already has.
export function ensureDiplomacy() {
  if (!game.wars) game.wars = {};
  if (game.atWar !== undefined) { game.wars['vale|march'] = { on: game.atWar, timer: game.warTimer || 10 }; delete game.atWar; delete game.warTimer; }
  for (let i = 0; i < KINGDOMS.length; i++) for (let j = i + 1; j < KINGDOMS.length; j++) {
    const k = warKey(KINGDOMS[i], KINGDOMS[j]);
    if (!game.wars[k]) game.wars[k] = { on: false, timer: randInt(4, 24) };
    if (game.wars[k].ally === undefined) game.wars[k].ally = false;
  }
}

// What the realm's ruler is like decides how trustworthy the realm is.
function ruler(k) { return LORDS.find(l => l.faction === k && l.ruler); }
function rulerHas(k, t) { const r = ruler(k); return !!(r && r.traits.includes(t)); }
function faithless(k) { return 0.18 + (rulerHas(k, 'cruel') ? 0.15 : 0) + (rulerHas(k, 'greedy') ? 0.12 : 0) - (rulerHas(k, 'honourable') ? 0.14 : 0); }
function warlike(k) { return 0.4 + (rulerHas(k, 'bold') ? 0.15 : 0) + (rulerHas(k, 'cruel') ? 0.1 : 0) - (rulerHas(k, 'cautious') ? 0.15 : 0); }
// Most of a realm's lords beaten or captured: it wants out of its wars.
function beaten(k) { const ls = LORDS.filter(l => l.faction === k); return ls.length && ls.filter(l => lordState(l.id).status !== 'free').length >= Math.ceil(ls.length * 0.6); }

function tell(text, colour) { chronicle(text); note(text, colour); }

// a goes to war with b. Allies on both sides are called to arms; each answers or breaks faith.
export function declareWar(a, b, why) {
  const w = pair(a, b);
  const wasAlly = w.ally;
  w.on = true; w.ally = false; w.timer = randInt(12, 22);
  if (wasAlly) { w.grudge = game.day + 80; tell(cap(name(a)) + ' betrayed ' + name(b) + '! Allies yesterday, ' + (why || 'they are at war today') + '.', '#ff9a8a'); }
  else tell('War! ' + cap(name(a)) + (many(a) ? ' march on ' : ' marches on ') + name(b) + (why ? ', ' + why : '') + '.', '#ffd27a');
  for (const [side, foe] of [[a, b], [b, a]]) {
    for (const x of alliesOf(side)) {
      if (x === foe || atWar(x, foe)) continue;
      if (allied(x, foe)) {
        // Allied to both: it sits this one out, and both remember.
        pair(x, side).ally = false; pair(x, foe).ally = false;
        tell(cap(name(x)) + ' would not choose between ' + name(side) + ' and ' + name(foe) + ', and lost both alliances.', '#d8dce6');
      } else if (Math.random() < 0.75 - faithless(x) * 0.5) {
        const v = pair(x, foe); v.on = true; v.timer = randInt(10, 18);
        tell(cap(name(x)) + ' answered ' + poss(side) + ' call and went to war with ' + name(foe) + '.', '#ffd27a');
      } else {
        const v = pair(x, side); v.ally = false; v.grudge = game.day + 50;
        tell(cap(name(x)) + ' ignored ' + poss(side) + ' call to arms. The alliance is over.', '#d8dce6');
      }
    }
  }
}

function makePeace(a, b) {
  const w = pair(a, b);
  w.on = false; w.timer = randInt(14, 30);
  tell(cap(name(a)) + ' and ' + name(b) + ' have made peace.', '#d8dce6');
}

function makeAlliance(a, b, against) {
  const w = pair(a, b);
  w.ally = true; w.timer = randInt(25, 45);
  tell(cap(name(a)) + ' and ' + name(b) + ' have sworn an alliance' + (against ? ' against ' + name(against) : '') + '.', '#9fd99a');
}

// Once a day. Each pair reconsiders when its timer runs out.
export function diplomacyTick() {
  for (const key of Object.keys(game.wars)) {
    const w = game.wars[key], [a, b] = key.split('|');
    if (!FACTIONS[a] || !FACTIONS[b]) continue;
    w.timer--;
    if (w.on && (beaten(a) || beaten(b))) w.timer--;
    if (w.timer > 0) continue;
    if (w.on) { makePeace(a, b); continue; }
    if (w.ally) {
      // An alliance comes up for renewal: kept, allowed to lapse, or betrayed.
      const traitor = Math.random() < 0.5 ? a : b, other = traitor === a ? b : a;
      if (enemiesOf(traitor).length < 2 && Math.random() < faithless(traitor) * 0.6) declareWar(traitor, other, 'and ' + name(traitor) + (many(traitor) ? ' are marching on their' : ' is marching on its') + ' old friend');
      else if (Math.random() < 0.4) { w.ally = false; w.timer = randInt(10, 20); tell('The alliance between ' + name(a) + ' and ' + name(b) + ' has lapsed.', '#d8dce6'); }
      else w.timer = randInt(20, 35);
      continue;
    }
    // At peace. Realms that share an enemy may band together; otherwise old rivalries flare up.
    const common = enemiesOf(a).filter(e => enemiesOf(b).includes(e));
    if (common.length && (w.grudge || 0) < game.day && Math.random() < 0.6) { makeAlliance(a, b, common[0]); continue; }
    const busy = enemiesOf(a).length >= 2 || enemiesOf(b).length >= 2 || (enemiesOf(a).length && enemiesOf(b).length);
    const [hawk, dove] = warlike(a) >= warlike(b) ? [a, b] : [b, a];
    if (!busy && Math.random() < warlike(hawk)) declareWar(hawk, dove);
    else if ((w.grudge || 0) < game.day && Math.random() < 0.15) makeAlliance(a, b);
    else w.timer = randInt(4, 10);
  }
}

export function warsText() {
  const w = anyWar(), al = anyAlliance();
  const parts = w.map(([a, b]) => cap(name(a)) + ' and ' + name(b) + ' are at war.');
  parts.push(...al.map(([a, b]) => cap(name(a)) + ' and ' + name(b) + ' are allies.'));
  return parts.length ? parts.join(' ') : 'All the realms are at peace.';
}
// One realm's standing with the others, for the island screen.
export function standing(k) {
  const e = enemiesOf(k), al = alliesOf(k);
  return (e.length ? 'At war with ' + e.map(name).join(', ') : 'At peace') + (al.length ? '; allied with ' + al.map(name).join(', ') : '');
}
