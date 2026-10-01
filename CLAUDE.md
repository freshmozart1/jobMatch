# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Vue 3 + TypeScript + Vite frontend. Package manager: npm.

## Commands

```bash
npm run dev          # dev server on http://0.0.0.0:5173
npm run build        # Vite build (parallel)
npm run type-check   # vue-tsc --build

npm run lint         # ESLint with --fix
npm run format       # Prettier with --experimental-cli on src/

npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright e2e tests
```

## Code Style

- `noUncheckedIndexedAccess: true` — always guard array/object lookups

## Path Aliases

- `@/*` → `src/*`
- `@pages` → `src/pages/index.ts`

## Scrape stream

`POST /scrape/linkedin` requires jobMatchServer v5.0.0 or newer. Every SSE
`data:` frame is discriminated by `type`: `job` wraps the `ScrapedJob`,
`progress` is tagged with its keyword, and `error` carries a safe string reason.
`MatchPage.vue` must switch exhaustively on this union; do not restore the old
`'error' in event` sniff or accept unwrapped jobs. Progress snapshots are kept
per keyword so concurrent scraper runs can interleave without combining their
positions, while failed/dropped counts are summed for the user-facing warning.

## Playwright (e2e)

- First run requires: `npx playwright install`
- Dev: base URL is `http://localhost:5173`; CI/built: `http://localhost:4173`
- Tests auto-start the dev server (or `npm run preview` on CI)
- API calls in tests are hardcoded to `http://localhost:3000`
- Run a single browser: `npm run test:e2e -- --project=chromium`
- Debug mode: `npm run test:e2e -- --debug`

## Cover-letter save lifecycle

`MatchPage.vue` provides a `createCoverLetterSaves()` coordinator from
`src/lib/coverLetterSaves.ts`. Keep debounce timers, in-flight writes and the
latest draft revision in that per-job queue, never in a disposable editor
instance. `ApplicationEditorPage.vue` closes its session on job change and
unmount; session disposal removes UI listeners and flushes pending work through
the same queue. A completed old upload must not mark a newer draft as saved.
Regression coverage lives in `src/__tests__/CoverLetterSaveLifecycle.spec.ts`
and uses deferred HTTP fixtures; do not exercise these races against live data.

Letter-containing PDF downloads must await `session.flush()` and confirm the
current draft is saved before the GET. A false result can mean a newer draft is
still debounced: flush again unless the save failed. Keep the job key/session
snapshot and an active-request guard across awaits; `active` becomes false as
soon as the editor closes, before its exit transition unmounts it. Failed saves
must show a retry action and must not request a stale PDF. Deferred download
regressions live in `src/__tests__/CoverLetterDownloadPersistence.spec.ts`.

Generation is a per-job coordinator transaction too. It captures the draft
revision before waiting for previous uploads and retains the entry while its
provider response or restoration is pending. The endpoint persists before it
responds: discard stale UI output AND invalidate savedText/restore the latest
manual draft, including same-text edits. Detached sessions cannot apply results;
reopened sessions inherit pending generation state. A failed restoration retains
its entry for retry. Empty drafts cannot be uploaded by the current server API;
report unsaved state instead of acknowledging them. Use the persisted-state
fixtures in `CoverLetterGenerationPersistence.spec.ts` for these races. This is
page-local ordering, not cross-tab or backend revision control.

After the exact revision/session/lifecycle guards accept generation, only
`response.saved === true` acknowledges its draft without a text upload. The
coordinator owns that atomic draft/baseline update; the component callback only
updates textarea/localStorage. Manual edits and missing/false/nonboolean saved
values still use autosave. Idle editor entries cache only their acknowledged
text and job-persistence flag for this page's lifetime; reopening must not
re-segment unchanged generated text. PDF preparation separately ensures the job
exists and re-checks request identity before continuing. Regression fixtures in
`GeneratedCoverLetterAcknowledgement.spec.ts` distinguish original generated
segments from re-segmented text and reject PDF requests lacking a job record.

## Swipe history and filtered decks

`MatchPage.vue` owns consumed `duplicateKey`s for one search and excludes them
before applying the match filter. Record a committed swipe synchronously in
`rateJob`; persistence is a separate operation. Filter changes and cancellation
must not clear consumed keys. `fetchJobs` starts a fresh search and resets them
alongside the streamed jobs, retaining outstanding rating keys; stream deduplication still uses duplicateKey.
`JobCardStack.vue` is a controlled view of jobs[0]/jobs[1]: it emits ratings and
never increments a second cursor when the parent removes a consumed job.
Filter re-keying only resets transient gestures. Mounted stream regression
coverage lives in `MatchConsumedJobs.spec.ts`, including hidden unseen jobs,
new arrivals, cancellation and fresh-search reset.

## Failed rating recovery

`createRatingSaves()` in `src/lib/ratingSaves.ts` belongs to one MatchPage.
Capture a deep independent job payload and boolean choice at enqueue, retain
one pending/failed entry per duplicateKey, and set pending synchronously before
sending. Retry only a failed entry; remove only that exact entry after a
successful response. Filters and new searches must not clear the queue or
replace its original payload. New-search consumed keys include outstanding
ratings so streamed duplicates cannot overwrite a pending choice.
`RatingSaveStatus.vue` presents failures and retry progress outside search/deck
conditionals; its bounded height is reserved in the card layout. Fixtures in
`RatingRecovery.spec.ts` use deferred HTTP/network failures, independent keys,
mutable job data, new searches and ambiguous responses. Backend upsert makes
identical retries converge by key; do not claim exactly-once HTTP after a lost
response. The queue is page-local and does not survive reload.
