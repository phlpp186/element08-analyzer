/**
 * MonthCalendar — the Session list's month: every training day a block in
 * its mode colour with the day's best figure, days without a match fading
 * while a search runs. On narrow screens it folds to the week holding the
 * focused day, with a Month / Week toggle (as the app's logbook does).
 */
import type { ParsedSession } from '../schema/backup';
import { dayKey, type CalendarDay } from '../lib/sessionMonth';
import { useT } from '../i18n';

const TONE: Record<ParsedSession['mode'], string> = {
  depth: 'rgb(var(--c-modeDepth))',
  pool: 'rgb(var(--c-modePool))',
  dry: 'rgb(var(--c-modeDry))',
};

const MODE_ORDER: ParsedSession['mode'][] = ['depth', 'pool', 'dry'];
const MODE_LABEL: Record<ParsedSession['mode'], string> = { depth: 'Depth', pool: 'Pool', dry: 'Dry' };

export function MonthCalendar({
  year,
  month,
  days,
  selected,
  searching,
  onSelect,
  onPrev,
  onNext,
  folded,
  onFold,
}: {
  year: number;
  month: number;
  days: Map<string, CalendarDay>;
  selected: string | null;
  /** A search or filter is on: days without a match fade. */
  searching: boolean;
  onSelect: (day: string) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Narrow screens only: show just the focused week. */
  folded: boolean;
  onFold: (folded: boolean) => void;
}) {
  const t = useT();
  const title = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  // Monday-first weeks.
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const today = dayKey(new Date());
  // The folded view keeps the selected day's week, else today's, else the
  // last week with training.
  const keyOf = (d: number) => dayKey(new Date(year, month, d));
  let focusWeek = weeks.findIndex((w) => w.some((d) => d != null && keyOf(d) === selected));
  if (focusWeek < 0) focusWeek = weeks.findIndex((w) => w.some((d) => d != null && keyOf(d) === today));
  if (focusWeek < 0) {
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (weeks[i].some((d) => d != null && days.has(keyOf(d)))) {
        focusWeek = i;
        break;
      }
    }
  }
  if (focusWeek < 0) focusWeek = 0;

  const dayNames = Array.from({ length: 7 }, (_, i) =>
    // 2024-01-01 was a Monday.
    new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }),
  );
  const present = MODE_ORDER.filter((m) => [...days.values()].some((d) => d.mode === m));

  return (
    <div className="board p-3">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={onPrev} aria-label={t('Previous month')} className="pill h-8 w-8 justify-center">
          ‹
        </button>
        <span className="font-heading text-base text-text">{title}</span>
        <button onClick={onNext} aria-label={t('Next month')} className="pill h-8 w-8 justify-center">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dayNames.map((n, i) => (
          <div key={i} className="text-center font-mono text-[10px] text-textDim">
            {n}
          </div>
        ))}
        {weeks.map((w, wi) =>
          w.map((d, i) => {
            const hide = folded && wi !== focusWeek ? 'max-lg:hidden' : '';
            if (d == null) return <div key={`${wi}-${i}`} className={hide} />;
            const key = keyOf(d);
            const info = days.get(key);
            const ring = key === selected ? 'outline outline-2 outline-offset-1 outline-text' : key === today ? 'outline outline-1 outline-accent' : '';
            if (!info) {
              return (
                <div
                  key={key}
                  className={`h-11 rounded-lg bg-abyss/60 px-1 pt-0.5 font-mono text-[10px] text-textDim ${ring} ${hide}`}
                >
                  {d}
                </div>
              );
            }
            const faded = searching && !info.matches;
            return (
              <button
                key={key}
                onClick={() => onSelect(key)}
                aria-pressed={key === selected}
                title={`${info.sessions} ${t(info.sessions === 1 ? 'session' : 'sessions')}`}
                className={`tile flex h-11 flex-col justify-between px-1 pb-1 pt-0.5 text-left transition-opacity ${ring} ${hide}`}
                style={{ '--tone': TONE[info.mode], opacity: faded ? 0.3 : 1 } as React.CSSProperties}
              >
                <span className="tile-label font-mono text-[10px] font-extrabold leading-none">{d}</span>
                <span className="tile-value self-center font-num text-[11px] font-bold leading-none">
                  {info.best ?? ''}
                </span>
              </button>
            );
          }),
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-3">
          {present.map((m) => (
            <span key={m} className="flex items-center gap-1 font-mono text-[10px] text-textDim">
              <span className="h-2 w-2 rounded-sm" style={{ background: TONE[m] }} />
              {t(MODE_LABEL[m])}
            </span>
          ))}
        </div>
        <button
          onClick={() => onFold(!folded)}
          className="font-mono text-[10px] uppercase tracking-widest text-textDim hover:text-accent lg:hidden"
        >
          {folded ? `${t('Month')} ▾` : `${t('Week')} ▴`}
        </button>
      </div>
    </div>
  );
}
