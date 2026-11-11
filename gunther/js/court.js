// The people side of the sandbox: lords with traits and memories, contracts with a kingdom
// (mercenary, then vassal with a village of your own), and prisoners you can ransom or recruit.

import { showPanel, esc, clamp } from './core.js';
import { TROOPS, SETTLEMENTS, FACTIONS, LORDS, SKILLS } from './data.js';
import {
  game, save, note, site, troopCount, partyLimit, addTroops, changeRelation, relationWord, lord, lordState, remember, hasTrait,
  chronicle, prisonerCount, prisonerLimit, ransomPrice, lordRansom, contractPay, fiefRent, skill, skillProgress, troopName
} from './state.js';

const TRAIT_WORDS = { bold: 'bold', cautious: 'cautious', honourable: 'honourable', cruel: 'cruel', greedy: 'greedy' };

export function lordBlurb(id) {
  const l = lord(id), st = lordState(id);
  return l.name + ', ' + (l.ruler ? 'ruler' : 'a lord') + ' of ' + FACTIONS[l.faction].short + '. Known to be ' + l.traits.map(t => TRAIT_WORDS[t]).join(' and ') + '.';
}

// What a lord says when you meet, based on how they feel about you and what they remember.
export function lordGreeting(id) {
  const st = lordState(id), last = st.memories[st.memories.length - 1];
  let line;
  if (st.opinion <= -40) line = '"You again. I have not forgotten, Gunther. Draw your weapon."';
  else if (st.opinion < -10) line = '"Gunther. Keep your distance."';
  else if (st.opinion >= 30) line = '"Gunther, my friend. Good to see your banner."';
  else if (st.opinion >= 10) line = '"Gunther. Well met."';
  else line = '"Another sellsword. What do you want?"';
  if (last) line += ' <span class="small">(' + esc(lord(id).name.split(' ').pop()) + ' remembers: ' + esc(last.text) + '.)</span>';
  return line;
}

// ---------------------------------------------------------------- the hall (contracts)
export function openHall(s, back) {
  const k = s.faction, f = FACTIONS[k];
  const ruler = LORDS.find(l => l.faction === k && l.ruler);
  const rel = game.relations[k];
  const c = game.contract;
  const lords = LORDS.filter(l => l.faction === k);
  const avgOpinion = lords.reduce((t, l) => t + lordState(l.id).opinion, 0) / lords.length;
  let body = '<h2>' + s.name + ' hall</h2><p>' + f.name + ', ruled by ' + ruler.name + '. Your standing: ' + relationWord(rel) + ' (' + rel + ').</p>';
  const handlers = { back };
  if (!c) {
    const ok = game.renown >= 15 && rel >= 0;
    body += '<p>' + ruler.name + '\'s steward is hiring swords. A mercenary is paid every day and fights the kingdom\'s enemies.</p>' +
      (ok ? '' : '<p class="warn">Come back with more renown (15) and a good name here.</p>') +
      '<button data-act="merc"' + (ok ? '' : ' disabled') + '>Sign on as a mercenary (' + (6 + Math.floor(game.renown / 8)) + ' gold a day)</button>';
    handlers.merc = () => {
      game.contract = { faction: k, kind: 'merc', since: game.day };
      chronicle('Gunther took service as a mercenary of ' + f.short + '.');
      note('You now fight for ' + f.name + '.', '#ffe08a');
      save(); openHall(s, back);
    };
  } else if (c.faction !== k) {
    body += '<p class="warn">You are sworn to ' + FACTIONS[c.faction].name + '. They will not hire a rival\'s sword.</p>';
  } else if (c.kind === 'merc') {
    const served = game.day - c.since;
    const fief = SETTLEMENTS.find(v => v.kind === 'village' && v.faction === k);
    const ok = game.renown >= 60 && rel >= 20 && served >= 10 && avgOpinion >= 0;
    body += '<p>You have served ' + served + ' days as a mercenary.</p>' +
      '<p>A vassal swears an oath to ' + ruler.name + ' and is given a village to hold. Its rent is yours, and its people will join you cheaply.</p>' +
      (ok ? '' : '<p class="warn">To be offered land you need renown 60, standing 20, 10 days of service, and the lords of ' + f.short + ' not to dislike you (their average opinion: ' + Math.round(avgOpinion) + ').</p>') +
      '<button data-act="vassal"' + (ok ? '' : ' disabled') + '>Swear fealty and receive ' + fief.name + '</button>' +
      '<button data-act="quit" class="secondary">End your contract</button>';
    handlers.vassal = () => {
      game.contract = { faction: k, kind: 'vassal', since: game.day, fief: fief.id };
      chronicle(ruler.name + ' made Gunther a vassal and granted him ' + fief.name + '.');
      for (const l of lords) remember(l.id, 'Gunther swore fealty to our crown', 8);
      game.renown += 10;
      save(); openHall(s, back);
    };
    handlers.quit = () => { game.contract = null; chronicle('Gunther left the service of ' + f.short + '.'); save(); openHall(s, back); };
  } else {
    body += '<p>You are a sworn vassal of ' + ruler.name + ' and hold ' + site(c.fief).name + ', which pays ' + fiefRent() + ' gold a day' + (game.sites[c.fief].raided ? ' (nothing while it is raided)' : '') + '.</p>' +
      '<button data-act="renounce" class="secondary">Renounce your oath</button>';
    handlers.renounce = () => {
      game.contract = null;
      changeRelation(k, -20);
      for (const l of lords) remember(l.id, 'Gunther broke his oath to our crown', -15);
      chronicle('Gunther renounced his oath to ' + ruler.name + '.');
      save(); openHall(s, back);
    };
  }
  body += '<h3>Lords of ' + f.short + '</h3><table>' + lords.map(l => lordRow(l.id)).join('') + '</table>';
  body += '<button data-act="back" class="secondary">Back</button>';
  showPanel(body, handlers, true);
}

