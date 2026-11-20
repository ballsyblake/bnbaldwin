// Boltyard: game state, garage, arenas and the battle loop.
import {
  CATS, FRAMES, DRIVES, WEAPONS, PLATES, MODULES, ARENAS, LEAGUES, TACTICS, TEAM_COLORS, ENEMY_COLOR, BAY_COST,
  START_CREDITS, MAX_LVL, LOSS_PAYOUT, REPLAY_PAYOUT, BATTLE_TIME, upgradeCost, lvlMul,
} from './data.js';
import { botStats, buildIssue, partsWeight, power, enemyBuild, enemyTactic } from './bot.js';
import { createBattle, step } from './sim.js';
import { drawBot, partIcon, botThumb, createView, drawBattle, absorbEvents, tickView, screenToWorld } from './render.js';

const SAVE_KEY = 'boltyard.v1';
const $ = (s) => document.querySelector(s);

// ---------- state ----------
function fresh() {
  return {
    v: 2, credits: START_CREDITS, nextId: 4, bays: 1, sel: 0, beaten: [], intro: false,
    inv: [
      { id: 1, cat: 'frame', key: 'skiff', lvl: 1, spent: 60 },
      { id: 2, cat: 'drive', key: 'rollers', lvl: 1, spent: 30 },
      { id: 3, cat: 'weapon', key: 'rivet', lvl: 1, spent: 30 },
    ],
    bots: [newBot(0, { frame: 1, drive: 2, weapons: [3] })],
  };
}
function newBot(i, s = {}) {
  return { name: 'B' + (i + 1), tactic: 'rush', slots: { frame: null, drive: null, weapons: [], plate: null, module: null, ...s } };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.v === 2) return s;
    if (s && s.v === 1) oldSave = true; // the 10-arena campaign: start over on the new one
  } catch (e) { /* no storage */ }
  return null;
}
let oldSave = false;
let S = load() || fresh();
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }

const item = (id) => S.inv.find((x) => x.id === id) || null;
const def = (cat, key) => CATS[cat].defs[key];
function usedIds() {
  const u = new Set();
  for (const b of S.bots) {
    const s = b.slots;
    [s.frame, s.drive, s.plate, s.module, ...s.weapons].forEach((x) => x && u.add(x));
  }
  return u;
}
function buildOf(bot) {
  const p = (id) => { const it = item(id); return it ? { key: it.key, lvl: it.lvl } : null; };
  return {
    frame: p(bot.slots.frame), drive: p(bot.slots.drive),
    weapons: bot.slots.weapons.map(p).filter(Boolean), plate: p(bot.slots.plate), module: p(bot.slots.module),
  };
}
function lookOf(build, color) {
  return {
    frame: build.frame ? build.frame.key : 'skiff', drive: build.drive && build.drive.key,
    weapons: build.weapons.map((w) => w.key), plate: build.plate && build.plate.key,
    module: build.module && build.module.key, color,
  };
}
function teamUnits() {
  const out = [];
  S.bots.forEach((bot, i) => {
    const b = buildOf(bot);
    if (buildIssue(b)) return;
    out.push({ st: botStats(b), tactic: bot.tactic, color: TEAM_COLORS[i], name: bot.name, look: lookOf(b, TEAM_COLORS[i]) });
  });
  return out;
}
function enemyUnits(arena) {
  return arena.team.map((s, i) => {
    const b = enemyBuild(s);
    return { st: botStats(b, s.hm), tactic: enemyTactic(s, i), color: ENEMY_COLOR, name: 'R' + (i + 1), look: lookOf(b, ENEMY_COLOR) };
  });
}

