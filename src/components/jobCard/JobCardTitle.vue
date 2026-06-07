<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <h2 class="job-card__title">{{ title }}</h2>
</template>

<style scoped>
.job-card__title {
  width: 100%;
  margin: 0;
  font-size: 24px;
  font-weight: 400;
  line-height: 36px;
  color: var(--text-color);
  text-align: center;
  word-break: break-word;
}
</style>
