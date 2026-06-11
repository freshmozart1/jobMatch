<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { JobCardStack, MatchFilterBar } from '@/components'
import CoverLetterPage from './CoverLetterPage.vue'
import type { ScrapedJob } from '@/components/jobCard/types'
import { postJson } from '@/lib/api'

type LinkedInJobLinksByKeyword = Record<string, string[]>

const jobs = ref<ScrapedJob[]>([])
const isLoading = ref(true)
const errorMessage = ref<string | null>(null)
const failedJobPageUrls = ref<string[]>([])

// In-card match filter: switch between all jobs and only jobs whose cosine
// similarity is >= threshold% (set via the adjacent number input).
const filterOn = ref(false)
const threshold = ref(50)

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

async function loadJobSimilarity(job: ScrapedJob): Promise<void> {
  // Isolated from the scrape flow: a similarity failure must never drop the job
  // or trip the fetch-error state — the indicator simply stays hidden.
  try {
    const { similarity } = await postJson<{ similarity: number | null }>(
      '/jobs/liked-average-similarity',
      job.embedding,
    )
    if (typeof similarity === 'number') job.cosineSimilarity = similarity
  } catch (error) {
    console.error('Failed to fetch job similarity:', error instanceof Error ? error.message : error)
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
        keywords: ['Full Stack Engineer'],
        location: 'Hamburg',
        distance: 25,
      },
    )
    const filteredJobLinksByKeyword = await postJson<LinkedInJobLinksByKeyword>(
      '/jobs/filter-job-links',
      jobLinksByKeyword,
    )
    await Promise.all(
      [...new Set(Object.values(filteredJobLinksByKeyword).flat())].map(async (url) => {
        try {
          const job = await postJson<ScrapedJob>('/scrape/linkedin/job-page', { url })
          // Mutate through the reactive array element so the indicator updates
          // when its similarity resolves (a direct raw-object write would not
          // trigger Vue reactivity).
          const reactiveJob = jobs.value[jobs.value.push(job) - 1]!
          await loadJobSimilarity(reactiveJob)
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
  void fetchJobs()
})
</script>

<template>
  <main class="match-page">
    <div class="brandbar">
      <div class="brandbar__mark" />
      <div class="brandbar__name">job<span>Match</span></div>
    </div>

    <p v-if="errorMessage" class="match-page__status match-page__status--error">
      {{ errorMessage }}
    </p>
    <template v-else-if="jobs.length > 0 || !isLoading">
      <p v-if="isLoading" class="match-page__status match-page__status--loading">
        Loading more jobs...
      </p>
      <p v-if="failedJobPageUrls.length > 0" class="match-page__status match-page__status--warning">
        {{ failedJobPageUrls.length }} job page request failed.
      </p>
      <MatchFilterBar v-model:enabled="filterOn" v-model:threshold="threshold" />
      <JobCardStack
        :key="filterOn ? 'min-' + threshold : 'all'"
        :jobs="visibleJobs"
        :empty-label="emptyLabel"
        @like="createJob"
        @edit="openCoverLetter"
      />
    </template>
    <p v-else class="match-page__status">Loading jobs...</p>

    <div :class="['cl-overlay', { 'cl-overlay--open': coverLetterOpen }]">
      <CoverLetterPage v-if="activeJob" :job="activeJob" @back="closeCoverLetter" />
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
