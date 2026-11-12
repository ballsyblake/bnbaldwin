// The game's fixed facts: realms, troop types, trade goods and the places on the island.
// Tweak numbers here to rebalance the game without touching any logic.

export const WORLD_W = 3600;
export const WORLD_H = 2400;
export const DAY_SECONDS = 10;          // seconds of travel that make one in-game day

// ---------------------------------------------------------------- realms
// 'player' is Gunther's own warband. 'free' is the neutral market town.
export const FACTIONS = {
  player: { name: "Gunther's warband", colour: '#f2c14e', short: 'You' },
  vale: { name: 'Kingdom of the Vale', colour: '#4f86d9', short: 'the Vale', ruler: 'Queen Isolde' },
  march: { name: 'The Ember March', colour: '#d0563c', short: 'the March', ruler: 'Lord Brannoc' },
  free: { name: 'Free city of Fairmeet', colour: '#9aa3b2', short: 'Fairmeet' },
  elves: { name: 'The Elthir Wood', colour: '#3aa58f', short: 'the Elthir Wood', ruler: 'Queen Ilyra', race: 'elf' },
  dwarves: { name: 'The Dunmar Holds', colour: '#c08a3e', short: 'the Dunmar Holds', ruler: 'High Thane Borga', race: 'dwarf' },
  horde: { name: 'The Gorrak Horde', colour: '#7c9a2e', short: 'the Horde' }
};
export const KINGDOMS = ['vale', 'march', 'elves', 'dwarves'];

// ---------------------------------------------------------------- races
// Four peoples share Aldmoor. None of them use magic: what sets them apart is how they live and fight.
//  Humans: all-rounders.  Elves: fast, deadly archers, lightly armoured.
//  Dwarves: slow, very tough, heavy shields and crossbows.  Orcs: raiders from over the sea.
// recruit: what volunteers join as. army: what a lord of that people fields, from weakest to best
// as [melee, ranged] pairs.
export const RACES = {
  human: { name: 'Human', recruit: 'recruit', army: [['recruit', 'recruit'], ['spearman', 'bowman'], ['knight', 'ranger']] },
  elf: { name: 'Elf', recruit: 'elfscout', army: [['elfscout', 'elfscout'], ['elfblade', 'elfarcher'], ['elfblade', 'sentinel']] },
  dwarf: { name: 'Dwarf', recruit: 'dwarfminer', army: [['dwarfminer', 'dwarfminer'], ['dwarfaxe', 'dwarfxbow'], ['ironguard', 'dwarfxbow']] }
};
export function raceOf(faction) { return (FACTIONS[faction] && FACTIONS[faction].race) || 'human'; }

