<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
    BrandBar,
    CancelScrapeButton,
    JobCardStack,
    MatchFilterBar,
} from '@/components';
import ApplicationEditorPage from './ApplicationEditorPage.vue';
import MatchEmpty from './MatchEmpty.vue';
import SearchPage from './SearchPage.vue';
import type { ScrapedJob } from '@/components/jobCard/types';
import { postJson, postJsonEventStream } from '@/lib/api';
import { DEFAULT_DATE_POSTED } from './searchParams';

type ScrapeErrorEvent = { error: string; reason: unknown };
type ScrapeStreamEvent = ScrapedJob | ScrapeErrorEvent;

function isScrapeErrorEvent(
    event: ScrapeStreamEvent,
): event is ScrapeErrorEvent {
    return 'error' in event;
}

const jobs = ref<ScrapedJob[]>([]);
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const scrapeCancelled = ref(false);
const matchFilterOn = ref(false);
const matchThreshold = ref(50);
const keywords = ref<string[]>(loadKeywords());
const searchOpen = ref(false);
const searchDialogActive = ref(false);
const applicationEditorOpen = ref(false);
const activeJob = ref<ScrapedJob | null>(null);
const matchPageRef = ref<HTMLElement | null>(null);
const applicationEditorDialogRef = ref<HTMLElement | null>(null);
const searchDialogRef = ref<HTMLElement | null>(null);

let applicationEditorTrigger: HTMLButtonElement | null = null;
let searchTrigger: HTMLButtonElement | null = null;

const matchEnabled = computed(() => keywords.value.length > 0);
const dialogActive = computed(
    () => activeJob.value !== null || searchDialogActive.value,
);
const visibleJobs = computed(() =>
    matchFilterOn.value
        ? jobs.value.filter(
              (job) =>
                  Math.round((job.match ?? 0) * 100) >= matchThreshold.value,
          )
        : jobs.value,
);
const emptyLabel = computed(() => {
    // With nothing scraped at all, the threshold wording would blame the filter
    // for an empty deck the cancelled scrape is responsible for.
    if (scrapeCancelled.value && jobs.value.length === 0)
        return 'Search stopped';
    if (matchFilterOn.value)
        return `No jobs at or above ${matchThreshold.value}% match`;
    return scrapeCancelled.value ? 'Search stopped' : 'No more jobs';
});

function loadKeywords(): string[] {
    try {
        const raw = window.localStorage.getItem('jobmatch.searchkeywords');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
            ? parsed.filter((k) => typeof k === 'string').slice(0, 5)
            : [];
    } catch {
        return [];
    }
}

function updateKeywords(next: string[]): void {
    keywords.value = next;
    try {
        window.localStorage.setItem(
            'jobmatch.searchkeywords',
            JSON.stringify(next),
        );
    } catch {
        // ignore quota errors
    }
}

function getCity(): string {
    try {
        return window.localStorage.getItem('jobmatch.searchcity') ?? '';
    } catch {
        return '';
    }
}

function getDistance(): number {
    try {
        const raw = window.localStorage.getItem('jobmatch.searchdistance');
        return raw ? Number(raw) || 25 : 25;
    } catch {
        return 25;
    }
}

function getDatePosted(): string {
    try {
        return (
            window.localStorage.getItem('jobmatch.searchdateposted') ||
            DEFAULT_DATE_POSTED
        );
    } catch {
        return DEFAULT_DATE_POSTED;
    }
}

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function isRendered(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current) {
        const style = window.getComputedStyle(current);
        if (
            current.hidden ||
            current.getAttribute('aria-hidden') === 'true' ||
            style.display === 'none' ||
            style.visibility === 'hidden'
        ) {
            return false;
        }
        current = current.parentElement;
    }
    return true;
}

function getTabbableElements(dialog: HTMLElement): HTMLElement[] {
    return Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(isRendered);
}

function focusDialogHeading(dialog: HTMLElement | null): void {
    dialog?.querySelector<HTMLElement>('.cl-header__title')?.focus();
}

async function openApplicationEditor(
    job: ScrapedJob,
    trigger: HTMLButtonElement,
): Promise<void> {
    if (searchDialogActive.value) return;
    applicationEditorTrigger = trigger;
    activeJob.value = job;
    applicationEditorOpen.value = true;
    await nextTick();
    focusDialogHeading(applicationEditorDialogRef.value);
}

function closeApplicationEditor(): void {
    if (!applicationEditorOpen.value) return;
    applicationEditorOpen.value = false;
}

