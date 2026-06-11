<script setup lang="ts">
import { ref, onMounted } from 'vue'

defineProps<{ tag: string }>()

const el = ref<HTMLLIElement | null>(null)
const hidden = ref(false)

onMounted(() => {
  if (el.value && el.value.scrollWidth > el.value.clientWidth) {
    hidden.value = true
  }
})
</script>

<template>
  <li ref="el" v-show="!hidden" class="job-card__tag">{{ tag }}</li>
</template>

<style scoped>
.job-card__tag {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 25%;
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
