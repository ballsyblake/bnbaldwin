// Gunther's own story, told in chapters. The words and the goals live in data/story.json so they
// can be rewritten or modded; this file only knows how to run them.
//
// Each chapter has one step to finish:
//   visit  - go to a place and press the story button there (optionally needing renown or gold)
//   visits - do the same in `count` of several places
//   defeat - beat a party that the story puts on the map (near a place, or right where Gunther is)
// When the step is done its scene is shown, with choices if it has any. A choice sets a flag that
// later text, and later steps, can check with "if" or "unless".

import { showPanel, hidePanel, panelOpen, rand, esc, setScene } from './core.js';
import { STORY, RACES, TROOPS } from './data.js';
import { game, note, chronicle, site, addTroops, changeRelation, save, troopCount, partyLimit } from './state.js';
import { spawnParty, mapScene } from './world.js';
import { battleScene } from './battle.js';
import { peopleOf } from './sieges.js';

export function newStory() { return { ch: 0, on: false, offered: false, flags: {}, visited: [], done: false }; }

const ok = c => (!c.if || game.story.flags[c.if]) && (!c.unless || !game.story.flags[c.unless]);
// A step or line can come in versions; the first whose "if"/"unless" fits is used.
function version(x) { return Array.isArray(x) ? x.find(ok) || x[x.length - 1] : x; }
function lines(list) {
  return (list || []).filter(l => typeof l === 'string' || ok(l)).map(l => '<p>' + esc(typeof l === 'string' ? l : l.text) + '</p>').join('');
}

export function chapter() { return game.story && game.story.on && !game.story.done ? STORY.chapters[game.story.ch] || null : null; }
export function step() { const c = chapter(); return c ? version(c.step) : null; }

// ---------------------------------------------------------------- what the story needs from the map
// Called from the map a few times a second. Offers the prologue, and keeps the chapter's enemy on the map.
export function storyTick() {
  const s = game.story;
  if (!s) return;
  if (!s.offered && game.day >= STORY.startDay && !panelOpen()) { s.offered = true; openPrologue(); return; }
  if (s.pending && !panelOpen()) { s.pending = false; openScene(); return; }
  const st = step();
  if (st && st.type === 'defeat' && !game.parties.some(p => p.story === chapter().id)) placeFoe(st);
}

function placeFoe(st) {
  const P = st.at === 'player' ? { x: mapScene.pos.x, y: mapScene.pos.y } : site(st.near);
  const ax = P.x + (st.dx || 0), ay = P.y + (st.dy || 0), r = st.spread || 150;
  const spec = st.party;
  const p = spawnParty(spec.faction, 'story', spec.name, Object.assign({}, spec.troops), ax + rand(-r, r), ay + rand(-r, r),
    { story: chapter().id, quest: true, anchor: { x: ax, y: ay }, desc: spec.desc, gold: 150 });
  // An ambush comes for Gunther at once; the others wait where the story put them.
  if (st.at === 'player') { p.hunt = true; note(spec.name + ' are coming for you!', '#ff6a5a'); }
  return p;
}

// Map markers: where the story wants Gunther to go next.
export function storyPlaces() {
  const st = step();
  if (!st) return [];
  if (st.type === 'visit') return [st.place];
  if (st.type === 'visits') return st.places.filter(id => !game.story.visited.includes(id));
  return [];
}

