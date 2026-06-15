<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BrandBar, JobCardStack, MatchFilterBar } from '@/components'
import ApplicationEditorPage from './ApplicationEditorPage.vue'
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

async function fetchCosineSimilarity(job: ScrapedJob): Promise<void> {
  if (!job.embedding?.length) return
  try {
    const result = await postJson<{ similarity: number | null }>(
      '/jobs/liked-average-similarity',
      job.embedding,
    )
    if (typeof result.similarity === 'number') {
      job.cosineSimilarity = result.similarity
    }
  } catch {
    // similarity is optional; silently ignore errors
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
          void fetchCosineSimilarity(jobs.value.at(-1)!)
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
    <BrandBar />

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
      <div v-else class="match-status-fill">
        <p class="match-page__status">Loading jobs...</p>
      </div>
    </template>

    <div :class="['overlay', { 'overlay--open': coverLetterOpen }]">
      <ApplicationEditorPage v-if="activeJob" :job="activeJob" @back="closeCoverLetter" />
    </div>

    <div :class="['overlay', { 'overlay--open': searchOpen }]">
      <SearchPage
        :keywords="keywords"
        @update:keywords="updateKeywords"
        @back="searchOpen = false"
      />
    </div>
  </main>
</template>

<style scoped src="./MatchPage.css"></style>
