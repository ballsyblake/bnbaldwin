// Turns a bot's parts into combat stats. Pure functions, shared by the game and the balance tool.
import { FRAMES, DRIVES, WEAPONS, PLATES, MODULES, lvlMul } from './data.js';

// A "build" is { frame:{key,lvl}, drive:{key,lvl}, weapons:[{key,lvl}], plate:{key,lvl}|null, module:{key,lvl}|null }
export function partsWeight(build) {
  let w = 0;
  if (build.drive) w += DRIVES[build.drive.key].wt;
  for (const x of build.weapons) w += WEAPONS[x.key].wt;
  if (build.plate) w += PLATES[build.plate.key].wt;
  if (build.module) w += MODULES[build.module.key].wt;
  return w;
}

export function buildIssue(build) {
  if (!build.frame) return 'No frame';
  if (!build.drive) return 'No drive';
  if (!build.weapons.length) return 'No weapon';
  if (partsWeight(build) > FRAMES[build.frame.key].cap) return 'Overweight';
  return null;
}

export function botStats(build, hpMul = 1) {
  const F = FRAMES[build.frame.key];
  const fm = lvlMul(build.frame.lvl);
  const D = build.drive ? DRIVES[build.drive.key] : { spd: 0, pull: 1, wt: 0 };
  const dm = build.drive ? lvlMul(build.drive.lvl) : 1;
  const P = build.plate ? PLATES[build.plate.key] : null;
  const M = build.module ? MODULES[build.module.key] : null;
  const mm = build.module ? lvlMul(build.module.lvl) : 1;

  let hp = F.hp * fm;
  let arm = D.arm || 0;
  if (P) {
    hp += P.hp * lvlMul(build.plate.lvl);
    arm += P.arm + (build.plate.lvl >= 3 ? 1 : 0);
  }
  hp = Math.round(hp * hpMul);

  const pw = partsWeight(build);
  const total = F.wt + pw;
  let spd = D.spd * dm * Math.min(1, D.pull * dm / total);
  if (M && M.spdMul) spd *= 1 + M.spdMul * mm;

  const rofMul = M && M.rofMul ? 1 + M.rofMul * mm : 1;
  const weapons = build.weapons.map((w) => {
    const W = WEAPONS[w.key];
    return { ...W, key: w.key, lvl: w.lvl, dmg: W.dmg * lvlMul(w.lvl), rof: W.rof * rofMul };
  });
  const dps = weapons.reduce((s, w) => s + w.dmg * (w.pellets || 1) * w.rof, 0);
  const range = weapons.length ? Math.max(...weapons.map((w) => w.range)) : 0;
  const minRange = weapons.length ? Math.min(...weapons.map((w) => w.range)) : 0;

  return {
    frame: build.frame.key, drive: build.drive && build.drive.key, plate: build.plate && build.plate.key,
    module: build.module && build.module.key,
    r: F.r, hp, arm, spd: Math.round(spd), wt: pw, cap: F.cap, weapons,
    dps: Math.round(dps * 10) / 10, range, minRange,
    regen: M && M.regen ? M.regen * mm : 0,
    shield: M && M.shield ? Math.round(M.shield * mm) : 0,
  };
}

// One number to compare teams at a glance. Not used by the simulation.
export function power(st) {
  const tough = (st.hp + st.shield * 1.5 + st.regen * 25) * (1 + st.arm * 0.18);
  const reach = 0.7 + st.range / 700;
  const move = 0.65 + st.spd / 260;
  return Math.round(Math.sqrt(tough * st.dps * reach * move));
}

export function enemyBuild(spec) {
  const L = spec.lv;
  return {
    frame: { key: spec.f, lvl: L }, drive: { key: spec.d, lvl: L },
    weapons: spec.w.map((k) => ({ key: k, lvl: L })),
    plate: spec.p ? { key: spec.p, lvl: L } : null,
    module: spec.m ? { key: spec.m, lvl: L } : null,
  };
}

// Tactic an enemy bot uses: its own if set, otherwise one that suits its weapons.
export function enemyTactic(spec, i) {
  if (spec.t) return spec.t;
  const ranges = spec.w.map((k) => WEAPONS[k].range);
  const mn = Math.min(...ranges);
  if (mn >= 220) return 'range';
  if (mn <= 20) return 'rush';
  return i % 2 ? 'flank' : 'rush';
}
