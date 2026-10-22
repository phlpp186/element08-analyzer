/**
 * ModeBlock — the session's mode as a coloured block with its glyph, the
 * leading mark of a logbook row (as in the app's logbook). Solid and bevelled
 * in Block Arcade, a tint elsewhere (see .tile).
 */
import type { ParsedSession } from '../schema/backup';

const TONE: Record<ParsedSession['mode'], string> = {
  depth: 'rgb(var(--c-modeDepth))',
  pool: 'rgb(var(--c-modePool))',
  dry: 'rgb(var(--c-modeDry))',
};

const GLYPH: Record<ParsedSession['mode'], string> = {
  depth: '↓',
  pool: '≈',
  dry: '○',
};

export function ModeBlock({ mode, size = 44 }: { mode: ParsedSession['mode']; size?: number }) {
  return (
    <span
      aria-hidden
      className="tile flex shrink-0 items-center justify-center"
      style={{ '--tone': TONE[mode], width: size, height: size } as React.CSSProperties}
    >
      <span className="tile-value font-num text-xl font-bold leading-none">{GLYPH[mode]}</span>
    </span>
  );
}
