# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Vue 3 + TypeScript + Vite frontend. Package manager: npm.

## Commands

```bash
npm run dev          # dev server on http://0.0.0.0:5173
npm run build        # Vite build; run type-check first
npm run type-check   # offline wire contract validation + vue-tsc --build

npm run lint         # ESLint with --fix
npm run format       # Prettier with --experimental-cli on src/

npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright e2e tests
npm run test:lint-config # Node ESLint configuration integration checks
npm run check:wire-contract           # offline snapshot/provenance/semantics
npm run check:wire-contract:upstream  # exact pinned source through gh
npm run test:wire-contract            # Node integrity regressions
# Replace NEW_SERVER_COMMIT_SHA with a full immutable 40-character server SHA:
npm run sync:wire-contract -- NEW_SERVER_COMMIT_SHA
```

## Code Style

- `noUncheckedIndexedAccess: true` — always guard array/object lookups

## ESLint configuration

`eslint.config.ts` uses native flat configuration with direct
`typescript-eslint`, `eslint-plugin-vue` and `vue-eslint-parser` dependencies.
`tinyglobby` groups Vue files from disk: `<script lang="ts">` and
`<script setup lang="ts">` enable project services, while template-only
components keep Vue rules with type-aware rules disabled. Script blocks remain
limited to TypeScript. Preserve the existing Vue component type exemptions,
Vitest/Playwright rules and build/coverage ignores when changing this setup.

Do not restore `@vue/eslint-config-typescript` without checking its dependency
tree: the removed wrapper brought in `fast-glob` → `micromatch` → `braces`.
`npm run test:lint-config` runs three checks for typed promise errors, Vue
template rules and template-only parsing. These are representative integration
checks, not exhaustive rule or parser compatibility coverage; run full lint
and type-check too.

## Path Aliases

- `@/*` → `src/*`
- `@pages` → `src/pages/index.ts`

## Server wire contract

`jobMatchServer/src/types.ts` is the canonical source. Keep
`src/contracts/jobMatchServer.d.ts` byte-exact with the full server commit and
SHA-256 recorded in `src/contracts/jobMatchServer.json`; do not hand-maintain
local copies. The current pin is `9d71e0c1ebe69fda79d2bc0b239b8d9643b385e9`.
Existing job-card and scrape-stream type modules re-export this snapshot, with
progress frames derived using `Extract`. Guard optional `sourceJobId`,
`location`, `postedAt` and `tags`; preserve the discriminated stream and
exhaustive consumer switch. These type-only exports add no server runtime
dependencies and require no rendering changes.

`npm run type-check` verifies integrity and declaration semantics offline
before compiling consumers. The validator uses `skipLibCheck: false`, no
external resolution or ambient packages, and only TypeScript's ES5 standard
library. Preserve rejection of runtime statements, normal/inline imports,
external triple-slash references, unresolved aliases, DOM/Node dependencies
and missing public wire exports. Sync validates before writing the declaration
snapshot or its manifest. The build script itself only runs Vite.

After a server wire-type change, select a new full commit SHA, run
`npm run sync:wire-contract -- NEW_SERVER_COMMIT_SHA`, inspect both generated
files, and run the upstream check, type-check, Node integrity tests, unit tests
and build. Sync/upstream checks require `gh` access to the server repository;
normal compiler and CI checks remain offline. A moving server branch is not
automatically checked: updating this pin is a reviewed dependency change.

Keep `scripts/wire-contract-checks.mjs` registered as the exact test entry in
`.fallowrc.json`. Its nine regressions cover the core validator; Fallow's
reachability estimate does not measure all CLI branches. Compiler/minimal-job
rendering regressions live in `src/__tests__/WireContract.spec.ts`.

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

