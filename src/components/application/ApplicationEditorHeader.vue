<script setup lang="ts">
defineProps<{ title: string }>()
defineEmits<{ back: [] }>()
</script>

<template>
  <header class="cl-header">
    <button type="button" class="cl-header__back" @click="$emit('back')">
      <svg width="11" height="18" viewBox="0 0 11 18" fill="none" aria-hidden="true">
        <path
          d="M9 2L2 9l7 7"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      Back
    </button>
    <span class="cl-header__title">{{ title }}</span>
  </header>
</template>

<style scoped>
.cl-header {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: calc(var(--match-top-padding) + 6px) 16px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.07);
  background: var(--background-color);
}

.cl-header__back {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  padding: 6px 4px;
  margin-left: -4px;
  color: var(--text-color);
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.cl-header__title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 15px;
  font-weight: 700;
  color: var(--text-color);
}
</style>
