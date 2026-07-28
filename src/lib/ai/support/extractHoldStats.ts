import type { DrySession, LungVolume, HoldStat } from '../appTypes';
import { resolveContractionMs } from './resolveContractionMs';
import { cleanOxyReadings } from './cleanOxyReadings';
import { minOf } from './arrayMath';

const TOL = 2000; // ms tolerance for aligning block timeline with readings
const AD_MS = 45000; // afterdrop measurement window

/**
 * Extract per-hold statistics from dry sessions that have oximeter data.
 *
 * For each Hold block in each session:
 * - Finds readings within the hold window (± tolerance)
 * - Computes: minSpo2, baseline, atEnd, afterdrop magnitude/delay, recovery, contractions
 *
 * Returns array sorted by date, optionally filtered by lung volume.
 */
export function extractHoldStats(sessions: DrySession[], lvFilter?: LungVolume): HoldStat[] {
  const result: HoldStat[] = [];

  for (const s of sessions) {
    if ((s.mode || 'dry') !== 'dry') continue;
    if (!s.oxyReadings || s.oxyReadings.length < 2) continue;
    if (!s.blockTimeline || !s.blockTimeline.length) continue;

    // Spike-filter the readings before computing stats. See
    // src/lib/algorithms/cleanOxyReadings.ts for the rationale.
    const R = cleanOxyReadings(s.oxyReadings).cleaned;

    // Compute playStart offset
    let PS: number;
    if (s.playStart != null) {
      PS = s.playStart;
    } else {
      let firstHoldStart = 0;
      let cur = 0;
      for (const b of s.blockTimeline) {
        if (b.type === 'Hold') {
          firstHoldStart = cur;
          break;
        }
        // Real-time block span includes any pause that happened DURING
        // the block — block.seconds alone counts only running-timer time.
        cur += b.seconds + (b.pausedMs ?? 0) / 1000;
      }
      if (firstHoldStart === 0) {
        PS = R[0].t;
      } else {
        const naivStart = R[0].t + firstHoldStart * 1000;
        const maxT = R[R.length - 1].t;
        if (naivStart > maxT) {
          PS = R[0].t - firstHoldStart * 1000;
        } else {
          PS = R[0].t;
        }
      }
    }

    let cursor = 0;
    let holdIdx = 0;
    let prevType: (typeof s.blockTimeline)[number]['type'] | null = null;

    for (const b of s.blockTimeline) {
      const blockSpanSec = b.seconds + (b.pausedMs ?? 0) / 1000;
      const startMs = PS + cursor * 1000;
      const endMs = PS + (cursor + blockSpanSec) * 1000;
      cursor += blockSpanSec;

      const wasAfterRest = prevType === 'Rest';
      prevType = b.type;
      if (b.type !== 'Hold') continue;
      const hi = holdIdx++;

      const inHold = R.filter((r) => r.t >= startMs - TOL && r.t <= endMs + TOL);
      if (inHold.length < 2) continue;

      const inAndAfter = R.filter((r) => r.t >= startMs - TOL && r.t <= endMs + AD_MS);

      // Baseline: avg of last 8 readings before hold
      const preR = R.filter((r) => r.t < startMs - TOL).slice(-8);
      const baseline =
        preR.length > 0 ? Math.round(preR.reduce((a, r) => a + r.s, 0) / preR.length) : null;

      // SpO2 at hold end
      const atEnd = inHold[inHold.length - 1].s;

      // Nadir
      const minSpo2 = minOf(inAndAfter.map((r) => r.s));
      const nadirR = inAndAfter.find((r) => r.s === minSpo2);

      // Afterdrop
      const adMag = Math.max(0, atEnd - minSpo2);
      const adDelay = nadirR && nadirR.t > endMs ? (nadirR.t - endMs) / 1000 : 0;

      // Recovery: nadir → back within 1% of baseline
      let recovSec: number | null = null;
      if (nadirR && baseline !== null) {
        const afterNadir = R.filter((r) => r.t > nadirR.t);
        const recovR = afterNadir.find((r) => r.s >= baseline - 1);
        if (recovR) recovSec = (recovR.t - nadirR.t) / 1000;
      }

      // Contractions for this hold. resolveContractionMs is PLAY-relative, so
      // subtract the PLAY-relative hold start (startMs − PS = cursor*1000), not
      // the oxy-absolute startMs — else a non-zero playStart (oximeter session
      // with a gap before play) drives every time negative. See
      // resolveContractionMs + the contractionTime regression test.
      const hContrs = (s.contractions || []).filter((c) => c.holdIdx === hi);
      const cTimes = hContrs
        .map((c) => (resolveContractionMs(c, s.blockTimeline) - (startMs - PS)) / 1000)
        .filter((t) => t >= -2)
        .sort((a, b) => a - b);

      const firstContrSec = cTimes.length > 0 ? Math.max(0, cTimes[0]) : null;

      let avgInterval: number | null = null;
      if (cTimes.length >= 2) {
        const ivs: number[] = [];
        for (let i = 1; i < cTimes.length; i++) ivs.push(cTimes[i] - cTimes[i - 1]);
        avgInterval = ivs.reduce((a, v) => a + v, 0) / ivs.length;
      }

      // Heart rate over the hold window. h > 0 also holds for HR-only ('hrs')
      // sessions, whose SpO2 channel is a constant 0 — HR stats stay valid
      // there while the SpO2 stats above are meaningless (callers gate on
      // deviceType for those).
      const hrInHold = inHold.filter((r) => r.h > 0);
      const hrs = hrInHold.map((r) => r.h);
      const hrMin = hrs.length ? hrs.reduce((a, v) => (v < a ? v : a), hrs[0]) : null;
      const hrMax = hrs.length ? hrs.reduce((a, v) => (v > a ? v : a), hrs[0]) : null;
      const hrAvg = hrs.length ? hrs.reduce((a, v) => a + v, 0) / hrs.length : null;

      // ── Dive-reflex HR analytics (Breathhold tab semantics) ─────────────────
      // Resting HR = mean over the last 20s of the preceding Rest block. The
      // Breathhold tab (useDryInsights) computes these; mirror it so the AI
      // agrees with the chart the diver sees.
      let hrBaseline: number | null = null;
      if (wasAfterRest) {
        const baseR = R.filter((r) => r.t >= startMs - 20_000 && r.t <= startMs && r.h > 0);
        if (baseR.length)
          hrBaseline = Math.round(baseR.reduce((a, r) => a + r.h, 0) / baseR.length);
      }
      const diveReflexPct =
        hrBaseline && hrMin && hrBaseline > 0
          ? Math.round(((hrBaseline - hrMin) / hrBaseline) * 100)
          : null;

      // First-minute reflex: HR at start vs the reading nearest 60s in.
      let diveReflex1minPct: number | null = null;
      if (b.seconds >= 65 && hrInHold.length >= 2) {
        const hrStart = hrInHold[0].h;
        const at60 = startMs + 60_000;
        let best = hrInHold[0];
        for (const r of hrInHold) if (Math.abs(r.t - at60) < Math.abs(best.t - at60)) best = r;
        if (hrStart > 0) diveReflex1minPct = Math.round(((hrStart - best.h) / hrStart) * 100);
      }

      // HR at the first contraction + late-phase drop from there to hold end.
      let hrAtFirstContraction: number | null = null;
      let diveReflexPostContractionPct: number | null = null;
      if (firstContrSec !== null && hrInHold.length) {
        const contrMs = startMs + firstContrSec * 1000;
        let best = hrInHold[0];
        for (const r of hrInHold)
          if (Math.abs(r.t - contrMs) < Math.abs(best.t - contrMs)) best = r;
        hrAtFirstContraction = best.h;
        const hrEnd = hrInHold[hrInHold.length - 1].h;
        if (hrAtFirstContraction > 0) {
          diveReflexPostContractionPct = Math.round(
            ((hrAtFirstContraction - hrEnd) / hrAtFirstContraction) * 100,
          );
        }
      }

      result.push({
        sessionId: s.id,
        holdIdx: hi,
        date: new Date(s.date),
        lv: b.lungVol || s.lungVol || '',
        durSec: b.seconds,
        minSpo2,
        baseline,
        atEnd,
        adMag,
        adDelay,
        recovSec,
        firstContrSec,
        avgInterval,
        contrCount: hContrs.length,
        hrMin,
        hrMax,
        hrAvg,
        hrBaseline,
        diveReflexPct,
        diveReflex1minPct,
        hrAtFirstContraction,
        diveReflexPostContractionPct,
      });
    }
  }

  result.sort((a, b) => a.date.getTime() - b.date.getTime());
  return lvFilter ? result.filter((h) => h.lv === lvFilter) : result;
}
