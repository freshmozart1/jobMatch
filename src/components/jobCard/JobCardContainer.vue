<script setup lang="ts">
import { computed, ref } from 'vue'
import { JobCard, LikeContainer } from '@/components'
import type { ScrapedJob } from './types'

defineProps({
  job: {
    type: Object as () => ScrapedJob,
    required: true,
  },
})

const emit = defineEmits<{
  drag: [payload: { progress: number; direction: 'left' | 'right' | 'none' }]
  swipe: [direction: 'left' | 'right']
}>()

const maxDragDistance = 160
const offscreenDistance = (typeof window !== 'undefined' ? window.innerWidth : 1000) + 400

const isDragging = ref(false)
const startX = ref(0)
const dragOffsetX = ref(0)
const committedDirection = ref<'left' | 'right' | null>(null)

const progress = computed(() => Math.min(Math.abs(dragOffsetX.value) / maxDragDistance, 1))

const direction = computed<'left' | 'right' | 'none'>(() => {
  if (dragOffsetX.value > 0) {
    return 'right'
  }
  if (dragOffsetX.value < 0) {
    return 'left'
  }
  return 'none'
})

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

function emitDrag(
  payload: { progress: number; direction: 'left' | 'right' | 'none' } = {
    progress: progress.value,
    direction: direction.value,
  },
) {
  emit('drag', payload)
}

function onPointerDown(event: PointerEvent) {
  if (committedDirection.value) {
    return
  }
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
  emitDrag()
}

function onPointerEnd(event: PointerEvent) {
  if (!isDragging.value) {
    return
  }
  isDragging.value = false
  const target = event.currentTarget as HTMLElement
  target.releasePointerCapture?.(event.pointerId)

  if (Math.abs(dragOffsetX.value) >= maxDragDistance) {
    const committed = dragOffsetX.value > 0 ? 'right' : 'left'
    committedDirection.value = committed
    dragOffsetX.value = committed === 'right' ? offscreenDistance : -offscreenDistance
    emitDrag({ progress: 1, direction: committed })
  } else {
    dragOffsetX.value = 0
    emitDrag()
  }
}

function onTransitionEnd() {
  if (!committedDirection.value) {
    return
  }
  const committed = committedDirection.value
  committedDirection.value = null
  emit('swipe', committed)
}
</script>
<template>
  <JobCard
    :job="job"
    :drag-offset-x="dragOffsetX"
    :is-dragging="isDragging"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @transitionend="onTransitionEnd"
  />
  <LikeContainer :like-opacity="likeOpacity" :dislike-opacity="dislikeOpacity" />
</template>
