// All the menu screens: title, towns and villages, the market, recruiting, the tavern, the smith,
// the party screen, meeting other parties, and what happens after a battle.
// Menus are plain HTML laid over the canvas (see showPanel in core.js).

import { showPanel, hidePanel, panelOpen, onKeyPress, overlay, setScene, rand, randInt, pick, dist, esc, clamp } from './core.js';
import { portrait } from './sprites.js';
import { TROOPS, GOODS, SETTLEMENTS, FACTIONS, KINGDOMS, ORC_CHIEFS, SKILLS, RACES, MODS, deviceMods, saveDeviceMods } from './data.js';
import {
  game, save, newGame, hasSave, loadSave, note, site, troopCount, partyLimit, addTroops, removeTroops, strength,
  playerStrength, playerFit, guntherPower, wages, foodStock, foodPerDay, cargo, cargoLimit, hostile, changeRelation, relationWord,
  buyPrice, sellPrice, nudgePrice, dailyTick, lootFor, campGarrison, troopName,
  skill, trainSkill, lord, lordState, remember, chronicle, prisonerCount, prisonerLimit,
  enemiesOf, anyWar, warsText, recruitType
} from './state.js';
import { storyButton, storyAt, storyBeaten, journalHtml, openPrologue } from './story.js';
import { mapScene, populate, spawnWarband, spawnParty, partyById, terrainAt, T, enemies, grudge, nearestPlace, renownLevel } from './world.js';
import { battleScene } from './battle.js';
import { capture, isHeld, besiegers, WALL_BONUS, townGarrison, originalFaction } from './sieges.js';
import { heroAge, lordAge, deathChance, heirChoices, succeed, adultHeirs, ageOf } from './dynasty.js';
import { openHall, openRansom, openCapturedLord, lordBlurb, lordGreeting, skillsTable, prisonersSection, convertPrisoner, contractLine, lordsTable } from './court.js';

// ---------------------------------------------------------------- helpers
function troopList(troops) {
  const parts = [];
  for (const t in troops) if (troops[t] > 0) parts.push(troops[t] + ' ' + troopName(t, troops[t]));
  return parts.join(', ') || 'nobody';
}
// Warns when arrows will struggle: most of the enemy wears good armour or carries shields.
function armourNote(troops) {
  let n = 0, hard = 0;
  for (const t in troops) { n += troops[t]; if ((TROOPS[t].armour || 0) >= 0.45 || (TROOPS[t].shield || 0) >= 0.5) hard += troops[t]; }
  return n && hard / n >= 0.4 ? '<p class="warn">Many of them are armoured or carry shields. Arrows will do little: be ready to use your sword.</p>' : '';
}
function count(troops) { let n = 0; for (const t in troops) n += troops[t]; return n; }
function compare(theirs) {
  const mine = playerStrength();
  if (theirs > mine * 1.5) return '<span class="bad">They far outmatch you.</span>';
  if (theirs > mine * 1.05) return '<span class="bad">They look stronger than you.</span>';
  if (theirs > mine * 0.7) return 'An even fight.';
  return '<span class="good">You should win this.</span>';
}
function statusLine() {
  return '<p class="stats">Gold ' + game.gold + ' &middot; Men ' + troopCount() + '/' + partyLimit() + ' &middot; Food ' + foodStock() + ' (' + Math.floor(foodStock() / foodPerDay()) + ' days) &middot; Health ' + Math.ceil(game.health) + '/' + game.maxHealth + '</p>';
}
const plural = (n, word) => n + ' ' + (n === 1 ? word : word.endsWith('man') ? word.slice(0, -3) + 'men' : /[^aeiou]y$/.test(word) ? word.slice(0, -1) + 'ies' : word + 's');

// ---------------------------------------------------------------- auto-resolved battles
// Rolls dice for a whole battle. Each round both sides deal damage based on their strength,
// and that damage knocks out random soldiers. heroPower is Gunther's share for side A.
export function autoResolve(a, b, heroPower, boostA) {
  const units = troops => { const l = []; for (const t in troops) for (let i = 0; i < troops[t]; i++) l.push({ t, hp: TROOPS[t].power * 10 }); return l; };
  const A = units(a), B = units(b);
  const power = l => l.reduce((s, u) => s + TROOPS[u.t].power, 0);
  for (let round = 0; round < 60 && (A.length || heroPower) && B.length; round++) {
    const dmgA = (power(A) + heroPower) * (boostA || 1) * rand(1.4, 2.6), dmgB = power(B) * rand(1.4, 2.6);
    const hit = (list, dmg) => {
      while (dmg > 0 && list.length) {
        const k = Math.floor(Math.random() * list.length);
        const take = Math.min(dmg, list[k].hp);
        list[k].hp -= take; dmg -= take;
        if (list[k].hp <= 0) list.splice(k, 1);
      }
    };
    hit(B, dmgA); hit(A, dmgB);
    if (!A.length && heroPower) { heroPower *= 0.5; if (heroPower < 1) heroPower = 0; }
  }
  const back = l => { const o = {}; for (const u of l) o[u.t] = (o[u.t] || 0) + 1; return o; };
  return { aWins: B.length === 0, a: back(A), b: back(B) };
}

// ---------------------------------------------------------------- title
export function openTitle() {
  const saved = hasSave();
  showPanel(
    '<div class="eyebrow">A warband tale</div>' +
    '<h1>Gunther</h1>' +
    '<p>The Gorrak Horde has landed on Aldmoor while its four kingdoms quarrel. Raise a band of sellswords, earn a lord\'s favour, and break the Horde at Skullrock.</p>' +
    (saved ? '<button data-act="continue" class="primary">Continue <span class="hk">Day ' + game.day + '</span></button>' : '') +
    '<button data-act="new"' + (saved ? '' : ' class="primary"') + '>New campaign</button>' +
    '<button data-act="help">How to play</button>' +
    '<button data-act="mods">Mods</button>' +
    '<div class="chips">' + (saved ? '<span>Last save: Day ' + game.day + ' &middot; near ' + esc(nearestPlace(game.player.x, game.player.y)) + '</span>' : '') + '<span>v0.5 prototype</span>' +
      (MODS.some(m => m.on && !m.error) ? '<span>' + MODS.filter(m => m.on && !m.error).length + ' mod(s) on</span>' : '') + '</div>',
    {
      continue: () => { loadSave(); populate(); setScene(mapScene); },
      new: () => { newGame(true); populate(); save(); setScene(mapScene); openIntro(); },
      help: () => openHelp(openTitle),
      mods: () => openMods()
    }, 'title');
}

// Mods: JSON files that change the game's data (troops, places, lords...). Players can load one
// from their device; it is kept in this browser and applied the next time the page loads.
function openMods(msg) {
  const rows = MODS.map(m => {
    const state = m.error ? '<span class="bad">Not applied: ' + esc(m.error) + '</span>' : m.on ? '<span class="good">On</span>' : 'Off';
    const btns = m.source === 'device' ? '<button class="mini" data-act="toggle" data-arg="' + esc(m.name) + '">' + (m.on ? 'Turn off' : 'Turn on') + '</button> <button class="mini secondary" data-act="remove" data-arg="' + esc(m.name) + '">Remove</button>' : '<span class="small">from the site</span>';
    return '<tr><td>' + esc(m.title || m.name) + (m.about ? '<br><span class="small">' + esc(m.about) + '</span>' : '') + '</td><td>' + state + '</td><td>' + btns + '</td></tr>';
  }).join('');
  const reload = '<button data-act="reload">Reload to apply</button>';
  showPanel('<h2>Mods</h2>' + (msg ? '<p class="msg">' + msg + '</p>' + reload : '') +
    '<p>A mod is a JSON file that changes the game\'s data: troop stats, new troops, places, lords, names, prices, how long a year is. <a href="data/README.md" target="_blank" rel="noopener">How to make one</a>.</p>' +
    (rows ? '<table>' + rows + '</table>' : '<p>No mods loaded.</p>') +
    '<p class="small">Mods are applied when the page loads. Start a new campaign after changing them: an old save may not match.</p>' +
    '<label class="filebtn"><input type="file" accept=".json,application/json" hidden><span>Load a mod from your device</span></label>' +
    '<button data-act="back" class="secondary">Back</button>', {
    toggle: name => { const l = deviceMods(); const m = l.find(x => x.name === name); if (m) m.on = m.on === false; saveDeviceMods(l); openMods(esc(name) + (m && m.on ? ' will be turned on.' : ' will be turned off.')); },
    remove: name => { saveDeviceMods(deviceMods().filter(x => x.name !== name)); openMods(esc(name) + ' will be removed.'); },
    reload: () => location.reload(),
    back: () => openTitle()
  }, true);
  const input = overlay.querySelector('input[type=file]');
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f) return;
    f.text().then(t => {
      let d;
      try { d = JSON.parse(t); } catch (e) { return openMods('<span class="bad">' + esc(f.name) + ' is not valid JSON: ' + esc(e.message) + '</span>'); }
      if (!d || typeof d !== 'object' || Array.isArray(d)) return openMods('<span class="bad">A mod must be one JSON object.</span>');
      const l = deviceMods().filter(x => x.name !== f.name);
      l.push({ name: f.name, data: d, on: true });
      if (!saveDeviceMods(l)) return openMods('<span class="bad">This browser would not store the mod (private mode?).</span>');
      openMods(esc(f.name) + ' loaded.');
    });
  });
}

