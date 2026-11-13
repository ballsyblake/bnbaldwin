// Small painted symbols used in place of words: a coin for gold, a skull for men killed, and so on.
// Each is drawn from a little grid of letters, one letter per pixel, then outlined like the sprites.

const PAL = {
  g: '#f2c14e', G: '#b98a35', y: '#ffe9a8', w: '#efe8d4', W: '#c9c2ae', s: '#c3c9d1', S: '#7e8794', r: '#e0533d', R: '#9a3a2a', p: '#ff9c8c',
  b: '#8a5a30', B: '#5e3b1e', n: '#3fd08a', N: '#2a9a62', k: '#0d0b09', t: '#d9a94a', T: '#a8782e'
};
const ART = {
  gold: ['...ggggg...', '..gyygggG..', '.gygggggGG.', '.gyggGgggG.', '.gggGGGggG.', '.gggGGGggG.', '.ggggGgggG.', '.gggggggGG.', '..GgggGGG..', '...GGGGG...'],
  renown: ['.....y.....', '.....y.....', '....yyy....', 'yyyyyyyyyyy', '.yyyyyyyyy.', '..yyyyyyy..', '..yyyyyyy..', '.yyyy.yyyy.', '.yyy...yyy.', 'yy.......yy'],
  slain: ['s.........s', 'ss.......ss', '.ss.....ss.', '..ss...ss..', '...ss.ss...', '....sss....', '...ss.ss...', '.bss...ssb.', '.bb.....bb.', 'b.b.....b.b'],
  killed: ['..wwwwwww..', '.wwwwwwwww.', '.wwwwwwwww.', '.wkkwwwkkw.', '.wkkwwwkkw.', '.wwwwkwwww.', '..wwwwwww..', '..wkwkwkw..', '..wwwwwww..'],
  wounded: ['.....r.....', '....rrr....', '....rrr....', '...rrrrr...', '..rrrrrrr..', '..rprrrrR..', '..rrrrrRR..', '..rrrrRRR..', '...RRRRR...'],
  prisoners: ['SSSSSSSSSSS', '.s.s.s.s.s.', '.s.s.s.s.s.', '.s.s.s.s.s.', '.s.s.s.s.s.', '.s.s.s.s.s.', '.s.s.s.s.s.', '.s.s.s.s.s.', 'SSSSSSSSSSS'],
  men: ['...sssss...', '..sssssss..', '.sssssssSS.', '.sssssssSS.', '.SSSSSSSSS.', '.ss.sSs.SS.', '.ss.sSs.SS.', '.ss..S..SS.'],
  food: ['..ttttttt..', '.ttTttTttT.', 'ttTttTttTTT', 'ttttttttTTT', 'tttttttTTTT', '.TTTTTTTTT.'],
  health: ['..rr...rr..', '.rrrr.rrrr.', 'rrprrrrrrrR', 'rrrrrrrrrRR', '.rrrrrrrRR.', '..rrrrrRR..', '...rrrRR...', '....rRR....', '.....R.....'],
  train: ['.....n.....', '....nnn....', '...nnnnn...', '..nnnnnnn..', '.nnnnnnnnn.', '....nnN....', '....nnN....', '....nnN....', '....nnN....'],
  quest: ['WwwwwwwwwW.', '.wwwwwwwww.', '.wBBBBBBww.', '.wwwwwwwww.', '.wBBBBBwww.', '.wwwwwwwww.', '.wBBBBBBww.', '.wwwwwwwww.', 'WwwwwwwwwW.'],
  blade: ['.........ss', '........sss', '.......sss.', '......sss..', '.....sss...', '.b..sss....', '.bbsss.....', '..bbs......', '.bbbb......', 'bb..bb.....'],
  morale: ['B..........', 'Bnnnnnnn...', 'BnnnnnnnnN.', 'BnnnnnnnNN.', 'BnnnnnnNN..', 'B..........', 'B..........', 'B..........', 'B..........']
};
const urls = {};
function url(name) {
  if (urls[name]) return urls[name];
  const rows = ART[name], w = 13, h = rows.length + 2;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (PAL[row[x]]) { g.fillStyle = PAL[row[x]]; g.fillRect(x + 1, y + 1, 1, 1); } });
  const d = g.getImageData(0, 0, w, h), a = d.data, solid = [];
  for (let i = 0; i < w * h; i++) solid[i] = a[i * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (solid[k]) continue;
    if ((x > 0 && solid[k - 1]) || (x < w - 1 && solid[k + 1]) || (y > 0 && solid[k - w]) || (y < h - 1 && solid[k + w])) { a[k * 4] = 13; a[k * 4 + 1] = 11; a[k * 4 + 2] = 9; a[k * 4 + 3] = 255; }
  }
  g.putImageData(d, 0, 0);
  return (urls[name] = c.toDataURL());
}
// The symbol as HTML. `label` is what it stands for, for screen readers and for hovering.
export function icon(name, label) { return '<img class="ic" alt="' + label + '" title="' + label + '" src="' + url(name) + '">'; }
// A symbol with a number beside it, and a word underneath for the first few times you see it.
export function tile(name, value, label, cls) { return '<div class="res">' + icon(name, label) + '<b class="' + (cls || '') + '">' + value + '</b><span>' + label + '</span></div>'; }
// A symbol with a number, in a row of others.
export function stat(name, value, label, cls) { return '<span class="st">' + icon(name, label) + '<b class="' + (cls || '') + '">' + value + '</b></span>'; }
