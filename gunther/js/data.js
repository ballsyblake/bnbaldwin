// The game's fixed facts (realms, peoples, troops, goods, places, lords, skills) live in JSON files
// in gunther/data/, so they can be changed without touching any code. See data/README.md.
// This module loads them, applies any mods, checks the result, and exports it under the same
// names the rest of the game has always used.

export const WORLD_W = 3600;
export const WORLD_H = 2400;

const FILES = ['rules', 'factions', 'races', 'troops', 'goods', 'places', 'lords', 'skills', 'names', 'story'];
const MOD_STORE = 'gunther-mods';

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Could not load ' + url + ' (' + r.status + ')');
  return r.json();
}

const base = {};
await Promise.all(FILES.map(async f => { base[f] = await getJson(new URL('../data/' + f + '.json', import.meta.url)); }));

// ---------------------------------------------------------------- mods
// A mod is one JSON object whose keys are the data files above (plus "settlements" and "roads",
// which live in places.json). Records are merged by key or id; see data/README.md for the rules.
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function merge(into, from) {
  for (const k in from) {
    if (from[k] === null) delete into[k];
    else if (isObj(from[k]) && isObj(into[k])) merge(into[k], from[k]);
    else into[k] = JSON.parse(JSON.stringify(from[k]));
  }
  return into;
}
// Lists of records with an id: change, remove ("remove": true) or add entries.
function mergeList(list, changes) {
  for (const c of changes) {
    const i = list.findIndex(x => x.id === c.id);
    if (c.remove) { if (i >= 0) list.splice(i, 1); continue; }
    if (i >= 0) merge(list[i], c); else list.push(JSON.parse(JSON.stringify(c)));
  }
}
// Plain lists: replace them, or give { "add": [...] } to append.
function mergePlain(list, change) { return Array.isArray(change) ? change.slice() : list.concat(change.add || []); }

function applyMod(d, mod) {
  for (const k of ['rules', 'factions', 'races', 'troops', 'goods', 'skills']) if (isObj(mod[k])) merge(d[k], mod[k]);
  if (Array.isArray(mod.settlements)) mergeList(d.places.settlements, mod.settlements);
  if (Array.isArray(mod.lords)) mergeList(d.lords, mod.lords);
  if (mod.roads) d.places.roads = mergePlain(d.places.roads, mod.roads);
  if (mod.orcChiefs) d.names.orcChiefs = mergePlain(d.names.orcChiefs, mod.orcChiefs);
  // The story: chapters are changed, removed or added by id; the rest (title, prologue...) merges.
  if (isObj(mod.story)) {
    const { chapters, ...rest } = mod.story;
    merge(d.story, rest);
    if (Array.isArray(chapters)) mergeList(d.story.chapters, chapters);
  }
}

