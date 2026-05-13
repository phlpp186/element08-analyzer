# ELEMENT | 08 — Analyzer

Browser-based freediving analytics. Drop in a `.e08backup.json` exported
from the [ELEMENT | 08 mobile app](https://element08.io) and explore your
training history with charts and statistics that don't fit on a phone
screen.

**Privacy promise.** Everything runs in your browser. The file you drop
is parsed locally; nothing is uploaded, nothing is logged, no servers are
involved.

Live at [analyze.element08.io](https://analyze.element08.io).

## Stack

- Vite + React + TypeScript
- Zustand (state), React Router (routing), Zod (schema validation)
- Apache ECharts (charts), Tailwind CSS (styling)
- GitHub Pages (hosting, custom domain via `public/CNAME`)

## Local development

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build into dist/
npm run preview      # preview the production build
```

## Project layout

```
src/
  routes/      one file per route (Landing, SessionList, SessionDetail, ...)
  components/  reusable presentation pieces (DropZone, Chart, ...)
  lib/         pure logic — schema parsing, analytics, formatters
  stores/      Zustand stores (loaded session data, view state)
  schema/      Zod schemas for the exported file format
```

## Deployment

Push to `main`. The GitHub Actions workflow in `.github/workflows/deploy.yml`
builds `dist/` and publishes to GitHub Pages. The custom domain comes from
`public/CNAME`.

DNS for `analyze.element08.io` should `CNAME` to `phlpp186.github.io.`.

## Schema

The accepted file format is documented at
[docs/export-schema.md in the app repo](https://github.com/phlpp186/Deeptimerapp/blob/dev/docs/export-schema.md).

## Roadmap

See the parent project roadmap. Current phase: 0 (scaffold).
