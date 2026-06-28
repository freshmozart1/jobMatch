<script setup lang="ts">
import { computed } from "vue";
import JobCardCompany from "./JobCardCompany.vue";
import JobCardCosineSimilarity from "./JobCardCosineSimilarity.vue";
import JobCardDescription from "./JobCardDescription.vue";
import JobCardTags from "./JobCardTags.vue";
import JobCardTitle from "./JobCardTitle.vue";
import type { ScrapedJob } from "./types";

const props = defineProps<{
  job: ScrapedJob;
  dragOffsetX?: number;
  isDragging?: boolean;
}>();

const progress = computed(() =>
  Math.min(Math.abs(props.dragOffsetX ?? 0) / 160, 1),
);
const direction = computed(() => {
  if ((props.dragOffsetX ?? 0) > 0) return "right";
  if ((props.dragOffsetX ?? 0) < 0) return "left";
  return "none";
});
const rotation = computed(() => (props.dragOffsetX ?? 0) * 0.06);
</script>

<template>
  <article
    class="job-card"
    :class="{ 'job-card--dragging': isDragging }"
    :style="{
      transform: `translateX(${dragOffsetX ?? 0}px) rotate(${rotation}deg)`,
    }"
  >
    <div
      class="stamp stamp--like"
      :style="{ opacity: direction === 'right' ? progress : 0 }"
    >
      Like
    </div>
    <div
      class="stamp stamp--nope"
      :style="{ opacity: direction === 'left' ? progress : 0 }"
    >
      Nope
    </div>
    <JobCardTitle :title="job.title" />
    <JobCardCompany :company="job.company" />
    <JobCardCosineSimilarity
      v-if="typeof job.match === 'number'"
      :value="job.match"
    />
    <JobCardTags :tags="job.tags" />
    <JobCardDescription :descriptionText="job.descriptionText" />
  </article>
</template>

<style scoped>
.job-card {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: var(--job-card-width);
  height: var(--job-card-height);
  min-height: 0;
  padding: clamp(16px, 4.5vw, 24px);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  box-shadow: 2px 2px 8px 0 var(--box-shadow-color);
  background: var(--background-color);
  touch-action: pan-y;
  user-select: none;
  cursor: grab;
  transition: transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.job-card--dragging {
  transition: none;
  cursor: grabbing;
}

.stamp {
  position: absolute;
  top: 26px;
  padding: 6px 16px;
  border: 4px solid;
  border-radius: 12px;
  font-size: 30px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  pointer-events: none;
  z-index: 3;
}

.stamp--like {
  left: 22px;
  transform: rotate(-18deg);
  color: var(--accents-green);
  border-color: var(--accents-green);
}

.stamp--nope {
  right: 22px;
  transform: rotate(18deg);
  color: var(--accents-pink);
  border-color: var(--accents-pink);
}
</style>
