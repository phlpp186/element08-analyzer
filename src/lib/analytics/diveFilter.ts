/**
 * Depth-dive inclusion filter for analytics.
 *
 * Mirrors the mobile app's Insights default: a depth dive counts toward
 * aggregate analytics UNLESS its `diveType` is 'excluded', 'warmup', or
 * 'safety'. An untyped dive defaults to 'training' and is included.
 *
 *   excluded → never counted, anywhere (explicitly marked junk)
 *   warmup   → not counted (not a real training/comp effort)
 *   safety   → not counted (supporting a buddy, not own training)
 *   training / competition / (unset) → counted
 *
 * The app additionally lets the user toggle warmup/safety back ON via a
 * filter. The analyzer doesn't have that toggle yet — when the depth
 * Insights charts land (Phase 2b) the toggle comes with them. Until
 * then this matches the app's *default* view so the numbers agree.
 *
 * This filter applies to AGGREGATE analytics only. The per-dive player
 * still shows any dive the user explicitly opens — a warmup dive is
 * still viewable, it just doesn't pollute the season comparisons.
 */
export function includeDepthDive(diveType: string | null | undefined): boolean {
  return diveType !== 'excluded' && diveType !== 'warmup' && diveType !== 'safety';
}
