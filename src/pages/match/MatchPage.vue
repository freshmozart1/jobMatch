<script setup lang="ts">
import { JobCardStack } from '@/components'
import type { ScrapedJob } from '@/components/jobCard/types'
import jobsData from '@/mockups/job.json'

const jobs = jobsData as ScrapedJob[]
</script>

<template>
  <main class="match-page">
    <JobCardStack :jobs="jobs" />
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
</style>
