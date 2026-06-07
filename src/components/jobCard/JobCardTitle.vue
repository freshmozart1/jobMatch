<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <h2 class="job-card__title">{{ title }}</h2>
</template>

<style scoped>
.job-card__title {
  width: 100%;
}
</style>
