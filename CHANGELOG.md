# Changelog

All notable changes to this project are documented in this file.

## v0.2.5

### Changed

- `README.md` was still the untouched `create-vue` scaffold — it opened with "This template should help get you started developing with Vue 3 in Vite", documented generic Vite/Vitest/Playwright/ESLint steps, and never said what jobMatch is. Worse, it never mentioned that the app is a frontend only: every call in `src/lib/api.ts` goes to a separate backend, [jobMatchServer](https://github.com/freshmozart1/jobMatchServer), whose base URL is read from `VITE_JOB_MATCH_SERVER_URL` and otherwise falls back to `http://<current hostname>:3000`. A reader who followed the scaffold's `npm install` / `npm run dev` therefore ended up with an app that renders but does nothing, with no hint as to why. Rewrote the README as jobMatch documentation: what the app does (a swipe deck of freshly scraped LinkedIn ads, ranked by cosine similarity against your search keywords, turned into an AI-drafted cover letter that merges with your CV into a single application PDF), a feature list pointing at the components that implement each part, and a prominent "Backend — required" section covering the base URL resolution, the `.env.local` setup, the fact that `VITE_*` variables are inlined at build time rather than read at runtime, and the order in which to start the server and the frontend. Added a full command table that documents `format` and `preview` — both previously undocumented — alongside the scripts the scaffold already listed, testing instructions for Vitest and Playwright that spell out the dev/CI base URL split, the project layout, and a path alias table recording that `@components` and `@assets` resolve in `vite.config.ts` but are missing from `tsconfig.app.json`'s `paths`, so importing through them builds and then fails `npm run type-check`. Added two screenshots under `docs/screenshots/` (the match page and the cover letter editor) captured from the real UI at a phone viewport, and dropped the scaffold boilerplate that no longer applied. Documentation only; no source or configuration changed (closes #56).

## v0.2.4

### Fixed

- `MatchPage.vue`'s `fetchJobs()` pushed every streamed `ScrapedJob` event straight into `jobs.value`, but the backend's `/scrape/linkedin` stream sends the same job once per matching search keyword, so a job matching multiple keywords produced multiple entries with the same `duplicateKey`. `JobCardStack.vue` keys its `JobCard`s by `duplicateKey`, so the duplicate entries shared a Vue `:key`, causing the swipe card to reuse stale internal drag state and making the deck appear to "eat" cards and get stuck/unresponsive. Added a `Set<string>` (`seenDuplicateKeys`) in `fetchJobs()` that skips any event whose `duplicateKey` was already seen before pushing, so each unique job appears exactly once in the deck (closes #47).

## v0.2.3

### Fixed

- `ApplicationEditorPage.vue`'s `generateCoverLetter()` made two sequential calls — `POST /jobs/top-x-similar-cover-letters` (to rank stored cover letters and get back `coverLetterIds`) followed by `POST /cover-letters/create/text` (passing those IDs in to generate the letter) — but the backend removed `/jobs/top-x-similar-cover-letters` after folding its ranking logic directly into `/cover-letters/create/text`, so the first call now 404s and cover letter generation was completely broken. Changed `generateCoverLetter()` to make a single `POST /cover-letters/create/text` call with the job's fields (`embedding` stripped, since the endpoint never used it), omitting the `coverLetterIds` step and the `x` parameter entirely (the backend defaults `x` to `3`, matching the old hardcoded frontend value) (closes #53).

## v0.2.2

### Fixed

- `ScrapedJob` (`src/components/jobCard/types.ts`) had `descriptionText` typed as required, but the backend's `/scrape/linkedin` stream intentionally omits the field entirely when a scraped job's description is empty, whitespace-only, or a LinkedIn login/legal modal that leaked through instead of real content. Changed `descriptionText` back to optional to match the backend's type; every consumer already defensively checked for the field, so nothing else changes at runtime. This reverts the `descriptionText` part of v0.1.0's change to this type, which had assumed the backend always populates it (closes freshmozart1/jobMatchServer#83).

## v0.2.1

### Fixed

- `MatchPage.vue`'s `fetchJobs()` only aborted the previous scrape's `AbortController` when a new search superseded it, never on component teardown, so navigating away from or reloading MatchPage while `/scrape/linkedin` was still streaming left the backend scrape run orphaned. Added an `onUnmounted` hook that calls `scrapeAbortController?.abort()` so leaving the page always cancels the in-flight scrape (closes #50).

## v0.2.0

### Removed

- The "Max pages" search option was removed since the backend no longer supports it. `MatchPage.vue`'s `getMaxPages()` (which read `localStorage['jobmatch.searchmaxpages']`) and every `maxPages` reference — the `lastFetchedParams` field, the `searchParamsChanged()` comparison, and the `POST /scrape/linkedin` request body field — were deleted. `SearchPage.vue`'s `MAX_PAGES_STORAGE_KEY`, the `maxPages` ref, `onMaxPagesChange()`, and the "Max pages" label/input/help-text template block were also removed (closes #44).

## v0.1.1

### Fixed

- The date-posted filter (`SearchPage.vue`) sent `86400`/`604800`/`2592000` (seconds) as its select option values and `DEFAULT_DATE_POSTED` (`src/pages/match/searchParams.ts`), which didn't match the backend's `/scrape/linkedin` handler's expected literal union `'day' | 'month' | 'week'` — every scrape request was rejected with a 400. Changed the option values and default to `'day'`, `'week'`, and `'month'` (closes #42).

## v0.1.0

### Changed

- `ScrapedJob` (`src/components/jobCard/types.ts`) now matches the corrected backend scrape response: `companyAddress: CompanyAddress` was replaced with `companyAddresses: CompanyAddress[]`, and `sourceJobId`, `location`, `descriptionText`, `postedAt`, and `tags` changed from optional to required, since the backend always populates them on a successful scrape and now sends an array of addresses instead of a single one. Types-only change; no `.vue` components read `companyAddress` today (closes #37).

## v0.0.1

### Fixed

- `MatchPage.vue`'s `fetchJobs()` now consumes `POST /scrape/linkedin`'s `text/event-stream` response incrementally instead of calling `response.json()` against it, which always failed — job cards never appeared. Added `postJsonEventStream` (`src/lib/api.ts`), a generic async generator that reads a fetch `Response` body as SSE frames, so jobs render progressively as the backend streams them instead of only after a whole-body JSON parse that could never succeed (closes #36).
- A per-scrape SSE error frame (`{ error, reason }`, sent when one search keyword fails while others succeed) no longer hides jobs already streamed in from other keywords — the error now surfaces as a non-blocking banner above the job stack (reusing the existing `match-page__status--warning` style) instead of replacing the whole view, unless there are no jobs at all.
