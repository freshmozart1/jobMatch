<script setup lang="ts">
defineProps<{ enabled: boolean; threshold: number }>();
const emit = defineEmits<{
  "update:enabled": [value: boolean];
  "update:threshold": [value: number];
  search: [];
}>();

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function onThresholdInput(event: Event) {
  emit(
    "update:threshold",
    clamp(Number((event.target as HTMLInputElement).value)),
  );
}
</script>

<template>
  <div class="match-filter">
    <button
      type="button"
      role="switch"
      :aria-checked="enabled"
      aria-label="Only show jobs at or above the minimum match"
      class="match-filter__switch"
      :data-on="enabled ? '1' : '0'"
      @click="emit('update:enabled', !enabled)"
    >
      <i />
    </button>
    <span class="match-filter__label">{{
      enabled ? "Min. match" : "Show all jobs"
    }}</span>
    <span class="match-filter__num" :data-disabled="enabled ? '0' : '1'">
      <input
        type="number"
        min="0"
        max="100"
        step="5"
        :value="threshold"
        :disabled="!enabled"
        aria-label="Minimum match percentage"
        @input="onThresholdInput"
      />
      <span class="match-filter__unit">%</span>
    </span>
    <button
      type="button"
      class="match-filter__search"
      aria-label="Search jobs"
      @click="emit('search')"
    >
      <svg
        class="match-filter__search-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.match-filter {
  /* match the rendered job-card width: the card re-applies --job-card-width
     inside its own layer, which subtracts another 32px from the percentage */
  width: calc(var(--job-card-width) - 32px);
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--match-card-control-gap);
  padding: 7px 10px 7px 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  background: var(--background-color);
}

.match-filter__switch {
  position: relative;
  flex: 0 0 auto;
  width: 42px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition: background 0.18s ease;
  -webkit-tap-highlight-color: transparent;
}

.match-filter__switch[data-on="1"] {
  background: var(--accents-green);
}

.match-filter__switch i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.18s ease;
}

.match-filter__switch[data-on="1"] i {
  transform: translateX(16px);
}

.match-filter__label {
  flex: 1 1 auto;
  font-family: "Inter", sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.match-filter__num {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 4px 8px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 8px;
  background: #fff;
  transition: opacity 0.18s ease;
}

.match-filter__num[data-disabled="1"] {
  opacity: 0.4;
}

.match-filter__num input {
  width: 32px;
  border: none;
  outline: none;
  background: transparent;
  font-family: "Inter", sans-serif;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--text-color);
  -moz-appearance: textfield;
  appearance: textfield;
}

.match-filter__num input::-webkit-inner-spin-button,
.match-filter__num input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.match-filter__unit {
  font-family: "Inter", sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--border-color);
}

.match-filter__search {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 8px;
  background: #fff;
  color: var(--text-color);
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.match-filter__search:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.24);
}

.match-filter__search:active {
  background: rgba(0, 0, 0, 0.08);
}

.match-filter__search-icon {
  width: 17px;
  height: 17px;
}
</style>
