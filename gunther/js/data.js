// The game's fixed facts: realms, troop types, trade goods and the places on the island.
// Tweak numbers here to rebalance the game without touching any logic.

export const WORLD_W = 3600;
export const WORLD_H = 2400;
export const DAY_SECONDS = 10;          // seconds of travel that make one in-game day

// ---------------------------------------------------------------- realms
// 'player' is Gunther's own warband. 'free' is the neutral market town.
export const FACTIONS = {
  player: { name: "Gunther's warband", colour: '#e8b83a', short: 'You' },
  vale: { name: 'Kingdom of the Vale', colour: '#4f86d9', short: 'the Vale', ruler: 'Queen Isolde' },
  march: { name: 'The Ember March', colour: '#d0563c', short: 'the March', ruler: 'Lord Brannoc' },
  free: { name: 'Free city of Fairmeet', colour: '#9aa3b2', short: 'Fairmeet' },
  horde: { name: 'The Gorrak Horde', colour: '#7c9a2e', short: 'the Horde' }
};
export const KINGDOMS = ['vale', 'march'];

// ---------------------------------------------------------------- troops
// hp: health. dmg: damage per hit. cd: seconds between attacks. range: reach in pixels.
// power: rough fighting worth, used for auto-resolved battles and AI decisions.
// wage: gold per week. upgrades: what this troop can be trained into, for xp and gold.
export const TROOPS = {
  recruit: { name: 'Recruit', sprite: 'soldier', kind: 'recruit', hp: 22, dmg: 5, cd: 1.0, range: 30, speed: 80, power: 1, wage: 1,
    upgrades: [{ to: 'spearman', xp: 25, cost: 10 }, { to: 'bowman', xp: 25, cost: 12 }] },
  spearman: { name: 'Spearman', sprite: 'soldier', kind: 'spear', hp: 36, dmg: 7, cd: 0.9, range: 36, speed: 76, power: 2.2, wage: 2, block: 0.4,
    upgrades: [{ to: 'knight', xp: 70, cost: 35 }] },
  knight: { name: 'Sworn Blade', sprite: 'soldier', kind: 'sword', hp: 58, dmg: 11, cd: 0.8, range: 32, speed: 74, power: 4.5, wage: 5, block: 0.65, upgrades: [] },
  bowman: { name: 'Bowman', sprite: 'archer', kind: 'archer', hp: 24, dmg: 6, cd: 1.5, range: 320, speed: 80, power: 2, wage: 2, ranged: true,
    upgrades: [{ to: 'ranger', xp: 70, cost: 35 }] },
  ranger: { name: 'Ranger', sprite: 'archer', kind: 'archer', hp: 32, dmg: 9, cd: 1.15, range: 380, speed: 84, power: 4, wage: 4, ranged: true, upgrades: [] },
  // The Horde.
  grunt: { name: 'Orc grunt', sprite: 'orc-yellow', hp: 30, dmg: 6, cd: 1.0, range: 32, speed: 74, power: 1.6, orc: true },
  brute: { name: 'Orc brute', sprite: 'orc-red', hp: 60, dmg: 11, cd: 1.1, range: 34, speed: 70, power: 3.6, orc: true },
  shaman: { name: 'Orc shaman', sprite: 'shaman', hp: 24, dmg: 9, cd: 2.2, range: 300, speed: 70, power: 2.6, orc: true, ranged: true, fire: true },
  warlord: { name: 'Warlord Gorrak', sprite: 'orc-red', hp: 360, dmg: 20, cd: 1.0, range: 44, speed: 66, power: 26, orc: true, scale: 3 }
};
export const HUMAN_TIERS = ['recruit', 'spearman', 'bowman', 'knight', 'ranger'];

// ---------------------------------------------------------------- trade goods
// food: true means the party can eat it.
export const GOODS = {
  grain: { name: 'Grain', base: 10, food: true },
  fish: { name: 'Salt fish', base: 16, food: true },
  wool: { name: 'Wool', base: 24 },
  ale: { name: 'Ale', base: 30 },
  iron: { name: 'Iron', base: 46 },
  spice: { name: 'Spices', base: 85 }
};

// ---------------------------------------------------------------- places
// kind: town (market, tavern, smith, recruits), village (recruits, grain), camp (orc camp),
// stronghold (the Horde's fortress). makes: cheap here. wants: pays well here.
export const SETTLEMENTS = [
  { id: 'brightwater', name: 'Brightwater', kind: 'town', faction: 'vale', x: 760, y: 1300, art: 0, makes: ['ale'], wants: ['wool', 'spice', 'iron'] },
  { id: 'millford', name: 'Millford', kind: 'village', faction: 'vale', x: 560, y: 900, makes: ['grain', 'wool'], wants: ['ale'] },
  { id: 'oakhollow', name: 'Oakhollow', kind: 'village', faction: 'vale', x: 1060, y: 1760, makes: ['grain', 'fish'], wants: ['iron'] },
  { id: 'fairmeet', name: 'Fairmeet', kind: 'town', faction: 'free', x: 1780, y: 1460, art: 1, makes: ['spice'], wants: ['fish', 'ale', 'wool'] },
  { id: 'redcliff', name: 'Redcliff', kind: 'town', faction: 'march', x: 2760, y: 1480, art: 2, makes: ['iron'], wants: ['grain', 'wool', 'spice'] },
  { id: 'ashby', name: 'Ashby', kind: 'village', faction: 'march', x: 2340, y: 1900, makes: ['wool', 'ale'], wants: ['iron'] },
  { id: 'stonefold', name: 'Stonefold', kind: 'village', faction: 'march', x: 3060, y: 1080, makes: ['iron', 'fish'], wants: ['grain', 'ale'] },
  { id: 'camp-west', name: 'Bonepit Camp', kind: 'camp', faction: 'horde', x: 1180, y: 640 },
  { id: 'camp-mid', name: 'Gutrot Camp', kind: 'camp', faction: 'horde', x: 2080, y: 760 },
  { id: 'camp-east', name: 'Fangmire Camp', kind: 'camp', faction: 'horde', x: 2640, y: 640 },
  { id: 'skullrock', name: 'Skullrock', kind: 'stronghold', faction: 'horde', x: 1700, y: 420 }
];

export const ROADS = [
  ['millford', 'brightwater'], ['brightwater', 'oakhollow'], ['brightwater', 'fairmeet'],
  ['oakhollow', 'fairmeet'], ['fairmeet', 'redcliff'], ['fairmeet', 'ashby'], ['redcliff', 'ashby'], ['redcliff', 'stonefold']
];

// Names for roaming orc warbands.
export const ORC_CHIEFS = ['Gruk', 'Morza', 'Uthak', 'Snagga', 'Bolg', 'Rakha', 'Dushnak', 'Ugra', 'Krimp', 'Zogg', 'Harrug', 'Nazgra'];
