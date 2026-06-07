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
  justify-content: center;
  min-height: 100svh;
  padding: 24px 24px 0;
  background: var(--page-background-color);
}
</style>