function openHelp(back) {
  showPanel(
    '<h2>How to play</h2><div class="left">' +
    '<p><b>Map.</b> Click or tap to travel. Time only passes while you move, or while you camp. Click a town to visit it, or a party to meet it. Space pauses, the speed buttons bottom left fast-forward, M opens the full map, P the party, J skills and quests, C camps, and E enters the place you are standing beside.</p>' +
    '<p><b>Story and quests.</b> From day 2 you are offered Gunther\'s own story, The Wall Tithe: nine chapters about where the villages\' tithe silver really goes, with choices that change what comes later. A gold ! marks where the story wants you next. Town taverns also offer work: hunting orc raiders or outlaws, burning a camp, feeding a village, carrying a letter, or bringing in orc captives. Your story and quests are on the Quests screen (J).</p>' +
    '<p><b>Your warband.</b> Hire recruits in villages and towns. Feed them (grain or fish) and pay their wages each week, or morale drops and men desert. Winning battles gives your men experience: train them up from the Party screen.</p>' +
    '<p><b>Screen space.</b> The small &minus; button in the corner of a panel shrinks it (the stats to one line, the minimap away, the button bars to compact rows); + brings it back. The game remembers your choice.</p>' +
    '<p><b>Battles.</b> WASD to move, aim with the mouse, hold click to shoot. 1, 2 and 3 pick who you are ordering (All, Foot or Bows), and F1 to F4 tell them to Charge, Hold, Follow you or Fall back. On a phone: drag to move, Gunther shoots by himself, and the buttons give orders.</p>' +
    '<p><b>Fighting.</b> Q swaps between bow and sword. Bow: hold click to draw and release to shoot; a full draw hits hardest and flies straightest, but moving or holding too long makes it shaky. Sword: move the mouse left, right or up to pick the side you swing from (the gold marker), hold click to wind up and release to strike. Each enemy shows its guard as a grey bar; strike a side it is not guarding, or hit it while it is winding up. Right click cancels a swing, which lets you feint. Armour and shields matter: a shield stops most arrows that come at it from the front (shoot from the side or behind), and heavy armour makes arrows glance off, while a sword blow gets through most of it. Crossbow bolts pierce more armour than arrows. Red arrows show where a blow is coming from: hold right click with your marker on that side to block, and block just before it lands to parry and stun them. On a phone, tap left, right or above Gunther to swing and hold the Block button. Bladework improves as you fight.</p>' +
    '<p><b>Skills.</b> Gunther gets better at what he does: shooting raises Archery, winning raises Leadership and Tactics, trading raises Trade, and tending the wounded raises Medicine.</p>' +
    '<p><b>Towns and sieges.</b> Towns have walls and a garrison, and a town\'s villages belong to whoever holds the town. Lords at war march on enemy towns, camp outside for a few days and then storm them, so towns change hands. You can besiege any town you are not sworn to (that means war with its owner): build ladders for two days, then fight your way in through the breaches while their archers shoot from behind the wall. As a vassal your lord grants you the towns you take; as a mercenary you are paid a bounty; on your own you hold them yourself. Leave men in a town\'s garrison to keep it, and collect its rent.</p>' +
    '<p><b>Family.</b> Years pass (one every 40 days) and everyone ages. Lords die of old age or in battle, and their son or daughter takes over, remembering half of what their parent felt about you. Marry into a lord\'s house through their kingdom\'s hall and you may have children. When your captain dies, of old age or struck down in battle, a grown child (or a cousin) takes over with the gear, some gold and renown, and a little of the skill. Death in battle can be turned off on the Party screen.</p>' +
    '<p><b>Lords.</b> Each kingdom is led by lords with their own temper. They remember what you do: spare one and they may become a friend, rob or ransom them and they may hunt you. Sign on as a mercenary in a kingdom hall, and with enough renown you can swear fealty and hold a village.</p>' +
    '<p><b>Peoples.</b> Men hold the Vale and the March. Elves of the Elthir Wood in the south west are fast and deadly with bows but lightly armoured. Dwarves of the Dunmar Holds in the north east are slow, tough and carry crossbows. Volunteers from each place are of its people. None of them use magic.</p>' +
    '<p><b>Trade.</b> Each place makes some goods cheaply and pays well for others. Buy low, carry it across the island, sell high.</p>' +
    '<p><b>Realms.</b> Help a kingdom and its people warm to you. Attack its lords or caravans and it will turn on you. The four kingdoms make war and peace with each other on their own, but none fights two wars at once. The island carries on without you: check the Chronicle on the Party screen.</p>' +
    '<p><b>Goal.</b> Grow strong enough to storm Skullrock and defeat Warlord Gorrak. Burning the orc camps first stops their raiders for a while.</p>' +
    '</div><button data-act="back">Back</button>', { back });
}

function openIntro() {
  showPanel('<h2>A warband of your own</h2>' +
    '<p>You start near Fairmeet with a handful of recruits, a couple of bowmen and 6 sacks of grain. Visit the town to buy food and hire more men, then hunt orc raiders for gold and renown.</p>' +
    '<p>Hover over or tap parties on the map to see how strong they look before you pick a fight.</p>' +
    '<button data-act="ok">To the road</button><button data-act="help" class="secondary">How to play</button>',
    { ok: () => hidePanel(), help: () => openHelp(openIntro) });
}

// ---------------------------------------------------------------- settlements
function leave() { setScene(mapScene); }

export function openSettlement(s, msg) {
  const st = game.sites[s.id];
  const f = FACTIONS[s.faction];
  msg = msg ? '<p class="msg">' + msg + '</p>' : '';
  if (s.kind === 'camp' || s.kind === 'stronghold') return openCamp(s, msg);
  const rel = game.relations[s.faction];
  const mine = isHeld(s);
  const head = '<h2>' + s.name + (mine ? ' <span class="good">(yours)</span>' : '') + '</h2><p>' + (s.kind === 'town' ? 'Town' : 'Village') + (s.faction === 'player' ? ' held in your own name' : ' of ' + f.name) +
    (rel !== undefined ? ' &middot; ' + relationWord(rel) + ' (' + rel + ')' : '') + (st.raided ? ' &middot; <span class="bad">recently raided</span>' : '') + '</p>' + statusLine();
  if (hostile(s.faction, 'player')) {
    if (s.kind === 'town') return openSiege(s, head + msg);
    showPanel(head + '<p class="bad">The gates are barred. Nobody here will deal with you.</p><button data-act="leave">Leave</button>', { leave });
    return;
  }
  const quest = game.quests.find(q => q.kind === 'supply' && q.to === s.id);
  let html = head + msg;
  const sb = storyButton(s);
  if (sb) html += '<button data-act="story"' + (sb.why ? ' disabled' : '') + '>' + esc(sb.label) + (sb.why ? ' (' + esc(sb.why) + ')' : '') + ' <span class="small">Story</span></button>';
  html += '<button data-act="market">Market</button>';
  html += '<button data-act="recruit">Recruit volunteers (' + st.recruits + ' willing)</button>';
  const letter = game.quests.find(q => q.kind === 'letter' && q.to === s.id);
  if (letter) html += '<button data-act="letter">Hand over the sealed letter</button>';
  if (quest) html += '<button data-act="deliver"' + ((game.goods[quest.good] || 0) < quest.amount ? ' disabled' : '') + '>Deliver ' + quest.amount + ' ' + GOODS[quest.good].name + ' for the quest</button>';
  if (s.kind === 'town') html += '<button data-act="tavern">Tavern</button><button data-act="smith">Smith</button>';
  if (s.kind === 'town' && KINGDOMS.includes(s.faction)) html += '<button data-act="hall">Hall of ' + FACTIONS[s.faction].short + '</button>';
  if (mine && s.kind === 'town') html += '<button data-act="garrison">Garrison</button>';
  // Any town you are not sworn to can be attacked, at the cost of war with whoever holds it.
  const canAttack = s.kind === 'town' && !mine && s.faction !== 'player' && !(game.contract && game.contract.faction === s.faction);
  html += '<button data-act="leave" class="secondary">Leave</button>';
  if (canAttack) html += '<button data-act="attack" class="secondary">Lay siege to ' + s.name + '</button>';
  showPanel(html, {
    garrison: () => openGarrison(s),
    attack: () => showPanel('<h2>Besiege ' + s.name + '?</h2><p>' + f.name + ' will count you an enemy (relation -40), and its lords will remember. ' + (s.faction === 'free' ? '' : 'Expect them to come for you.') + '</p>' +
      '<button data-act="yes">Declare war and besiege</button><button data-act="no" class="secondary">Think again</button>', {
      yes: () => {
        if (game.relations[s.faction] !== undefined) changeRelation(s.faction, Math.min(0, -40 - game.relations[s.faction]));
        for (const id in game.lords) if (lord(id).faction === s.faction) remember(id, 'Gunther attacked ' + s.name + ' without cause', -25);
        chronicle('Gunther declared war on ' + FACTIONS[s.faction].short + ' and marched on ' + s.name + '.');
        save(); openSettlement(s);
      },
      no: () => openSettlement(s)
    }),
    hall: () => openHall(s, () => openSettlement(s)),
    story: () => storyAt(s, () => openSettlement(s)),
    letter: () => { completeQuest(letter); openSettlement(s, 'The letter is delivered. +' + letter.reward + ' gold.'); },
    market: () => openMarket(s),
    recruit: () => openRecruit(s),
    tavern: () => openTavern(s),
    smith: () => openSmith(s),
    deliver: () => {
      game.goods[quest.good] -= quest.amount;
      if (!game.goods[quest.good]) delete game.goods[quest.good];
      completeQuest(quest);
      openSettlement(s, 'The villagers cheer as the carts are unloaded.');
    },
    leave
  });
}

