<script setup lang="ts">
defineProps<{ company: string }>()
</script>

<template>
  <p class="job-card__company">{{ company }}</p>
</template>

<style scoped>
.job-card__company {
  width: 100%;
  margin: 0;
  font-size: 16px;
  font-weight: 100;
  line-height: 24px;
  color: var(--text-color);
  text-align: center;
  word-break: break-word;
}
</style>
