/**
 * genDemoData.mjs — public-facing sample backup for the analyzer demo.
 *
 * Smaller, lighter cousin of genMarketingData.mjs. Output is committed to
 * public/demo-backup.json and served by the "Try with demo data" button on
 * the analyzer landing page, so it must load fast: target < 1.5 MB.
 *
 * Trade-offs vs. the marketing dataset:
 *   - 52 weeks instead of 58 (still two full season cycles for Compare).
 *   - 2-3 sessions/week instead of 4-6.
 *   - Profiles sampled every 2 s (depth/pool) and every 3 s (oxy).
 *   - Warmup dives carry summary stats only (no per-second profile).
 *
 * The result is enough to populate every analyzer view richly while still
 * letting a visitor compare two seasons end-to-end. Deterministic seed so
 * the demo stays stable across releases.
 *
 * Output: public/demo-backup.json (committed).
 * Run:    node scripts/genDemoData.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let _seed = 20260516;
const rnd = () => {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 4294967296;
};
const rng = (lo, hi) => lo + rnd() * (hi - lo);
const irng = (lo, hi) => Math.floor(rng(lo, hi + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 1) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
const wpick = (weights) => {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (const [k, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
};

const WEEKS = 52;
const END = new Date('2026-05-10T00:00:00');
const weekStart = (w) => {
  const d = new Date(END);
  d.setDate(d.getDate() - (WEEKS - 1 - w) * 7);
  return d;
};
const dateAt = (w, dayOffset, hour) => {
  const d = weekStart(w);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, irng(0, 59), 0, 0);
  return d;
};
const fmtDuration = (totalSec) => {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
};

const CYCLE_LEN = 26;
function plan(week) {
  const cycle = week < CYCLE_LEN ? 1 : 2;
  const w = week % CYCLE_LEN;
  let phase;
  if (w < 9) phase = 'base';
  else if (w < 18) phase = 'build';
  else if (w < 24) phase = 'peak';
  else phase = 'taper';

  const ramp =
    phase === 'base' ? w / 9 :
    phase === 'build' ? (w - 9) / 9 :
    phase === 'peak' ? (w - 18) / 6 :
    (w - 24) / 2;

  // Cycle 2 reaches deeper and longer — a noticeable Compare delta.
  const cyclePeakDepth = cycle === 1 ? 62 : 78;
  const cyclePeakHold = cycle === 1 ? 300 : 384;
  const cyclePeakDyn = cycle === 1 ? 115 : 148;

  const phaseFactor =
    phase === 'base' ? 0.55 + ramp * 0.1 :
    phase === 'build' ? 0.65 + ramp * 0.22 :
    phase === 'peak' ? 0.88 + ramp * 0.12 :
    0.9;

  const depthCeil = cyclePeakDepth * phaseFactor;
  const holdCeil = cyclePeakHold * phaseFactor;
  const dynCeil = cyclePeakDyn * phaseFactor;

  // Two sessions per week is the comfortable baseline; peak gets a third.
  const sessionsPerWeek =
    phase === 'base' ? irng(2, 3) :
    phase === 'build' ? irng(2, 3) :
    phase === 'peak' ? irng(2, 3) :
    irng(1, 2);

  const modeWeights =
    phase === 'base' ? { dry: 46, pool: 34, depth: 20 } :
    phase === 'build' ? { dry: 30, pool: 30, depth: 40 } :
    phase === 'peak' ? { dry: 20, pool: 22, depth: 58 } :
    { dry: 32, pool: 20, depth: 48 };

  const isCompWeek = phase === 'taper' && w === CYCLE_LEN - 1;

  return { cycle, phase, w, ramp, depthCeil, holdCeil, dynCeil, sessionsPerWeek, modeWeights, isCompWeek, cyclePeakDepth };
}

const ease = (t) => t * t * (3 - 2 * t);
const glitch = (v, p, mag) => (chance(p) ? v + rng(-mag, mag) : v);

const DEPTH_DISCIPLINES = ['CWT', 'CWT', 'CWT', 'FIM', 'FIM', 'CWTB', 'CNF'];
const DEPTH_SPOTS = ['Blue Hole, Dahab', 'Y-40 Deep Joy', 'Lake Garda', 'Amed, Bali', 'Vobster Quay', 'Kalamata'];

function makeDepthDive(si, targetDepth, discipline, diveType) {
  const depth = round(clamp(targetDepth, 8, 92), 1);
  const trained = clamp(depth / 80, 0.3, 1);

  const descentSpeed = round(rng(0.95, 1.05) + trained * 0.22, 2);
  const ascentSpeed = round(rng(0.82, 0.96) + trained * 0.16, 2);
  const descentTime = depth / descentSpeed;
  const hangTime = discipline === 'CWTB' ? rng(2, 6) : rng(0, 3.5);
  const ascentTime = depth / ascentSpeed;
  const diveTime = Math.round(descentTime + hangTime + ascentTime);

  const surfaceTemp = round(rng(20, 26), 1);
  const deepTemp = round(rng(13, 17), 1);
  const thermocline = depth * rng(0.4, 0.6);

  const hrStart = irng(68, 82);
  const hrBottom = irng(43, 56);
  const hrEnd = irng(74, 96);

  // Warmups skip the profile array to keep the demo file lean — the
  // session list / aggregations still see them, the player just shows
  // "no profile recorded" for those rows.
  const includeProfile = diveType !== 'warmup' && diveType !== 'safety';
  const profile = [];
  if (includeProfile) {
    // Sample every 2 s instead of 1 s. Still smooth at chart resolution.
    for (let t = 0; t <= diveTime; t += 2) {
      let d;
      let phase01;
      if (t <= descentTime) {
        const p = t / descentTime;
        d = depth * ease(p);
        phase01 = p;
      } else if (t <= descentTime + hangTime) {
        d = depth;
        phase01 = 1;
      } else {
        const p = (t - descentTime - hangTime) / ascentTime;
        d = depth * (1 - ease(p));
        phase01 = 1 - p;
      }
      d = clamp(d + rng(-0.15, 0.15), 0, depth + 0.5);

      const hr =
        t <= descentTime + hangTime
          ? hrStart + (hrBottom - hrStart) * ease(phase01)
          : hrBottom + (hrEnd - hrBottom) * ease(1 - phase01);

      let v;
      if (t <= descentTime) v = -descentSpeed;
      else if (t <= descentTime + hangTime) v = 0;
      else v = ascentSpeed;
      v = round(v + rng(-0.12, 0.12), 2);

      const tempT = d < thermocline ? d / thermocline : 1;
      const temp = round(surfaceTemp + (deepTemp - surfaceTemp) * ease(tempT) + rng(-0.2, 0.2), 1);

      profile.push({
        t,
        d: round(d, 1),
        v,
        hr: Math.round(glitch(hr, 0.012, 14)),
        temp,
      });
    }
  }

  const hangs = [];
  if (hangTime > 1.8) {
    hangs.push({
      startT: Math.round(descentTime),
      endT: Math.round(descentTime + hangTime),
      avgD: round(depth - rng(0, 0.6), 1),
      type: 'bottom',
    });
  }

  // Mouthfill + first-contraction markers on deeper trained dives.
  const isDeepTrained = depth > 28 && diveType !== 'warmup' && diveType !== 'safety';
  const mfChargeDepth = isDeepTrained && chance(0.6) ? round(depth * rng(0.35, 0.55), 1) : null;
  const contractionOnset = isDeepTrained
    ? { depth: round(depth * rng(0.45, 0.7), 1), direction: chance(0.75) ? 'up' : 'down' }
    : null;

  const avgHr = includeProfile
    ? Math.round(profile.reduce((a, p) => a + p.hr, 0) / profile.length)
    : Math.round((hrStart + hrBottom + hrEnd) / 3);

  return {
    si,
    discipline,
    diveType,
    depth,
    diveTime,
    descentTime: Math.round(descentTime),
    hangTime: Math.round(hangTime),
    ascentTime: Math.round(ascentTime),
    descentSpeed,
    ascentSpeed,
    hr: avgHr,
    tempDepth: deepTemp,
    hangs,
    mfChargeDepth,
    contractionOnset,
    profile,
  };
}

function makeDepthSession(week, p, dayOffset) {
  const date = dateAt(week, dayOffset, irng(8, 15));
  const discipline = pick(DEPTH_DISCIPLINES);
  const ceil = p.depthCeil;

  const dives = [];
  let si = 0;
  for (let i = 0; i < 2; i++) {
    dives.push(makeDepthDive(si++, ceil * rng(0.3, 0.5), discipline, 'warmup'));
  }
  const trainingCount = irng(2, 4);
  for (let i = 0; i < trainingCount; i++) {
    const frac = 0.6 + (i / trainingCount) * 0.4;
    dives.push(makeDepthDive(si++, ceil * frac * rng(0.95, 1.05), discipline, 'training'));
  }
  const isComp = p.isCompWeek && dayOffset >= 4;
  dives.push(
    makeDepthDive(
      si++,
      isComp ? p.cyclePeakDepth * rng(0.99, 1.03) : ceil * rng(1.0, 1.08),
      discipline,
      isComp ? 'competition' : 'training',
    ),
  );
  if (chance(0.3)) dives.push(makeDepthDive(si++, ceil * rng(0.25, 0.4), discipline, 'safety'));

  const maxDepth = Math.max(...dives.map((d) => d.depth));
  const totalSec = dives.reduce((a, d) => a + d.diveTime, 0) + dives.length * irng(150, 260);

  // A single manual hang correction somewhere in cycle 2 to demonstrate
  // the originalHangs schema in the wild.
  if (p.cycle === 2 && week === CYCLE_LEN + 14 && dayOffset === 0) {
    const target = dives.find((d) => d.hangs.length > 0);
    if (target) {
      target.originalHangs = JSON.parse(JSON.stringify(target.hangs));
      target.hangs[0].endT += 2;
      target.hangs[0].avgD = round(target.hangs[0].avgD - 0.2, 1);
    }
  }

  const alarms = [
    { type: 'depth', depth: 20, time: null, speed: null, enabled: true, triggerOnDescent: true, triggerOnAscent: false, repeating: false },
    { type: 'depth', depth: 30, time: null, speed: null, enabled: true, triggerOnDescent: false, triggerOnAscent: true, repeating: false },
    { type: 'depth', depth: Math.round(maxDepth * 0.8), time: null, speed: null, enabled: true, triggerOnDescent: true, triggerOnAscent: true, repeating: false },
  ];

  return {
    id: date.getTime() + irng(1, 999),
    date: date.toISOString(),
    name: isComp ? 'Competition' : pick(['Depth training', 'Deep session', 'CWT progression', 'Line training']),
    mode: 'depth',
    blocks: dives.length,
    duration: fmtDuration(totalSec),
    rating: isComp ? irng(4, 5) : irng(2, 5),
    breathingStyle: pick(['Relaxed', 'Box breathing', 'Long exhale']),
    maxDepth,
    discipline,
    location: pick(DEPTH_SPOTS),
    remarks: isComp ? 'Clean dive, good card.' : chance(0.2) ? pick(['Felt strong on the bottom turn.', 'Equalisation a touch late.', 'Relaxed descent, fast ascent.']) : null,
    alarms,
    dives,
  };
}

function makePoolDive(discipline, targetDistance, poolLen, diveType, ceilDyn) {
  if (discipline === 'STA') {
    const diveTime = Math.round(clamp(ceilDyn * rng(1.6, 2.2), 90, 420));
    const hrStart = irng(72, 88);
    const hrBottom = irng(46, 58);
    const profile = [];
    // Sample every 2 s.
    for (let t = 0; t <= diveTime; t += 2) {
      const p01 = t / diveTime;
      const hr = hrStart + (hrBottom - hrStart) * ease(Math.min(1, p01 * 1.4));
      profile.push({ t, hr: Math.round(glitch(hr, 0.01, 12)), depth: 0, speed: 0 });
    }
    const contractions = [];
    for (let s = diveTime * rng(0.5, 0.62); s < diveTime; s += rng(7, 13)) {
      contractions.push(Math.round(s));
    }
    return {
      discipline, diveType, distance: null, diveTime,
      rating: irng(2, 5),
      hr: Math.round(profile.reduce((a, x) => a + x.hr, 0) / profile.length),
      lapTimes: [], contractions, profile,
    };
  }

  const distance = Math.round(clamp(targetDistance, 25, 175) / poolLen) * poolLen || poolLen;
  const laps = Math.max(1, Math.round(distance / poolLen));
  const baseSpeed = rng(0.78, 1.0);
  const diveTime = Math.round(distance / baseSpeed);

  const lapTimes = [];
  for (let i = 0; i < laps; i++) {
    const fatigue = 1 + (i / Math.max(1, laps)) * 0.18;
    lapTimes.push(round((poolLen / baseSpeed) * fatigue * rng(0.94, 1.06), 1));
  }
  const scale = diveTime / lapTimes.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lapTimes.length; i++) lapTimes[i] = round(lapTimes[i] * scale, 1);

  const hrStart = irng(82, 98);
  const hrBottom = irng(54, 66);
  const hrEnd = irng(88, 108);
  // Warmups frequently lack HR; training always has it.
  const hasHr = diveType !== 'warmup' || chance(0.5);
  const includeProfile = diveType !== 'warmup';

  const profile = [];
  if (includeProfile) {
    for (let t = 0; t <= diveTime; t += 2) {
      const p01 = t / diveTime;
      const hr =
        p01 < 0.7
          ? hrStart + (hrBottom - hrStart) * ease(p01 / 0.7)
          : hrBottom + (hrEnd - hrBottom) * ease((p01 - 0.7) / 0.3);
      const kick = discipline === 'DNF' ? 0.34 : 0.2;
      const speed = round(baseSpeed * (1 + Math.sin(t * 0.9) * kick) * rng(0.92, 1.08), 2);
      const depth = round(clamp(1.1 + Math.sin(t * 0.55) * 0.8, 0.1, 2.6), 1);
      profile.push({
        t,
        hr: hasHr ? Math.round(glitch(hr, 0.012, 12)) : 0,
        depth,
        speed,
      });
    }
  }

  const contractions = [];
  for (let s = diveTime * rng(0.55, 0.7); s < diveTime; s += rng(8, 14)) {
    contractions.push(Math.round(s));
  }

  const dive = {
    discipline, diveType, distance, diveTime,
    rating: irng(2, 5),
    lapTimes, contractions,
  };
  if (includeProfile) {
    if (hasHr) {
      dive.hr = Math.round(profile.reduce((a, x) => a + x.hr, 0) / profile.length);
    }
    dive.profile = profile;
    if (hasHr) dive.hrProfile = profile.map((x) => ({ t: x.t, hr: x.hr }));
  }
  return dive;
}

const POOL_DISCIPLINES = ['DYN', 'DYN', 'DNF', 'DYNB', 'STA'];

// Pool session-type tags map to phases roughly the way a real coach
// programs them — base = volume + CO2 builders, build = mixed, peak =
// speed + max efforts, taper = recovery.
function pickPoolSessionType(phase, focus) {
  if (focus === 'STA') return wpick({ O2: 60, CO2: 30, RC: 10 });
  if (phase === 'base')  return wpick({ VOL: 36, CO2: 28, TE: 20, FUN: 16 });
  if (phase === 'build') return wpick({ CO2: 28, O2: 22, VOL: 22, SP: 16, TE: 12 });
  if (phase === 'peak')  return wpick({ SP: 30, MAX: 22, O2: 22, CO2: 16, TE: 10 });
  return wpick({ RC: 48, TE: 28, FUN: 24 });
}

function makePoolSession(week, p, dayOffset) {
  const date = dateAt(week, dayOffset, irng(7, 20));
  const poolLen = chance(0.6) ? 25 : 50;
  const focus = pick(POOL_DISCIPLINES);
  const ceil = p.dynCeil;

  const dives = [];
  for (let i = 0; i < irng(2, 3); i++) {
    dives.push(makePoolDive(focus === 'STA' ? 'DYN' : focus, ceil * rng(0.3, 0.5), poolLen, 'warmup', ceil));
  }
  const setCount = irng(2, 4);
  for (let i = 0; i < setCount; i++) {
    const frac = 0.6 + (i / setCount) * 0.45;
    dives.push(makePoolDive(focus, ceil * frac * rng(0.95, 1.06), poolLen, 'training', ceil));
  }
  dives.push(makePoolDive(focus, ceil * rng(1.0, 1.1), poolLen, 'training', ceil * 1.05));

  const totalDistance = dives.reduce((a, d) => a + (d.distance ?? 0), 0);
  const totalSec = dives.reduce((a, d) => a + d.diveTime, 0) + dives.length * irng(120, 220);

  return {
    id: date.getTime() + irng(1, 999),
    date: date.toISOString(),
    name: pick(['Pool intervals', 'DYN technique', 'CO₂ pool set', 'Distance session', 'Pool training']),
    mode: 'pool',
    blocks: dives.length,
    duration: fmtDuration(totalSec),
    rating: irng(2, 5),
    breathingStyle: pick(['Relaxed', 'Box breathing']),
    totalDistance,
    poolType: poolLen === 25 ? '25m' : '50m',
    sessionType: pickPoolSessionType(p.phase, focus),
    remarks: chance(0.2) ? pick(['Good glide phase today.', 'Turns need work.', 'Strong final effort.']) : null,
    dives,
  };
}

function makeTimeline(tag, holdCeil) {
  const blocks = [];
  if (tag === 'co2_table') {
    const holdLen = Math.round(holdCeil * rng(0.5, 0.62));
    let rest = Math.round(holdLen * rng(1.1, 1.3));
    const n = irng(5, 7);
    blocks.push({ type: 'Rest', seconds: 120 });
    for (let i = 0; i < n; i++) {
      blocks.push({ type: 'Hold', seconds: holdLen + irng(-4, 4), rating: irng(2, 4) });
      if (i < n - 1) blocks.push({ type: 'Rest', seconds: Math.max(20, rest) });
      rest -= Math.round(holdLen * 0.12);
    }
  } else if (tag === 'o2_table') {
    let holdLen = Math.round(holdCeil * rng(0.45, 0.55));
    const rest = 120;
    const n = irng(5, 7);
    blocks.push({ type: 'Rest', seconds: 120 });
    for (let i = 0; i < n; i++) {
      blocks.push({ type: 'Hold', seconds: holdLen, rating: irng(2, 4) });
      if (i < n - 1) blocks.push({ type: 'Rest', seconds: rest });
      holdLen += Math.round(holdCeil * rng(0.05, 0.09));
    }
  } else {
    const n = tag === 'recovery' ? irng(2, 3) : irng(3, 5);
    const top = tag === 'pb_attempt' ? holdCeil * rng(1.0, 1.08) : holdCeil * rng(0.82, 0.95);
    blocks.push({ type: 'Rest', seconds: 180 });
    for (let i = 0; i < n; i++) {
      const frac = 0.55 + (i / Math.max(1, n - 1)) * 0.45;
      blocks.push({ type: 'Hold', seconds: Math.round(top * frac), rating: irng(2, 5) });
      if (i < n - 1) blocks.push({ type: 'Recover', seconds: irng(45, 75) });
      blocks.push({ type: 'Rest', seconds: irng(120, 240) });
    }
  }
  return blocks;
}

function makeDrySession(week, p, dayOffset) {
  const date = dateAt(week, dayOffset, irng(6, 22));
  const tag = p.isCompWeek
    ? 'recovery'
    : wpick({ co2_table: 28, o2_table: 24, comfy: 22, pb_attempt: 14, recovery: 12 });
  const timeline = makeTimeline(tag, p.holdCeil);
  const holds = timeline.filter((b) => b.type === 'Hold');

  const playStart = irng(6000, 18000);
  const hasOxy = chance(0.75);

  const oxyReadings = [];
  const contractions = [];
  let spo2 = 98;
  let hr = irng(64, 74);
  let cursor = 0;
  let holdIdx = -1;
  const OXY_STEP = 3; // every 3 seconds — keeps the file small.

  for (const block of timeline) {
    if (block.type === 'Hold') holdIdx++;
    const dur = block.seconds;
    for (let s = 0; s < dur; s++) {
      const within = s / dur;
      if (block.type === 'Rest') {
        spo2 += (rng(97.8, 99.2) - spo2) * 0.25;
        hr += (rng(62, 74) - hr) * 0.15;
      } else if (block.type === 'Hold') {
        if (within > 0.38) {
          const decline = (within - 0.38) ** 1.7 * (dur / 60) * rng(0.9, 1.3);
          spo2 -= decline * 0.5;
        }
        const hrTarget = within < 0.85 ? rng(46, 56) : rng(52, 64);
        hr += (hrTarget - hr) * 0.08;
        if (within > rng(0.52, 0.62) && chance(0.16)) {
          contractions.push({ elapsed: Math.round(cursor + s), holdIdx });
        }
      } else {
        if (s < 12) spo2 -= rng(0.3, 0.9);
        else spo2 += (rng(96.5, 98) - spo2) * 0.12;
        hr += ((s < 6 ? rng(92, 108) : rng(74, 84)) - hr) * 0.25;
      }
      spo2 = clamp(spo2, 62, 100);
      hr = clamp(hr, 38, 130);

      if (hasOxy && (cursor + s) % OXY_STEP === 0) {
        const tMs = playStart + (cursor + s) * 1000;
        oxyReadings.push({
          t: tMs,
          s: Math.round(glitch(spo2, 0.015, 7)),
          h: Math.round(glitch(hr, 0.015, 18)),
          p: round(rng(2.5, 7.5), 1),
        });
      }
    }
    cursor += dur;
  }

  if (hasOxy) {
    for (let tMs = 0; tMs < playStart; tMs += OXY_STEP * 1000) {
      oxyReadings.unshift({ t: tMs, s: irng(97, 99), h: irng(66, 78), p: round(rng(3, 7), 1) });
    }
    oxyReadings.sort((a, b) => a.t - b.t);
  }

  // Lung volume: most sessions are at FRC (relaxed exhale), max attempts
  // tend to be FL (full lung), some advanced training at RV (residual).
  const lungVol = tag === 'pb_attempt'
    ? wpick({ FL: 70, FRC: 20, RV: 10 })
    : tag === 'o2_table'
      ? wpick({ FRC: 40, FL: 50, RV: 10 })
      : wpick({ FRC: 60, FL: 30, RV: 10 });

  const totalSec = cursor;
  return {
    id: date.getTime() + irng(1, 999),
    date: date.toISOString(),
    name:
      tag === 'co2_table' ? 'CO₂ table' :
      tag === 'o2_table' ? 'O₂ table' :
      tag === 'pb_attempt' ? 'Max attempt' :
      tag === 'recovery' ? 'Recovery breathing' :
      'Comfortable holds',
    mode: 'dry',
    blocks: timeline.length,
    duration: fmtDuration(totalSec),
    rating: irng(2, 5),
    sessionTag: tag,
    lungVol,
    breathingStyle: pick(['Relaxed', 'Box breathing', 'Long exhale']),
    cyclesCount: holds.length,
    playStart,
    blockTimeline: timeline,
    contractions,
    oxyReadings,
  };
}

const sessions = [];

for (let week = 0; week < WEEKS; week++) {
  const p = plan(week);
  // Fixed weekly deep day (day 0) keeps season-over-season depth
  // progression continuous in the Compare overlay.
  const days = [0];
  while (days.length < p.sessionsPerWeek) {
    const d = irng(1, 6);
    if (!days.includes(d)) days.push(d);
  }
  days.sort((a, b) => a - b);

  days.forEach((day) => {
    const mode = day === 0 ? 'depth' : wpick(p.modeWeights);
    if (mode === 'depth') sessions.push(makeDepthSession(week, p, day));
    else if (mode === 'pool') sessions.push(makePoolSession(week, p, day));
    else sessions.push(makeDrySession(week, p, day));
  });
}

sessions.sort((a, b) => new Date(a.date) - new Date(b.date));

const backup = {
  appId: 'element08',
  schemaVersion: 3,
  appVersion: '1.0.0',
  buildNumber: '21',
  exportedAt: new Date('2026-05-12T18:30:00').toISOString(),
  data: {
    sessions,
    settings: { units: 'metric' },
    programs: [],
    plans: [],
    customCharts: [],
  },
};

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'public', 'demo-backup.json');
writeFileSync(outPath, JSON.stringify(backup));

const counts = sessions.reduce((acc, s) => ((acc[s.mode] = (acc[s.mode] || 0) + 1), acc), {});
const sizeKb = (Buffer.byteLength(JSON.stringify(backup)) / 1024).toFixed(0);
const iso = (d) => d.toISOString().slice(0, 10);
console.log(`Wrote ${outPath}`);
console.log(`  ${sessions.length} sessions over ${WEEKS} weeks — depth ${counts.depth}, pool ${counts.pool}, dry ${counts.dry}`);
console.log(`  ${sizeKb} KB`);
console.log(`  range ${sessions[0].date.slice(0, 10)} → ${sessions[sessions.length - 1].date.slice(0, 10)}`);
console.log(`  compare anchors — season 1: ${iso(weekStart(25))}  ·  season 2: ${iso(weekStart(51))}`);
