<script setup lang="ts">
import { computed, ref } from 'vue';
import JobCard from './JobCard.vue';
import LikeContainer from '../LikeContainer.vue';
import type { ScrapedJob } from './types';

withDefaults(
    defineProps<{
        job: ScrapedJob;
        applicationEditorOpen?: boolean;
    }>(),
    { applicationEditorOpen: false },
);

const emit = defineEmits<{
    drag: [progress: number];
    swipe: [direction: 'left' | 'right'];
    edit: [trigger: HTMLButtonElement];
}>();

const maxDragDistance = 160;
const offscreenDistance =
    (typeof window !== 'undefined' ? window.innerWidth : 1000) + 400;

const isDragging = ref(false);
const startX = ref(0);
const dragOffsetX = ref(0);
const committedDirection = ref<'left' | 'right' | null>(null);

const progress = computed(() =>
    Math.min(Math.abs(dragOffsetX.value) / maxDragDistance, 1),
);

const likeOpacity = computed(() => {
    if (dragOffsetX.value > 0) {
        return 0.33 + progress.value * 0.67;
    }
    if (dragOffsetX.value < 0) {
        return 0.33 * (1 - progress.value);
    }
    return 0.33;
});

const dislikeOpacity = computed(() => {
    if (dragOffsetX.value < 0) {
        return 0.33 + progress.value * 0.67;
    }
    if (dragOffsetX.value > 0) {
        return 0.33 * (1 - progress.value);
    }
    return 0.33;
});

function onPointerDown(event: PointerEvent) {
    if (committedDirection.value) {
        return;
    }
    isDragging.value = true;
    startX.value = event.clientX;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
    if (!isDragging.value) {
        return;
    }
    dragOffsetX.value = event.clientX - startX.value;
    emit('drag', progress.value);
}

function commitSwipe(direction: 'left' | 'right') {
    if (committedDirection.value) {
        return;
    }
    isDragging.value = false;
    committedDirection.value = direction;
    dragOffsetX.value =
        direction === 'right' ? offscreenDistance : -offscreenDistance;
    emit('drag', 1);
}

function onPointerEnd(event: PointerEvent) {
    if (!isDragging.value) {
        return;
    }
    isDragging.value = false;
    const target = event.currentTarget as HTMLElement;
    target.releasePointerCapture?.(event.pointerId);

    if (Math.abs(dragOffsetX.value) >= maxDragDistance) {
        commitSwipe(dragOffsetX.value > 0 ? 'right' : 'left');
    } else {
        dragOffsetX.value = 0;
        emit('drag', progress.value);
    }
}

function onTransitionEnd() {
    if (!committedDirection.value) {
        return;
    }
    const committed = committedDirection.value;
    committedDirection.value = null;
    emit('swipe', committed);
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
    <LikeContainer
        :like-opacity="likeOpacity"
        :dislike-opacity="dislikeOpacity"
        :application-editor-open="applicationEditorOpen"
        @dislike="commitSwipe('left')"
        @edit="emit('edit', $event)"
        @like="commitSwipe('right')"
    />
</template>