function finishClosingApplicationEditor(event: TransitionEvent): void {
    if (event.propertyName !== 'visibility' || applicationEditorOpen.value)
        return;
    activeJob.value = null;
    const trigger = applicationEditorTrigger;
    applicationEditorTrigger = null;
    void restoreFocus(trigger, '.like-container__button--edit');
}

async function openSearch(trigger: HTMLButtonElement): Promise<void> {
    if (activeJob.value !== null) return;
    searchTrigger = trigger;
    searchDialogActive.value = true;
    searchOpen.value = true;
    await nextTick();
    focusDialogHeading(searchDialogRef.value);
}

function closeSearch(): void {
    if (!searchOpen.value) return;
    searchOpen.value = false;
}

function finishClosingSearch(event: TransitionEvent): void {
    if (event.propertyName !== 'visibility' || searchOpen.value) return;
    searchDialogActive.value = false;
    const trigger = searchTrigger;
    searchTrigger = null;
    void restoreFocus(
        trigger,
        '.match-filter__search, .match-empty__cta, .scrape-cancel',
    );
}

async function restoreFocus(
    trigger: HTMLButtonElement | null,
    fallbackSelector: string,
): Promise<void> {
    await nextTick();
    if (trigger?.isConnected) {
        trigger.focus();
        return;
    }
    const fallback =
        matchPageRef.value?.querySelector<HTMLElement>(fallbackSelector) ??
        matchPageRef.value;
    fallback?.focus();
}

function getActiveDialog(): HTMLElement | null {
    if (activeJob.value !== null) return applicationEditorDialogRef.value;
    if (searchDialogActive.value) return searchDialogRef.value;
    return null;
}

function handleDialogFocusin(event: FocusEvent): void {
    const dialog = getActiveDialog();
    if (
        !dialog?.isConnected ||
        !(event.target instanceof Node) ||
        dialog.contains(event.target)
    ) {
        return;
    }
    focusDialogHeading(dialog);
}

