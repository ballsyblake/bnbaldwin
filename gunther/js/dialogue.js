// Story scenes told the way a visual novel tells them: one line at a time in a box at the bottom
// of the screen, with the speaker's portrait and name. Click, tap or press Space for the next line.
// Portraits are painted here from a short description (hair, clothes, a beard, an eye patch), so
// the cast in data/story.json can be changed or added to without drawing anything.

import { showPanel, onKeyPress, panelOpen, esc } from './core.js';
import { STORY } from './data.js';
import { game } from './state.js';

const OUT = '#0d0b09', EYE = '#1d1a16';
const dark = h => '#' + [1, 3, 5].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.78).toString(16).padStart(2, '0')).join('');
const faces = {};

function paintFace(f) {
  const c = document.createElement('canvas'); c.width = 22; c.height = 24;
  const g = c.getContext('2d');
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  if (f.paper) {
    // A letter: parchment, lines of writing and a wax seal.
    r(4, 3, 14, 18, '#efe3c2'); r(16, 3, 2, 18, '#d6c79e');
    for (let y = 6; y < 15; y += 2) r(6, y, y % 4 ? 9 : 7, 1, '#5e3b1e');
    r(9, 16, 4, 4, f.seal || '#8a8f96'); r(10, 17, 2, 2, dark(f.seal || '#8a8f96'));
  } else {
    const skin = f.skin || '#e5b183', skinD = dark(skin), hair = f.hair || '#6a3e22', cloth = f.cloth || '#7a6a52';
    r(3, 18, 16, 5, cloth); r(15, 18, 4, 5, dark(cloth)); r(9, 16, 4, 2, skinD);
    if (f.trim) { r(9, 18, 4, 2, f.trim); r(3, 18, 16, 1, f.trim); }
    if (f.style === 'long') { r(4, 5, 2, 14, hair); r(16, 5, 2, 14, hair); }
    r(6, 5, 10, 12, skin); r(14, 5, 2, 12, skinD);
    r(8, 10, 2, 2, EYE); r(12, 10, 2, 2, EYE);
    if (f.old) { r(7, 12, 1, 1, skinD); r(14, 12, 1, 1, dark(skinD)); r(8, 8, 2, 1, skinD); r(12, 8, 2, 1, skinD); }
    r(9, 14, 4, 1, f.smile ? '#7a2e22' : dark(skinD)); if (f.smile) { r(8, 13, 1, 1, dark(skinD)); r(13, 13, 1, 1, dark(skinD)); }
    if (f.tusks) { r(8, 13, 1, 2, '#efe8d4'); r(13, 13, 1, 2, '#efe8d4'); }
    if (f.beard) { r(6, 13, 10, 5, hair); r(9, 14, 4, 1, dark(hair)); }
    const s = f.style || 'short';
    if (s === 'short' || s === 'long' || s === 'bun') { r(6, 3, 10, 3, hair); r(6, 6, 1, 3, hair); r(15, 6, 1, 3, hair); r(5, 4, 1, 3, hair); r(16, 4, 1, 3, hair); }
    if (s === 'bun') r(9, 1, 4, 2, hair);
    if (s === 'bald') { r(6, 7, 1, 3, hair); r(15, 7, 1, 3, hair); }
    if (s === 'hood') { r(5, 2, 12, 4, f.hood || cloth); r(4, 4, 2, 14, f.hood || cloth); r(16, 4, 2, 14, dark(f.hood || cloth)); }
    if (s === 'cap') { r(6, 2, 10, 3, f.hood || '#3b2a1c'); r(5, 5, 12, 1, f.hood || '#3b2a1c'); r(6, 6, 1, 3, hair); r(15, 6, 1, 3, hair); }
    if (s === 'helm') { r(5, 2, 12, 6, '#c3c9d1'); r(15, 2, 2, 6, '#7e8794'); r(10, 8, 2, 4, '#7e8794'); r(5, 7, 12, 1, '#7e8794'); }
    if (f.circlet) r(6, 5, 10, 1, f.circlet);
    if (f.patch) { r(12, 9, 3, 3, OUT); r(6, 8, 10, 1, OUT); }
  }
  // Dark outline, like every other sprite.
  const d = g.getImageData(0, 0, 22, 24), a = d.data, solid = [];
  for (let i = 0; i < 22 * 24; i++) solid[i] = a[i * 4 + 3] > 0;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 22; x++) {
    const k = y * 22 + x;
    if (!solid[k] && ((x > 0 && solid[k - 1]) || (x < 21 && solid[k + 1]) || (y > 0 && solid[k - 22]) || (y < 23 && solid[k + 22]))) { a[k * 4] = 13; a[k * 4 + 1] = 11; a[k * 4 + 2] = 9; a[k * 4 + 3] = 255; }
  }
  g.putImageData(d, 0, 0);
  return c.toDataURL();
}