function openMarket(s, msg) {
  const list = s.kind === 'town' ? Object.keys(GOODS) : Object.keys(GOODS).filter(g => g === 'grain' || g === 'fish' || (s.makes || []).includes(g) || (s.wants || []).includes(g));
  let rows = '';
  for (const g of list) {
    const have = game.goods[g] || 0, buy = buyPrice(s.id, g), sell = sellPrice(s.id, g);
    const tag = (s.makes || []).includes(g) ? ' <span class="good">made here</span>' : (s.wants || []).includes(g) ? ' <span class="warn">wanted</span>' : '';
    rows += '<tr><td>' + GOODS[g].name + tag + '</td><td>' + have + '</td>' +
      '<td><button class="mini" data-act="buy" data-arg="' + g + '"' + (game.gold < buy || cargo() >= cargoLimit() ? ' disabled' : '') + '>Buy ' + buy + '</button></td>' +
      '<td><button class="mini" data-act="sell" data-arg="' + g + '"' + (!have ? ' disabled' : '') + '>Sell ' + sell + '</button></td>' +
      '<td><button class="mini secondary" data-act="sellall" data-arg="' + g + '"' + (!have ? ' disabled' : '') + '>All</button></td></tr>';
  }
  showPanel('<h2>' + s.name + ' market</h2>' + statusLine() +
    '<p>Cargo ' + cargo() + '/' + cargoLimit() + '. Your men eat ' + foodPerDay() + ' food a day (grain or fish).</p>' +
    (msg ? '<p class="msg">' + msg + '</p>' : '') +
    '<table><tr><th>Goods</th><th>Have</th><th></th><th></th><th></th></tr>' + rows + '</table>' +
    '<button data-act="back" class="secondary">Back</button>', {
    buy: g => { const p = buyPrice(s.id, g); if (game.gold >= p && cargo() < cargoLimit()) { game.gold -= p; game.goods[g] = (game.goods[g] || 0) + 1; nudgePrice(s.id, g, 1); trainSkill('trade', p / 25); } openMarket(s); },
    sell: g => sellGoods(s, g, 1),
    sellall: g => sellGoods(s, g, game.goods[g] || 0),
    back: () => openSettlement(s)
  }, true);
}
function sellGoods(s, g, n) {
  let earned = 0;
  for (let i = 0; i < n && game.goods[g]; i++) { earned += sellPrice(s.id, g); game.goods[g]--; nudgePrice(s.id, g, -1); }
  if (!game.goods[g]) delete game.goods[g];
  game.gold += earned;
  trainSkill('trade', earned / 15);
  openMarket(s, earned ? 'Sold for ' + earned + ' gold.' : '');
}

function recruitCost(s) {
  const rel = game.relations[s.faction] || 0;
  const fief = isHeld(s) ? 0.5 : 1;
  return Math.max(3, Math.round((s.kind === 'town' ? 14 : 10) * (1 - rel / 200) * fief));
}
function openRecruit(s, msg) {
  const st = game.sites[s.id], cost = recruitCost(s), room = partyLimit() - troopCount();
  const can = Math.min(st.recruits, room, Math.floor(game.gold / cost));
  let why = '';
  if ((game.relations[s.faction] || 0) <= -10) why = 'The locals are too wary of you to sign up.';
  else if (!st.recruits) why = st.raided ? 'The orcs took the young men. Come back when the village recovers.' : 'Nobody else wants to join right now. Come back in a few days.';
  else if (room <= 0) why = 'Your warband is at its limit. Win renown to lead more men.';
  showPanel('<h2>Recruit</h2>' + statusLine() +
    '<p>' + plural(st.recruits, 'volunteer') + ' will join for ' + cost + ' gold each. ' + recruitBlurb(s) + '</p>' +
    (why ? '<p class="warn">' + why + '</p>' : '') + (msg ? '<p class="msg">' + msg + '</p>' : '') +
    '<button data-act="one"' + (why || can < 1 ? ' disabled' : '') + '>Hire 1 (' + cost + ' gold)</button>' +
    '<button data-act="all"' + (why || can < 2 ? ' disabled' : '') + '>Hire ' + Math.max(can, 0) + ' (' + Math.max(can, 0) * cost + ' gold)</button>' +
    '<button data-act="back" class="secondary">Back</button>', {
    one: () => hire(s, 1), all: () => hire(s, can), back: () => openSettlement(s)
  });
}
function recruitBlurb(s) {
  const t = TROOPS[recruitType(s)];
  const type = recruitType(s), ups = t.upgrades.map(u => troopName(u.to, 2).toLowerCase());
  return 'Volunteers here are ' + troopName(type, 2).toLowerCase() + '. They start weak but can be trained into ' + ups.join(' or ') + '.';
}
function hire(s, n) {
  const cost = recruitCost(s);
  n = Math.min(n, game.sites[s.id].recruits, partyLimit() - troopCount(), Math.floor(game.gold / cost));
  if (n <= 0) return openRecruit(s);
  game.gold -= n * cost; game.sites[s.id].recruits -= n; addTroops(recruitType(s), n);
  openRecruit(s, n + ' ' + troopName(recruitType(s), n).toLowerCase() + ' joined your warband.');
}

// Sellswords in the tavern: a band of trained troops for hire, refreshed each week.
function mercs(s) {
  const st = game.sites[s.id], week = Math.floor(game.day / 7);
  if (st.mercWeek !== week) { st.mercWeek = week; st.mercs = { type: pick(Object.keys(TROOPS).filter(t => !TROOPS[t].orc && TROOPS[t].power >= 2 && TROOPS[t].power < 5)), n: randInt(2, 5) }; }
  return st.mercs;
}

function openTavern(s, msg) {
  const restCost = 4 + Math.ceil(troopCount() / 3);
  const m = mercs(s), mCost = Math.round(TROOPS[m.type].power * 22);
  const room = partyLimit() - troopCount();
  const hireN = Math.min(m.n, room, Math.floor(game.gold / mCost));
  const myQuest = game.quests.find(q => q.giver === s.id);
  const captQ = game.quests.find(q => q.kind === 'captives' && q.giver === s.id);
  const questBtn = myQuest ? '<button disabled>Quest in progress: ' + esc(myQuest.title) + '</button>' :
    game.quests.length >= 3 ? '<button disabled>You have enough quests already</button>' : '<button data-act="quest">Ask about work</button>';
  showPanel('<h2>' + s.name + ' tavern</h2>' + statusLine() + (msg ? '<p class="msg">' + msg + '</p>' : '') +
    '<p class="rumour">' + rumour() + '</p>' +
    '<button data-act="rest"' + (game.gold < restCost ? ' disabled' : '') + '>Rest a night: heal Gunther, men recover (' + restCost + ' gold)</button>' +
    (m.n ? '<button data-act="mercs"' + (hireN < 1 ? ' disabled' : '') + '>Hire sellswords: ' + m.n + ' ' + troopName(m.type, m.n) + ' at ' + mCost + ' gold each' + (hireN < 1 ? (troopCount() >= partyLimit() ? ' (warband full)' : ' (not enough gold)') : hireN < m.n ? ' (you can take ' + hireN + ')' : '') + '</button>' : '<button disabled>No sellswords here this week</button>') +
    questBtn +
    (captQ ? '<button data-act="captives"' + (orcCaptives() < captQ.amount ? ' disabled' : '') + '>Hand over ' + captQ.amount + ' orc captives (' + orcCaptives() + ' held)</button>' : '') +
    '<button data-act="ransom"' + (prisonerCount() ? '' : ' disabled') + '>Ransom broker' + (prisonerCount() ? ' (' + prisonerCount() + ' prisoners to sell)' : ' (no prisoners)') + '</button>' +
    '<button data-act="back" class="secondary">Back</button>', {
    ransom: () => openRansom(s, () => openTavern(s)),
    rest: () => {
      game.gold -= restCost; game.health = game.maxHealth; dailyTick(); populate();
      for (const t in game.troops) game.troops[t].wounded = Math.max(0, game.troops[t].wounded - 2);
      game.morale = clamp(game.morale + 5, 0, 100);
      openTavern(s, 'You wake rested. A day has passed.');
    },
    mercs: () => {
      game.gold -= hireN * mCost; addTroops(m.type, hireN); m.n -= hireN;
      openTavern(s, hireN + ' ' + troopName(m.type, hireN).toLowerCase() + ' signed on.');
    },
    quest: () => offerQuest(s),
    captives: () => { takeOrcCaptives(captQ.amount); completeQuest(captQ); openTavern(s, 'The marshal\'s men lead the captives away. +' + captQ.reward + ' gold.'); },
    back: () => openSettlement(s)
  });
}

function rumour() {
  const r = [];
  const towns = SETTLEMENTS.filter(x => x.wants);
  const t = pick(towns), g = pick(t.wants);
  r.push('"They say ' + t.name + ' pays well for ' + GOODS[g].name.toLowerCase() + '."');
  const m = pick(towns.filter(x => x.makes)), g2 = pick(m.makes);
  r.push('"' + GOODS[g2].name + ' is cheap in ' + m.name + ', if you can carry it."');
  const w = anyWar();
  r.push(w.length ? '"' + FACTIONS[w[0][0]].short.replace(/^the /, 'The ') + ' and ' + FACTIONS[w[0][1]].short + ' are at each other\'s throats again. Good time to be a sellsword."' : '"All the kingdoms are at peace, for now."');
  const raided = SETTLEMENTS.filter(x => game.sites[x.id].raided);
  if (raided.length) r.push('"Orcs hit ' + raided[0].name + ' not long ago. Burned the barns."');
  if (!game.hordeBroken) r.push('"Warlord Gorrak sits in Skullrock, up in the northern hills. Takes an army to shift him."');
  r.push('"Burn an orc camp and its raiders stop coming, at least for a while."');
  // Half the time, gossip about something that actually happened.
  const recent = game.chronicle.filter(c => game.day - c.day < 12);
  if (recent.length && Math.random() < 0.6) return '"Did you hear? ' + pick(recent).text + '"';
  return pick(r);
}

