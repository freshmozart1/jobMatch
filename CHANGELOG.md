# Changelog

All notable changes to this project are documented in this file.

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