function lordRow(id) {
  const l = lord(id), st = lordState(id);
  const where = st.status === 'free' ? 'In the field' : st.status === 'routed' ? 'Recovering' : st.status === 'held-player' ? 'Your prisoner' : 'Held by ' + FACTIONS[st.status.slice(5)].short;
  const op = st.opinion;
  return '<tr><td>' + l.name + '<br><span class="small">' + l.traits.join(', ') + '</span></td><td>' + where + '</td><td class="' + (op <= -20 ? 'bad' : op >= 20 ? 'good' : '') + '">' + (op > 0 ? '+' : '') + op + '</td></tr>';
}

// ---------------------------------------------------------------- ransom broker (in town taverns)
export function openRansom(s, back, msg) {
  let rows = '';
  for (const t in game.prisoners) {
    const n = game.prisoners[t];
    rows += '<tr><td>' + n + ' ' + troopName(t, n) + '</td><td>' + ransomPrice(t) + ' each</td><td><button class="mini" data-act="sell" data-arg="' + t + '">Sell all</button></td></tr>';
  }
  for (const id of game.lordCaptives) {
    rows += '<tr><td>' + lord(id).name + '</td><td>' + lordRansom(id) + '</td><td><button class="mini" data-act="sellLord" data-arg="' + id + '">Ransom</button></td></tr>';
  }
  showPanel('<h2>Ransom broker</h2>' + (msg ? '<p class="msg">' + msg + '</p>' : '') +
    '<p>A thin man in a good coat buys captives and sells them back to their kin. No questions asked.</p>' +
    (rows ? '<table>' + rows + '</table>' : '<p>You have no prisoners to sell.</p>') +
    '<button data-act="back" class="secondary">Back</button>', {
    sell: t => {
      const gold = ransomPrice(t) * game.prisoners[t];
      game.gold += gold; delete game.prisoners[t];
      save(); openRansom(s, back, 'Sold for ' + gold + ' gold.');
    },
    sellLord: id => {
      const gold = lordRansom(id);
      game.gold += gold;
      game.lordCaptives = game.lordCaptives.filter(x => x !== id);
      const st = lordState(id); st.status = 'routed'; st.back = game.day + 4;
      remember(id, 'Gunther sold me back to my family like a sack of grain', -25);
      changeRelation(lord(id).faction, -5);
      chronicle(lord(id).name + ' was ransomed by Gunther for ' + gold + ' gold.');
      save(); openRansom(s, back, lord(id).name + ' was ransomed for ' + gold + ' gold. They will not forget it.');
    },
    back
  });
}

