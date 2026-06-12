<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { JobCardStack, MatchFilterBar } from '@/components'
import CoverLetterPage from './CoverLetterPage.vue'
import SearchPage from './SearchPage.vue'
import type { ScrapedJob } from '@/components/jobCard/types'
import { postJson } from '@/lib/api'

type LinkedInJobLinksByKeyword = Record<string, string[]>

const jobs = ref<ScrapedJob[]>([])
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const failedJobPageUrls = ref<string[]>([])

// In-card match filter: switch between all jobs and only jobs whose cosine
// similarity is >= threshold% (set via the adjacent number input).
const filterOn = ref(false)
const threshold = ref(50)

function loadKeywords(): string[] {
  try {
    const raw = window.localStorage.getItem('jobmatch.searchkeywords')
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}

const keywords = ref<string[]>(loadKeywords())
const searchOpen = ref(false)
const matchEnabled = computed(() => keywords.value.length > 0)

function updateKeywords(next: string[]) {
  keywords.value = next
  try {
    window.localStorage.setItem('jobmatch.searchkeywords', JSON.stringify(next))
  } catch {
    // ignore quota errors
  }
}

function getCity(): string {
  try {
    return window.localStorage.getItem('jobmatch.searchcity') ?? ''
  } catch {
    return ''
  }
}

function getDistance(): number {
  try {
    const raw = window.localStorage.getItem('jobmatch.searchdistance')
    return raw ? Number(raw) || 25 : 25
  } catch {
    return 25
  }
}

const visibleJobs = computed(() =>
  filterOn.value
    ? jobs.value.filter((job) => Math.round((job.cosineSimilarity ?? 0) * 100) >= threshold.value)
    : jobs.value,
)

const emptyLabel = computed(() =>
  filterOn.value ? `No jobs at or above ${threshold.value}% match` : 'No more jobs',
)

const coverLetterOpen = ref(false)
const activeJob = ref<ScrapedJob | null>(null)

function openCoverLetter(job: ScrapedJob) {
  activeJob.value = job
  coverLetterOpen.value = true
}

function closeCoverLetter() {
  coverLetterOpen.value = false
}

async function createJob(job: ScrapedJob, like: boolean) {
  try {
    await postJson('/jobs/create', { job, like })
  } catch (error) {
    console.error('Failed to create job:', error instanceof Error ? error.message : error)
  }
}

async function fetchJobs(): Promise<void> {
  isLoading.value = true
  jobs.value = []
  errorMessage.value = null
  failedJobPageUrls.value = []

  try {
    const jobLinksByKeyword = await postJson<LinkedInJobLinksByKeyword>(
      '/scrape/linkedin/job-links',
      {
        keywords: keywords.value,
        location: getCity(),
        distance: getDistance(),
      },
    )
    const filteredJobLinksByKeyword = await postJson<LinkedInJobLinksByKeyword>(
      '/jobs/filter-job-links',
      jobLinksByKeyword,
    )
    await Promise.all(
      [...new Set(Object.values(filteredJobLinksByKeyword).flat())].map(async (url) => {
        try {
          jobs.value.push(await postJson<ScrapedJob>('/scrape/linkedin/job-page', { url }))
        } catch {
          failedJobPageUrls.value.push(url)
        }
      }),
    )
  } catch (error) {
    jobs.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch jobs.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  if (keywords.value.length > 0) void fetchJobs()
})

watch(searchOpen, (open) => {
  if (!open && keywords.value.length > 0) void fetchJobs()
})
</script>

<template>
  <main class="match-page">
    <div class="brandbar">
      <div class="brandbar__mark" />
      <div class="brandbar__name">job<span>Match</span></div>
    </div>

    <template v-if="!matchEnabled">
      <div class="match-empty">
        <div class="match-empty__icon">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20"
            />
          </svg>
        </div>
        <h2 class="match-empty__title">No keywords yet</h2>
        <p class="match-empty__text">Add search keywords to start swiping jobs.</p>
        <button type="button" class="match-empty__cta" @click="searchOpen = true">
          Add keywords
        </button>
      </div>
    </template>
    <template v-else>
      <p v-if="errorMessage" class="match-page__status match-page__status--error">
        {{ errorMessage }}
      </p>
      <template v-else-if="jobs.length > 0 || !isLoading">
        <p v-if="isLoading" class="match-page__status match-page__status--loading">
          Loading more jobs...
        </p>
        <p
          v-if="failedJobPageUrls.length > 0"
          class="match-page__status match-page__status--warning"
        >
          {{ failedJobPageUrls.length }} job page request failed.
        </p>
        <MatchFilterBar
          v-model:enabled="filterOn"
          v-model:threshold="threshold"
          @search="searchOpen = true"
        />
        <JobCardStack
          :key="filterOn ? 'min-' + threshold : 'all'"
          :jobs="visibleJobs"
          :empty-label="emptyLabel"
          @like="createJob"
          @edit="openCoverLetter"
        />
      </template>
      <p v-else class="match-page__status">Loading jobs...</p>
    </template>

    <div :class="['cl-overlay', { 'cl-overlay--open': coverLetterOpen }]">
      <CoverLetterPage v-if="activeJob" :job="activeJob" @back="closeCoverLetter" />
    </div>

    <div :class="['cl-overlay', { 'cl-overlay--open': searchOpen }]">
      <SearchPage
        :keywords="keywords"
        @update:keywords="updateKeywords"
        @back="searchOpen = false"
      />
    </div>
  </main>
</template>

<style scoped>
.match-page {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-height: 100dvh;
  overflow: hidden;
  padding: var(--match-top-padding) var(--match-horizontal-padding)
    calc(var(--match-bottom-padding) + var(--match-bottom-safe-area));
  background: var(--page-background-color, var(--background-color));
}

.brandbar {
  width: var(--job-card-width);
  height: var(--brandbar-height);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: var(--match-card-control-gap);
  flex: 0 0 auto;
}

.brandbar__mark {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: linear-gradient(135deg, var(--accents-pink), var(--accents-green));
  flex: 0 0 auto;
}

.brandbar__name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text-color);
}