Generation failures are editor-local UI state in `ApplicationEditorPage.vue`.
`CoverLetterEditor.vue` renders a safe alert beside the AI button and associates
it with `aria-describedby`; the same button becomes available to retry when the
coordinator transaction finishes. Clear the error only for an accepted new
attempt or a job/deactivation/outer-close/unmount reset. Both success and failure
must check the current active state and captured generation epoch, session and
job, so late failures cannot reach a reopened or different editor. Keep manual
drafts and the coordinator's persistence/restoration behavior intact; restoration
failures still have their own save retry. Deferred regressions in
`CoverLetterGenerationRecovery.spec.ts` cover HTTP/network/invalid responses,
retry, lifecycle races and separate restoration failures; Chromium also checks
the accessible alert and retry at a compact mobile viewport.

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

## CV upload and lookup recovery

`createCvUpload()` in `src/lib/cvUpload.ts` owns the selected File, notice and
attachment availability for one editor. `ApplicationEditorPage.vue` opens a
fresh CV session after connecting its cover-letter save session; capture that
session's `ensureJob` and duplicateKey before awaiting. Job/active/back/unmount
changes invalidate old completions, including A/B/A identity reuse. Serialize
writes by duplicateKey within the helper, not across independent jobs. A newer
selection replaces retry intent and skips an obsolete queued file; duplicate
retries cannot overlap. An acknowledged older selection can establish attachment
availability in its current session, but cannot mark a newer file successful.
Late status responses must not downgrade an acknowledged upload.

`CvUploadNotice.vue` shows pending/success/error and explicit retry next to the
CV input. Keep downloads of an existing attachment available when replacement
fails. Do not claim rollback after HTTP/network uncertainty: the server persists
before its response and exposes no file version. Retry retains the exact File;
reset the native input after selection to permit choosing the same file again.
`CvUploadRecovery.spec.ts` covers deferred upload/status/preparation and lifecycle
races. State is editor-local; no cross-instance/tab/backend revision ordering is
claimed.

The same helper owns `lookupState`: `unknown` after reset, `loading` while a
check is pending, `missing` for a known missing record, `available` after a
successful status check or acknowledged upload, and `error` for a failed check.
`ApiError` in `src/lib/api.ts` retains HTTP status and the separate server error
detail without replacing the existing message. Only 404 responses with the
known `Job not found` / `CV not found` detail confirm `missing`; unexpected
404s, other HTTP failures, network failures and invalid JSON remain errors.
Retry only an errored current session and set loading synchronously to prevent
overlapping checks. Keep lookup errors separate from upload notices and retain
session identity plus acknowledged-upload precedence across every await.

`CvFileInput.vue` shows a safe lookup alert and retry action. Keep that same
button focusable during a retry with `aria-disabled` and a guarded handler,
instead of removing or disabling the focused control. Repeated failure retains
focus. After an available/missing result removes a focused retry, transfer focus
to the enabled CV download/file-picker action only if the current lookup and
document focus still permit it after rendering. Job/close/unmount changes and
the user's focus movement take precedence. `CvFileInput.spec.ts` covers focus
retention, both handoff targets and no focus theft; `CvUploadRecovery.spec.ts`
covers deferred lookup retries and lifecycle races. Chromium checks HTTP/network
failure, pending Enter suppression, repeated failure and download focus.

## Nested revision Escape

`MatchPage.vue` traps Tab and focusin in document capture listeners, but outer
Escape dismissal runs in a separate bubbling listener and respects
`defaultPrevented`. Keep listener cleanup symmetric. `CoverLetterEditor.vue`
consumes Escape only while its revision selection form is open; the next Escape
from the draft can then close the outer editor. Dismissal clears instruction,
emits explicit `cancelRevision`, and restores draft focus with a collapsed caret.
Keep Cancel enabled and focus it when revision inputs lock so the pending form
remains keyboard-cancellable. `ApplicationEditorPage.vue` aborts on dismissal or
deactivation and checks request controller, active state, job and original draft
before using either a revision success or error. Cancellation does not guarantee
that backend/model work stops; ignore late responses even when abort is ignored.
Full-page regressions are in `NestedEscape.spec.ts` and Chromium covers actual
keyboard selection/Escape, pending cancellation and resubmission.
