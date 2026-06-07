<script setup lang="ts">
import JobCardTag from './JobCardTag.vue'

defineProps<{ tags: string[] | undefined }>()
</script>

<template>
  <ul v-if="tags?.length" class="job-card__tags">
    <JobCardTag v-for="(tag, index) in tags" :key="`${index}-${tag}`" :tag="tag" />
  </ul>
</template>

<style scoped>
.job-card__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: 24px;
  width: 100%;
  margin: 0;
  padding: 24px 24px 12px;
  list-style: none;
}
</style>
