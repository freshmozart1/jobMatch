<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BrandBar, JobCardStack, MatchFilterBar } from '@/components'
import ApplicationEditorPage from './ApplicationEditorPage.vue'
import MatchEmpty from './MatchEmpty.vue'
import SearchPage from './SearchPage.vue'
import type { ScrapedJob } from '@/components/jobCard/types'
import { postJson } from '@/lib/api'
import { DEFAULT_DATE_POSTED } from './searchParams'

type ScrapeJobResponseBody = Record<string, { searchUrl: string; jobs: ScrapedJob[] }>

const jobs = ref<ScrapedJob[]>([])
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const matchFilterOn = ref(false)
const matchThreshold = ref(50)
const keywords = ref<string[]>(loadKeywords())
const searchOpen = ref(false)
const coverLetterOpen = ref(false)
const activeJob = ref<ScrapedJob | null>(null)

const matchEnabled = computed(() => keywords.value.length > 0)
const visibleJobs = computed(() =>
  matchFilterOn.value
    ? jobs.value.filter((job) => Math.round((job.match ?? 0) * 100) >= matchThreshold.value)
    : jobs.value,
)
const emptyLabel = computed(() =>
  matchFilterOn.value ? `No jobs at or above ${matchThreshold.value}% match` : 'No more jobs',
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

function getDatePosted(): string {
  try {
    return window.localStorage.getItem('jobmatch.searchdateposted') || DEFAULT_DATE_POSTED
  } catch {
    return DEFAULT_DATE_POSTED
  }
}

function getMaxPages(): number {
  try {
    const raw = window.localStorage.getItem('jobmatch.searchmaxpages')
    return raw !== null ? parseInt(raw, 10) || 1 : 1
  } catch {
    return 1
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

let scrapeGeneration = 0
let scrapeAbortController: AbortController | null = null

let lastFetchedParams: {
  keywords: string[]
  city: string
  distance: number
  datePosted: string
  maxPages: number
} | null = null

function searchParamsChanged(): boolean {
  const cur = {
    keywords: keywords.value,
    city: getCity(),
    distance: getDistance(),
    datePosted: getDatePosted(),
    maxPages: getMaxPages(),
  }
  if (!lastFetchedParams) return true
  return (
    cur.city !== lastFetchedParams.city ||
    cur.distance !== lastFetchedParams.distance ||
    cur.datePosted !== lastFetchedParams.datePosted ||
    cur.maxPages !== lastFetchedParams.maxPages ||
    cur.keywords.length !== lastFetchedParams.keywords.length ||
    cur.keywords.some((k, i) => k !== lastFetchedParams!.keywords[i])
  )
}

async function fetchJobs(): Promise<void> {
  lastFetchedParams = {
    keywords: [...keywords.value],
    city: getCity(),
    distance: getDistance(),
    datePosted: getDatePosted(),
    maxPages: getMaxPages(),
  }
  scrapeAbortController?.abort()
  scrapeAbortController = new AbortController()
  scrapeGeneration++
  const myGeneration = scrapeGeneration
  const signal = scrapeAbortController.signal
  isLoading.value = true
  jobs.value = []
  errorMessage.value = null

  try {
    const result = await postJson<ScrapeJobResponseBody>(
      '/scrape/linkedin/playwright',
      {
        keywords: keywords.value,
        location: getCity(),
        distance: getDistance(),
        datePosted: getDatePosted(),
        maxPages: getMaxPages(),
      },
      signal,
    )
    if (scrapeGeneration !== myGeneration) return
    jobs.value = Object.values(result).flatMap(({ jobs }) => jobs)
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
        <MatchFilterBar
          v-model:enabled="matchFilterOn"
          v-model:threshold="matchThreshold"
          @search="searchOpen = true"
        />
        <JobCardStack
          :key="matchFilterOn ? 'min-' + matchThreshold : 'all'"
          :jobs="visibleJobs"
          :empty-label="emptyLabel"
          :is-loading="isLoading"
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
