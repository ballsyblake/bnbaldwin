// Sound effects made in code with the Web Audio API: no sound files to download.
// Each sound is a short burst of noise or a tone with a quick fade. Battle events are throttled so
// 4x speed or a scatter volley does not stack dozens of copies of the same sound.
const KEY = 'boltyard.snd';
let ctx = null, master = null, noiseBuf = null;
let on = true;
try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* no storage */ }
const lastAt = {};

export const soundOn = () => on;
export function setSound(v) {
  on = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* */ }
  if (master) master.gain.value = v ? 0.5 : 0;
}

// Browsers (iPhone Safari especially) only allow audio after a tap, so call this from a tap handler.
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = on ? 0.5 : 0;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function env(g, t, a, len, vol) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
}
function noise(len, freq, vol, type = 'lowpass', at = 0) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ctx.createGain(); env(g, t, 0.004, len, vol);
  s.connect(f).connect(g).connect(master);
  s.start(t); s.stop(t + len + 0.02);
}
function tone(f0, f1, len, vol, type = 'square', at = 0) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
  const g = ctx.createGain(); env(g, t, 0.005, len, vol);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + len + 0.02);
}

const SOUNDS = {
  rivet: () => noise(0.05, 3200, 0.12, 'highpass'),
  scatter: () => noise(0.12, 1400, 0.25),
  lobber: () => { tone(160, 60, 0.18, 0.18, 'sine'); noise(0.1, 600, 0.15); },
  rail: () => { tone(1800, 200, 0.25, 0.1, 'sawtooth'); noise(0.08, 4000, 0.15, 'highpass'); },
  beam: () => tone(900, 1500, 0.14, 0.07, 'sawtooth'),
  spark: () => noise(0.04, 5000, 0.08, 'highpass'),
  hit: () => noise(0.04, 2000, 0.06, 'bandpass'),
  shield: () => tone(600, 1200, 0.1, 0.05, 'triangle'),
  boom: () => { noise(0.35, 500, 0.35); tone(90, 40, 0.3, 0.2, 'sine'); },
  die: () => { noise(0.7, 350, 0.5); tone(120, 30, 0.6, 0.3, 'sawtooth'); },
  tick: () => tone(660, 660, 0.08, 0.08, 'square'),
  go: () => tone(990, 990, 0.25, 0.1, 'square'),
  star: () => tone(880, 1760, 0.15, 0.08, 'triangle'),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 0.09, 'square', i * 0.11)),
  loss: () => [392, 330, 262].forEach((f, i) => tone(f, f * 0.97, 0.25, 0.08, 'triangle', i * 0.16)),
};
const GAP = { rivet: 0.07, hit: 0.05, spark: 0.06, beam: 0.08, scatter: 0.08, boom: 0.06, shield: 0.08 };

export function play(name) {
  if (!on || !ctx || !SOUNDS[name]) return;
  const now = ctx.currentTime;
  if (now - (lastAt[name] || -1) < (GAP[name] || 0.03)) return;
  lastAt[name] = now;
  SOUNDS[name]();
}

// Turn one simulation event into a sound.
export function eventSound(e) {
  switch (e.k) {
    case 'muzzle': play(e.wk === 'rail' ? 'rail' : e.wk === 'lobber' ? 'lobber' : e.wk === 'scatter' ? 'scatter' : 'rivet'); break;
    case 'beam': play('beam'); break;
    case 'spark': play('spark'); break;
    case 'hit': play('hit'); break;
    case 'shield': play('shield'); break;
    case 'boom': play('boom'); break;
    case 'die': play('die'); break;
  }
}
