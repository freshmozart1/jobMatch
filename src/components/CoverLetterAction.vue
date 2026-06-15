<script setup lang="ts">
defineProps<{ done: boolean }>()
</script>

<template>
  <button type="button" class="cl-action">
    <span class="cl-action__icon">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"
          fill="currentColor"
        />
      </svg>
    </span>
    <span class="cl-action__text">
      <span class="cl-action__title">Cover Letter</span>
      <span class="cl-action__sub">{{ done ? 'Draft written' : 'Write a tailored note' }}</span>
    </span>
    <span :class="['cl-action__check', { 'cl-action__check--on': done }]">
      <svg v-if="done" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="currentColor" />
        <path d="M7.4 12.2l3 3 6.2-6.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" stroke-width="2" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
.cl-action {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  box-sizing: border-box;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: #fff;
  color: var(--text-color);
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  text-align: left;
  transition:
    box-shadow 0.15s ease,
    transform 0.1s ease;
  -webkit-tap-highlight-color: transparent;
}

.cl-action:active {
  transform: scale(0.99);
  box-shadow: 2px 2px 8px 0 var(--box-shadow-color);
}

.cl-action__icon {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  color: var(--border-color);
}

.cl-action__icon svg {
  width: 22px;
  height: 22px;
}

.cl-action__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cl-action__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-color);
}

.cl-action__sub {
  font-size: 12px;
  font-weight: 500;
  color: var(--border-color);
}

.cl-action__check {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: rgba(0, 0, 0, 0.28);
}

.cl-action__check svg {
  width: 24px;
  height: 24px;
}

.cl-action__check--on {
  color: var(--accents-green);
}
</style>
