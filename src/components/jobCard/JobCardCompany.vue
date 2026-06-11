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
  font-weight: 100;
  text-align: center;
  word-break: break-word;
  font-size: 16px;
  line-height: 1.4;
  margin: 6px 0 0 0;
}
</style>