// ---------------------------------------------------------------- troops
// hp: health. dmg: damage per hit. cd: seconds between attacks. range: reach in pixels.
// power: rough fighting worth, used for auto-resolved battles and AI decisions.
// wage: gold per week. upgrades: what this troop can be trained into, for xp and gold.
export const TROOPS = {
  recruit: { name: 'Recruit', guard: 0.08, sprite: 'soldier', kind: 'recruit', hp: 22, dmg: 5, cd: 1.0, range: 30, speed: 80, power: 1, wage: 1,
    upgrades: [{ to: 'spearman', xp: 25, cost: 10 }, { to: 'bowman', xp: 25, cost: 12 }] },
  spearman: { name: 'Spearman', guard: 0.35, sprite: 'soldier', kind: 'spear', hp: 36, dmg: 7, cd: 0.9, range: 36, speed: 76, power: 2.2, wage: 2, block: 0.4,
    upgrades: [{ to: 'knight', xp: 70, cost: 35 }] },
  knight: { name: 'Sworn Blade', guard: 0.6, sprite: 'soldier', kind: 'sword', hp: 58, dmg: 11, cd: 0.8, range: 32, speed: 74, power: 4.5, wage: 5, block: 0.65, upgrades: [] },
  bowman: { name: 'Bowman', sprite: 'archer', kind: 'archer', hp: 24, dmg: 6, cd: 1.5, range: 320, speed: 80, power: 2, wage: 2, ranged: true,
    upgrades: [{ to: 'ranger', xp: 70, cost: 35 }] },
  ranger: { name: 'Ranger', sprite: 'archer', kind: 'archer', hp: 32, dmg: 9, cd: 1.15, range: 380, speed: 84, power: 4, wage: 4, ranged: true, upgrades: [] },
  // Elves: quick on their feet, the best bows on the island, little armour.
  elfscout: { name: 'Elf scout', race: 'elf', sprite: 'soldier', kind: 'elfscout', hp: 20, dmg: 5, cd: 1.3, range: 330, speed: 94, power: 1.6, wage: 2, ranged: true,
    upgrades: [{ to: 'elfarcher', xp: 30, cost: 15 }, { to: 'elfblade', xp: 30, cost: 15 }] },
  elfarcher: { name: 'Elf archer', race: 'elf', sprite: 'soldier', kind: 'elfarcher', hp: 28, dmg: 9, cd: 1.05, range: 400, speed: 94, power: 3.6, wage: 4, ranged: true,
    upgrades: [{ to: 'sentinel', xp: 80, cost: 40 }] },
  sentinel: { name: 'Elf sentinel', race: 'elf', sprite: 'soldier', kind: 'sentinel', hp: 34, dmg: 12, cd: 0.95, range: 440, speed: 96, power: 5.6, wage: 6, ranged: true, upgrades: [] },
  elfblade: { name: 'Elf bladedancer', guard: 0.65, race: 'elf', sprite: 'soldier', kind: 'elfblade', hp: 34, dmg: 8, cd: 0.6, range: 30, speed: 100, power: 3.6, wage: 4, block: 0.2, upgrades: [] },
  // Dwarves: slow and stubborn, hard to kill, with axes, heavy shields and crossbows.
  dwarfminer: { name: 'Dwarf miner', guard: 0.15, race: 'dwarf', sprite: 'soldier', kind: 'dwarfminer', hp: 32, dmg: 6, cd: 1.0, range: 30, speed: 64, power: 1.7, wage: 2,
    upgrades: [{ to: 'dwarfaxe', xp: 30, cost: 15 }, { to: 'dwarfxbow', xp: 30, cost: 15 }] },
  dwarfaxe: { name: 'Dwarf axeman', guard: 0.4, race: 'dwarf', sprite: 'soldier', kind: 'dwarfaxe', hp: 50, dmg: 9, cd: 1.0, range: 30, speed: 62, power: 3.3, wage: 3, block: 0.45,
    upgrades: [{ to: 'ironguard', xp: 80, cost: 40 }] },
  ironguard: { name: 'Dwarf ironguard', guard: 0.7, race: 'dwarf', sprite: 'soldier', kind: 'ironguard', hp: 78, dmg: 12, cd: 1.0, range: 32, speed: 58, power: 5.8, wage: 6, block: 0.75, upgrades: [] },
  dwarfxbow: { name: 'Dwarf crossbowman', race: 'dwarf', sprite: 'soldier', kind: 'dwarfxbow', hp: 36, dmg: 14, cd: 2.4, range: 360, speed: 62, power: 3.2, wage: 3, ranged: true, bolt: true, upgrades: [] },
  // The Horde.
  grunt: { name: 'Orc grunt', guard: 0.15, sprite: 'grunt', hp: 30, dmg: 6, cd: 1.0, range: 32, speed: 74, power: 1.6, orc: true },
  brute: { name: 'Orc brute', guard: 0.3, sprite: 'brute', hp: 60, dmg: 11, cd: 1.1, range: 34, speed: 70, power: 3.6, orc: true },
  shaman: { name: 'Orc skirmisher', sprite: 'shaman', hp: 24, dmg: 9, cd: 2.2, range: 280, speed: 72, power: 2.6, orc: true, ranged: true, javelin: true },
  warlord: { name: 'Warlord Gorrak', guard: 0.55, sprite: 'warlord', hp: 360, dmg: 20, cd: 1.0, range: 44, speed: 66, power: 26, orc: true, scale: 3 }
};

// ---------------------------------------------------------------- trade goods
// food: true means the party can eat it.
export const GOODS = {
  grain: { name: 'Grain', base: 10, food: true },
  fish: { name: 'Salt fish', base: 16, food: true },
  wool: { name: 'Wool', base: 24 },
  timber: { name: 'Elven timber', base: 34 },
  tools: { name: 'Dwarven tools', base: 64 },
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
  { id: 'elthir', name: 'Elthir', kind: 'town', faction: 'elves', race: 'elf', x: 560, y: 1990, art: 1, makes: ['timber'], wants: ['tools', 'spice', 'fish'] },
  { id: 'silverbrook', name: 'Silverbrook', kind: 'village', faction: 'elves', race: 'elf', x: 1230, y: 2060, makes: ['timber', 'wool'], wants: ['iron'] },
  { id: 'dunmar', name: 'Dunmar', kind: 'town', faction: 'dwarves', race: 'dwarf', x: 2980, y: 760, art: 2, makes: ['tools', 'iron'], wants: ['grain', 'ale', 'timber'] },
  { id: 'irondeep', name: 'Irondeep', kind: 'village', faction: 'dwarves', race: 'dwarf', x: 3220, y: 920, makes: ['iron'], wants: ['grain', 'ale'] },
  { id: 'camp-west', name: 'Bonepit Camp', kind: 'camp', faction: 'horde', x: 1180, y: 640 },
  { id: 'camp-mid', name: 'Gutrot Camp', kind: 'camp', faction: 'horde', x: 2080, y: 760 },
  { id: 'camp-east', name: 'Fangmire Camp', kind: 'camp', faction: 'horde', x: 2640, y: 640 },
  { id: 'skullrock', name: 'Skullrock', kind: 'stronghold', faction: 'horde', x: 1700, y: 420 }
];