// ---------------------------------------------------------------- quests
// Work from a tavern keeper or a worried official. Each town offers one job at a time, and what
// it is depends on what the island needs: orcs to hunt, outlaws to catch, camps to burn, hungry
// villages, letters to carry, captives to question.
function orcCaptives() { let n = 0; for (const t in game.prisoners) if (TROOPS[t].orc) n += game.prisoners[t]; return n; }
function takeOrcCaptives(n) {
  for (const t of Object.keys(game.prisoners)) {
    if (!TROOPS[t].orc || n <= 0) continue;
    const k = Math.min(n, game.prisoners[t]); game.prisoners[t] -= k; n -= k;
    if (!game.prisoners[t]) delete game.prisoners[t];
  }
}
const OUTLAW_TAGS = ['the Red', 'Half-Ear', 'the Hound', 'Blackhand', 'the Tanner', 'Crowfoot', 'the Deserter', 'Ninefingers'];

function offerQuest(s) {
  const kingdom = s.faction;
  const villages = SETTLEMENTS.filter(v => v.kind === 'village' && (v.faction === kingdom || kingdom === 'free' || kingdom === 'player'));
  const v = pick(villages.length ? villages : SETTLEMENTS.filter(x => x.kind === 'village'));
  const camps = SETTLEMENTS.filter(c => c.kind === 'camp' && !game.sites[c.id].burned);
  const towns = SETTLEMENTS.filter(t => t.kind === 'town' && t !== s && !hostile(t.faction, 'player'));
  const kinds = ['supply', 'bounty', 'letter'];
  if (!game.hordeBroken) kinds.push('hunt', 'hunt');
  if (!game.hordeBroken && camps.length) kinds.push('burn');
  if (!game.hordeBroken) kinds.push('captives');
  const kind = pick(kinds);
  const d = game.day;
  let q, offer, days;
  const accept = (extra) => { game.quests.push(q); if (extra) extra(); save(); openTavern(s, 'Quest accepted. It is on the Quests screen (J).'); };

  if (kind === 'hunt') {
    const camp = camps.length ? pick(camps) : SETTLEMENTS.find(c => c.kind === 'stronghold');
    const chief = pick(ORC_CHIEFS);
    days = 14;
    q = { kind, giver: s.id, chief, near: v.id, camp: camp.id, title: 'Hunt ' + chief + "'s raiders near " + v.name, reward: 90 + d * 6 };
    offer = pick([
      '"An orc chief called ' + chief + ' has been raiding around ' + v.name + '. Bring me word that his band is broken and you will have ' + q.reward + ' gold."',
      '"' + v.name + ' lost two barns and a shepherd to ' + chief + '\'s raiders last week. The headman has scraped together ' + q.reward + ' gold for whoever ends it."'
    ]);
    q.spawn = () => {
      const p = spawnWarband(camp, 4, { quest: true, anchor: { x: v.x, y: v.y } });
      p.name = chief + "'s raiders"; p.x = v.x + rand(-200, 200); p.y = v.y + rand(-200, 200);
      const spot = nearestLandSafe(p.x, p.y); p.x = spot.x; p.y = spot.y; p.tx = p.x; p.ty = p.y;
      q.party = p.id;
    };
  } else if (kind === 'bounty') {
    const boss = pick(RACES.human.names.m) + ' ' + pick(OUTLAW_TAGS);
    days = 12;
    q = { kind, giver: s.id, near: v.id, title: 'Bring in ' + boss, reward: 120 + d * 7 };
    offer = pick([
      '"Deserters from the last war have turned outlaw on the roads near ' + v.name + '. Their leader, ' + boss + ', has a price on his head: ' + q.reward + ' gold."',
      '"' + boss + ' and his cutthroats robbed a wedding party outside ' + v.name + '. They took the bride\'s ring and the groom\'s teeth. ' + q.reward + ' gold for the lot of them."'
    ]);
    q.spawn = () => {
      const troops = { recruit: 3 + Math.floor(d / 6), spearman: 2 + Math.floor(d / 9), bowman: 2 + Math.floor(d / 12) };
      if (d > 15) troops.knight = Math.floor(d / 15);
      const spot = nearestLandSafe(v.x + rand(-220, 220), v.y + rand(-220, 220));
      const p = spawnParty('outlaws', 'outlaws', boss + "'s outlaws", troops, spot.x, spot.y, { quest: true, anchor: { x: v.x, y: v.y }, gold: randInt(60, 140), desc: 'Deserters and cutthroats with a price on their heads.' });
      q.party = p.id;
    };
  } else if (kind === 'burn') {
    const camp = pick(camps);
    days = 16;
    q = { kind, giver: s.id, camp: camp.id, title: 'Burn ' + camp.name, reward: 200 + d * 8 };
    offer = '"Every raider that hits our villages comes out of ' + camp.name + '. The council will pay ' + q.reward + ' gold to see it burn. Take plenty of men: they keep a garrison."';
  } else if (kind === 'supply') {
    const good = pick(['grain', 'fish']), amount = randInt(6, 12);
    days = 10;
    q = { kind, giver: s.id, to: v.id, good, amount, title: 'Bring ' + amount + ' ' + GOODS[good].name + ' to ' + v.name, reward: Math.round(GOODS[good].base * amount * 1.6 + 30) };
    offer = pick([
      '"' + v.name + ' is short of food. Take them ' + amount + ' ' + GOODS[good].name.toLowerCase() + ' and I will pay you ' + q.reward + ' gold."',
      '"The orcs burned ' + v.name + '\'s stores, and the children there are going hungry. ' + amount + ' ' + GOODS[good].name.toLowerCase() + ' would see them through. The guild pays ' + q.reward + ' gold."'
    ]);
  } else if (kind === 'letter') {
    const to = pick(towns.length ? towns : SETTLEMENTS.filter(t => t.kind === 'town' && t !== s));
    days = Math.max(5, Math.ceil(dist(s.x, s.y, to.x, to.y) / 260) + 3);
    q = { kind, giver: s.id, to: to.id, title: 'Carry a sealed letter to ' + to.name, reward: 40 + Math.round(dist(s.x, s.y, to.x, to.y) / 20) };
    offer = pick([
      '"A letter for the guildmaster in ' + to.name + '. Do not open it, and do not let it get wet. ' + q.reward + ' gold when it arrives."',
      '"My daughter married a ' + to.name + ' man. Take her this letter, and the little purse inside is yours: ' + q.reward + ' gold."'
    ]);
  } else {
    const n = randInt(3, 5);
    days = 15;
    q = { kind, giver: s.id, amount: n, title: 'Bring ' + n + ' orc captives to ' + s.name, reward: 60 + n * 30 };
    offer = '"The marshal wants live orcs to question. Where they camp, how many, who feeds them. Bring ' + n + ' captives here and I will pay ' + q.reward + ' gold. Dead ones are no use to anybody."';
  }
  q.deadline = d + days;
  const spawn = q.spawn; delete q.spawn;
  showPanel('<h2>Work</h2><p>' + offer + '</p><p>Time limit: ' + plural(days, 'day') + '.</p><button data-act="yes">Accept</button><button data-act="no" class="secondary">Not now</button>', {
    yes: () => accept(spawn),
    no: () => openTavern(s)
  });
}
function nearestLandSafe(x, y) {
  return terrainAt(x, y) >= T.GRASS ? { x, y } : { x: mapScene.pos.x, y: mapScene.pos.y };
}
function completeQuest(q) {
  q.done = true;
  game.gold += q.reward;
  game.renown += 5;
  changeRelation(site(q.giver).faction, 8);
  note('Quest complete: ' + q.title + ' (+' + q.reward + ' gold)', '#ffe08a');
  game.quests = game.quests.filter(x => x !== q);
  save();
}

// ---------------------------------------------------------------- smith
function openSmith(s, msg) {
  const bowCost = 40 * game.bowLevel, armourCost = 50 * game.armourLevel;
  const bowMax = game.bowLevel >= 8;
  const swordCost = 45 * game.swordLevel, swordMax = game.swordLevel >= 8;
  showPanel('<h2>Smith</h2>' + statusLine() + (msg ? '<p class="msg">' + msg + '</p>' : '') +
    '<p>Bow level ' + game.bowLevel + ', sword level ' + game.swordLevel + ', armour level ' + game.armourLevel + '.</p>' +
    '<button data-act="armour"' + (game.gold < armourCost ? ' disabled' : '') + '>Better armour: +25 health, less damage (' + armourCost + ' gold)</button>' +
    (bowMax ? '<button disabled>Your bow is the finest on the island</button>' : '<button data-act="bow"' + (game.gold < bowCost ? ' disabled' : '') + '>Better bow: faster draw, harder hitting (' + bowCost + ' gold)</button>') +
    (swordMax ? '<button disabled>Your sword is the finest on the island</button>' : '<button data-act="sword"' + (game.gold < swordCost ? ' disabled' : '') + '>Better sword: harder blows (' + swordCost + ' gold)</button>') +
    '<button data-act="back" class="secondary">Back</button>', {
    armour: () => { game.gold -= armourCost; game.armourLevel++; game.maxHealth += 25; game.health = game.maxHealth; openSmith(s, 'The smith fits new plates. You feel sturdier.'); },
    bow: () => { game.gold -= bowCost; game.bowLevel++; openSmith(s, 'The bowyer hands you a stronger bow.'); },
    sword: () => { game.gold -= swordCost; game.swordLevel++; openSmith(s, 'The smith hands you a better-balanced blade.'); },
    back: () => openSettlement(s)
  });
}

