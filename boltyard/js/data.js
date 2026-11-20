// Boltyard game data. All parts, arenas and enemy teams are original to this game.
// Pure data: no DOM, so the battle simulation can also run in Node for balance tests.

export const MAX_LVL = 3;
export const START_CREDITS = 250;
export const BAY_COST = [0, 300, 900];        // cost to unlock bay 1, 2, 3
export const BATTLE_TIME = 75;                // seconds before a timeout decision
export const LOSS_PAYOUT = 0.25;              // share of the reward paid on a loss
export const REPLAY_PAYOUT = 0.25;            // share of the reward paid when replaying a won arena

// shape = number of sides drawn for the hull
export const FRAMES = {
  skiff:  { name: 'Skiff',  hp: 70,  cap: 30,  slots: 1, wt: 10, r: 18, cost: 120,  shape: 3 },
  brick:  { name: 'Brick',  hp: 120, cap: 48,  slots: 1, wt: 18, r: 20, cost: 320,  shape: 4 },
  warden: { name: 'Warden', hp: 165, cap: 66,  slots: 2, wt: 26, r: 23, cost: 750,  shape: 6 },
  titan:  { name: 'Titan',  hp: 250, cap: 95,  slots: 2, wt: 36, r: 27, cost: 1500, shape: 8 },
  hydra:  { name: 'Hydra',  hp: 215, cap: 112, slots: 3, wt: 34, r: 27, cost: 2600, shape: 5 },
};

// spd = top speed (units/s); pull = total weight carried at full speed
export const DRIVES = {
  rollers: { name: 'Rollers', spd: 90,  pull: 40, wt: 4,  cost: 60 },
  treads:  { name: 'Treads',  spd: 62,  pull: 95, wt: 10, cost: 240, arm: 1 },
  hover:   { name: 'Hover',   spd: 135, pull: 38, wt: 6,  cost: 420 },
  strider: { name: 'Strider', spd: 100, pull: 80, wt: 9,  cost: 800 },
};

// range = gap between hull edges at which the weapon fires
export const WEAPONS = {
  rivet:   { name: 'Rivet Gun', kind: 'bullet',  dmg: 5,  rof: 3,    range: 190, pspd: 430,  spread: 0.07, wt: 5,  cost: 60 },
  grinder: { name: 'Grinder',   kind: 'melee',   dmg: 9,  rof: 4,    range: 14,  wt: 7,  cost: 160 },
  scatter: { name: 'Scatter',   kind: 'bullet',  dmg: 4,  rof: 0.9,  range: 130, pspd: 380,  spread: 0.32, pellets: 5, wt: 8, cost: 220 },
  arc:     { name: 'Arc Lance', kind: 'beam',    dmg: 19, rof: 0.8,  range: 240, wt: 10, cost: 450, pierce: 0.5 },
  lobber:  { name: 'Lobber',    kind: 'shell',   dmg: 26, rof: 0.5,  range: 330, pspd: 240, min: 70, splash: 46, wt: 14, cost: 600 },
  swarm:   { name: 'Swarm Pod', kind: 'missile', dmg: 9,  rof: 0.45, range: 300, pspd: 230, pellets: 3, wt: 13, cost: 900 },
  rail:    { name: 'Railspike', kind: 'rail',    dmg: 70, rof: 0.33, range: 440, pspd: 1500, wt: 18, cost: 1200 },
};

export const PLATES = {
  tin:      { name: 'Tin',      hp: 25,  arm: 1, wt: 6,  cost: 80 },
  steel:    { name: 'Steel',    hp: 50,  arm: 2, wt: 12, cost: 280 },
  ceramite: { name: 'Ceramite', hp: 70,  arm: 3, wt: 10, cost: 650 },
  bastion:  { name: 'Bastion',  hp: 120, arm: 4, wt: 22, cost: 1100 },
};

export const MODULES = {
  patch:     { name: 'Patch Kit', regen: 2.5,  wt: 3, cost: 300 },
  barrier:   { name: 'Barrier',   shield: 35,  wt: 4, cost: 480 },
  overclock: { name: 'Overclock', rofMul: 0.2, wt: 2, cost: 420 },
  booster:   { name: 'Booster',   spdMul: 0.25, wt: 3, cost: 260 },
};

export const CATS = {
  frame:  { label: 'Frame',  defs: FRAMES },
  drive:  { label: 'Drive',  defs: DRIVES },
  weapon: { label: 'Weapon', defs: WEAPONS },
  plate:  { label: 'Plating', defs: PLATES },
  module: { label: 'Module', defs: MODULES },
};

export const TACTICS = {
  rush:  { label: 'Rush',  hint: 'Close in' },
  range: { label: 'Range', hint: 'Keep distance' },
  flank: { label: 'Flank', hint: 'Circle target' },
};

export const TEAM_COLORS = ['#f2a33a', '#3ac4f2', '#9be564'];
export const ENEMY_COLOR = '#e5484d';

// Each level adds 15% to the part's main stat.
export const lvlMul = (lvl) => 1 + 0.15 * (lvl - 1);

export function upgradeCost(cat, key, lvl) {
  const base = Math.max(60, CATS[cat].defs[key].cost * 0.45);
  return Math.round((base * lvl) / 10) * 10;
}

// Arena layouts in a 900 x 560 world. c = round pillar, r = block.
export const LAYOUTS = {
  pit:     [],
  posts:   [{ t: 'c', x: 450, y: 180, r: 30 }, { t: 'c', x: 450, y: 380, r: 30 }],
  cross:   [{ t: 'r', x: 420, y: 120, w: 60, h: 120 }, { t: 'r', x: 420, y: 320, w: 60, h: 120 }],
  maze:    [{ t: 'r', x: 300, y: 80, w: 40, h: 170 }, { t: 'r', x: 560, y: 310, w: 40, h: 170 },
            { t: 'c', x: 450, y: 280, r: 34 }],
  ring:    [{ t: 'c', x: 330, y: 160, r: 26 }, { t: 'c', x: 570, y: 160, r: 26 },
            { t: 'c', x: 330, y: 400, r: 26 }, { t: 'c', x: 570, y: 400, r: 26 }, { t: 'c', x: 450, y: 280, r: 40 }],
  bunker:  [{ t: 'r', x: 230, y: 230, w: 30, h: 100 }, { t: 'r', x: 640, y: 230, w: 30, h: 100 },
            { t: 'r', x: 380, y: 60, w: 140, h: 36 }, { t: 'r', x: 380, y: 464, w: 140, h: 36 }],
  grid:    [{ t: 'c', x: 300, y: 170, r: 22 }, { t: 'c', x: 450, y: 170, r: 22 }, { t: 'c', x: 600, y: 170, r: 22 },
            { t: 'c', x: 300, y: 390, r: 22 }, { t: 'c', x: 450, y: 390, r: 22 }, { t: 'c', x: 600, y: 390, r: 22 }],
  lanes:   [{ t: 'r', x: 260, y: 180, w: 380, h: 26 }, { t: 'r', x: 260, y: 354, w: 380, h: 26 }],
  scrap:   [{ t: 'r', x: 250, y: 120, w: 50, h: 50 }, { t: 'c', x: 380, y: 400, r: 30 }, { t: 'r', x: 600, y: 390, w: 50, h: 50 },
            { t: 'c', x: 520, y: 160, r: 30 }, { t: 'r', x: 430, y: 255, w: 40, h: 50 }],
};

// Arena list and enemy teams are written by tools/gen-arenas.mjs (tuned by simulation).
export { ARENAS, LEAGUES } from './arenas.js';
