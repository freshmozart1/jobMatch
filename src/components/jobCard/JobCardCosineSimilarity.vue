<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: number }>()

// cosineSimilarity ∈ [0, 1]: how closely this job matches the running average
// of the user's liked jobs.
const isValid = computed(() => typeof props.value === 'number' && !Number.isNaN(props.value))
const clamped = computed(() => Math.max(0, Math.min(1, props.value)))
const percent = computed(() => Math.round(clamped.value * 100))

function cosineSimilarityLevel(value: number): string {
  if (value >= 0.75) return 'strong match'
  if (value >= 0.5) return 'moderate match'
  if (value >= 0.25) return 'weak match'
  return 'poor match'
}

const level = computed(() => cosineSimilarityLevel(clamped.value))

// Hue travels pink (low) → green (high), echoing NOPE/LIKE; fixed L & C keep the
// accent harmonious with the design tokens.
const fillColor = computed(() => `oklch(0.68 0.19 ${(12 + clamped.value * 133).toFixed(1)})`)

const altText = computed(
  () => `Match to your liked jobs: ${percent.value}% cosine similarity — ${level.value}.`,
)
</script>

<template>
  <div
    v-if="isValid"
    class="cosine-indicator"
    data-testid="cosineSimilarityIndicator"
    role="meter"
    aria-label="Match to your liked jobs"
    :aria-valuemin="0"
    :aria-valuemax="1"
    :aria-valuenow="Number(clamped.toFixed(2))"
    :aria-valuetext="altText"
    :title="altText"
  >
    <span class="cosine-indicator__label" aria-hidden="true">Match</span>
    <span class="cosine-indicator__track" aria-hidden="true">
      <span
        class="cosine-indicator__fill"
        :style="{ width: percent + '%', background: fillColor }"
      />
    </span>
    <span class="cosine-indicator__value" aria-hidden="true">{{ percent }}%</span>
  </div>
</template>

<style scoped>
.cosine-indicator {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 2px;
  flex: 0 0 auto;
}

.cosine-indicator__label {
  flex: 0 0 auto;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--border-color);
}

.cosine-indicator__track {
  position: relative;
  flex: 1 1 auto;
  height: 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.cosine-indicator__fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.cosine-indicator__value {
  flex: 0 0 auto;
  min-width: 32px;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--text-color);
}
</style>
