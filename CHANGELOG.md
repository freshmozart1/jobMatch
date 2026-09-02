# Changelog

All notable changes to this project are documented in this file.

## v0.2.8

### Fixed

- The pencil button in `src/components/LikeContainer.vue` carried `aria-label="Write cover letter"`, but it has not opened the cover letter editor since the Application Editor menu was introduced: `LikeContainer` emits `edit` → `JobCardContainer.vue` re-emits it → `JobCardStack.vue` attaches the current job → `MatchPage.vue` opens `ApplicationEditorPage.vue`, which starts on `view = ref<'menu' | 'letter'>('menu')` and renders `ApplicationEditorMenu.vue` under a header reading "Application Editor" — a three-action screen (cover letter row, Curriculum Vitae row, "Download application") where the cover letter editor is a _second_ view, reachable only by activating the menu's cover letter row. Sighted users got the correct header; screen reader users were promised a cover letter editor and landed in a menu, and since v0.2.6 documented this button as opening the Application Editor, the accessible name was the last place in the codebase still describing it the pre-#59 way. Renamed the label to "Open application editor" and updated the exact-string assertion in `src/__tests__/LikeContainer.spec.ts`; Playwright's `e2e/` specs never selected this button by its label, so they were unaffected. Carried the same rename through `MatchPage.vue`, whose `openCoverLetter()`, `closeCoverLetter()` and `coverLetterOpen` all named the cover letter while opening the Application Editor overlay (now `openApplicationEditor()`, `closeApplicationEditor()` and `applicationEditorOpen`), and through its scoped `MatchPage.css`, where the overlay was commented "Cover letter fly-in overlay" and its keyframes were named `cl-fly-in` — both wrong twice over, since the same `.overlay` rule also drives the Search overlay (now `overlay-fly-in`, with a comment naming both users). Also closed the accessibility hole that left the mislabelled destination reachable in the first place: `.overlay` hid a closed overlay with `opacity: 0`, an off-screen `transform` and `pointer-events: none`, none of which removes an element from the accessibility tree or the keyboard tab order, so a closed overlay's controls stayed focusable and announced — on a fresh load that meant tabbing off the deck straight into the invisible Search page's city, distance and keyword inputs (`SearchPage` has no `v-if`), and after one use of the pencil button the closed Application Editor's Back, cover letter, CV and download controls joined them. Added `visibility: hidden` to `.overlay` and `visibility: visible` to `.overlay--open`, with the `visibility` transition delayed by the length of the fly-out (and by the shorter fade in the `prefers-reduced-motion: reduce` override) so the closing animation still plays. Added a `MatchPage.spec.ts` test asserting that clicking the pencil button opens the overlay on the "Application Editor" header — the button-to-destination contract this fix is about had no coverage at all, `LikeContainer.spec.ts` stopping at "an `edit` event is emitted" (closes #63).

## v0.2.7

### Removed

- The path alias configuration was split across two files that disagreed: `vite.config.ts`'s `resolve.alias` defined four aliases (`@`, `@pages`, `@components`, `@assets`) while `tsconfig.app.json`'s `compilerOptions.paths` mapped only two (`@/*` and `@pages`). An import through `@components` or `@assets` therefore bundled fine via `npm run dev` / `npm run build` and then failed `npm run type-check` (`vue-tsc --build`) with "Cannot find module" — a trap for anyone who read `vite.config.ts` and assumed all four were usable, and one that v0.2.5's README documented as a caveat instead of fixing. Neither alias was needed: nothing in `src/` or `e2e/` imported through them, `@/components` and `@/assets` already cover both via the `@/*` mapping that _is_ type-checked, and `src/assets` does not exist, so `@assets` pointed at a missing directory. Deleted the `@components` and `@assets` entries from `resolve.alias`, leaving `@` and `@pages` — the two that `tsconfig.app.json` maps. Adding them to `tsconfig.app.json` instead was rejected: it keeps two redundant spellings for the same import and would map `@assets` to a directory that doesn't exist. Updated the "Path aliases" section of `README.md` and the "Path Aliases" list in `CLAUDE.md` to the two supported aliases, recorded that the aliases apply to `src/` only (`e2e/` compiles against `e2e/tsconfig.json` and the root config files against `tsconfig.node.json`, neither of which has a `paths` mapping), and noted in both `README.md` and `vite.config.ts` that any future alias must be added to `vite.config.ts` and `tsconfig.app.json` together so the two cannot drift apart again. External behavior is unchanged; the bundle output is identical (closes #61).

## v0.2.6

### Fixed

- `README.md` documented the Application Editor as a single screen: one "Application editor" feature bullet describing an editor that opens with the job it belongs to kept in view, auto-saves the draft, and whose "menu" was mentioned only in passing as something that also attaches a CV and downloads files — and a Screenshots table whose second column was headed "Cover letter editor" while pointing at `docs/screenshots/application-editor.png`. The page is really a two-view flow: `src/pages/match/ApplicationEditorPage.vue` holds `const view = ref<'menu' | 'letter'>('menu')` and lands on `src/components/application/ApplicationEditorMenu.vue` (header "Application Editor"), and the cover letter editor (header "Cover Letter") is a second view opened from the menu's cover letter row. A reader therefore never learned that the screen the pencil button actually opens is the menu, and the only screenshot named after it showed the other view. Renamed `docs/screenshots/application-editor.png` to `cover-letter-editor.png`, since it had always shown the Cover Letter view, and captured a new `application-editor.png` of the menu in its filled state — "Draft written", "PDF attached", both per-document download buttons enabled and "Download application" enabled — then widened the Screenshots table to three columns (Match page | Application Editor | Cover Letter). Replaced the single feature bullet with three: **Application editor** for the two-view flow itself; **Cover letter** for one-tap generation (`POST /cover-letters/create/text`), the immediate `localStorage` save and the upload debounced 3s after typing stops (`POST /cover-letters/upload/text`) together with the points that flush it early (leaving the editor, swiping to another card, unmount), and the fact that the job is kept in view in the letter view but not in the menu; and **CV and downloads** for the per-`duplicateKey` CV attachment (`POST /cv/upload` and `GET /cv/<duplicateKey>/status`, both issued by `ApplicationEditorPage.vue` — `src/components/CvFileInput.vue` only emits the chosen file), the three download endpoints (`GET /cover-letters/<duplicateKey>`, `GET /cv/<duplicateKey>` and the merged `GET /application/<duplicateKey>`), and the distinct gates behind each disabled state — in particular that the cover letter download enables on a local draft (`letterDone = text.trim().length > 0`) rather than on the document being present on the server, so it unlocks before the debounced upload lands. Also corrected the match page screenshot's alt text to name the pencil button that opens the Application Editor, and the project layout tree's `components/` line to list the application editor UI. Documentation only; no source or configuration changed (closes #59).

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
