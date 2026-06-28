<script setup lang="ts">
import { computed, ref } from 'vue'
import JobCard from './JobCard.vue'
import JobCardContainer from './JobCardContainer.vue'
import type { ScrapedJob } from './types'

const props = withDefaults(
  defineProps<{
    jobs: ScrapedJob[]
    emptyLabel?: string
    loadingLabel?: string
    isLoading?: boolean
  }>(),
  {
    emptyLabel: 'No more jobs',
    loadingLabel: 'Loading more jobs...',
    isLoading: false,
  },
)
const emit = defineEmits<{
  (e: 'like', job: ScrapedJob, like: boolean): void
  (e: 'edit', job: ScrapedJob): void
}>()

const currentIndex = ref(0)
const dragProgress = ref(0)

const currentJob = computed(() => props.jobs[currentIndex.value])
const nextJob = computed(() => props.jobs[currentIndex.value + 1])

const nextScale = computed(() => 0.92 + dragProgress.value * 0.08)
const nextOpacity = computed(() => 0.5 + dragProgress.value * 0.5)

function onDrag(payload: { progress: number; direction: 'left' | 'right' | 'none' }) {
  dragProgress.value = payload.progress
}

function onSwipe(direction: 'left' | 'right') {
  if (currentJob.value) emit('like', currentJob.value, direction === 'right')
  currentIndex.value += 1
  dragProgress.value = 0
}
</script>

<template>
  <div class="job-card-stack">
    <div
      v-if="nextJob"
      class="job-card-stack__next"
      :style="{ transform: `translateX(-50%) scale(${nextScale})`, opacity: nextOpacity }"
    >
      <JobCard :key="nextJob.duplicateKey" :job="nextJob" />
    </div>
    <div v-if="currentJob" class="job-card-stack__current">
      <JobCardContainer
        :key="currentJob.duplicateKey"
        :job="currentJob"
        @drag="onDrag"
        @swipe="onSwipe"
        @edit="emit('edit', currentJob)"
      />
    </div>
    <template v-else>
      <p v-if="isLoading" class="job-card-stack__loading">{{ loadingLabel }}</p>
      <p v-else class="job-card-stack__empty">{{ emptyLabel }}</p>
    </template>
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
  transform-origin: center center;
  pointer-events: none;
  transition:
    transform 0.32s ease,
    opacity 0.32s ease;
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

.job-card-stack__empty,
.job-card-stack__loading {
  font-family: 'Inter', sans-serif;
  font-size: 18px;
  font-weight: 400;
  color: var(--border-color);
  text-align: center;
}

@media (prefers-reduced-motion: no-preference) {
  .job-card-stack__loading {
    animation: stack-loading-pulse 1.4s ease-in-out infinite;
  }
}

@keyframes stack-loading-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
</style>