function handleDialogKeydown(event: KeyboardEvent): void {
    const dialog = getActiveDialog();
    if (!dialog?.isConnected) return;

    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (applicationEditorOpen.value) closeApplicationEditor();
        else if (searchOpen.value) closeSearch();
        return;
    }
    if (event.key !== 'Tab') return;

    const tabbableElements = getTabbableElements(dialog);
    const activeElement = document.activeElement as HTMLElement | null;
    const first = tabbableElements[0];
    const last = tabbableElements[tabbableElements.length - 1];

    if (!first || !last) {
        event.preventDefault();
        focusDialogHeading(dialog);
        return;
    }

    if (!activeElement || !tabbableElements.includes(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

async function createJob(job: ScrapedJob, like: boolean): Promise<void> {
    try {
        await postJson('/jobs/create', { job, like });
    } catch (error) {
        console.error(
            'Failed to create job:',
            error instanceof Error ? error.message : error,
        );
    }
}

let scrapeGeneration = 0;
let scrapeAbortController: AbortController | null = null;

let lastFetchedParams: {
    keywords: string[];
    city: string;
    distance: number;
    datePosted: string;
} | null = null;

function searchParamsChanged(): boolean {
    const cur = {
        keywords: keywords.value,
        city: getCity(),
        distance: getDistance(),
        datePosted: getDatePosted(),
    };
    if (!lastFetchedParams) return true;
    return (
        cur.city !== lastFetchedParams.city ||
        cur.distance !== lastFetchedParams.distance ||
        cur.datePosted !== lastFetchedParams.datePosted ||
        cur.keywords.length !== lastFetchedParams.keywords.length ||
        cur.keywords.some((k, i) => k !== lastFetchedParams!.keywords[i])
    );
}

// One frame of the scrape stream: an error frame updates the banner without
// ending the scrape, and a job frame is kept only the first time its
// duplicateKey is seen.
function applyScrapeEvent(
    event: ScrapeStreamEvent,
    seenDuplicateKeys: Set<string>,
): void {
    if (isScrapeErrorEvent(event)) {
        errorMessage.value = event.error;
        return;
    }
    if (seenDuplicateKeys.has(event.duplicateKey)) return;
    seenDuplicateKeys.add(event.duplicateKey);
    jobs.value.push(event);
}

async function fetchJobs(): Promise<void> {
    lastFetchedParams = {
        keywords: [...keywords.value],
        city: getCity(),
        distance: getDistance(),
        datePosted: getDatePosted(),
    };
    scrapeAbortController?.abort();
    scrapeAbortController = new AbortController();
    scrapeGeneration++;
    const myGeneration = scrapeGeneration;
    const signal = scrapeAbortController.signal;
    isLoading.value = true;
    jobs.value = [];
    errorMessage.value = null;
    scrapeCancelled.value = false;
    const seenDuplicateKeys = new Set<string>();

    try {
        for await (const event of postJsonEventStream<ScrapeStreamEvent>(
            '/scrape/linkedin',
            {
                keywords: keywords.value,
                location: getCity(),
                distance: getDistance(),
                datePosted: getDatePosted(),
            },
            signal,
        )) {
            if (scrapeGeneration !== myGeneration) return;
            applyScrapeEvent(event, seenDuplicateKeys);
        }
    } catch (error) {
        // An abort is either a user-requested stop or a superseded scrape —
        // neither is a failure, so neither may surface as an error message.
        if (scrapeGeneration === myGeneration && !signal.aborted) {
            errorMessage.value =
                error instanceof Error
                    ? error.message
                    : 'Failed to fetch jobs.';
        }
    } finally {
        if (scrapeGeneration === myGeneration) {
            isLoading.value = false;
        }
    }
}

function cancelScrape(): void {
    scrapeCancelled.value = true;
    // Settle into the stopped state immediately rather than waiting for the
    // aborted stream to reject — a stream that has already been fully buffered
    // drains to `done` instead of erroring, and never rejects at all.
    isLoading.value = false;
    // Forget the cancelled scrape's parameters so that reopening and closing
    // the search sheet re-runs the *same* search. Without this the user has no
    // way back to the search they stopped, which is the dead end the cancel
    // control exists to prevent.
    lastFetchedParams = null;
    scrapeAbortController?.abort();
}

onUnmounted(() => {
    scrapeAbortController?.abort();
    document.removeEventListener('focusin', handleDialogFocusin, true);
    document.removeEventListener('keydown', handleDialogKeydown, true);
});

onMounted(() => {
    document.addEventListener('focusin', handleDialogFocusin, true);
    document.addEventListener('keydown', handleDialogKeydown, true);
    if (keywords.value.length > 0) void fetchJobs();
});

watch(searchOpen, (open) => {
    if (!open && keywords.value.length > 0 && searchParamsChanged())
        void fetchJobs();
});
</script>

<template>
    <main
        ref="matchPageRef"
        class="match-page"
        tabindex="-1"
        :inert="dialogActive || undefined"
    >
        <BrandBar />

        <MatchEmpty
            v-if="!matchEnabled"
            :search-open="searchOpen"
            @open-search="openSearch"
        />
        <template v-else>
            <!-- Initial load: this branch wins over the error state below so an
                 in-flight scrape stays cancellable even after an error frame —
                 otherwise a mid-scrape error re-traps the user on a screen with
                 no way to stop the scrape. -->
            <div
                v-if="isLoading && jobs.length === 0"
                class="match-status-fill"
            >
                <p
                    v-if="errorMessage"
                    class="match-page__status match-page__status--warning"
                >
                    {{ errorMessage }}
                </p>
                <p class="match-page__status">Loading jobs...</p>
                <CancelScrapeButton @cancel="cancelScrape" />
            </div>
            <p
                v-else-if="errorMessage && jobs.length === 0"
                class="match-page__status match-page__status--error"
            >
                {{ errorMessage }}
            </p>
            <template v-else>
                <p
                    v-if="errorMessage"
                    class="match-page__status match-page__status--warning"
                >
                    {{ errorMessage }}
                </p>
                <MatchFilterBar
                    v-model:enabled="matchFilterOn"
                    v-model:threshold="matchThreshold"
                    :search-open="searchOpen"
                    @search="openSearch"
                />
                <JobCardStack
                    :key="matchFilterOn ? 'min-' + matchThreshold : 'all'"
                    :jobs="visibleJobs"
                    :empty-label="emptyLabel"
                    :is-loading="isLoading"
                    :application-editor-open="applicationEditorOpen"
                    @like="createJob"
                    @edit="openApplicationEditor"
                    @cancel="cancelScrape"
                />
            </template>
        </template>
    </main>

    <div
        id="application-editor-dialog"
        ref="applicationEditorDialogRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-editor-dialog-title"
        :class="['overlay', { 'overlay--open': applicationEditorOpen }]"
        @transitionend.self="finishClosingApplicationEditor"
    >
        <ApplicationEditorPage
            v-if="activeJob"
            :job="activeJob"
            @back="closeApplicationEditor"
        />
    </div>

    <div
        id="search-dialog"
        ref="searchDialogRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-dialog-title"
        :class="['overlay', { 'overlay--open': searchOpen }]"
        @transitionend.self="finishClosingSearch"
    >
        <SearchPage
            :keywords="keywords"
            @update:keywords="updateKeywords"
            @back="closeSearch"
        />
    </div>
</template>

<style scoped src="./MatchPage.css"></style>
