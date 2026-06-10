<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { JobCardStack } from '@/components'
import CoverLetterPage from './CoverLetterPage.vue'
import type { ScrapedJob } from '@/components/jobCard/types'

type LinkedInJobLinksByKeyword = Record<string, string[]>

const API_BASE_URL = import.meta.env.VITE_JOB_MATCH_SERVER_URL ?? 'http://localhost:3000'

const jobs = ref<ScrapedJob[]>([])
const isLoading = ref(true)
const errorMessage = ref<string | null>(null)
const failedJobPageUrls = ref<string[]>([])

const coverLetterOpen = ref(false)
const activeJob = ref<ScrapedJob | null>(null)

function openCoverLetter(job: ScrapedJob) {
  activeJob.value = job
  coverLetterOpen.value = true
}

function closeCoverLetter() {
  coverLetterOpen.value = false
}

async function postJson<ResponseBody>(path: string, body: unknown): Promise<ResponseBody> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response))
  }

  return response.json() as Promise<ResponseBody>
}

async function getResponseErrorMessage(response: Response): Promise<string> {
  try {
    const errorBody = (await response.json()) as { error?: unknown; message?: unknown }
    const serverMessage = errorBody.message ?? errorBody.error

    if (typeof serverMessage === 'string' && serverMessage.length > 0) {
      return serverMessage
    }
  } catch {
    // Fall back to the status text below when the server did not return JSON.
  }

  return response.statusText || `Request failed with status ${response.status}`
}

function getUniqueUrls(jobLinksByKeyword: LinkedInJobLinksByKeyword): string[] {
  return [...new Set(Object.values(jobLinksByKeyword).flat())]
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
        keywords: ['Full Stack Engineer'],
        location: 'Hamburg',
        distance: 25,
      },
    )
    const filteredJobLinksByKeyword = await postJson<LinkedInJobLinksByKeyword>(
      '/jobs/filter-job-links',
      jobLinksByKeyword,
    )
    const urls = getUniqueUrls(filteredJobLinksByKeyword)
    await Promise.all(
      urls.map(async (url) => {
        try {
          const job = await postJson<ScrapedJob>('/scrape/linkedin/job-page', { url })
          jobs.value.push(job)
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
      <JobCardStack :jobs="jobs" @like="createJob" @edit="openCoverLetter" />
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
  min-height: 100svh;
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
  color: #b42318;
}

.match-page__status--loading {
  margin-bottom: var(--match-card-control-gap);
}

.match-page__status--warning {
  margin-bottom: var(--match-card-control-gap);
  color: #b54708;
}

/* Cover letter fly-in overlay */
.cl-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  transform-origin: center center;
  transform: translateX(115%) rotate(7deg) scale(0.6);
  opacity: 0;
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  background: var(--background-color);
  transition: transform 0.4s cubic-bezier(0.22, 0.61, 0.36, 1),
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
    border-radius: 24px;
  }
  46% {
    transform: translateX(0) rotate(0deg) scale(0.62);
    opacity: 1;
    border-radius: 24px;
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