export const ROADS = [
  ['millford', 'brightwater'], ['brightwater', 'oakhollow'], ['brightwater', 'fairmeet'],
  ['oakhollow', 'fairmeet'], ['fairmeet', 'redcliff'], ['fairmeet', 'ashby'], ['redcliff', 'ashby'], ['redcliff', 'stonefold'],
  ['elthir', 'oakhollow'], ['silverbrook', 'oakhollow'], ['silverbrook', 'fairmeet'], ['dunmar', 'stonefold'], ['dunmar', 'irondeep']
];

// Names for roaming orc warbands.
export const ORC_CHIEFS = ['Gruk', 'Morza', 'Uthak', 'Snagga', 'Bolg', 'Rakha', 'Dushnak', 'Ugra', 'Krimp', 'Zogg', 'Harrug', 'Nazgra'];

// ---------------------------------------------------------------- lords
// Each kingdom is run by a few named lords who lead its armies. Their traits decide what they do:
//  bold: picks fights at worse odds.      cautious: only fights when well ahead.
//  honourable: hunts orcs, respects mercy. cruel: burns enemy villages in wartime.
//  greedy: preys on enemy caravans, likes gold.
export const LORDS = [
  { id: 'isolde', name: 'Queen Isolde', faction: 'vale', ruler: true, traits: ['honourable', 'cautious'], home: 'brightwater' },
  { id: 'aldric', name: 'Sir Aldric Fenn', faction: 'vale', traits: ['bold', 'honourable'], home: 'oakhollow' },
  { id: 'maren', name: 'Lady Maren Holt', faction: 'vale', traits: ['greedy', 'cautious'], home: 'millford' },
  { id: 'brannoc', name: 'Lord Brannoc', faction: 'march', ruler: true, traits: ['cruel', 'bold'], home: 'redcliff' },
  { id: 'corwen', name: 'Sir Corwen Ashe', faction: 'march', traits: ['honourable', 'cautious'], home: 'stonefold' },
  { id: 'tamsin', name: 'Lady Tamsin Vey', faction: 'march', traits: ['greedy', 'bold'], home: 'ashby' },
  { id: 'ilyra', name: 'Queen Ilyra', faction: 'elves', ruler: true, traits: ['honourable', 'cautious'], home: 'elthir' },
  { id: 'faelan', name: 'Lord Faelan', faction: 'elves', traits: ['bold', 'cruel'], home: 'silverbrook' },
  { id: 'borga', name: 'High Thane Borga', faction: 'dwarves', ruler: true, traits: ['greedy', 'bold'], home: 'dunmar' },
  { id: 'halvar', name: 'Thane Halvar', faction: 'dwarves', traits: ['honourable', 'cautious'], home: 'irondeep' }
];

// ---------------------------------------------------------------- skills
// Gunther's skills improve by doing the thing, not by spending points.
export const SKILLS = {
  archery: { name: 'Archery', how: 'hitting enemies with your bow', effect: '+4% bow damage and a faster, steadier draw per level' },
  blade: { name: 'Bladework', how: 'landing and blocking sword blows', effect: '+5% sword damage, quicker swings and a wider parry window per level' },
  leadership: { name: 'Leadership', how: 'leading your men to victory', effect: '+2 party size and steadier morale per level' },
  trade: { name: 'Trade', how: 'buying and selling goods', effect: '2% better prices per level' },
  tactics: { name: 'Tactics', how: 'winning battles against strong enemies', effect: '+6% strength in auto-resolved battles per level' },
  medicine: { name: 'Medicine', how: 'tending your wounded', effect: 'More of your fallen men survive, and they heal faster' }
};
