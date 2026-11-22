// Duel challenge links. A team is packed into a short text code that goes in the link after #duel=.
// Nothing is sent to a server: the friend's browser unpacks the code and fights the team itself.
// Pure functions (no DOM) so they can be tested in Node.
import { FRAMES, DRIVES, WEAPONS, PLATES, MODULES, TACTICS, MAX_LVL, upgradeCost } from './data.js';
import { buildIssue } from './bot.js';

export const DUEL_BUDGET = 4000;
export const DUEL_LAYOUTS = ['pit', 'posts', 'cross', 'ring', 'grid', 'lanes'];

const LISTS = {
  frame: Object.keys(FRAMES), drive: Object.keys(DRIVES), weapon: Object.keys(WEAPONS),
  plate: Object.keys(PLATES), module: Object.keys(MODULES), tactic: Object.keys(TACTICS),
};
const DEFS = { frame: FRAMES, drive: DRIVES, weapon: WEAPONS, plate: PLATES, module: MODULES };

export function partCost(cat, key, lvl) {
  let c = DEFS[cat][key].cost;
  for (let l = 1; l < lvl; l++) c += upgradeCost(cat, key, l);
  return c;
}
export function buildCost(b) {
  let c = partCost('frame', b.frame.key, b.frame.lvl) + partCost('drive', b.drive.key, b.drive.lvl);
  for (const w of b.weapons) c += partCost('weapon', w.key, w.lvl);
  if (b.plate) c += partCost('plate', b.plate.key, b.plate.lvl);
  if (b.module) c += partCost('module', b.module.key, b.module.lvl);
  return c;
}

export const cleanName = (s) => String(s || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 12);

// team: [{ build, tactic }]. Each bot becomes numbers: part index then level, '0' for an empty slot.
export function encodeTeam(name, team) {
  const enc = (cat, p) => (p ? `${LISTS[cat].indexOf(p.key) + 1}${p.lvl}` : '0');
  const bots = team.map(({ build: b, tactic }) => [
    enc('frame', b.frame), enc('drive', b.drive), b.weapons.map((w) => enc('weapon', w)).join(':'),
    enc('plate', b.plate), enc('module', b.module), LISTS.tactic.indexOf(tactic),
  ].join('.'));
  return ['1', cleanName(name).replace(/ /g, '-') || 'anon', bots.join('_')].join('~');
}

// Returns { name, team:[{build,tactic}], cost } or { error }. Never trusts the link: every part,
// level, weight limit and the total budget are checked again here.
export function decodeTeam(code) {
  try {
    const [v, rawName, rawBots, extra] = decodeURIComponent(String(code)).split('~');
    if (v !== '1' || extra !== undefined || !rawBots) return { error: 'Unknown link format' };
    const name = cleanName(rawName.replace(/-/g, ' ')) || 'anon';
    const bots = rawBots.split('_');
    if (bots.length < 1 || bots.length > 3) return { error: 'Team must have 1 to 3 bots' };
    const dec = (cat, s, optional) => {
      if (s === '0' && optional) return null;
      if (!/^[1-9][0-9]*[1-9]$/.test(s)) throw new Error('bad part');
      const idx = +s.slice(0, -1) - 1, lvl = +s.slice(-1);
      const key = LISTS[cat][idx];
      if (!key || lvl < 1 || lvl > MAX_LVL) throw new Error('bad part');
      return { key, lvl };
    };
    let cost = 0;
    const team = bots.map((raw) => {
      const f = raw.split('.');
      if (f.length !== 6) throw new Error('bad bot');
      const build = {
        frame: dec('frame', f[0]), drive: dec('drive', f[1]),
        weapons: f[2].split(':').map((w) => dec('weapon', w)),
        plate: dec('plate', f[3], true), module: dec('module', f[4], true),
      };
      if (build.weapons.length > FRAMES[build.frame.key].slots) throw new Error('too many weapons');
      if (buildIssue(build)) throw new Error('illegal bot');
      const tactic = LISTS.tactic[+f[5]];
      if (!tactic || !/^[0-9]$/.test(f[5])) throw new Error('bad tactic');
      cost += buildCost(build);
      return { build, tactic };
    });
    if (cost > DUEL_BUDGET) return { error: 'Team is over the duel budget' };
    return { name, team, cost };
  } catch (e) {
    return { error: 'Broken challenge link' };
  }
}

// Same code always picks the same arena, so both players see the same layout.
export function layoutFor(code) {
  let h = 0;
  for (const ch of String(code)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DUEL_LAYOUTS[h % DUEL_LAYOUTS.length];
}