// ---------- text helpers ----------
const coin = (n) => `<span class="coin">${n}</span>`;
const lv = (l) => `<span class="lv l${l}">L${l}</span>`;
function statLine(cat, key, lvl) {
  const d = def(cat, key), m = lvlMul(lvl);
  switch (cat) {
    case 'frame': return `HP <em>${Math.round(d.hp * m)}</em> CAP <em>${d.cap}</em> SLOT <em>${d.slots}</em>`;
    case 'drive': return `SPD <em>${Math.round(d.spd * m)}</em> PULL <em>${Math.round(d.pull * m)}</em>${d.arm ? ' ARM <em>1</em>' : ''} WT <em>${d.wt}</em>`;
    case 'weapon': {
      const dps = Math.round(d.dmg * m * (d.pellets || 1) * d.rof * 10) / 10;
      const tag = { shell: ' SPL', missile: ' HOME', rail: ' PRC', beam: ' PRC' }[d.kind] || '';
      return `DPS <em>${dps}</em> RNG <em>${d.range}</em>${tag} WT <em>${d.wt}</em>`;
    }
    case 'plate': return `HP <em>+${Math.round(d.hp * m)}</em> ARM <em>${d.arm + (lvl >= 3 ? 1 : 0)}</em> WT <em>${d.wt}</em>`;
    case 'module': {
      const e = d.regen ? `REGEN <em>${(d.regen * m).toFixed(1)}/s</em>` : d.shield ? `SHLD <em>${Math.round(d.shield * m)}</em>`
        : d.rofMul ? `ROF <em>+${Math.round(d.rofMul * m * 100)}%</em>` : `SPD <em>+${Math.round(d.spdMul * m * 100)}%</em>`;
      return `${e} WT <em>${d.wt}</em>`;
    }
  }
  return '';
}

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800);
}

// ---------- actions ----------
function slotGet(bot, slot) {
  if (slot.startsWith('weapon:')) return bot.slots.weapons[+slot.split(':')[1]] ?? null;
  return bot.slots[slot];
}
function slotSet(bot, slot, id) {
  if (slot.startsWith('weapon:')) {
    const i = +slot.split(':')[1];
    const w = bot.slots.weapons.slice();
    if (id == null) w.splice(i, 1); else w[i] = id;
    bot.slots.weapons = w.filter((x) => x != null);
  } else bot.slots[slot] = id;
  if (slot === 'frame') {
    const f = item(id);
    const max = f ? FRAMES[f.key].slots : 0;
    if (bot.slots.weapons.length > max) bot.slots.weapons = bot.slots.weapons.slice(0, max);
  }
}
const slotCat = (slot) => (slot.startsWith('weapon') ? 'weapon' : slot);

// weight after putting part (cat,key) into slot; returns {wt, cap}
function weightWith(bot, slot, key) {
  const b = buildOf(bot);
  const cat = slotCat(slot);
  const p = { key, lvl: 1 };
  if (cat === 'weapon') { const i = +slot.split(':')[1]; b.weapons = b.weapons.slice(); b.weapons[i] = p; }
  else b[cat] = p;
  return { wt: partsWeight(b), cap: b.frame ? FRAMES[b.frame.key].cap : 0 };
}
function fits(bot, slot, key) {
  if (slotCat(slot) === 'frame') return true;
  const w = weightWith(bot, slot, key);
  return w.wt <= w.cap;
}

function equip(slot, id) {
  const bot = S.bots[S.sel];
  const it = item(id);
  if (!fits(bot, slot, it.key)) return toast('Too heavy for this frame');
  slotSet(bot, slot, id);
  save(); render(); openPicker(slot);
}
function buy(slot, key) {
  const cat = slotCat(slot), d = def(cat, key);
  if (S.credits < d.cost) return toast('Not enough credits');
  const bot = S.bots[S.sel];
  if (!fits(bot, slot, key)) return toast('Too heavy for this frame');
  S.credits -= d.cost;
  const id = S.nextId++;
  S.inv.push({ id, cat, key, lvl: 1, spent: d.cost });
  slotSet(bot, slot, id);
  save(); render(); openPicker(slot);
}
function upgrade(id, slot) {
  const it = item(id);
  if (it.lvl >= MAX_LVL) return;
  const c = upgradeCost(it.cat, it.key, it.lvl);
  if (S.credits < c) return toast('Not enough credits');
  S.credits -= c; it.spent += c; it.lvl++;
  save(); render(); openPicker(slot);
}
function unequip(slot) {
  slotSet(S.bots[S.sel], slot, null);
  save(); render(); openPicker(slot);
}
function sell(id, slot) {
  const it = item(id);
  for (const b of S.bots) {
    for (const k of ['frame', 'drive', 'plate', 'module']) if (b.slots[k] === id) b.slots[k] = null;
    b.slots.weapons = b.slots.weapons.filter((x) => x !== id);
  }
  S.credits += Math.floor(it.spent / 2);
  S.inv = S.inv.filter((x) => x.id !== id);
  save(); render(); openPicker(slot);
}
function unlockBay(i) {
  if (i !== S.bays) return;
  if (S.credits < BAY_COST[i]) return toast('Not enough credits');
  S.credits -= BAY_COST[i];
  S.bays++;
  S.bots.push(newBot(i));
  S.sel = i;
  save(); render();
}