// What to do with a lord you have just beaten in battle. Returns a promise-like callback.
export function openCapturedLord(id, done) {
  const l = lord(id);
  showPanel('<h2>' + l.name + ' is your prisoner</h2><p>' + lordBlurb(id) + '</p>' +
    '<p>Release them and word of your mercy will spread. Keep them and a ransom broker in any town will pay ' + lordRansom(id) + ' gold, though they will never forgive it.</p>' +
    '<button data-act="free">Let them go</button><button data-act="keep" class="secondary">Keep them for ransom</button>', {
    free: () => {
      const st = lordState(id); st.status = 'routed'; st.back = game.day + 3;
      remember(id, 'Gunther beat me in battle and let me go free', 25);
      changeRelation(l.faction, 4);
      for (const o of LORDS) if (o.id !== id && hasTrait(o.id, 'honourable')) remember(o.id, 'Gunther spared ' + l.name, 4);
      chronicle('Gunther defeated ' + l.name + ' and set them free.');
      save(); done('You let ' + l.name + ' go. Honourable lords will hear of it.');
    },
    keep: () => {
      lordState(id).status = 'held-player';
      game.lordCaptives.push(id);
      remember(id, 'Gunther took me captive', -15);
      chronicle('Gunther defeated and captured ' + l.name + '.');
      save(); done(l.name + ' is in chains in your camp.');
    }
  });
}

// ---------------------------------------------------------------- party screen sections
export function skillsTable() {
  let rows = '';
  for (const k in SKILLS) {
    const pct = Math.round(skillProgress(k) * 100);
    rows += '<tr><td>' + SKILLS[k].name + '</td><td>' + skill(k) + '</td><td><span class="meter"><span style="width:' + pct + '%"></span></span></td><td class="small">Grows by ' + SKILLS[k].how + '. ' + SKILLS[k].effect + '.</td></tr>';
  }
  return '<table><tr><th>Skill</th><th>Lv</th><th></th><th></th></tr>' + rows + '</table>';
}

export function prisonersSection() {
  const n = prisonerCount();
  if (!n) return '<p>No prisoners. Beaten enemies are sometimes captured; sell them to a ransom broker in any town tavern.</p>';
  let rows = '';
  for (const t in game.prisoners) {
    const c = game.prisoners[t];
    const can = !TROOPS[t].orc && troopCount() < partyLimit();
    rows += '<tr><td>' + c + ' ' + troopName(t, c) + '</td><td>' + (TROOPS[t].orc ? '<span class="small">Orcs will not serve you</span>' : '<button class="mini" data-act="convert" data-arg="' + t + '"' + (can ? '' : ' disabled') + '>Persuade one to join</button>') + '</td></tr>';
  }
  for (const id of game.lordCaptives) rows += '<tr><td>' + lord(id).name + '</td><td class="small">Ransom in a town tavern</td></tr>';
  return '<p>Prisoners ' + n + '/' + prisonerLimit() + '. They eat your food and slow you down.</p><table>' + rows + '</table>';
}

// A captured soldier joins you. Leadership makes it more likely.
export function convertPrisoner(t) {
  if (!game.prisoners[t]) return 'No such prisoner.';
  const chance = clamp(0.35 + skill('leadership') * 0.06, 0, 0.9);
  game.prisoners[t]--;
  if (!game.prisoners[t]) delete game.prisoners[t];
  if (Math.random() < chance) { addTroops(t, 1); return 'A captured ' + TROOPS[t].name.toLowerCase() + ' swore to fight for you.'; }
  return 'The prisoner refused, and you sent them on their way.';
}

export function contractLine() {
  const c = game.contract;
  if (!c) return 'You serve no one. Kingdom halls in Brightwater, Redcliff, Elthir and Dunmar hire mercenaries.';
  if (c.kind === 'merc') return 'Mercenary of ' + FACTIONS[c.faction].name + ', paid ' + contractPay() + ' gold a day.';
  return 'Sworn vassal of ' + FACTIONS[c.faction].name + ', holding ' + site(c.fief).name + ' (' + fiefRent() + ' gold a day).';
}

export function lordsTable() {
  return '<table>' + LORDS.map(l => lordRow(l.id).replace('<td>' + l.name, '<td><span class="dot" style="background:' + FACTIONS[l.faction].colour + '"></span>' + l.name)).join('') + '</table>';
}
