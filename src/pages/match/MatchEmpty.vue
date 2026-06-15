<script setup lang="ts">
const emit = defineEmits<{ 'open-search': [] }>()
</script>

<template>
  <div class="match-empty">
    <div class="match-empty__icon">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20"
        />
      </svg>
    </div>
    <h2 class="match-empty__title">No keywords yet</h2>
    <p class="match-empty__text">Add search keywords to start swiping jobs.</p>
    <button type="button" class="match-empty__cta" @click="emit('open-search')">
      Add keywords
    </button>
  </div>
</template>

<style scoped>
.match-empty {
  flex: 1 1 0;
  min-height: 0;
  width: var(--job-card-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 14px;
  padding-bottom: 8vh;
}

.match-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  color: var(--border-color);
  margin-bottom: 4px;
}

.match-empty__icon svg {
  width: 28px;
  height: 28px;
}

.match-empty__title {
  margin: 0;
  font-family: 'Inter', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: var(--border-color);
}

.match-empty__text {
  margin: 0;
  max-width: 240px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--border-color);
  text-wrap: pretty;
}

.match-empty__cta {
  margin-top: 6px;
  padding: 11px 22px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--border-color);
  color: var(--background-color);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.match-empty__cta:hover {
  opacity: 0.85;
}

.match-empty__cta:active {
  opacity: 0.7;
}
</style>
