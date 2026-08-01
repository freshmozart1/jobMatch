# Changelog

All notable changes to this project are documented in this file.

## v0.0.1

### Fixed

- `MatchPage.vue`'s `fetchJobs()` now consumes `POST /scrape/linkedin`'s `text/event-stream` response incrementally instead of calling `response.json()` against it, which always failed — job cards never appeared. Added `postJsonEventStream` (`src/lib/api.ts`), a generic async generator that reads a fetch `Response` body as SSE frames, so jobs render progressively as the backend streams them instead of only after a whole-body JSON parse that could never succeed (closes #36).
- A per-scrape SSE error frame (`{ error, reason }`, sent when one search keyword fails while others succeed) no longer hides jobs already streamed in from other keywords — the error now surfaces as a non-blocking banner above the job stack (reusing the existing `match-page__status--warning` style) instead of replacing the whole view, unless there are no jobs at all.
