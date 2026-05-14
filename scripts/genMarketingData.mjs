/**
 * genMarketingData.mjs — synthetic .e08backup.json for marketing screenshots.
 *
 * Produces ~14 months of believable training data for one well-rounded
 * competitive freediver across two season cycles (base → build → peak →
 * taper/competition), covering all three modes (depth, pool, dry holds)
 * with full 1 Hz profiles so every analyzer screen renders rich.
 *
 * Output: marketing-data/element08-demo-backup.json (gitignored).
 * Run:    node scripts/genMarketingData.mjs
 *
 * Deterministic — a fixed RNG seed means reruns produce the identical
 * file, so screenshots stay stable.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ── deterministic RNG ───────────────────────────────────────────────────────
let _seed = 20260514;
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
/** Weighted pick: weights = { key: weight }. */
const wpick = (weights) => {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (const [k, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
};

// ── timeline ────────────────────────────────────────────────────────────────
const WEEKS = 58;
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

// ── per-week training plan ──────────────────────────────────────────────────
// Two ~29-week cycles. Each: base (0-9), build (10-19), peak (20-26),
// taper/comp (27-28). Cycle 2 reaches deeper / longer than cycle 1.
const CYCLE_LEN = 29;
function plan(week) {
  const cycle = week < CYCLE_LEN ? 1 : 2;
  const w = week % CYCLE_LEN;
  let phase;
  if (w < 10) phase = 'base';
  else if (w < 20) phase = 'build';
  else if (w < 27) phase = 'peak';
  else phase = 'taper';

  // Within-phase 0..1 ramp.
  const ramp =
    phase === 'base' ? w / 10 :
    phase === 'build' ? (w - 10) / 10 :
    phase === 'peak' ? (w - 20) / 7 :
    (w - 27) / 2;

  // Season-best ceilings, climbing across the cycle and between cycles.
  const cyclePeakDepth = cycle === 1 ? 64 : 80;
  const cyclePeakHold = cycle === 1 ? 310 : 392; // seconds
  const cyclePeakDyn = cycle === 1 ? 118 : 152; // metres

  const phaseFactor =
    phase === 'base' ? 0.55 + ramp * 0.1 :
    phase === 'build' ? 0.65 + ramp * 0.22 :
    phase === 'peak' ? 0.88 + ramp * 0.12 :
    0.9; // taper holds back, comp dive added separately

  const depthCeil = cyclePeakDepth * phaseFactor;
  const holdCeil = cyclePeakHold * phaseFactor;
  const dynCeil = cyclePeakDyn * phaseFactor;

  const sessionsPerWeek =
    phase === 'base' ? irng(4, 5) :
    phase === 'build' ? irng(4, 6) :
    phase === 'peak' ? irng(3, 5) :
    irng(2, 3);

  const modeWeights =
    phase === 'base' ? { dry: 46, pool: 34, depth: 20 } :
    phase === 'build' ? { dry: 30, pool: 30, depth: 40 } :
    phase === 'peak' ? { dry: 20, pool: 22, depth: 58 } :
    { dry: 32, pool: 20, depth: 48 };

  const isCompWeek = phase === 'taper' && w === 28;

  return { cycle, phase, w, ramp, depthCeil, holdCeil, dynCeil, sessionsPerWeek, modeWeights, isCompWeek, cyclePeakDepth };
}

// ── physiology curve helpers ────────────────────────────────────────────────
/** Smooth 0..1 ease. */
const ease = (t) => t * t * (3 - 2 * t);
/** Occasional sensor glitch spike (cleanOxyReadings filters these). */
const glitch = (v, p, mag) => (chance(p) ? v + rng(-mag, mag) : v);

// ── depth dive ──────────────────────────────────────────────────────────────
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

  const profile = [];
  for (let t = 0; t <= diveTime; t++) {
    let d;
    let phase01; // 0 at surface-out, 1 at bottom
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

    // HR: dips through the dive (dive reflex), recovers on the way up.
    const hr =
      t <= descentTime + hangTime
        ? hrStart + (hrBottom - hrStart) * ease(phase01)
        : hrBottom + (hrEnd - hrBottom) * ease(1 - phase01);

    // Vertical speed: signed, descent negative.
    let v;
    if (t <= descentTime) v = -descentSpeed;
    else if (t <= descentTime + hangTime) v = 0;
    else v = ascentSpeed;
    v = round(v + rng(-0.12, 0.12), 2);

    // Temp: warm shallow, cold past the thermocline.
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

  // Hangs: a real bottom hang only when it was long enough to matter.
  const hangs = [];
  if (hangTime > 1.8) {
    hangs.push({
      startT: Math.round(descentTime),
      endT: Math.round(descentTime + hangTime),
      avgD: round(depth - rng(0, 0.6), 1),
      type: 'bottom',
    });
  }

  // Contractions tend to start on the way up for a trained diver.
  const contractionOnset =
    depth > 28 && diveType !== 'warmup'
      ? { depth: round(depth * rng(0.45, 0.7), 1), direction: chance(0.75) ? 'up' : 'down' }
      : null;

  const avgHr = Math.round(profile.reduce((a, p) => a + p.hr, 0) / profile.length);

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
  // Two warmups, shallow.
  for (let i = 0; i < 2; i++) {
    dives.push(makeDepthDive(si++, ceil * rng(0.3, 0.5), discipline, 'warmup'));
  }
  // Training dives building toward the day's target.
  const trainingCount = irng(3, 6);
  for (let i = 0; i < trainingCount; i++) {
    const frac = 0.6 + (i / trainingCount) * 0.4;
    dives.push(makeDepthDive(si++, ceil * frac * rng(0.95, 1.05), discipline, 'training'));
  }
  // The dive of the day — deepest. On the competition week, a comp dive.
  const isComp = p.isCompWeek && dayOffset >= 4;
  dives.push(
    makeDepthDive(
      si++,
      isComp ? p.cyclePeakDepth * rng(0.99, 1.03) : ceil * rng(1.0, 1.08),
      discipline,
      isComp ? 'competition' : 'training',
    ),
  );
  // Occasional safety dive for a buddy.
  if (chance(0.3)) dives.push(makeDepthDive(si++, ceil * rng(0.25, 0.4), discipline, 'safety'));

  const maxDepth = Math.max(...dives.map((d) => d.depth));
  const totalSec = dives.reduce((a, d) => a + d.diveTime, 0) + dives.length * irng(150, 260);

  // Depth alarms — render as dots on the depth-player curve.
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
    remarks: isComp ? 'Clean dive, good card.' : chance(0.25) ? pick(['Felt strong on the bottom turn.', 'Equalisation a touch late.', 'Relaxed descent, fast ascent.']) : null,
    alarms,
    dives,
  };
}

// ── pool dive ───────────────────────────────────────────────────────────────
function makePoolDive(discipline, targetDistance, poolLen, diveType, ceilDyn) {
  if (discipline === 'STA') {
    // Static apnea — time only, no distance.
    const diveTime = Math.round(clamp(ceilDyn * rng(1.6, 2.2), 90, 420));
    const hrStart = irng(72, 88);
    const hrBottom = irng(46, 58);
    const profile = [];
    for (let t = 0; t <= diveTime; t++) {
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
  const baseSpeed = rng(0.78, 1.0); // m/s
  const diveTime = Math.round(distance / baseSpeed);

  // Lap times — slightly slower as the dive goes on.
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
  const hasHr = diveType !== 'warmup' ? true : chance(0.5);

  const profile = [];
  for (let t = 0; t <= diveTime; t++) {
    const p01 = t / diveTime;
    const hr =
      p01 < 0.7
        ? hrStart + (hrBottom - hrStart) * ease(p01 / 0.7)
        : hrBottom + (hrEnd - hrBottom) * ease((p01 - 0.7) / 0.3);
    // Kick-cycle speed oscillation; DNF glides more (wider swing).
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

  const contractions = [];
  for (let s = diveTime * rng(0.55, 0.7); s < diveTime; s += rng(8, 14)) {
    contractions.push(Math.round(s));
  }

  const dive = {
    discipline, diveType, distance, diveTime,
    rating: irng(2, 5),
    lapTimes, contractions,
  };
  if (hasHr) {
    dive.hr = Math.round(profile.reduce((a, x) => a + x.hr, 0) / profile.length);
    dive.profile = profile;
    dive.hrProfile = profile.map((x) => ({ t: x.t, hr: x.hr }));
  }
  return dive;
}

const POOL_DISCIPLINES = ['DYN', 'DYN', 'DNF', 'DYNB', 'STA'];

function makePoolSession(week, p, dayOffset) {
  const date = dateAt(week, dayOffset, irng(7, 20));
  const poolLen = chance(0.6) ? 25 : 50;
  const focus = pick(POOL_DISCIPLINES);
  const ceil = p.dynCeil;

  const dives = [];
  // Warmups.
  for (let i = 0; i < irng(2, 3); i++) {
    dives.push(makePoolDive(focus === 'STA' ? 'DYN' : focus, ceil * rng(0.3, 0.5), poolLen, 'warmup', ceil));
  }
  // Training set.
  const setCount = irng(3, 6);
  for (let i = 0; i < setCount; i++) {
    const frac = 0.6 + (i / setCount) * 0.45;
    dives.push(makePoolDive(focus, ceil * frac * rng(0.95, 1.06), poolLen, 'training', ceil));
  }
  // Target effort.
  dives.push(makePoolDive(focus, ceil * rng(1.0, 1.1), poolLen, 'training', ceil * 1.05));
  if (chance(0.25)) dives.push(makePoolDive(focus, ceil * rng(0.3, 0.45), poolLen, 'safety', ceil));

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
    remarks: chance(0.2) ? pick(['Good glide phase today.', 'Turns need work.', 'Strong final effort.']) : null,
    dives,
  };
}

// ── dry session (breath holds) ──────────────────────────────────────────────
/** Build a Rest/Hold/Recover timeline for a table type. */
function makeTimeline(tag, holdCeil) {
  const blocks = [];
  if (tag === 'co2_table') {
    const holdLen = Math.round(holdCeil * rng(0.5, 0.62));
    let rest = Math.round(holdLen * rng(1.1, 1.3));
    const n = irng(6, 8);
    blocks.push({ type: 'Rest', seconds: 120 });
    for (let i = 0; i < n; i++) {
      blocks.push({ type: 'Hold', seconds: holdLen + irng(-4, 4), rating: irng(2, 4) });
      if (i < n - 1) blocks.push({ type: 'Rest', seconds: Math.max(20, rest) });
      rest -= Math.round(holdLen * 0.12);
    }
  } else if (tag === 'o2_table') {
    let holdLen = Math.round(holdCeil * rng(0.45, 0.55));
    const rest = 120;
    const n = irng(6, 8);
    blocks.push({ type: 'Rest', seconds: 120 });
    for (let i = 0; i < n; i++) {
      blocks.push({ type: 'Hold', seconds: holdLen, rating: irng(2, 4) });
      if (i < n - 1) blocks.push({ type: 'Rest', seconds: rest });
      holdLen += Math.round(holdCeil * rng(0.05, 0.09));
    }
  } else {
    // comfy / pb_attempt / recovery — progressive holds toward a max.
    const n = tag === 'recovery' ? irng(2, 3) : irng(4, 6);
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

  // playStart: oximeter started a little before the first Play press.
  const playStart = irng(6000, 18000);
  const hasOxy = chance(0.82); // some sessions logged without the oximeter

  // Per-second physiology walk across the whole timeline.
  const oxyReadings = [];
  const contractions = [];
  let spo2 = 98;
  let hr = irng(64, 74);
  let cursor = 0; // seconds since play
  let holdIdx = -1;

  for (const block of timeline) {
    if (block.type === 'Hold') holdIdx++;
    const dur = block.seconds;
    for (let s = 0; s < dur; s++) {
      const within = s / dur;
      if (block.type === 'Rest') {
        spo2 += (rng(97.8, 99.2) - spo2) * 0.25;
        hr += (rng(62, 74) - hr) * 0.15;
      } else if (block.type === 'Hold') {
        // SpO2 holds, then declines harder the longer the hold runs.
        if (within > 0.38) {
          const decline = (within - 0.38) ** 1.7 * (dur / 60) * rng(0.9, 1.3);
          spo2 -= decline * 0.5;
        }
        // HR drops with the dive reflex, small rise at the very end.
        const hrTarget = within < 0.85 ? rng(46, 56) : rng(52, 64);
        hr += (hrTarget - hr) * 0.08;
        // Contractions start partway in.
        if (within > rng(0.52, 0.62) && chance(0.16)) {
          contractions.push({ elapsed: Math.round(cursor + s), holdIdx });
        }
      } else {
        // Recover — afterdrop for the first ~12s, then recovery.
        if (s < 12) spo2 -= rng(0.3, 0.9);
        else spo2 += (rng(96.5, 98) - spo2) * 0.12;
        hr += ((s < 6 ? rng(92, 108) : rng(74, 84)) - hr) * 0.25;
      }
      spo2 = clamp(spo2, 62, 100);
      hr = clamp(hr, 38, 130);

      if (hasOxy) {
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

  // A few pre-play readings so playStart is meaningful.
  if (hasOxy) {
    for (let tMs = 0; tMs < playStart; tMs += 1000) {
      oxyReadings.unshift({ t: tMs, s: irng(97, 99), h: irng(66, 78), p: round(rng(3, 7), 1) });
    }
    oxyReadings.sort((a, b) => a.t - b.t);
  }

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
    breathingStyle: pick(['Relaxed', 'Box breathing', 'Long exhale']),
    cyclesCount: holds.length,
    playStart,
    blockTimeline: timeline,
    contractions,
    oxyReadings,
  };
}

// ── assemble the season ─────────────────────────────────────────────────────
const sessions = [];
const usedDays = new Set();

for (let week = 0; week < WEEKS; week++) {
  const p = plan(week);
  // Day 0 of every week is the depth day. The compare view buckets by
  // rolling 7-day windows from the anchor, so a fixed weekly deep day
  // keeps the season depth-progression line continuous (and competitive
  // depth freedivers do tend to have a set deep day).
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

// ── write ───────────────────────────────────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'marketing-data');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'element08-demo-backup.json');
writeFileSync(outPath, JSON.stringify(backup));

const counts = sessions.reduce((acc, s) => ((acc[s.mode] = (acc[s.mode] || 0) + 1), acc), {});
const sizeMb = (Buffer.byteLength(JSON.stringify(backup)) / 1024 / 1024).toFixed(2);
const iso = (d) => d.toISOString().slice(0, 10);
console.log(`Wrote ${outPath}`);
console.log(`  ${sessions.length} sessions over ${WEEKS} weeks — depth ${counts.depth}, pool ${counts.pool}, dry ${counts.dry}`);
console.log(`  ${sizeMb} MB`);
console.log(`  range ${sessions[0].date.slice(0, 10)} → ${sessions[sessions.length - 1].date.slice(0, 10)}`);
// Anchors aligned to the week grid so the compare overlay buckets cleanly.
console.log(`  compare anchors — 2025 season: ${iso(weekStart(28))}  ·  2026 season: ${iso(weekStart(57))}`);
