/**
 * ChartCard — common wrapper around every chart on the Insights page.
 *
 * Standardizes the visual chrome (border, padding, title, description)
 * so individual chart components only declare their content.
 */
import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  /** Optional right-side controls — filter pills, etc. */
  controls?: ReactNode;
}

export function ChartCard({ title, description, children, controls }: Props) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-text">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-textDim">{description}</p>
          )}
        </div>
        {controls && <div className="shrink-0">{controls}</div>}
      </header>
      <div>{children}</div>
    </section>
  );
}