// ---------------------------------------------------------------- orc camps and Skullrock
function openCamp(s, msg) {
  const st = game.sites[s.id];
  if (st.burned) {
    showPanel('<h2>' + s.name + '</h2><p>Smoking ruins. ' + (game.hordeBroken ? 'The orcs will not be back.' : 'The orcs will rebuild in ' + plural(st.burned, 'day') + '.') + '</p><button data-act="leave">Leave</button>', { leave });
    return;
  }
  const g = st.garrison;
  const big = s.kind === 'stronghold';
  showPanel('<h2>' + s.name + '</h2>' + msg +
    '<p>' + (big ? 'The Horde\'s fortress. Warlord Gorrak waits inside with his guard.' : 'An orc war camp. Raiders set out from here to burn the villages.') + '</p>' +
    '<p>Defenders: ' + troopList(g) + '.</p><p>' + compare(strength(g)) + '</p>' + armourNote(g) + statusLine() +
    '<button data-act="fight"' + (troopCount(true) < 1 && big ? ' disabled' : '') + '>' + (big ? 'Storm the fortress' : 'Attack the camp') + '</button>' +
    (big ? '' : '<button data-act="send" class="secondary">Send your men in (auto-resolve)</button>') +
    '<button data-act="leave" class="secondary">Leave</button>', {
    fight: () => startBattle({ troops: g, faction: 'horde', name: s.name }, big ? 'stronghold' : 'camp', res => afterBattle({ site: s }, res)),
    send: () => afterBattle({ site: s }, sendTroops(g)),
    leave
  });
}

// ---------------------------------------------------------------- meeting a party on the map
export function openEncounter(p, forced) {
  const f = FACTIONS[p.faction];
  const isHostile = enemies(p, { faction: 'player' });
  const desc = { story: p.desc, outlaws: p.desc, warband: 'Orc raiders looking for easy prey.', lord: p.lord ? lordBlurb(p.lord) : '', caravan: 'Merchants hauling goods to ' + (p.dest ? site(p.dest).name : 'market') + '.' }[p.kind] || '';
  let html = '<h2>' + esc(p.name) + (p.lord ? '\'s host' : '') + '</h2><p>' + (p.lord ? '' : f.name + '. ') + desc + '</p>' + (p.lord ? '<p>' + lordGreeting(p.lord) + '</p>' : '') +
    '<p>' + troopList(p.troops) + '.</p><p>' + compare(strength(p.troops)) + '</p>' + armourNote(p.troops);
  if (p.lord && grudge(p.lord) && !hostile(p.faction, 'player')) html += '<p class="warn">This is a personal grudge. Fighting back will not anger ' + f.short + '.</p>';
  if (forced) html += '<p class="bad">They are attacking you!</p>';
  const canSend = troopCount(true) > 0;
  const handlers = {
    fight: () => engage(p),
    send: () => { if (!isHostile) attackPenalty(p); afterBattle({ party: p }, sendTroops(p.troops)); },
    talk: () => openLordTalk(p),
    sacrifice: () => {
      const lost = sacrifice();
      mapScene.grace = 2; setScene(mapScene);
      note('You slipped away, leaving ' + lost + ' men behind to hold them off.', '#ff9a8a');
      mapScene.grace = 2;
    },
    leave: () => { setScene(mapScene); mapScene.grace = 1.5; },
    attack: () => openConfirmAttack(p)
  };
  if (isHostile) {
    html += '<button data-act="fight">Fight</button>';
    html += '<button data-act="send" class="secondary"' + (canSend ? '' : ' disabled') + '>Send your men (auto-resolve)</button>';
    if (forced) html += '<button data-act="sacrifice" class="secondary"' + (troopCount(true) >= 3 ? '' : ' disabled') + '>Leave some men behind and escape</button>';
    else html += '<button data-act="leave" class="secondary">Leave</button>';
  } else {
    html += '<button data-act="leave">Leave them be</button>';
    if (p.lord) html += '<button data-act="talk" class="secondary">Ask what news they have</button>';
    html += '<button data-act="attack" class="secondary">Attack them</button>';
  }
  showPanel(html, handlers);
}

// A short chat with a lord: they share what they have seen, coloured by what they think of you.
function openLordTalk(p) {
  const l = lord(p.lord), st = lordState(p.lord);
  const lines = [];
  const recent = game.chronicle.filter(c => game.day - c.day < 15);
  if (recent.length) lines.push('"' + pick(recent).text + '"');
  const orcs = game.parties.filter(o => o.faction === 'horde').sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
  if (orcs) lines.push('"My scouts saw ' + orcs.name + ' near ' + nearestPlace(orcs.x, orcs.y) + '."');
  const foes = enemiesOf(l.faction);
  if (foes.length) lines.push(l.traits.includes('cruel') ? '"This war will be won by burning their fields, not by talk."' : '"This war with ' + FACTIONS[foes[0]].short + ' bleeds us both while the orcs grow fat."');
  const hall = SETTLEMENTS.find(s => s.kind === 'town' && s.faction === l.faction);
  if (st.opinion >= 20 && !game.contract && hall) lines.push('"If you want honest work, the hall in ' + hall.name + ' hires good swords."');
  showPanel('<h2>' + l.name + '</h2>' + lines.map(x => '<p>' + x + '</p>').join('') + '<button data-act="back">Back</button>', { back: () => openEncounter(p, false) });
}

function openConfirmAttack(p) {
  const f = FACTIONS[p.faction];
  showPanel('<h2>Attack ' + esc(p.name) + '?</h2><p>' + f.name + ' will not forget this. Your relation with them will drop sharply' + (p.faction === 'free' ? '.' : ', and their lords may hunt you.') + '</p>' +
    '<button data-act="yes">Attack</button><button data-act="no" class="secondary">Think again</button>', {
    yes: () => { attackPenalty(p); engage(p); },
    no: () => openEncounter(p, false)
  });
}
function attackPenalty(p) {
  if (p.penalised) return;
  p.penalised = true;
  if (p.lord && grudge(p.lord)) return;     // they started it
  changeRelation(p.faction, p.kind === 'caravan' ? -20 : -15);
  if (p.lord) remember(p.lord, 'Gunther attacked my host without cause', -30);
  if (p.kind === 'caravan') for (const id in game.lords) if (lord(id).faction === p.faction && lord(id).traits.includes('greedy')) remember(id, 'Gunther robbed one of our caravans', -12);
}

function engage(p) {
  const ground = terrainAt(mapScene.pos.x, mapScene.pos.y);
  const kind = ground === T.FOREST ? 'forest' : ground === T.HILLS ? 'hills' : 'field';
  startBattle({ troops: p.troops, faction: p.faction, name: p.name }, kind, res => afterBattle({ party: p }, res));
}

function startBattle(enemy, kind, onEnd) {
  hidePanel();
  setScene(battleScene, { enemy, kind, onEnd });
}

// Auto-resolve: your men fight without Gunther. Returns the same shape a real battle does.
function sendTroops(enemyTroops) {
  const mine = playerFit();
  // Gunther's Tactics skill makes his men fight smarter without him.
  const res = autoResolve(mine, enemyTroops, 0, 1 + skill('tactics') * 0.06);
  const killed = {}, wounded = {};
  for (const t in mine) {
    const lost = mine[t] - (res.a[t] || 0);
    for (let i = 0; i < lost; i++) { if (Math.random() < 0.5 + skill('medicine') * 0.04) wounded[t] = (wounded[t] || 0) + 1; else killed[t] = (killed[t] || 0) + 1; }
  }
  const enemyKilled = {};
  for (const t in enemyTroops) enemyKilled[t] = enemyTroops[t] - (res.b[t] || 0);
  return { won: res.aWins, killed, wounded, enemyKilled, enemyRemaining: res.b, heroDown: false, auto: true };
}

function sacrifice() {
  const fit = playerFit();
  let lose = Math.max(1, Math.ceil(count(fit) * 0.3)), lost = 0;
  const types = Object.keys(fit).sort((a, b) => TROOPS[a].power - TROOPS[b].power);
  for (const t of types) { const n = Math.min(lose, fit[t]); removeTroops(t, n); lose -= n; lost += n; if (!lose) break; }
  game.morale = clamp(game.morale - 15, 0, 100);
  return lost;
}

