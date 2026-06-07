<script setup lang="ts">
import JobCardCompany from './JobCardCompany.vue'
import JobCardDescription from './JobCardDescription.vue'
import JobCardTags from './JobCardTags.vue'
import JobCardTitle from './JobCardTitle.vue'
import type { ScrapedJob } from './types'

defineProps<{ job: ScrapedJob; dragOffsetX?: number; isDragging?: boolean }>()
</script>

<template>
  <article
    class="job-card"
    :class="{ 'job-card--dragging': isDragging }"
    :style="{ transform: `translateX(${dragOffsetX ?? 0}px)` }"
  >
    <JobCardTitle :title="job.title" />
    <JobCardCompany :company="job.company" />
    <JobCardTags :tags="job.tags" />
    <JobCardDescription :descriptionText="job.descriptionText" />
  </article>
</template>

<style scoped>
.job-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 354px;
  height: 695px;
  padding: 24px;
  border: 1px solid var(--border-color);
  border-radius: 24px;
  box-shadow: 2px 2px 8px 0 var(--box-shadow-color);
  background: var(--background-color);
  font-family: 'Inter', sans-serif;
  touch-action: pan-y;
  transition: transform 0.3s ease;
}

.job-card--dragging {
  transition: none;
}
</style>
