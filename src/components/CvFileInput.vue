<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ uploaded: boolean }>()
const emit = defineEmits<{ fileSelected: [file: File] }>()

const fileInputRef = ref<HTMLInputElement | null>(null)

function openFilePicker() {
  fileInputRef.value?.click()
}

function onChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  emit('fileSelected', file)
}
</script>

<template>
  <button type="button" class="cl-action" @click="openFilePicker">
    <!-- TODO: backend — implement CV upload endpoint (e.g. POST /cover-letters/upload/cv)
         and update cvUploaded state on success -->
    <span class="cl-action__icon">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 15V4M12 4L8 8M12 4l4 4"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M5 14v3.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V14"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <span class="cl-action__text">
      <span class="cl-action__title">Curriculum Vitae</span>
      <span class="cl-action__sub">{{ uploaded ? 'PDF attached' : 'Attach a PDF file' }}</span>
    </span>
    <span :class="['cl-action__check', { 'cl-action__check--on': uploaded }]">
      <svg v-if="uploaded" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="currentColor" />
        <path d="M7.4 12.2l3 3 6.2-6.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" stroke-width="2" />
      </svg>
    </span>
  </button>

  <!-- TODO: backend — POST selectedCvFile to the upload endpoint -->
  <input
    ref="fileInputRef"
    type="file"
    accept="application/pdf,.pdf"
    style="display: none"
    @change="onChange"
  />
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
