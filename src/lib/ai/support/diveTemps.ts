/**
 * A dive's surface and bottom temperature, the ONE way every reader gets them
 * (dive screen, assistant query / list / detail tools).
 *
 * Several importers keep temperature only in the 1 Hz profile samples
 * (`profile[].temp`) and leave the per-dive `tempSurface` / `tempDepth` empty
 * (the FIT path stores one bottom value per SESSION). The chart drew 27 -> 22 C
 * from the samples while the assistant, reading only the stored fields, said
 * the dive had no depth temperature (Philipp's Preview APK, 2026-10-02).
 *
 * Order: the dive's stored value, then its own samples, then the session's
 * single value (one number for the whole day, the least specific).
 * Pure, no RN imports (shared with the analyzer).
 */
type Pt = { d: number; temp?: number | null };
type DiveLike = {
  tempSurface?: number | null;
  tempDepth?: number | null;
  profile?: Pt[] | null;
};
type SessionLike = { tempSurface?: number | null; tempDepth?: number | null };

/** Coldest sample of the dive, i.e. the reading at depth. */
function profileMinTemp(profile: Pt[] | null | undefined): number | null {
  if (!profile) return null;
  let m: number | null = null;
  for (const p of profile) if (p.temp != null && (m == null || p.temp < m)) m = p.temp;
  return m;
}

/** First sample near the surface (< 2 m), before the descent. */
function profileSurfaceTemp(profile: Pt[] | null | undefined): number | null {
  return profile?.find((p) => p.temp != null && p.d < 2)?.temp ?? null;
}

export function diveTempSurface(dive: DiveLike, session?: SessionLike | null): number | null {
  return dive.tempSurface ?? profileSurfaceTemp(dive.profile) ?? session?.tempSurface ?? null;
}

export function diveTempDepth(dive: DiveLike, session?: SessionLike | null): number | null {
  return dive.tempDepth ?? profileMinTemp(dive.profile) ?? session?.tempDepth ?? null;
}

/** Surface minus bottom (the thermocline), 0.1 C; null when either is unknown. */
export function diveTempDrop(dive: DiveLike, session?: SessionLike | null): number | null {
  const top = diveTempSurface(dive, session);
  const bottom = diveTempDepth(dive, session);
  if (top == null || bottom == null) return null;
  return Math.round((top - bottom) * 10) / 10;
}