// Everything must point at things that exist, or the game would break in odd ways later.
function problems(d) {
  const out = [], T = d.troops, F = d.factions, R = d.races, S = d.places.settlements;
  for (const t in T) for (const u of T[t].upgrades || []) if (!T[u.to]) out.push('troop ' + t + ' upgrades to unknown troop ' + u.to);
  for (const r in R) {
    if (!T[R[r].recruit]) out.push('race ' + r + ' recruits unknown troop ' + R[r].recruit);
    for (const pair of R[r].army || []) for (const t of pair) if (!T[t]) out.push('race ' + r + ' army uses unknown troop ' + t);
    if (!R[r].names || !R[r].titles) out.push('race ' + r + ' needs names and titles');
  }
  for (const f in F) if (F[f].race && !R[F[f].race]) out.push('faction ' + f + ' has unknown race ' + F[f].race);
  for (const s of S) {
    if (!F[s.faction]) out.push('place ' + s.id + ' has unknown faction ' + s.faction);
    if (s.bound && !S.some(t => t.id === s.bound)) out.push('village ' + s.id + ' is bound to unknown town ' + s.bound);
    if (typeof s.x !== 'number' || typeof s.y !== 'number') out.push('place ' + s.id + ' needs x and y');
  }
  for (const [a, b] of d.places.roads) if (!S.some(s => s.id === a) || !S.some(s => s.id === b)) out.push('road ' + a + '-' + b + ' joins an unknown place');
  for (const l of d.lords) {
    if (!F[l.faction]) out.push('lord ' + l.id + ' has unknown faction ' + l.faction);
    if (!S.some(s => s.id === l.home)) out.push('lord ' + l.id + ' has unknown home ' + l.home);
  }
  for (const need of ['player', 'free', 'horde']) if (!F[need]) out.push('the ' + need + ' faction cannot be removed');
  for (const need of ['recruit', 'bowman', 'grunt', 'brute', 'shaman', 'warlord']) if (!T[need]) out.push('the ' + need + ' troop cannot be removed');
  for (const need of ['grain', 'fish']) if (!d.goods[need]) out.push('the ' + need + ' goods cannot be removed');
  if (!S.some(s => s.kind === 'stronghold')) out.push('there must be an orc stronghold');
  for (const c of d.story.chapters || []) for (const st of [].concat(c.step)) {
    if (!st || !['visit', 'visits', 'defeat'].includes(st.type)) { out.push('story chapter ' + c.id + ' has an unknown step type'); continue; }
    for (const id of [st.place, st.near].concat(st.places || [])) if (id && !S.some(s => s.id === id)) out.push('story chapter ' + c.id + ' uses unknown place ' + id);
    if (st.party) {
      if (!F[st.party.faction]) out.push('story chapter ' + c.id + ' has unknown faction ' + st.party.faction);
      for (const t in st.party.troops || {}) if (!T[t]) out.push('story chapter ' + c.id + ' uses unknown troop ' + t);
    }
  }
  return out;
}

// Mods come from two places: files listed in mods/mods.json (for whoever hosts the game), and
// mods a player loaded from their own device (kept in this browser).
export const MODS = [];          // { name, source, on, error, title, about }
async function modList() {
  const list = [];
  try {
    const index = await getJson(new URL('../mods/mods.json', import.meta.url));
    for (const file of index.mods || []) {
      try { list.push({ name: file, source: 'site', data: await getJson(new URL('../mods/' + file, import.meta.url)), on: true }); }
      catch (e) { list.push({ name: file, source: 'site', on: false, error: e.message }); }
    }
  } catch (e) { /* no mods folder: fine */ }
  for (const m of deviceMods()) list.push({ name: m.name, source: 'device', data: m.data, on: m.on !== false });
  return list;
}

// Player mods, for the title screen's Mods menu. Changes take effect after a reload.
export function deviceMods() { try { return JSON.parse(localStorage.getItem(MOD_STORE) || '[]'); } catch (e) { return []; } }
export function saveDeviceMods(list) { try { localStorage.setItem(MOD_STORE, JSON.stringify(list)); return true; } catch (e) { return false; } }

const data = JSON.parse(JSON.stringify(base));
for (const m of await modList()) {
  if (m.on && m.data && !m.error) {
    // Try the mod on a copy first, so a broken one can't take the game down with it.
    const trial = JSON.parse(JSON.stringify(data));
    try {
      if (!isObj(m.data)) throw new Error('a mod must be one JSON object');
      applyMod(trial, m.data);
      const bad = problems(trial);
      if (bad.length) m.error = bad.slice(0, 3).join('; ');
      else applyMod(data, m.data);
    } catch (e) { m.error = e.message; }
  }
  MODS.push({ name: m.name, source: m.source, on: m.on, error: m.error || null, title: isObj(m.data) ? m.data.name : null, about: isObj(m.data) ? m.data.description : null });
}

// ---------------------------------------------------------------- the game's data
export const DAY_SECONDS = data.rules.daySeconds;     // seconds of travel that make one in-game day
export const YEAR_DAYS = data.rules.yearDays;         // days in a year; everyone ages one year per year
export const FACTIONS = data.factions;
export const KINGDOMS = Object.keys(FACTIONS).filter(k => FACTIONS[k].kingdom);
export const RACES = data.races;
export function raceOf(faction) { return (FACTIONS[faction] && FACTIONS[faction].race) || 'human'; }
export const TROOPS = data.troops;
export const GOODS = data.goods;
export const SETTLEMENTS = data.places.settlements;
export const ROADS = data.places.roads;
export const ORC_CHIEFS = data.names.orcChiefs;
export const LORDS = data.lords;
export const SKILLS = data.skills;
export const STORY = data.story;
