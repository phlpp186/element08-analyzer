/**
 * Landing — first screen the user lands on at analyze.element08.io.
 *
 * Phase 0 (now): brand presence + drop-zone placeholder. The drop zone
 * is non-functional in this commit; Phase 1 wires it to a file parser
 * and a session-list view.
 *
 * Privacy promise lives here visibly: the file the user drops never
 * leaves their browser. That's a brand pillar, not a footnote.
 */
export function Landing() {
  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-12">
      <header className="mb-12 text-center">
        <h1 className="mb-3 text-5xl font-light tracking-widest text-text">
          ELEMENT <span className="text-accent">|</span> 08
        </h1>
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-textDim">
          Analyzer
        </p>
      </header>

      <DropZone />

      <p className="mt-8 max-w-md text-center text-sm text-textDim">
        Your data never leaves this browser. The file you drop is parsed
        locally; nothing is uploaded.
      </p>

      <footer className="mt-auto pt-12 text-xs text-textDim">
        <a
          href="https://element08.io"
          className="underline-offset-4 hover:underline"
        >
          element08.io
        </a>
      </footer>
    </div>
  );
}

/**
 * Stub drop zone. Phase 1 will wire this up to actual file parsing.
 * Keeping the visual + interaction here so the route renders something
 * tangible while the schema work continues.
 */
function DropZone() {
  return (
    <div
      className="flex h-64 w-full max-w-2xl flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-panel text-center transition-colors hover:border-accent"
      // intentionally inert in Phase 0 — wire onDrop / onChange in Phase 1
    >
      <p className="mb-2 font-heading text-xl tracking-wide text-text">
        Drop your backup file here
      </p>
      <p className="font-mono text-xs uppercase tracking-widest text-textDim">
        Phase 1: pickaroo coming soon
      </p>
    </div>
  );
}
