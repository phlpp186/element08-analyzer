/**
 * DEV ONLY. A small synthetic backup for checking the dive pages in a browser:
 * one depth session (5 dives with depth/speed/HR/temp samples, remarks,
 * effort, a contraction and a depth alarm) and one pool session (4 dives with
 * HR/depth/speed samples, laps, contractions and a motion trace). Loaded by
 * `?fixture=dives` from main.tsx behind import.meta.env.DEV, so it never ships.
 */
import { parseBackupText } from '../lib/parseBackup';
import type { ParsedBackup } from '../schema/backup';

export const FIXTURE_DEPTH_ID = 990001;
export const FIXTURE_POOL_ID = 990002;

function depthDive(depth: number, n: number) {
  const descV = 0.95 + n * 0.03;
  const ascV = 0.85 + n * 0.02;
  const hang = 3 + n;
  const descT = Math.round(depth / descV);
  const ascT = Math.round(depth / ascV);
  const total = descT + hang + ascT;
  const profile: { t: number; d: number; hr: number; temp: number }[] = [];
  for (let t = 0; t <= total; t++) {
    let d: number;
    if (t <= descT) d = (t / descT) * depth;
    else if (t <= descT + hang) d = depth - 0.3 * Math.sin(t - descT);
    else d = Math.max(0, depth - ((t - descT - hang) / ascT) * depth);
    // A little kick-cycle wobble so smoothing has something to do.
    d = Math.max(0, d + (t > 0 && t < total ? 0.15 * Math.sin(t * 1.7) : 0));
    const hr = Math.round(78 - 30 * Math.min(1, t / (total * 0.7)) + (t > total * 0.85 ? 8 : 0));
    const temp = +(24 - (d / depth) * (6 + n * 0.4)).toFixed(1);
    profile.push({ t, d: +d.toFixed(2), hr, temp });
  }
  // Stored speed from the depth curve (negative = descending).
  const withV = profile.map((p, i) => {
    const a = profile[Math.max(0, i - 1)];
    const b = profile[Math.min(profile.length - 1, i + 1)];
    return { ...p, v: +(-(b.d - a.d) / (b.t - a.t)).toFixed(2) };
  });
  return {
    si: n === 0 ? 0 : 240 + n * 30,
    discipline: n === 3 ? 'FIM' : 'CWT',
    diveType: n === 0 ? 'warmup' : 'training',
    depth,
    diveTime: total,
    descentTime: descT,
    hangTime: hang,
    ascentTime: ascT,
    descentSpeed: +(depth / descT).toFixed(2),
    ascentSpeed: +(depth / ascT).toFixed(2),
    hr: Math.round(withV.reduce((s, p) => s + p.hr, 0) / withV.length),
    tempDepth: withV.reduce((m, p) => Math.min(m, p.temp), 99),
    contractionOnset: n === 3 ? { depth: Math.round(depth * 0.6), direction: 'up' } : null,
    remarks:
      n === 2
        ? 'Clean mouthfill at 22 m, slight hurry on the ascent. Next time hold the freefall a little longer before the turn.'
        : null,
    rating: n === 2 ? 6 : n === 3 ? 8 : null,
    profile: withV,
  };
}

function poolDive(distance: number, n: number) {
  const laps = Math.round(distance / 25);
  const lapTimes = Array.from({ length: laps }, (_, i) => 24 + i * 1.5 + n);
  const diveTime = Math.round(lapTimes.reduce((a, b) => a + b, 0));
  const profile: { t: number; hr: number; depth: number; speed: number }[] = [];
  for (let t = 0; t <= diveTime; t++) {
    profile.push({
      t,
      hr: Math.round(82 - 28 * Math.min(1, t / (diveTime * 0.75)) + (t > diveTime * 0.9 ? 6 : 0)),
      depth: +(1.2 + 0.4 * Math.sin(t / 4)).toFixed(2),
      speed: +(1.0 + 0.15 * Math.sin(t * 0.9) - t * 0.002).toFixed(2),
    });
  }
  const hz = 5;
  const samples = (diveTime + 10) * hz;
  const turns: number[] = [];
  let acc = 5;
  for (let i = 0; i < laps - 1; i++) {
    acc += lapTimes[i];
    turns.push(+acc.toFixed(1));
  }
  const strokes = Array.from({ length: laps * 12 }, (_, i) => +(5.5 + i * (diveTime / (laps * 12))).toFixed(1));
  return {
    discipline: n % 2 === 0 ? 'DNF' : 'DYN',
    diveType: 'training',
    distance,
    diveTime,
    si: n === 0 ? 0 : 180 + n * 20,
    turns: laps - 1,
    turnsManual: false,
    lapTimes,
    contractions: n >= 2 ? [Math.round(diveTime * 0.6), Math.round(diveTime * 0.75)] : [],
    hrHighest: 84,
    hrLowest: 52 - n,
    remarks: n === 1 ? 'Good glide, turns a bit early on the second wall.' : null,
    rating: n === 1 ? 7 : null,
    profile,
    trace: {
      hz,
      accel: Array.from({ length: samples }, (_, i) => +(1 + 0.3 * Math.sin(i / 3) + (i % 50 === 0 ? 1.5 : 0)).toFixed(2)),
      gyro: Array.from({ length: samples }, (_, i) => +(40 * Math.sin(i / 2.5)).toFixed(1)),
      heading: Array.from({ length: samples }, (_, i) => {
        const t = i / hz;
        const flips = turns.filter((x) => x <= t).length;
        return flips % 2 === 0 ? 10 : 190;
      }),
      turns,
    },
    traceEdits:
      n === 0 ? { startT: 4, endT: diveTime + 6, turns, strokes, kicks: [] } : null,
  };
}

export function fixtureBackup(): ParsedBackup {
  const depthDives = [18, 26, 33, 41, 22].map((d, i) => depthDive(d, i));
  const poolDives = [50, 75, 100, 50].map((d, i) => poolDive(d, i));
  const raw = {
    appId: 'element08',
    schemaVersion: 4,
    exportedAt: '2026-10-16T10:00:00.000Z',
    data: {
      sessions: [
        {
          id: FIXTURE_DEPTH_ID,
          date: '2026-10-10T09:30:00.000Z',
          name: 'Fixture depth session',
          mode: 'depth',
          blocks: depthDives.length,
          duration: '1:05:00',
          remarks: 'Calm water, light current.',
          rating: 7,
          maxDepth: 41,
          discipline: 'CWT',
          location: 'Fixture bay',
          alarms: [{ type: 'depth', depth: 30, enabled: true, triggerOnDescent: true }],
          dives: depthDives,
        },
        {
          id: FIXTURE_POOL_ID,
          date: '2026-10-12T17:00:00.000Z',
          name: 'Fixture pool session',
          mode: 'pool',
          blocks: poolDives.length,
          duration: '0:45:00',
          rating: 6,
          totalDistance: poolDives.reduce((s, d) => s + d.distance, 0),
          location: 'Fixture pool',
          poolType: '25m',
          startTime: '19:00',
          dives: poolDives,
        },
      ],
    },
  };
  return parseBackupText(JSON.stringify(raw));
}