// Who is speaking: their name and portrait. The captain's name is whoever leads the warband now.
export function speaker(id) {
  const c = (STORY.cast || {})[id];
  if (!c) return null;
  return { name: id === 'gunther' ? game.hero.first : c.name, right: !!c.right, face: faces[id] || (faces[id] = paintFace(c.face || {})) };
}
// A line of story as plain text, for places that list it rather than play it.
export function lineText(l) { if (typeof l === 'string') return l; const s = l.who && speaker(l.who); return (s ? s.name + ': ' : '') + l.text; }

let live = null;
// Plays lines one at a time. `lines` are strings (the narrator) or { who, text }. When they run out,
// `end.choices` (a list of labels) are offered and `end.pick(i)` is called, or else `end.done()`.
export function talk(title, lines, end) {
  if (!lines.length) return finish();
  let i = 0, shown = 0, timer = null;
  const full = () => lines[i].text || lines[i];
  function finish(k) { clearInterval(timer); live = null; if (end.choices && end.choices.length) end.pick(k); else end.done(); }
  function render() {
    clearInterval(timer);
    const l = lines[i], who = typeof l === 'string' ? null : speaker(l.who), last = i === lines.length - 1;
    const choices = last && end.choices && end.choices.length;
    showPanel('<div class="dhead"><span class="lbl">' + esc(title) + '</span><span class="lbl">' + (i + 1) + ' / ' + lines.length + '</span></div>' +
      '<div class="dbody' + (who && who.right ? ' right' : '') + '">' +
      (who ? '<div class="dface"><img alt="" src="' + who.face + '"><b>' + esc(who.name) + '</b></div>' : '') +
      '<p class="dtext' + (who ? '' : ' narr') + '" data-act="next"></p></div>' +
      '<div class="dnav">' + (choices ? end.choices.map((c, k) => '<button data-act="pick" data-arg="' + k + '"' + (k ? ' class="secondary"' : '') + '>' + esc(c) + '</button>').join('')
        : '<button data-act="next" class="primary">' + (last ? (end.label || 'Continue') : 'Next') + '</button>') +
      (last ? '' : '<button data-act="skip" class="mini secondary">Skip</button>') + '</div>',
      { next, skip: () => { i = lines.length - 1; shown = 1e9; render(); }, pick: k => finish(+k) }, 'dlg');
    const el = document.querySelector('.dtext');
    const draw = () => { el.textContent = full().slice(0, shown); };
    if (shown >= full().length) return draw();
    // The words appear a few letters at a time; a click finishes the line at once.
    timer = setInterval(() => { shown += 2; draw(); if (shown >= full().length) clearInterval(timer); }, 22);
    draw();
  }
  function next() {
    if (shown < full().length) { shown = 1e9; return render(); }
    if (i === lines.length - 1) { if (!(end.choices && end.choices.length)) finish(); return; }
    i++; shown = 0; render();
  }
  live = { next, alive: () => panelOpen() && !!document.querySelector('.panel.dlg') };
  render();
}
onKeyPress(k => { if ((k === ' ' || k === 'enter') && live && live.alive()) { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); live.next(); } });