// ---------------------------------------------------------------- the opening
// A new campaign starts with the story: the hanging at Ashby, then the fight on the Fairmeet road,
// which teaches combat one step at a time. Three years later, the warband takes the road.
export function startOpening() {
  const P = STORY.prologue;
  const start = game.troops;
  game.troops = { recruit: { n: 3, wounded: 0, xp: 0 } };
  game.story.offered = true;
  showPanel('<h2>' + esc(P.title) + '</h2><div class="story">' + lines(P.text) + '</div>' +
    '<button data-act="fight">' + esc(P.fight || 'Fight') + '</button><button data-act="skip" class="secondary">' + esc(P.skip || 'Skip') + '</button>', {
    fight: () => {
      hidePanel();
      setScene(battleScene, { enemy: { troops: {}, faction: P.foeFaction || 'march', name: P.foeName || 'The tithe-wardens\' men' }, kind: 'field', tutorial: true, onEnd: () => afterOpening(start) });
    },
    skip: () => afterOpening(start)
  });
}
function afterOpening(start) {
  const P = STORY.prologue;
  game.troops = start;
  game.weapon = 'bow'; game.health = game.maxHealth;
  game.story.on = true;
  save();
  setScene(mapScene);
  const c = chapter();
  showPanel('<h2>Three years later</h2><div class="story">' + lines(P.after) + '</div>' +
    '<h3>' + esc(c.title) + '</h3><p>' + esc(c.goal) + '</p>' +
    '<p class="small">A gold ! on the map marks where the story wants you. Buy food in towns, hire men, and keep your warband paid. Your story and quests are on the Quests screen (J); How to play is on the Party screen.</p>' +
    '<button data-act="ok">To the road</button>', { ok: () => hidePanel() });
}

// ---------------------------------------------------------------- the prologue, for older saves
export function openPrologue(back) {
  const P = STORY.prologue;
  showPanel('<h2>' + esc(P.title) + '</h2><div class="story">' + lines(P.text) + lines(P.after) + '</div>' +
    '<button data-act="yes">' + esc(P.accept) + '</button><button data-act="no" class="secondary">' + esc(P.decline) + '</button>', {
    yes: () => { game.story.on = true; save(); openGoal(back); },
    no: () => { save(); note('You can take up the story later from the Quests screen.', '#d8dce6'); back ? back() : hidePanel(); }
  });
}
function openGoal(back) {
  const c = chapter();
  showPanel('<h2>' + esc(c.title) + '</h2><p>' + esc(c.goal) + '</p><p class="small">Your story is kept on the Quests screen (J).</p><button data-act="ok">Onward</button>', { ok: () => back ? back() : hidePanel() });
}

// ---------------------------------------------------------------- places
// The story button a place shows, if the story wants something here. Returns null or { label, why }.
export function storyButton(s) {
  const st = step();
  if (!st) return null;
  if (st.type === 'visit' && st.place === s.id) return { label: st.button, why: unmet(st.needs) };
  if (st.type === 'visits' && st.places.includes(s.id) && !game.story.visited.includes(s.id)) {
    return { label: st.button, why: game.sites[s.id].raided ? 'the village has just been raided' : null };
  }
  return null;
}
function unmet(n) {
  if (!n) return null;
  if (n.renown && game.renown < n.renown) return 'needs renown ' + n.renown + ', you have ' + game.renown;
  if (n.gold && game.gold < n.gold) return 'needs ' + n.gold + ' gold';
  return null;
}
// Gunther pressed the story button in place s. `back` reopens the place.
export function storyAt(s, back) {
  const st = step();
  if (st.type === 'visits') {
    game.story.visited.push(s.id);
    const got = give(st.eachReward || {}, s);
    const left = st.count - game.story.visited.filter(id => st.places.includes(id)).length;
    if (left > 0) {
      save();
      showPanel('<h2>' + esc(s.name) + '</h2><p>' + esc(st.each) + '</p>' + got + '<p class="small">' + left + ' more ' + (left === 1 ? 'village' : 'villages') + ' to go.</p><button data-act="ok">Carry on</button>', { ok: back });
      return;
    }
  }
  finish(back);
}
// A story enemy was beaten. The scene waits until the battle report is closed.
export function storyBeaten(p) {
  if (!chapter() || p.story !== chapter().id) return;
  game.story.pending = true;
  game.story.after = null;
}

function finish(back) { game.story.after = back || null; openScene(); }

