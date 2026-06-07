<script setup lang="ts">
import { computed, ref } from 'vue'
import { JobCard, LikeContainer } from '@/components'
import job from '@/mockups/job.json'

const maxDragDistance = 160

const isDragging = ref(false)
const startX = ref(0)
const dragOffsetX = ref(0)

const progress = computed(() => Math.min(Math.abs(dragOffsetX.value) / maxDragDistance, 1))

const likeOpacity = computed(() => {
  if (dragOffsetX.value > 0) {
    return 0.33 + progress.value * 0.67
  }
  if (dragOffsetX.value < 0) {
    return 0.33 * (1 - progress.value)
  }
  return 0.33
})

const dislikeOpacity = computed(() => {
  if (dragOffsetX.value < 0) {
    return 0.33 + progress.value * 0.67
  }
  if (dragOffsetX.value > 0) {
    return 0.33 * (1 - progress.value)
  }
  return 0.33
})

function onPointerDown(event: PointerEvent) {
  isDragging.value = true
  startX.value = event.clientX
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!isDragging.value) {
    return
  }
  dragOffsetX.value = event.clientX - startX.value
}

function onPointerEnd(event: PointerEvent) {
  if (!isDragging.value) {
    return
  }
  isDragging.value = false
  dragOffsetX.value = 0
  const target = event.currentTarget as HTMLElement
  target.releasePointerCapture?.(event.pointerId)
}
</script>

<template>
  <main class="match-page">
    <JobCard
      :job="job"
      :drag-offset-x="dragOffsetX"
      :is-dragging="isDragging"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
    />
    <LikeContainer :like-opacity="likeOpacity" :dislike-opacity="dislikeOpacity" />
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