// ---------------------------------------------------------------- after a battle
function afterBattle(foe, res) {
  // Your casualties.
  const lines = [];
  for (const t in res.killed) { removeTroops(t, res.killed[t]); }
  for (const t in res.wounded) { const st = game.troops[t]; if (st) st.wounded = Math.min(st.n, st.wounded + res.wounded[t]); }
  const nk = count(res.killed), nw = count(res.wounded);
  if (nk || nw) lines.push('Your losses: ' + plural(nk, 'man') + ' killed, ' + nw + ' wounded.');
  if (res.heroDown) {
    game.health = Math.max(game.health, game.maxHealth * 0.1);
    // Falling in battle can be the end of a captain. The heir takes over back on the map.
    if (Math.random() < deathChance(!res.won)) {
      game.pendingDeath = 'fell in battle near ' + nearestPlace(mapScene.pos.x, mapScene.pos.y);
      lines.push('<span class="bad">' + esc(game.hero.name) + ' was struck down and did not get up.</span>');
    } else lines.push(esc(game.hero.name) + ' was knocked senseless but will recover.');
  }
  const slain = count(res.enemyKilled);
  const orcs = (foe.site && !foe.siege) || (foe.party && foe.party.faction === 'horde');
  if (orcs) game.stats.orcsSlain += slain;

  if (!res.won) {
    // The enemy keeps what is left of its army.
    if (foe.party) { foe.party.troops = res.enemyRemaining; if (!count(res.enemyRemaining)) foe.party.gone = true; }
    if (foe.site) game.sites[foe.site.id].garrison = Object.keys(res.enemyRemaining).length ? res.enemyRemaining : (foe.siege ? townGarrison(foe.site.faction) : campGarrison(foe.site));
    return defeat(lines);
  }

  game.stats.won++;
  const enemyTroops = foe.party ? foe.party.troops : game.sites[foe.site.id].garrison;
  const enemyPower = strength(enemyTroops);
  // Learning by doing: leading men to victory, and beating strong enemies.
  trainSkill('leadership', 4 + troopCount() / 3);
  trainSkill('tactics', Math.max(1, enemyPower / 3) * Math.min(2, enemyPower / Math.max(1, playerStrength())));
  // Some of the fallen were only knocked down: they become prisoners if there's room.
  let took = 0;
  for (const t in res.enemyKilled) {
    if (t === 'warlord') continue;
    for (let i = 0; i < res.enemyKilled[t]; i++) {
      if (prisonerCount() >= prisonerLimit() || Math.random() > 0.35) continue;
      game.prisoners[t] = (game.prisoners[t] || 0) + 1; took++;
    }
  }
  if (took) lines.push('You took ' + plural(took, 'prisoner') + '. Sell them to a ransom broker in any town, or persuade them to join you.');
  // Lords nearby who were fighting the same enemy remember that you stood with them.
  if (foe.party) {
    for (const p of game.parties) {
      if (!p.lord || p === foe.party || dist(p.x, p.y, mapScene.pos.x, mapScene.pos.y) > 500) continue;
      if (hostile(p.faction, foe.party.faction)) { remember(p.lord, 'Gunther fought ' + foe.party.name + ' near ' + nearestPlace(p.x, p.y), 8); lines.push(lord(p.lord).name + ' saw you fight and will remember it.'); }
    }
  }
  let gold = foe.party ? lootFor(enemyTroops, foe.party.kind) + (foe.party.gold || 0) : Math.round(enemyPower * 4 + (foe.siege ? 220 : 60));
  const renown = Math.max(1, Math.round(enemyPower / 5));
  game.gold += gold; game.renown += renown;
  game.morale = clamp(game.morale + 8, 0, 100);
  lines.unshift('You won! ' + plural(slain, 'enemy') + ' fell. Loot: ' + gold + ' gold. Renown +' + renown + '.');
  // Experience for everyone who fought.
  const xp = Math.round(enemyPower * 3);
  for (const t in game.troops) if (TROOPS[t].upgrades && TROOPS[t].upgrades.length) game.troops[t].xp += xp;
  // Rescued captives and grateful kingdoms.
  if (orcs && Math.random() < 0.55) {
    const n = Math.min(randInt(1, 3), partyLimit() - troopCount());
    if (n > 0) { addTroops('recruit', n); lines.push(plural(n, 'freed captive') + ' joined your warband.'); }
  }
  if (orcs) {
    let near = null, nd = Infinity;
    for (const s of SETTLEMENTS) if (KINGDOMS.includes(s.faction)) { const d = dist(s.x, s.y, mapScene.pos.x, mapScene.pos.y); if (d < nd) { nd = d; near = s; } }
    if (near && nd < 1000) changeRelation(near.faction, 2);
  } else if (foe.party && KINGDOMS.includes(foe.party.faction) || foe.siege && KINGDOMS.includes(foe.site.faction)) {
    // Every kingdom at war with the beaten one is grateful; your employer most of all.
    for (const other of enemiesOf(foe.party ? foe.party.faction : foe.site.faction)) changeRelation(other, game.contract && game.contract.faction === other ? 6 : 4);
  }
  if (foe.party && foe.party.kind === 'caravan') {
    const g = pick(Object.keys(GOODS)), n = randInt(3, 8);
    const room = cargoLimit() - cargo();
    if (room > 0) { game.goods[g] = (game.goods[g] || 0) + Math.min(n, room); lines.push('You seized ' + Math.min(n, room) + ' ' + GOODS[g].name.toLowerCase() + '.'); }
  }
  let capturedLord = null;
  if (foe.party) {
    foe.party.gone = true;
    const q = game.quests.find(q => q.party === foe.party.id);
    if (q) completeQuest(q), lines.push('Quest complete! +' + q.reward + ' gold.');
    if (foe.party.story) storyBeaten(foe.party);
    if (foe.party.lord) { capturedLord = foe.party.lord; chronicle('Gunther defeated ' + lord(capturedLord).name + ' near ' + nearestPlace(foe.party.x, foe.party.y) + '.'); }
  } else if (foe.site && !foe.siege) chronicle('Gunther stormed ' + foe.site.name + '.');
  let title = 'Victory';
  if (foe.siege) {
    title = foe.site.name + ' has fallen';
    takeTown(foe.site).forEach(l => lines.push(l));
  } else if (foe.site) {
    const st = game.sites[foe.site.id];
    st.garrison = null;
    if (foe.site.kind === 'stronghold') {
      game.hordeBroken = true;
      for (const s of SETTLEMENTS) if (s.faction === 'horde') { game.sites[s.id].burned = 999; game.sites[s.id].garrison = null; }
      game.parties = game.parties.filter(p => p.faction !== 'horde');
      game.renown += 50;
      title = 'The Horde is broken!';
      lines.unshift('Warlord Gorrak has fallen and Skullrock burns. The orcs scatter to their boats. Aldmoor is free.');
      lines.push('Your legend is just beginning. Keep playing as long as you like.');
    } else {
      st.burned = 25;
      game.stats.campsBurned++;
      const bq = game.quests.find(q => q.kind === 'burn' && q.camp === foe.site.id);
      if (bq) completeQuest(bq), lines.push('Quest complete! +' + bq.reward + ' gold.');
      lines.push(foe.site.name + ' burns. No raiders will come from it for a while.');
    }
  }
  game.parties = game.parties.filter(p => !p.gone);
  const ups = upgradeable();
  if (ups) lines.push('<span class="good">' + ups + ' of your men can be trained up. Open the Party screen.</span>');
  save();
  const report = extra => showPanel('<h2>' + title + '</h2>' + (extra ? '<p class="msg">' + extra + '</p>' : '') + lines.map(l => '<p>' + l + '</p>').join('') + statusLine() +
    '<button data-act="map">Back to the map</button><button data-act="party" class="secondary">Party</button>', {
    map: () => { setScene(mapScene); mapScene.grace = 1.5; },
    party: () => { setScene(mapScene); openParty(); }
  });
  if (capturedLord) openCapturedLord(capturedLord, report); else report();
}

function defeat(lines) {
  game.stats.lost++;
  const lostGold = Math.floor(game.gold / 2);
  game.gold -= lostGold;
  let scattered = 0;
  for (const t of Object.keys(game.troops)) { const n = Math.ceil(game.troops[t].n * 0.4); removeTroops(t, n); scattered += n; }
  game.health = Math.max(game.health, game.maxHealth * 0.3);
  game.morale = 40;
  // Wake up in the nearest town that will have you.
  const safe = SETTLEMENTS.filter(s => s.kind === 'town' && !hostile(s.faction, 'player'));
  let best = safe[0], bd = Infinity;
  for (const s of safe) { const d = dist(s.x, s.y, mapScene.pos.x, mapScene.pos.y); if (d < bd) { bd = d; best = s; } }
  if (best) { game.player.x = best.x; game.player.y = best.y + 60; }
  dailyTick(); dailyTick(); populate();
  save();
  showPanel('<h2>Defeat</h2>' + lines.map(l => '<p>' + l + '</p>').join('') +
    '<p>Your warband is routed. ' + (scattered ? plural(scattered, 'man') + ' scattered or were lost, and you' : 'You') + ' lost ' + lostGold + ' gold.' +
    (best ? ' Two days later you limp into ' + best.name + '.' : '') + '</p>' + statusLine() +
    '<button data-act="map">Carry on</button>', { map: () => { setScene(mapScene); mapScene.grace = 2; } });
}

// ---------------------------------------------------------------- sieges
// Outside the walls of a hostile town: build ladders for two days, then storm it in person.
function openSiege(s, head) {
  const g = game.sites[s.id].garrison || {};
  const others = besiegers(s).map(p => p.lord ? lord(p.lord).name : p.name);
  const fit = troopCount(true);
  showPanel(head + '<p class="bad">The gates are barred against you.</p>' +
    '<p>Garrison: ' + troopList(g) + '.</p><p>' + compare(strength(g) / WALL_BONUS) + ' <span class="small">(walls count for a lot)</span></p>' + armourNote(g) +
    (others.length ? '<p>' + others.join(', ') + (others.length > 1 ? ' are' : ' is') + ' already besieging the town.</p>' : '') +
    '<p class="small">Building ladders takes 2 days. Then you storm the walls: the defenders hold the breaches and their archers shoot from behind the wall.</p>' +
    '<button data-act="siege"' + (fit < 5 ? ' disabled' : '') + '>Build ladders and storm the walls' + (fit < 5 ? ' (needs 5 fit men)' : '') + '</button>' +
    '<button data-act="leave" class="secondary">Leave</button>', {
    siege: () => {
      dailyTick(); dailyTick(); populate();
      if (!hostile(s.faction, 'player') || game.pendingDeath) return leave();
      const gar = game.sites[s.id].garrison || {};
      if (!count(gar)) { afterBattle({ site: s, siege: true }, { won: true, killed: {}, wounded: {}, enemyKilled: {}, enemyRemaining: {}, heroDown: false }); return; }
      startBattle({ troops: gar, faction: s.faction, name: s.name + ' garrison' }, 'siege', res => afterBattle({ site: s, siege: true }, res));
    },
    leave
  });
}

