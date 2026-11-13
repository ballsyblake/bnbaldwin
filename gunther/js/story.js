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
import { talk, lineText } from './dialogue.js';

export function newStory() { return { ch: 0, on: false, offered: false, flags: {}, visited: [], done: false }; }

const ok = c => (!c.if || game.story.flags[c.if]) && (!c.unless || !game.story.flags[c.unless]);
// A step or line can come in versions; the first whose "if"/"unless" fits is used.
function version(x) { return Array.isArray(x) ? x.find(ok) || x[x.length - 1] : x; }
function lines(list) {
  return say(list).map(l => '<p>' + esc(lineText(l)) + '</p>').join('');
}
// The lines of a scene that apply to this playthrough, ready to be played as dialogue. A line is
// a string (the narrator) or { who, text }; either kind can carry "if" or "unless".
function say(list) { return [].concat(list || []).filter(l => typeof l === 'string' || ok(l)); }

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
    { story: chapter().id, quest: true, anchor: { x: ax, y: ay }, desc: spec.desc, gold: 80 });
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
  talk(P.title, say(P.text), {
    choices: [P.fight || 'Fight', P.skip || 'Skip'],
    pick: i => {
      if (i) return afterOpening(start);
      hidePanel();
      setScene(battleScene, { enemy: { troops: {}, faction: P.foeFaction || 'march', name: P.foeName || 'The tithe-wardens\' men' }, kind: 'field', tutorial: true, onEnd: () => afterOpening(start) });
    }
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
  talk('Three years later', say(P.after), { done: () =>
    showPanel('<h2>' + esc(c.title) + '</h2><p>' + esc(c.short || c.goal) + '</p>' +
      '<p class="small">A gold ! on the map marks where the story wants you. Feed and pay your men. Quests: J.</p>' +
      '<button data-act="ok">To the road</button>', { ok: () => hidePanel() }) });
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
  talk('Chapter ' + n + ' · ' + c.title, say(c.scene), { choices: ch.map(x => x.label), pick: i => choose(c, ch[i]), done: () => choose(c, null) });
}

// What follows a choice is played out as dialogue too, then the rewards and the next goal are shown.
function choose(c, pickd) {
  if (pickd) game.story.flags[pickd.flag] = true;
  const after = pickd ? say(pickd.text) : [];
  if (after.length) talk(c.title, after, { done: () => wrapUp(c, pickd) }); else wrapUp(c, pickd);
}
function wrapUp(c, pickd) {
  let html = pickd ? give(pickd.reward || {}) : '';
  html += give(c.reward || {});
  game.story.ch++;
  game.story.visited = [];
  const next = chapter();
  if (!next) {
    game.story.done = true;
    html += '<p class="msg">' + esc(STORY.ending) + '</p>';
  } else html += '<h3>Next: ' + esc(next.title) + '</h3><p>' + esc(next.short || next.goal) + '</p>';
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
  // One line for what to do now. The full telling is a tap away, for anyone who wants it.
  const c = chapter(), total = STORY.chapters.length;
  const head = '<h3>Story <span class="count">' + Math.min(s.ch + 1, total) + ' / ' + total + '</span></h3>';
  if (!c) return head + '<p class="good">' + esc(STORY.title) + ': finished.</p>';
  const st = step();
  let chips = '';
  if (st.type === 'visits') chips += '<span class="chip">Villages<b>' + s.visited.length + ' / ' + st.count + '</b></span>';
  const n = st.type === 'visit' && st.needs;
  if (n && n.renown) chips += '<span class="chip">Renown<b class="' + (game.renown < n.renown ? 'bad' : 'good') + '">' + game.renown + ' / ' + n.renown + '</b></span>';
  if (n && n.gold) chips += '<span class="chip">Gold<b class="' + (game.gold < n.gold ? 'bad' : 'good') + '">' + n.gold + '</b></span>';
  return head + '<p class="goal"><b>' + esc(c.title) + '</b> ' + esc(c.short || c.goal) + '</p>' + (chips ? '<div class="rhead">' + chips + '</div>' : '') +
    (c.short ? '<details><summary>More</summary><p class="small">' + esc(c.goal) + '</p></details>' : '');
}