// ---------- garage ----------
let tab = 'garage';
let previewLook = null;

function renderGarage() {
  const bot = S.bots[S.sel];
  const b = buildOf(bot);
  const issue = buildIssue(b);
  const st = b.frame ? botStats(b) : null;
  let bays = '';
  for (let i = 0; i < 3; i++) {
    if (i < S.bays) {
      const bb = buildOf(S.bots[i]);
      const bad = buildIssue(bb);
      const img = bb.frame ? `<img alt="" src="${botThumb(lookOf(bb, TEAM_COLORS[i]), 44)}">` : '<span class="ph"></span>';
      bays += `<button class="bay ${i === S.sel ? 'on' : ''} ${bad ? 'bad' : ''}" data-act="bay" data-i="${i}">${img}<span><b>${S.bots[i].name}</b><small>${bad ? bad : 'PWR ' + power(botStats(bb))}</small></span></button>`;
    } else {
      const can = i === S.bays;
      bays += `<button class="bay locked" data-act="unlock" data-i="${i}" ${can ? '' : 'disabled'}><b>+</b><small>${can ? coin(BAY_COST[i]) : 'Locked'}</small></button>`;
    }
  }
  const cell = (k, v, bad) => `<div class="stat ${bad ? 'bad' : ''}"><i>${k}</i><b>${v}</b></div>`;
  const stats = st
    ? cell('HP', st.hp) + cell('ARM', st.arm) + cell('SPD', st.spd) + cell('DPS', st.dps) + cell('RNG', st.range) + cell('WT', `${st.wt}/${st.cap}`, st.wt > st.cap)
    : cell('HP', '-') + cell('ARM', '-') + cell('SPD', '-') + cell('DPS', '-') + cell('RNG', '-') + cell('WT', '-');

  const row = (slot, label) => {
    const id = slotGet(bot, slot);
    const it = id ? item(id) : null;
    const cat = slotCat(slot);
    if (!it) return `<button class="row" data-act="slot" data-slot="${slot}"><span class="ph">+</span><span class="nm"><small>${label}</small><b style="color:var(--muted)">Empty</b></span><span class="chev">&rsaquo;</span></button>`;
    return `<button class="row" data-act="slot" data-slot="${slot}"><img alt="" src="${partIcon(cat, it.key)}"><span class="nm"><small>${label}</small><b>${def(cat, it.key).name}${lv(it.lvl)}</b></span><span class="kv">${statLine(cat, it.key, it.lvl)}</span><span class="chev">&rsaquo;</span></button>`;
  };
  let rows = row('frame', 'Frame') + row('drive', 'Drive');
  const nW = b.frame ? FRAMES[b.frame.key].slots : 0;
  for (let i = 0; i < nW; i++) {
    if (i > bot.slots.weapons.length) break;
    rows += row('weapon:' + i, nW > 1 ? 'Weapon ' + (i + 1) : 'Weapon');
  }
  rows += row('plate', 'Plating') + row('module', 'Module');

  const tactics = Object.entries(TACTICS).map(([k, t]) => `<button data-act="tactic" data-t="${k}" class="${bot.tactic === k ? 'on' : ''}">${t.label}<small>${t.hint}</small></button>`).join('');

  $('#view').innerHTML = `
    <div class="bays">${bays}</div>
    <div class="botcard">
      <canvas id="preview" width="256" height="256"></canvas>
      <div class="stats">${stats}${issue ? `<div class="issue">${issue}: bot sits out</div>` : ''}</div>
    </div>
    <div class="seg">${tactics}</div>
    <div class="slots">${rows}</div>`;
  previewLook = b.frame ? lookOf(b, TEAM_COLORS[S.sel]) : null;
}

