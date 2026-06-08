<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { JobCardStack } from '@/components'
import type { ScrapedJob } from '@/components/jobCard/types'

type LinkedInJobLinksByKeyword = Record<string, string[]>

const API_BASE_URL = import.meta.env.VITE_JOB_MATCH_SERVER_URL ?? 'http://localhost:3000'

const jobs = ref<ScrapedJob[]>([])
const isLoading = ref(true)
const errorMessage = ref<string | null>(null)
const failedJobPageUrls = ref<string[]>([])

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
      <JobCardStack :jobs="jobs" />
    </template>
    <p v-else class="match-page__status">Loading jobs...</p>
  </main>
</template>

<style scoped>
.match-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-height: 100svh;
  padding: var(--match-top-padding) var(--match-horizontal-padding)
    calc(var(--match-bottom-padding) + var(--match-bottom-safe-area));
  background: var(--page-background-color, var(--background-color));
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
</style>