// What happens to a town Gunther takes: his lord's if he is sworn to one, otherwise his own.
function takeTown(s) {
  const old = s.faction, c = game.contract, lines = [];
  const lordOf = c && KINGDOMS.includes(c.faction) && c.faction !== old ? c.faction : null;
  if (lordOf && c.kind === 'vassal') {
    capture(s, lordOf, 'player', 'Gunther');
    const ruler = LORDSLIST().find(l => l.faction === lordOf && l.ruler);
    if (ruler) remember(ruler.id, 'Gunther won ' + s.name + ' for our crown', 12);
    lines.push(FACTIONS[lordOf].ruler + ' grants you ' + s.name + ' and its villages to hold. It pays 80 gold a day while it is not raided or besieged.');
  } else if (lordOf) {
    capture(s, lordOf, null, 'Gunther');
    game.gold += 150;
    lines.push(s.name + ' now belongs to ' + FACTIONS[lordOf].name + '. As their mercenary you are paid a bounty of 150 gold.');
  } else {
    capture(s, 'player', 'player', 'Gunther');
    lines.push(s.name + ' and its villages are yours, held in your own name. ' + (FACTIONS[old].short.replace(/^the /, 'The ')) + ' will want it back.');
  }
  // The garrison is gone. A handful of militia hold the walls until you leave men there.
  const militia = RACES[s.race || (FACTIONS[originalFaction(s)].race || 'human')].recruit;
  game.sites[s.id].garrison = { [militia]: 3 };
  if (isHeld(s)) lines.push('Only 3 militia hold the walls. Leave men there from the town\'s Garrison menu, or it will not stay yours for long.');
  if (game.relations[old] !== undefined) changeRelation(old, -10);
  return lines;
}
const LORDSLIST = () => Object.keys(game.lords).map(id => lord(id));

// Moving men between the warband and the garrison of a town Gunther holds.
function openGarrison(s, msg) {
  const st = game.sites[s.id], g = st.garrison || (st.garrison = {});
  const fit = playerFit(), room = partyLimit() - troopCount();
  let rows = '';
  const types = [...new Set(Object.keys(fit).concat(Object.keys(g)))].sort((a, b) => TROOPS[b].power - TROOPS[a].power);
  for (const t of types) {
    const here = fit[t] || 0, there = g[t] || 0;
    rows += '<tr><td>' + TROOPS[t].name + '</td><td>' + here + '</td><td>' + there + '</td>' +
      '<td><button class="mini" data-act="leave1" data-arg="' + t + '"' + (here ? '' : ' disabled') + '>Leave 1</button> <button class="mini secondary" data-act="leaveall" data-arg="' + t + '"' + (here ? '' : ' disabled') + '>All</button></td>' +
      '<td><button class="mini" data-act="take1" data-arg="' + t + '"' + (there && room > 0 ? '' : ' disabled') + '>Take 1</button> <button class="mini secondary" data-act="takeall" data-arg="' + t + '"' + (there && room > 0 ? '' : ' disabled') + '>All</button></td></tr>';
  }
  const move = (t, n, out) => {
    if (out) { n = Math.min(n, fit[t] || 0); removeTroops(t, n); g[t] = (g[t] || 0) + n; }
    else { n = Math.min(n, g[t] || 0, partyLimit() - troopCount()); addTroops(t, n); g[t] -= n; if (!g[t]) delete g[t]; }
    save(); openGarrison(s);
  };
  showPanel('<h2>' + s.name + ' garrison</h2>' + (msg ? '<p class="msg">' + msg + '</p>' : '') +
    '<p>Men you leave here defend the walls when a lord comes to besiege the town, and are paid half wages. The town also raises a few militia of its own. Garrison strength ' + Math.round(strength(g)) + '.</p>' +
    '<table><tr><th>Troop</th><th>With you</th><th>Here</th><th></th><th></th></tr>' + rows + '</table>' +
    '<button data-act="back" class="secondary">Back</button>', {
    leave1: t => move(t, 1, true), leaveall: t => move(t, 999, true),
    take1: t => move(t, 1, false), takeall: t => move(t, 999, false),
    back: () => openSettlement(s)
  }, true);
}

// ---------------------------------------------------------------- death and the heir
export function openSuccession(cause) {
  const dead = game.hero, heirs = heirChoices();
  const nth = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const opts = heirs.map((h, i) => '<button data-act="pick" data-arg="' + i + '">' + esc(h.first) + ' Gunther' +
    '<span class="hk">' + (h.cousin ? 'cousin, ' : (h.sex === 'm' ? 'son, ' : 'daughter, ')) + 'age ' + h.age + ', knack for ' + esc(SKILLS[h.talent].name) + '</span></button>').join('');
  showPanel('<h2>' + esc(dead.name) + ' is dead</h2>' +
    '<p>' + esc(dead.name) + ' ' + esc(cause) + ', aged ' + heroAge() + ', after ' + plural(game.day - (dead.since || 1), 'day') + ' in command. ' + (dead.gen > 1 ? 'The ' + nth(dead.gen) + ' captain of the line.' : 'The first captain of the line.') + '</p>' +
    '<p>' + (heirs[0].cousin ? 'No child of yours is old enough to lead. A cousin will carry the banner.' : 'Choose who leads the warband now.') + '</p>' + opts, {
    pick: i => {
      const lines = succeed(heirs[+i], cause);
      game.pendingDeath = null;
      save();
      showPanel('<h2>' + esc(game.hero.name) + ' takes command</h2>' + lines.map(l => '<p>' + l + '</p>').join('') +
        '<button data-act="ok">Carry on</button>', { ok: () => { hidePanel(); mapScene.hud(); } });
    }
  });
}

// ---------------------------------------------------------------- party screen
function upgradeable() {
  let n = 0;
  for (const t in game.troops) {
    const st = game.troops[t];
    for (const u of TROOPS[t].upgrades || []) n = Math.max(n, Math.min(st.n - st.wounded, Math.floor(st.xp / u.xp)));
  }
  return n;
}

// The roster: a card for Gunther and one per troop type, with details for the picked card.
let rosterSel = 'gunther';
function healthColour(f) { return f > 0.6 ? 'var(--good)' : f > 0.3 ? 'var(--gold)' : 'var(--danger)'; }
const ROLE = t => { const d = TROOPS[t]; return d.ranged ? (d.bolt ? 'Crossbow' : 'Archer') : d.block >= 0.6 ? 'Heavy foot' : d.kind === 'spear' ? 'Spearman' : 'Infantry'; };
function rosterHtml() {
  const order = Object.keys(game.troops).filter(t => TROOPS[t] && game.troops[t].n > 0).sort((a, b) => TROOPS[b].power - TROOPS[a].power);
  if (rosterSel !== 'gunther' && !order.includes(rosterSel)) rosterSel = 'gunther';
  const lv = renownLevel().lv;
  const card = (key, role, lvl, pic, name, frac) => '<button class="card' + (rosterSel === key ? ' sel' : '') + '" data-act="pick" data-arg="' + key + '">' +
    '<div class="ch"><span>' + role + '</span><span>' + lvl + '</span></div><img alt="" src="' + pic + '"><div class="cn">' + name + '</div>' +
    '<div class="meter"><i style="width:' + Math.round(frac * 100) + '%;background:' + healthColour(frac) + '"></i></div></button>';
  let cards = card('gunther', 'Captain', 'Lv ' + lv, portrait('gunther', '', ''), esc(game.hero.first), game.health / game.maxHealth);
  for (const t of order) {
    const st = game.troops[t], d = TROOPS[t];
    cards += card(t, ROLE(t), '&times;' + st.n, portrait(d.sprite, d.kind || '', FACTIONS.player.colour), troopName(t, st.n), (st.n - st.wounded) / st.n);
  }
  if (!order.length) cards += '<p>No troops yet. Hire volunteers in a village or town.</p>';
  let det;
  const stat = (a, b) => '<div><span>' + a + '</span><b>' + b + '</b></div>';
  if (rosterSel === 'gunther') {
    det = '<div class="kind">Captain &middot; Level ' + lv + ' &middot; Age ' + heroAge() + '</div><h3>' + esc(game.hero.name) + '</h3><p>Leads from the front with bow and sword. Renown ' + game.renown + '.</p>' +
      '<div class="sg">' + stat('Health', Math.ceil(game.health) + '/' + game.maxHealth) + stat('Bow', game.bowLevel) + stat('Armour', game.armourLevel) + stat('Archery', skill('archery')) +
      stat('Bladework', skill('blade')) + stat('Sword', game.swordLevel) + stat('Leadership', skill('leadership')) + '</div>' +
      '<p class="lbl">Kit</p><p>Hunting bow (level ' + game.bowLevel + '), arming sword and shield (level ' + game.swordLevel + '), armour (level ' + game.armourLevel + '). Upgrade them at a town smith.</p>';
  } else {
    const t = rosterSel, st = game.troops[t], d = TROOPS[t];
    let ups = '';
    for (const u of d.upgrades) {
      const can = Math.min(st.n - st.wounded, Math.floor(st.xp / u.xp), Math.floor(game.gold / u.cost));
      ups += '<button data-act="up" data-arg="' + t + '>' + u.to + '"' + (can < 1 ? ' disabled' : '') + '>Train as ' + TROOPS[u.to].name.toLowerCase() + ' <span class="hk">' + u.cost + 'g each' + (can > 0 ? ', ' + can + ' ready' : '') + '</span></button>';
    }
    const need = d.upgrades.length ? Math.min(...d.upgrades.map(u => u.xp)) : 0;
    det = '<div class="kind">' + ROLE(t) + ' &middot; ' + st.n + ' in the warband</div><h3>' + d.name + '</h3>' +
      (st.wounded ? '<p class="bad">' + st.wounded + ' wounded, they will not fight until they heal.</p>' : '') +
      '<div class="sg">' + stat(d.ranged ? 'Ranged' : 'Melee', d.dmg) + stat('Health', d.hp) + stat('Armour', Math.round((d.armour || 0) * 100) + '%') + stat('Shield', Math.round((d.shield || 0) * 100) + '%') + stat('Speed', d.speed) +
      stat('Range', d.ranged ? d.range : 'Close') + stat('Upkeep', d.wage + 'g/wk') + '</div>' +
      (need ? '<p class="lbl">Experience</p><div class="meter"><i style="width:' + Math.min(100, Math.round(st.xp / need * 100)) + '%;background:var(--gold)"></i></div><p class="small">' + Math.min(st.xp, need) + ' / ' + need + ' xp to train one man</p>' : '<p class="small">Fully trained.</p>') +
      ups + '<button data-act="dismiss" data-arg="' + t + '" class="secondary">Dismiss one</button>';
  }
  return '<div class="roster"><div class="cards">' + cards + '</div><div class="detail">' + det + '</div></div>';
}