function openPicker(slot) {
  const bot = S.bots[S.sel];
  const cat = slotCat(slot);
  const curId = slotGet(bot, slot);
  const cur = curId ? item(curId) : null;
  const used = usedIds();
  const label = slot.startsWith('weapon:') ? 'Weapon ' + (+slot.split(':')[1] + 1) : CATS[cat].label;
  const needFrame = cat !== 'frame' && !bot.slots.frame;

  const wtTag = (key) => {
    if (cat === 'frame') return '';
    const w = weightWith(bot, slot, key);
    return ` <span class="${w.wt > w.cap ? 'over' : ''}">${w.wt}/${w.cap}</span>`;
  };

  let html = `<div class="sheet-in"><header><b>${label}</b><button class="x" data-act="close" aria-label="Close">&times;</button></header>`;
  if (needFrame) html += `<p class="issue">Fit a frame first</p>`;
  if (cur) {
    const up = cur.lvl < MAX_LVL ? upgradeCost(cat, cur.key, cur.lvl) : 0;
    html += `<div class="cur"><div class="row"><img alt="" src="${partIcon(cat, cur.key)}"><span class="nm"><small>Fitted</small><b>${def(cat, cur.key).name}${lv(cur.lvl)}</b></span><span class="kv">${statLine(cat, cur.key, cur.lvl)}</span></div>
      ${cur.lvl < MAX_LVL ? `<div class="kv cmp" style="text-align:left;margin-top:4px">Next ${lv(cur.lvl + 1)} <span class="up">${statLine(cat, cur.key, cur.lvl + 1)}</span></div>` : ''}
      <div class="acts">
        ${cur.lvl < MAX_LVL ? `<button class="btn acc" data-act="upgrade" data-id="${cur.id}" data-slot="${slot}" ${S.credits < up ? 'disabled' : ''}>Upgrade ${coin(up)}</button>` : '<button class="btn" disabled>Max level</button>'}
        <button class="btn" data-act="unequip" data-slot="${slot}">Remove</button>
        <button class="btn" data-act="sell" data-id="${cur.id}" data-slot="${slot}">Sell +${coin(Math.floor(cur.spent / 2))}</button>
      </div></div>`;
  }
  const spare = S.inv.filter((x) => x.cat === cat && !used.has(x.id));
  if (spare.length) {
    html += '<h4>Stash</h4>';
    for (const x of spare) {
      const ok = !needFrame && fits(bot, slot, x.key);
      html += `<div class="row"><img alt="" src="${partIcon(cat, x.key)}"><span class="nm"><b>${def(cat, x.key).name}${lv(x.lvl)}</b><span class="kv" style="display:block;text-align:left">${statLine(cat, x.key, x.lvl)}${wtTag(x.key)}</span></span>
        <button class="btn" data-act="sell" data-id="${x.id}" data-slot="${slot}">+${coin(Math.floor(x.spent / 2))}</button>
        <button class="btn acc" data-act="equip" data-id="${x.id}" data-slot="${slot}" ${ok ? '' : 'disabled'}>Fit</button></div>`;
    }
  }
  html += '<h4>Shop</h4>';
  for (const [key, d] of Object.entries(CATS[cat].defs)) {
    const ok = !needFrame && S.credits >= d.cost && fits(bot, slot, key);
    html += `<div class="row"><img alt="" src="${partIcon(cat, key)}"><span class="nm"><b>${d.name}</b><span class="kv" style="display:block;text-align:left">${statLine(cat, key, 1)}${wtTag(key)}</span></span>
      <button class="btn acc" data-act="buy" data-key="${key}" data-slot="${slot}" ${ok ? '' : 'disabled'}>${coin(d.cost)}</button></div>`;
  }
  html += '</div>';
  const sh = $('#sheet');
  const scroll = sh.firstElementChild ? sh.firstElementChild.scrollTop : 0;
  sh.innerHTML = html;
  sh.classList.remove('hidden');
  sh.firstElementChild.scrollTop = scroll;
  sh.dataset.slot = slot;
}
function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheet').innerHTML = ''; }

// ---------- arenas ----------
function teamPower() { return teamUnits().reduce((s, u) => s + power(u.st), 0); }

function renderArenas() {
  const mine = teamPower();
  const n = teamUnits().length;
  let html = `<div class="teambar"><span>Team <b>${n}</b> bot${n === 1 ? '' : 's'}</span><span>PWR <b>${mine}</b></span></div>`;
  ARENAS.forEach((a, i) => {
    const won = S.beaten.includes(i);
    const open = i === 0 || S.beaten.includes(i - 1);
    if (i === 0 || ARENAS[i - 1].league !== a.league) {
      const inL = ARENAS.map((x, j) => j).filter((j) => ARENAS[j].league === a.league);
      const done = inL.filter((j) => S.beaten.includes(j)).length;
      html += `<div class="league"><b>${LEAGUES[a.league]}</b><span>${done}/${inL.length}</span></div>`;
    }
    const foes = enemyUnits(a);
    const ep = foes.reduce((s, u) => s + power(u.st), 0);
    const cls = ep > mine * 1.15 ? 'hi' : ep < mine * 0.85 ? 'lo' : '';
    const pay = won ? Math.round(a.reward * REPLAY_PAYOUT) : a.reward;
    html += `<div class="arena ${won ? 'won' : ''} ${open ? '' : 'locked'} ${a.boss ? 'boss' : ''}">
      <div class="num">${String(i + 1).padStart(2, '0')}</div>
      <div class="mid"><b>${a.name}${a.boss ? ' <span class="tag">BOSS</span>' : ''}</b><div class="foes">${foes.map((u) => `<img alt="" src="${botThumb(u.look, 30)}">`).join('')}</div></div>
      <div class="side"><span class="pw ${cls}">PWR ${ep}</span><span>${coin(pay)}</span></div>
      <button class="btn acc" data-act="fight" data-i="${i}" ${open ? '' : 'disabled'}>${won ? 'Again' : 'Fight'}</button>
    </div>`;
  });
  html += `<div class="foot"><button class="btn" data-act="reset" id="resetBtn">Reset progress</button></div>`;
  $('#view').innerHTML = html;
}

