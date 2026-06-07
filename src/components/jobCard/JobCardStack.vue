<script setup lang="ts">
import { computed, ref } from 'vue'
import { JobCard, JobCardContainer } from '@/components'
import type { ScrapedJob } from './types'

const props = defineProps<{ jobs: ScrapedJob[] }>()

const currentIndex = ref(0)
const dragProgress = ref(0)

const currentJob = computed(() => props.jobs[currentIndex.value])
const nextJob = computed(() => props.jobs[currentIndex.value + 1])

function onDrag(payload: { progress: number; direction: 'left' | 'right' | 'none' }) {
  dragProgress.value = payload.progress
}

function onSwipe() {
  currentIndex.value += 1
  dragProgress.value = 0
}
</script>

<template>
  <div class="job-card-stack">
    <div
      v-if="nextJob"
      class="job-card-stack__next"
      :style="{ transform: `translateX(-50%) scale(${dragProgress})`, opacity: dragProgress }"
    >
      <JobCard :key="nextJob.duplicateKey" :job="nextJob" />
    </div>
    <div v-if="currentJob" class="job-card-stack__current">
      <JobCardContainer
        :key="currentJob.duplicateKey"
        :job="currentJob"
        @drag="onDrag"
        @swipe="onSwipe"
      />
    </div>
    <p v-else class="job-card-stack__empty">No more jobs</p>
  </div>
</template>

<style scoped>
.job-card-stack {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: var(--job-card-width);
}

.job-card-stack__next {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 0;
  width: var(--job-card-width);
  transform-origin: top center;
  pointer-events: none;
}

.job-card-stack__current {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--match-card-control-gap);
  width: var(--job-card-width);
}

.job-card-stack__empty {
  font-family: 'Inter', sans-serif;
  font-size: 18px;
  font-weight: 400;
  color: var(--border-color);
  text-align: center;
}
</style>
