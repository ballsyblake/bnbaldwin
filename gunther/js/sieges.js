// Towns change hands. Each town has walls and a garrison; a lord at war may march on an enemy
// town, sit outside it for a few days and then storm it. Whoever takes a town takes the villages
// bound to it. Gunther can besiege towns too, and hold them: as a vassal for his lord, or in his
// own name, in which case he has to keep a garrison there or lose it again.

import { randInt, dist } from './core.js';
import { SETTLEMENTS, FACTIONS, RACES, TROOPS, raceOf } from './data.js';
import { game, note, chronicle, site, strength, hostile, lord, lordState } from './state.js';
import { autoResolve } from './menus.js';

// Who held each place on day one. SETTLEMENTS[i].faction is kept up to date with the save.
const ORIGINAL = {};
for (const s of SETTLEMENTS) ORIGINAL[s.id] = s.faction;
export function originalFaction(s) { return ORIGINAL[s.id]; }

export function applyOwners() {
  for (const s of SETTLEMENTS) {
    const st = game.sites && game.sites[s.id];
    s.faction = (st && st.owner) || ORIGINAL[s.id];
  }
}

export const SIEGE_DAYS = 3;            // days an AI lord camps outside before storming
export const WALL_BONUS = 0.6;          // attackers fight at this fraction of their strength against walls

export function isHeld(s) { return game.sites[s.id].holder === 'player'; }
export function heldSites() { return SETTLEMENTS.filter(isHeld); }
export function boundVillages(s) { return SETTLEMENTS.filter(v => v.bound === s.id); }
// The people who live in a place stay the same whoever rules it.
export function peopleOf(s) { return s.race || raceOf(ORIGINAL[s.id]); }

// A town's standing garrison, drawn from its ruler's people.
export function townGarrison(faction) {
  const [t0, t1, t2] = RACES[raceOf(faction)].army;
  const g = {};
  const add = (t, n) => { g[t] = (g[t] || 0) + n; };
  add(t0[0], 4); add(t1[0], 5); add(t1[1], 4); add(t2[0], 2);
  return g;
}
export function garrisonCap() { return Math.min(90, 35 + game.day * 0.25); }

// Lords besieging a place right now.
export function besiegers(s) { return game.parties.filter(p => p.mode === 'besiege' && p.siege === s.id); }

// The best town for a lord's host to march on, if any is weak enough.
export function siegeTarget(p) {
  const me = strength(p.troops);
  let best = null, bd = 1800;
  for (const s of SETTLEMENTS) {
    if (s.kind !== 'town' || s.faction === p.faction || s.faction === 'horde' || !hostile(p.faction, s.faction)) continue;
    if (game.parties.some(o => o.siege === s.id)) continue;
    if (game.day - (game.sites[s.id].takenDay || -99) < 12) continue;     // a town just taken gets a breather
    if (me * WALL_BONUS < strength(game.sites[s.id].garrison || {}) * 1.1) continue;
    const d = dist(p.x, p.y, s.x, s.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// A town (and its villages) gets a new ruler. holder 'player' means Gunther holds it.
export function capture(s, faction, holder, by) {
  const old = s.faction, wasHeld = isHeld(s);
  for (const v of [s].concat(boundVillages(s))) {
    const st = game.sites[v.id];
    if (v !== s && v.faction !== old) continue;      // a village already lost to someone else stays lost
    st.owner = faction; st.holder = holder || null; st.raided = Math.max(st.raided, v === s ? 4 : 0);
    st.takenDay = game.day;
  }
  applyOwners();
  const who = by || FACTIONS[faction].name;
  chronicle(who + ' took ' + s.name + ' from ' + FACTIONS[old].short + '.');
  if (wasHeld && holder !== 'player') note('You have lost ' + s.name + ' to ' + who + '!', '#ff6a5a');
  else note(who + ' took ' + s.name + ' from ' + FACTIONS[old].short + '.', '#ffd27a');
  // Lords who besieged it stop; quests and mercenary bands there carry on.
  for (const p of game.parties) if (p.siege === s.id) { p.mode = 'idle'; p.siege = null; }
}

// ---------------------------------------------------------------- the daily tick
export function siegeTick() {
  for (const s of SETTLEMENTS) {
    if (s.kind !== 'town') continue;
    const st = game.sites[s.id];
    if (!st.garrison) st.garrison = {};
    const g = st.garrison;
    if (isHeld(s)) {
      // Gunther's towns raise a little militia; the rest of the garrison is whoever he leaves there.
      const t = RACES[peopleOf(s)].recruit;
      if (game.day % 3 === 0 && (g[t] || 0) < 6 && !besiegers(s).length) g[t] = (g[t] || 0) + 1;
    } else if (strength(g) < garrisonCap() && !besiegers(s).length) {
      const [, t1, t2] = RACES[raceOf(s.faction)].army;
      const t = game.day % 5 === 0 ? t2[0] : t1[game.day % 2];
      g[t] = (g[t] || 0) + 1;
    }
  }
  // Lords outside the walls: give up if peace breaks out, storm after a few days.
  for (const p of game.parties) {
    if (p.mode !== 'besiege') continue;
    const s = site(p.siege);
    if (!s || !hostile(p.faction, s.faction)) { p.mode = 'idle'; p.siege = null; continue; }
    if (game.day - p.siegeDay >= SIEGE_DAYS) assault(p, s);
  }
}

function assault(p, s) {
  const st = game.sites[s.id], who = p.lord ? lord(p.lord).name : p.name;
  const res = autoResolve(p.troops, st.garrison || {}, 0, WALL_BONUS);
  if (res.aWins) {
    // A third of the survivors stay behind to hold the walls.
    const keep = {}, go = {};
    for (const t in res.a) { const n = Math.ceil(res.a[t] / 3); keep[t] = n; if (res.a[t] - n > 0) go[t] = res.a[t] - n; }
    capture(s, p.faction, null, who);
    st.garrison = keep;
    p.troops = go;
    p.mode = 'idle'; p.siege = null;
    if (!Object.keys(go).length) p.gone = true;
  } else {
    st.garrison = res.b;
    p.gone = true;
    if (p.lord) { const ls = lordState(p.lord); ls.status = 'routed'; ls.back = game.day + randInt(4, 7); }
    chronicle(who + ' failed to storm ' + s.name + '.');
    note(who + ' failed to storm ' + s.name + '.', isHeld(s) ? '#9fd99a' : '#d8dce6');
  }
}

// Gold a day from the places Gunther holds.
export function holdingsRent() {
  let r = 0;
  for (const s of heldSites()) {
    const st = game.sites[s.id];
    if (st.raided || besiegers(s).length) continue;
    r += s.kind === 'town' ? 80 : 40;
  }
  return r;
}
// Garrison troops are paid half wages.
export function garrisonWages() {
  let w = 0;
  for (const s of heldSites()) for (const t in game.sites[s.id].garrison || {}) w += (TROOPS[t].wage || 0) * game.sites[s.id].garrison[t] * 0.5;
  return Math.round(w);
}

