/**
 * Tile tones: the colour a stat tile takes by what it measures, as CSS
 * colours of the theme tokens (see .tile in index.css).
 */
/** A stat tile's colour, by what it measures: the profile colour for
 *  descent, amber for ascent, the hero colour for the headline figure. */
export type Tone = 'hero' | 'profile' | 'amber' | 'accent' | 'highlight' | 'recover' | 'red';

export const TONE_VAR: Record<Tone, string> = {
  hero: 'rgb(var(--c-hero))',
  profile: 'rgb(var(--c-profile))',
  amber: 'rgb(var(--c-amber))',
  accent: 'rgb(var(--c-accent))',
  highlight: 'rgb(var(--c-highlight))',
  recover: 'rgb(var(--c-recover))',
  red: 'rgb(var(--c-red))',
};