// ---------- battle ----------
let B = null, view = null, arenaIdx = 0, speed = 1, paused = false, endT = 0, raf = 0, last = 0, rt = 0, resultShown = false;

function startBattle(i) {
  const team = teamUnits();
  if (!team.length) { toast('No bot is ready: check the garage'); tab = 'garage'; render(); return; }
  if (team.length < S.bays) toast(`${S.bays - team.length} bot sits out (not ready)`);
  arenaIdx = i;
  const el = $('#battle');
  el.classList.remove('hidden');
  const c = $('#arena');
  const portrait = c.clientHeight > c.clientWidth * 1.05;
  B = createBattle({ teams: [team, enemyUnits(ARENAS[i])], layout: ARENAS[i].layout, seed: (Date.now() % 100000) + 1, portrait, smart: [false, !!ARENAS[i].smart] });
  view = createView(c);
  paused = false; endT = 0; resultShown = false; rt = 0;
  $('#pauseBtn').textContent = 'II';
  $('#result').classList.add('hidden');
  const hint = $('#hint');
  hint.style.opacity = 1;
  setTimeout(() => (hint.style.opacity = 0), 3500);
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

const DT = 1 / 60;
let acc = 0;
function loop(now) {
  raf = requestAnimationFrame(loop);
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!B) return;
  if (!paused) {
    acc += real * speed;
    while (acc >= DT) {
      step(B, DT);
      absorbEvents(view, B);
      B.events.length = 0;
      acc -= DT;
    }
    tickView(view, real * speed);
    rt += real * speed;
  }
  drawBattle(view, B, rt, real);
  const sum = (t, k) => B.bots.filter((x) => x.team === t).reduce((s, x) => s + Math.max(0, x[k]), 0);
  $('#hpA').style.width = (100 * sum(0, 'hp')) / sum(0, 'maxHp') + '%';
  $('#hpB').style.width = (100 * sum(1, 'hp')) / sum(1, 'maxHp') + '%';
  $('#clock').textContent = Math.max(0, Math.ceil(BATTLE_TIME - B.t));
  if (B.over && !resultShown) {
    endT += real;
    if (endT > 1.1) showResult();
  }
}

function showResult() {
  resultShown = true;
  const a = ARENAS[arenaIdx];
  const win = B.winner === 0;
  const first = win && !S.beaten.includes(arenaIdx);
  const pay = Math.round(a.reward * (win ? (first ? 1 : REPLAY_PAYOUT) : LOSS_PAYOUT));
  S.credits += pay;
  if (first) S.beaten.push(arenaIdx);
  save();
  const rows = B.bots.filter((x) => x.team === 0).map((x) =>
    `<tr><td style="color:${x.color}">${x.name}</td><td>${Math.round(x.dmgDone)}</td><td>${x.kills}</td><td>${x.alive ? Math.round((100 * x.hp) / x.maxHp) + '%' : 'KO'}</td></tr>`).join('');
  const next = win && arenaIdx + 1 < ARENAS.length;
  $('#result').innerHTML = `<div class="box">
    <h2 class="${win ? 'win' : 'loss'}">${win ? 'VICTORY' : 'DEFEAT'}</h2>
    <div style="color:var(--muted);font-size:12px">${a.name}${B.timeout ? ' · time' : ''}</div>
    <div class="pay">+${coin(pay)}</div>
    <table><tr><th>BOT</th><th>DMG</th><th>KO</th><th>HP</th></tr>${rows}</table>
    <div class="acts">
      <button class="btn" data-act="leave">Garage</button>
      <button class="btn" data-act="fight" data-i="${arenaIdx}">Retry</button>
      ${next ? `<button class="btn acc" data-act="fight" data-i="${arenaIdx + 1}">Next</button>` : ''}
    </div></div>`;
  $('#result').classList.remove('hidden');
}

