<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BrandBar, JobCardStack, MatchFilterBar } from '@/components'
import ApplicationEditorPage from './ApplicationEditorPage.vue'
import MatchEmpty from './MatchEmpty.vue'
import SearchPage from './SearchPage.vue'
import type { ScrapedJob } from '@/components/jobCard/types'
import { postJson } from '@/lib/api'

type LinkedInJobLinksByKeyword = Record<string, string[]>

const jobs = ref<ScrapedJob[]>([])
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const failedJobPageUrls = ref<string[]>([])
const cosineFilterOn = ref(false)
const cosineThreshold = ref(50)
const keywords = ref<string[]>(loadKeywords())
const searchOpen = ref(false)
const coverLetterOpen = ref(false)
const activeJob = ref<ScrapedJob | null>(null)

const matchEnabled = computed(() => keywords.value.length > 0)
const visibleJobs = computed(() =>
  cosineFilterOn.value
    ? jobs.value.filter(
        (job) => Math.round((job.cosineSimilarity ?? 0) * 100) >= cosineThreshold.value,
      )
    : jobs.value,
)
const emptyLabel = computed(() =>
  cosineFilterOn.value ? `No jobs at or above ${cosineThreshold.value}% match` : 'No more jobs',
)

function loadKeywords(): string[] {
  try {
    const raw = window.localStorage.getItem('jobmatch.searchkeywords')
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}

function updateKeywords(next: string[]): void {
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

function openCoverLetter(job: ScrapedJob): void {
  activeJob.value = job
  coverLetterOpen.value = true
}

function closeCoverLetter(): void {
  coverLetterOpen.value = false
}

async function createJob(job: ScrapedJob, like: boolean): Promise<void> {
  try {
    await postJson('/jobs/create', { job, like })
  } catch (error) {
    console.error('Failed to create job:', error instanceof Error ? error.message : error)
  }
}

const MAX_SIMILARITY_CONCURRENCY = 2
let similarityInFlight = 0
let similarityGeneration = 0
const similarityQueue: Array<() => void> = []
let similarityAbortController: AbortController | null = null

const MAX_SCRAPE_CONCURRENCY = 2
let scrapeInFlight = 0
let scrapeGeneration = 0
const scrapeQueue: Array<() => void> = []
let scrapeAbortController: AbortController | null = null

let lastFetchedParams: { keywords: string[]; city: string; distance: number } | null = null

function searchParamsChanged(): boolean {
  const cur = { keywords: keywords.value, city: getCity(), distance: getDistance() }
  if (!lastFetchedParams) return true
  return (
    cur.city !== lastFetchedParams.city ||
    cur.distance !== lastFetchedParams.distance ||
    cur.keywords.length !== lastFetchedParams.keywords.length ||
    cur.keywords.some((k, i) => k !== lastFetchedParams!.keywords[i])
  )
}

function drainSimilarityQueue(): void {
  while (similarityInFlight < MAX_SIMILARITY_CONCURRENCY && similarityQueue.length > 0) {
    similarityInFlight++
    similarityQueue.shift()!()
  }
}

function drainScrapeQueue(): void {
  while (scrapeInFlight < MAX_SCRAPE_CONCURRENCY && scrapeQueue.length > 0) {
    scrapeInFlight++
    scrapeQueue.shift()!()
  }
}

async function fetchCosineSimilarity(job: ScrapedJob): Promise<void> {
  if (!job.embedding?.length) return
  const generation = similarityGeneration
  const signal = similarityAbortController?.signal
  await new Promise<void>((resolve) => {
    similarityQueue.push(resolve)
    drainSimilarityQueue()
  })
  if (generation !== similarityGeneration) return
  try {
    const result = await postJson<{ similarity: number | null }>(
      '/jobs/liked-average-similarity',
      job.embedding,
      signal,
    )
    if (typeof result.similarity === 'number') {
      job.cosineSimilarity = result.similarity
    }
  } catch {
    // similarity is optional; silently ignore errors
  } finally {
    if (generation === similarityGeneration) {
      similarityInFlight--
      drainSimilarityQueue()
    }
  }
}

async function scrapeJobPage(url: string, signal: AbortSignal): Promise<void> {
  const generation = scrapeGeneration
  await new Promise<void>((resolve) => {
    scrapeQueue.push(resolve)
    drainScrapeQueue()
  })
  if (generation !== scrapeGeneration) return
  try {
    const scrapedJob = await postJson<ScrapedJob>('/scrape/linkedin/job-page', { url }, signal)
    // Stale result from a superseded search — discard silently; belongs to neither the old
    // (already reset) nor the new search's jobs/failures.
    if (generation !== scrapeGeneration) return
    const pushedIndex = jobs.value.push(scrapedJob) - 1
    void fetchCosineSimilarity(jobs.value[pushedIndex]!)
  } catch {
    if (generation === scrapeGeneration) {
      failedJobPageUrls.value.push(url)
    }
  } finally {
    if (generation === scrapeGeneration) {
      scrapeInFlight--
      drainScrapeQueue()
    }
  }
}

async function fetchJobs(): Promise<void> {
  lastFetchedParams = { keywords: [...keywords.value], city: getCity(), distance: getDistance() }
  similarityAbortController?.abort()
  similarityAbortController = new AbortController()
  similarityGeneration++
  for (const resolve of similarityQueue.splice(0)) resolve()
  similarityInFlight = 0
  scrapeAbortController?.abort()
  scrapeAbortController = new AbortController()
  scrapeGeneration++
  for (const resolve of scrapeQueue.splice(0)) resolve()
  scrapeInFlight = 0
  // Capture local snapshots before the first await so a concurrent fetchJobs() call cannot
  // overwrite scrapeAbortController or scrapeGeneration and corrupt this call's state.
  const myGeneration = scrapeGeneration
  const signal = scrapeAbortController.signal
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
      signal,
    )
    if (scrapeGeneration !== myGeneration) return
    const filteredJobLinksByKeyword = await postJson<LinkedInJobLinksByKeyword>(
      '/jobs/filter-job-links',
      jobLinksByKeyword,
      signal,
    )
    if (scrapeGeneration !== myGeneration) return
    const urls = [...new Set(Object.values(filteredJobLinksByKeyword).flat())]
    await Promise.all(urls.map((url) => scrapeJobPage(url, signal)))
  } catch (error) {
    if (scrapeGeneration === myGeneration) {
      jobs.value = []
      errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch jobs.'
    }
  } finally {
    if (scrapeGeneration === myGeneration) {
      isLoading.value = false
    }
  }
}

onMounted(() => {
  if (keywords.value.length > 0) void fetchJobs()
})

watch(searchOpen, (open) => {
  if (!open && keywords.value.length > 0 && searchParamsChanged()) void fetchJobs()
})
</script>

<template>
  <main class="match-page">
    <BrandBar />

    <MatchEmpty v-if="!matchEnabled" @open-search="searchOpen = true" />
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
          v-model:enabled="cosineFilterOn"
          v-model:threshold="cosineThreshold"
          @search="searchOpen = true"
        />
        <JobCardStack
          :key="cosineFilterOn ? 'min-' + cosineThreshold : 'all'"
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