// ---------------------------------------------------------------- scenes and rewards
let afterScene = null;
function openScene() {
  const c = chapter();
  if (!c) return;
  afterScene = game.story.after;
  const ch = (c.choices || []).filter(ok);
  const n = game.story.ch + 1;
  let html = '<h2><span class="small">Chapter ' + n + '</span><br>' + esc(c.title) + '</h2><div class="story">' + lines(c.scene) + '</div>';
  if (ch.length) html += ch.map((x, i) => '<button data-act="pick" data-arg="' + i + '"' + (i ? ' class="secondary"' : '') + '>' + esc(x.label) + '</button>').join('');
  else html += '<button data-act="pick" data-arg="-1">Continue</button>';
  showPanel(html, { pick: i => choose(c, ch[+i]) }, true);
}

function choose(c, pickd) {
  let html = '';
  if (pickd) {
    game.story.flags[pickd.flag] = true;
    html += '<p>' + esc(pickd.text) + '</p>' + give(pickd.reward || {});
  }
  html += give(c.reward || {});
  game.story.ch++;
  game.story.visited = [];
  const next = chapter();
  if (!next) {
    game.story.done = true;
    html += '<p class="msg">' + esc(STORY.ending) + '</p>';
  } else html += '<h3>Next: ' + esc(next.title) + '</h3><p>' + esc(next.goal) + '</p>';
  save();
  const back = afterScene;
  showPanel('<h2>' + esc(c.title) + '</h2>' + html + '<button data-act="ok">Onward</button>', { ok: () => back ? back() : hidePanel() });
}

// Applies a reward and describes it. `s` is the place it came from, for recruits.
function give(r, s) {
  const out = [];
  if (r.spend) { game.gold -= Math.min(game.gold, r.spend); out.push('You paid ' + r.spend + ' gold.'); }
  if (r.gold) { game.gold += r.gold; out.push('+' + r.gold + ' gold.'); }
  if (r.renown) { game.renown += r.renown; out.push('Renown +' + r.renown + '.'); }
  if (r.relations) for (const k in r.relations) if (game.relations[k] !== undefined) changeRelation(k, r.relations[k]);
  if (r.relations) out.push('The realms think better of you.');
  const room = () => partyLimit() - troopCount();
  if (r.troops) for (const t in r.troops) if (TROOPS[t]) addTroops(t, r.troops[t]);
  if (r.say) out.push(r.say);
  if (r.recruits && s) {
    const t = RACES[peopleOf(s)].recruit, n = Math.max(0, Math.min(r.recruits, room()));
    if (n) { addTroops(t, n); out.push(n + ' ' + TROOPS[t].name.toLowerCase() + (n === 1 ? '' : 's') + ' joined you.'); }
    else out.push('Your warband is full, so nobody new could join.');
  }
  if (r.chronicle) chronicle(r.chronicle);
  return out.length ? '<p class="good">' + out.map(esc).join(' ') + '</p>' : '';
}

// ---------------------------------------------------------------- the journal
export function journalHtml() {
  const s = game.story;
  if (!s.on) return '<h3>' + esc(STORY.title) + '</h3><p>' + esc(STORY.about) + '</p><button class="mini" data-act="story">Begin the story</button>';
  const done = STORY.chapters.slice(0, s.ch).map((c, i) => '<li class="small">' + (i + 1) + '. ' + esc(c.title) + '</li>').join('');
  const c = chapter();
  let now = '';
  if (c) {
    const st = step();
    let extra = '';
    if (st.type === 'visits') extra = ' (' + s.visited.length + ' of ' + st.count + ' done)';
    const why = st.type === 'visit' ? unmet(st.needs) : null;
    now = '<li><b>' + (s.ch + 1) + '. ' + esc(c.title) + '</b><br>' + esc(c.goal) + extra + (why ? ' <span class="warn">(' + esc(why) + ')</span>' : '') + '</li>';
  }
  return '<h3>Story: ' + esc(STORY.title) + '</h3><ul class="left">' + done + now + '</ul>' + (s.done ? '<p class="good">' + esc(STORY.ending) + '</p>' : '');
}