function leaveBattle() {
  cancelAnimationFrame(raf);
  B = null;
  $('#battle').classList.add('hidden');
  render();
}

// tap a foe to focus fire; tap it again or empty floor to clear
$('#arena').addEventListener('pointerdown', (e) => {
  if (!B || B.over) return;
  const r = e.currentTarget.getBoundingClientRect();
  const p = screenToWorld(view, e.clientX - r.left, e.clientY - r.top);
  let best = null, bd = Infinity;
  for (const bot of B.bots) {
    if (!bot.alive || bot.team !== 1) continue;
    const d = Math.hypot(bot.x - p.x, bot.y - p.y);
    if (d < bot.st.r + 22 && d < bd) { bd = d; best = bot; }
  }
  B.focus[0] = best && best !== B.focus[0] ? best : null;
  $('#hint').style.opacity = 0;
});

// ---------- preview animation ----------
function previewLoop(now) {
  requestAnimationFrame(previewLoop);
  const c = document.getElementById('preview');
  if (!c || !previewLook) return;
  const ctx = c.getContext('2d');
  const t = now / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  const s = 72 / FRAMES[previewLook.frame].r;
  ctx.setTransform(s, 0, 0, s, c.width / 2, c.height / 2);
  drawBot(ctx, previewLook, 0, 0, -Math.PI / 2, -Math.PI / 2 + Math.sin(t * 0.8) * 0.9, t, { moving: 0.4 });
}
requestAnimationFrame(previewLoop);

// ---------- intro ----------
function showIntro() {
  const sh = $('#sheet');
  sh.innerHTML = `<div class="sheet-in intro"><header><b>Boltyard</b></header>
    <p>Build bots. Win arena fights. Spend the credits. Repeat.</p>
    <ol><li>Garage: tap a slot to fit, buy or upgrade parts.</li>
    <li>Arenas: pick a fight. Bots battle on their own.</li>
    <li>In battle, tap a foe to focus fire.</li></ol>
    <button class="btn acc" style="width:100%;padding:10px" data-act="introdone">Start</button></div>`;
  sh.classList.remove('hidden');
  sh.dataset.slot = '';
}

// ---------- render + events ----------
function render() {
  $('#credits').textContent = S.credits;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'garage') renderGarage(); else { previewLook = null; renderArenas(); }
}

let resetArmed = false;
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  switch (d.act) {
    case 'tab': tab = d.tab; closeSheet(); render(); window.scrollTo(0, 0); break;
    case 'bay': S.sel = +d.i; save(); render(); break;
    case 'unlock': unlockBay(+d.i); break;
    case 'tactic': S.bots[S.sel].tactic = d.t; save(); render(); break;
    case 'slot': openPicker(d.slot); break;
    case 'close': closeSheet(); break;
    case 'equip': equip(d.slot, +d.id); break;
    case 'buy': buy(d.slot, d.key); break;
    case 'upgrade': upgrade(+d.id, d.slot); break;
    case 'unequip': unequip(d.slot); break;
    case 'sell': sell(+d.id, d.slot); break;
    case 'fight': startBattle(+d.i); break;
    case 'leave': leaveBattle(); break;
    case 'quit': leaveBattle(); toast('Left the arena: no pay'); break;
    case 'speed': speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; el.textContent = speed + 'x'; break;
    case 'pause': paused = !paused; el.textContent = paused ? '>' : 'II'; break;
    case 'introdone': S.intro = true; save(); closeSheet(); break;
    case 'reset':
      if (!resetArmed) { resetArmed = true; el.textContent = 'Tap again to wipe save'; setTimeout(() => { resetArmed = false; if (el.isConnected) el.textContent = 'Reset progress'; }, 3000); break; }
      S = fresh(); S.intro = true; save(); tab = 'garage'; resetArmed = false; render(); toast('Progress reset');
      break;
  }
});
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet' && S.intro) closeSheet(); });

render();
if (!S.intro) showIntro();
if (oldSave) toast('New 20-arena campaign: progress reset');

// Small hook so automated tests can read the game state. Not used by the game itself.
window.__boltyard = { get state() { return S; }, get battle() { return B; }, get view() { return view; } };