.brandbar__name span {
  font-weight: 300;
  color: var(--border-color);
}

.match-page__status {
  max-width: var(--job-card-width);
  margin: 0;
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: var(--border-color);
  text-align: center;
}

.match-page__status--error {
  color: var(--error);
}

.match-page__status--loading {
  margin-bottom: var(--match-card-control-gap);
}

.match-page__status--warning {
  margin-bottom: var(--match-card-control-gap);
  color: var(--warning);
}

/* Empty state — no keywords saved yet */
.match-empty {
  flex: 1 1 0;
  min-height: 0;
  width: var(--job-card-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 14px;
  padding-bottom: 8vh;
}

.match-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  color: var(--border-color);
  margin-bottom: 4px;
}

.match-empty__icon svg {
  width: 28px;
  height: 28px;
}

.match-empty__title {
  margin: 0;
  font-family: 'Inter', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: var(--border-color);
}

.match-empty__text {
  margin: 0;
  max-width: 240px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--border-color);
  text-wrap: pretty;
}

.match-empty__cta {
  margin-top: 6px;
  padding: 11px 22px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--border-color);
  color: var(--background-color);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.match-empty__cta:hover {
  opacity: 0.85;
}

.match-empty__cta:active {
  opacity: 0.7;
}

/* Cover letter fly-in overlay */
.cl-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  transform-origin: center center;
  transform: translateX(115%) rotate(7deg) scale(0.6);
  opacity: 0;
  border-radius: var(--job-card-border-radius);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  background: var(--background-color);
  transition:
    transform 0.4s cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 0.3s ease,
    border-radius 0.4s ease;
}

.cl-overlay--open {
  transform: none;
  opacity: 1;
  border-radius: 0;
  pointer-events: auto;
  animation: cl-fly-in 0.66s cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes cl-fly-in {
  0% {
    transform: translateX(115%) rotate(7deg) scale(0.6);
    opacity: 0.35;
    border-radius: var(--job-card-border-radius);
  }
  46% {
    transform: translateX(0) rotate(0deg) scale(0.62);
    opacity: 1;
    border-radius: var(--job-card-border-radius);
  }
  100% {
    transform: none;
    border-radius: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cl-overlay {
    transition: opacity 0.2s ease;
    transform: none;
  }
  .cl-overlay--open {
    animation: none;
  }
}
</style>
