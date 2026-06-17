# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Vue 3 + TypeScript + Vite frontend. Package manager: npm.

## Commands

```bash
npm run dev          # dev server on http://0.0.0.0:5173
npm run build        # type-check + Vite build (parallel)
npm run type-check   # vue-tsc --build

npm run lint         # oxlint + ESLint in sequence, both with --fix
npm run format       # Prettier with --experimental-cli on src/

npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright e2e tests
```

## Code Style

- No semicolons, single quotes, 100-char print width (Prettier)
- `noUncheckedIndexedAccess: true` — always guard array/object lookups

## Path Aliases

- `@/*` → `src/*`
- `@pages` → `src/pages/index.ts`
- `@components` → `src/components`
- `@assets` → `src/assets`

## Playwright (e2e)

- First run requires: `npx playwright install`
- Dev: base URL is `http://localhost:5173`; CI/built: `http://localhost:4173`
- Tests auto-start the dev server (or `npm run preview` on CI)
- API calls in tests are hardcoded to `http://localhost:3000`
- Run a single browser: `npm run test:e2e -- --project=chromium`
- Debug mode: `npm run test:e2e -- --debug`
