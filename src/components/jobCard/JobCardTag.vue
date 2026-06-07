<script setup lang="ts">
defineProps<{ tag: string }>()
</script>

<template>
  <li class="job-card__tag">{{ tag }}</li>
</template>

<style scoped>
.job-card__tag {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 8px;
  font-weight: 700;
  color: var(--tag-text-color);
  text-align: center;
  white-space: nowrap;
}

.job-card__tag:nth-child(4n + 1) {
  background-color: var(--tag-background-color-1);
}
.job-card__tag:nth-child(4n + 2) {
  background-color: var(--tag-background-color-2);
}
.job-card__tag:nth-child(4n + 3) {
  background-color: var(--tag-background-color-3);
}
.job-card__tag:nth-child(4n + 4) {
  background-color: var(--tag-background-color-4);
}
</style>
