<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ company: string; sourceUrl: string }>()

const safeUrl = computed(() => (props.sourceUrl.startsWith('https://') ? props.sourceUrl : null))
</script>

<template>
  <p class="job-card__company">
    {{ company }}
    <a
      v-if="safeUrl"
      class="job-card__company-link"
      :href="safeUrl"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="`View job posting at ${company}`"
      @pointerdown.stop
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14 5h5v5M19 5l-8 8"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M18 14v3.5A2.5 2.5 0 0 1 15.5 20h-9A2.5 2.5 0 0 1 4 17.5v-9A2.5 2.5 0 0 1 6.5 6H10"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </a>
  </p>
</template>

<style scoped>
.job-card__company {
  width: 100%;
  margin: 6px 0 0;
  font-weight: 100;
  font-size: 16px;
  line-height: 1.4;
  word-break: break-word;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.job-card__company-link {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--border-color);
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.job-card__company-link:hover {
  opacity: 0.6;
}

.job-card__company-link svg {
  width: 16px;
  height: 16px;
}
</style>