// The party screen has tabs so it fits on a phone: troops, Gunther himself, and the wider world.
let partyTab = 'troops';
export function openParty(msg, tab) {
  partyShownAt = performance.now();
  if (tab) partyTab = tab;
  const tabs = ['troops', 'gunther', 'world'].map(t => '<button class="tab' + (partyTab === t ? ' on' : '') + '" data-act="tab" data-arg="' + t + '">' + { troops: 'Roster', gunther: 'Captain and family', world: 'The island' }[t] + '</button>').join('');
  let body = '';
  if (partyTab === 'troops') {
    body = rosterHtml() + '<h3>Prisoners</h3>' + prisonersSection();
  } else if (partyTab === 'gunther') {
    const quests = game.quests.map(q => '<li>' + esc(q.title) + ' &middot; ' + plural(Math.max(0, q.deadline - game.day), 'day') + ' left &middot; ' + q.reward + ' gold</li>').join('');
    body = '<p class="stats">Health ' + Math.ceil(game.health) + '/' + game.maxHealth + ' &middot; Bow ' + game.bowLevel + ' &middot; Armour ' + game.armourLevel + ' &middot; Renown ' + game.renown + '</p>' +
      journalHtml() +
      '<h3>Quests</h3>' + (quests ? '<ul class="left">' + quests + '</ul>' : '<p class="small">No work taken. Ask in any town tavern.</p>') +
      '<p>' + contractLine() + '</p>' + familySection() +
      '<h3>Skills</h3>' + skillsTable() +
      '<p class="small">Day ' + game.day + ' &middot; Battles won ' + game.stats.won + ', lost ' + game.stats.lost + ' &middot; Orcs slain ' + game.stats.orcsSlain + ' &middot; Camps burned ' + game.stats.campsBurned + '</p>';
  } else {
    let realms = '';
    for (const k of KINGDOMS.concat('free')) {
      const v = game.relations[k];
      realms += '<tr><td><span class="dot" style="background:' + FACTIONS[k].colour + '"></span>' + FACTIONS[k].name + '</td><td class="' + (v <= -20 ? 'bad' : v >= 15 ? 'good' : '') + '">' + relationWord(v) + ' (' + v + ')</td></tr>';
    }
    realms += '<tr><td><span class="dot" style="background:' + FACTIONS.horde.colour + '"></span>' + FACTIONS.horde.name + '</td><td class="bad">' + (game.hordeBroken ? 'Broken' : 'At war with everyone') + '</td></tr>';
    const chron = game.chronicle.slice(-10).reverse().map(c => '<li><span class="small">Day ' + c.day + '</span> ' + esc(c.text) + '</li>').join('');
    body = '<p>' + (anyWar().length ? '<span class="bad">' + warsText() + '</span>' : warsText()) + '</p><table>' + realms + '</table>' +
      '<h3>Lords and what they think of you</h3>' + lordsTable() +
      '<h3>Chronicle</h3>' + (chron ? '<ul class="left">' + chron + '</ul>' : '<p>Nothing of note has happened yet.</p>');
  }
  const food = foodStock(), days = Math.floor(food / foodPerDay());
  const head = '<div class="rhead"><h2>Gunther\'s Warband</h2><span class="small">' + troopCount() + ' / ' + partyLimit() + ' men</span>' +
    '<span class="chip">Gold<b class="gold">' + game.gold.toLocaleString('en-AU') + '</b></span><span class="chip">Food<b>' + days + ' days</b></span>' +
    '<span class="chip">Morale<b class="good">' + Math.round(game.morale) + '</b></span><span class="chip">Wages<b class="bad">-' + wages() + ' / wk</b></span></div>';
  const where = 'Near ' + nearestPlace(game.player.x, game.player.y) + (game.contract ? ' &middot; ' + contractLine() : '') + (game.quests[0] ? ' &middot; Quest: ' + esc(game.quests[0].title) + ' (' + plural(Math.max(0, game.quests[0].deadline - game.day), 'day') + ' left)' : '');
  showPanel(head + '<div class="tabs">' + tabs + '</div>' + (msg ? '<p class="msg">' + msg + '</p>' : '') + body +
    '<div class="rfoot">' + where + '</div>' +
    '<button data-act="close" class="primary">Back to the map <span class="hk">P</span></button><button data-act="help" class="secondary">How to play</button><button data-act="title" class="secondary">Save and quit to title</button>', {
    tab: t => openParty('', t),
    pick: t => { rosterSel = t; openParty(); },
    dismiss: t => { if (game.troops[t] && game.troops[t].n > 0) { removeTroops(t, 1); save(); openParty('One ' + troopName(t, 1).toLowerCase() + ' was paid off and sent home.'); } },
    up: arg => {
      const [from, to] = arg.split('>');
      const st = game.troops[from], u = TROOPS[from].upgrades.find(x => x.to === to);
      const n = Math.min(st.n - st.wounded, Math.floor(st.xp / u.xp), Math.floor(game.gold / u.cost));
      if (n < 1) return openParty();
      st.xp -= n * u.xp; game.gold -= n * u.cost;
      removeTroops(from, n); addTroops(to, n);
      if (!game.troops[from] || game.troops[from].n <= 0) rosterSel = to;
      save();
      openParty(n + ' ' + troopName(from, n).toLowerCase() + ' trained as ' + troopName(to, n).toLowerCase() + '.');
    },
    convert: t => { const m = convertPrisoner(t); save(); openParty(m); },
    story: () => openPrologue(() => openParty('', 'gunther')),
    mortal: () => { game.battleDeath = !game.battleDeath; save(); openParty(game.battleDeath ? 'Captains can now die when struck down in battle.' : 'Captains struck down in battle will always recover. Old age still comes for everyone.'); },
    close: () => hidePanel(),
    help: () => openHelp(() => openParty()),
    title: () => { save(); setScene(titleScene); }
  }, true);
}

// Gunther's family: spouse, children, the heir, and the captains who came before.
function familySection() {
  const h = game.hero, sp = game.spouse;
  let html = '<h3>Family</h3><p>' + esc(h.name) + ', aged ' + heroAge() + (h.gen > 1 ? ', captain since day ' + h.since + ' (' + (['', 'first', 'second', 'third', 'fourth', 'fifth'][h.gen] || h.gen + 'th') + ' of the line)' : '') + '. ' +
    (sp ? 'Married to ' + esc(sp.name) + ', kin of ' + esc(lord(sp.from).name) + '.' : 'Unmarried. A lord who thinks well of you may offer a match: ask in their kingdom\'s hall.') + '</p>';
  if (game.children.length) html += '<ul class="left">' + game.children.map(c => '<li>' + esc(c.first) + ', ' + (c.sex === 'm' ? 'son' : 'daughter') + ', age ' + ageOf(c.born) +
    (ageOf(c.born) >= RACES.human.adult ? ' <span class="good">(of age)</span>' : '') + ' &middot; knack for ' + SKILLS[c.talent].name + '</li>').join('') + '</ul>';
  const heir = adultHeirs()[0];
  html += '<p class="small">Heir: ' + (heir ? esc(heir.first) + ' Gunther.' : 'none of age. If you die, a cousin takes over, and more of your men will leave.') +
    ' Chance of dying when struck down in a lost battle: ' + Math.round(deathChance(true) * 100) + '%.</p>' +
    '<button class="mini secondary" data-act="mortal">Death in battle: ' + (game.battleDeath ? 'on' : 'off') + '</button>';
  if (game.dynasty.length) html += '<p class="small">Before you: ' + game.dynasty.map(d => esc(d.name) + ' (' + d.cause.replace(/ near .*/, '') + ' at ' + d.age + ', day ' + d.to + ')').join('; ') + '.</p>';
  return html;
}

// The title screen is the map in the background with the title menu on top.
export const titleScene = {
  enter() { openTitle(); },
  update() {},
  draw() { if (game.player) mapScene.draw(); }
};

export { guntherPower, partyById };

// P closes the party screen again.
let partyShownAt = 0;
onKeyPress(k => { if (k === 'p' && panelOpen() && overlay.querySelector('.rhead') && performance.now() - partyShownAt > 100) hidePanel(); });
