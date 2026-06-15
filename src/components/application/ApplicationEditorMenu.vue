<script setup lang="ts">
import { CoverLetterAction } from '@/components/coverLetter'
import CvFileInput from '@/components/CvFileInput.vue'

defineProps<{ letterDone: boolean; cvUploaded: boolean }>()
defineEmits<{ openLetter: []; fileSelected: [file: File] }>()
</script>

<template>
  <div class="cl-menu">
    <p class="cl-menu__lead">
      Build your application for this role — write a tailored cover letter or attach your CV.
    </p>

    <CoverLetterAction :done="letterDone" @click="$emit('openLetter')" />

    <CvFileInput :uploaded="cvUploaded" @fileSelected="$emit('fileSelected', $event)" />

    <!-- TODO: backend — implement application download endpoint
         (e.g. GET /jobs/{duplicateKey}/application.pdf) and wire it to this button -->
    <button type="button" class="cl-download" :disabled="!cvUploaded">Download application</button>
  </div>
</template>

<style scoped>
/* Application Editor menu */
.cl-menu {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px 18px;
  background: var(--background-color);
}

.cl-menu__lead {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  line-height: 19px;
  font-weight: 500;
  color: var(--border-color);
  margin: 0 2px 6px;
  text-wrap: pretty;
}

.cl-download {
  margin-top: auto;
  flex: 0 0 auto;
  width: 100%;
  box-sizing: border-box;
  padding: 15px 20px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--border-color);
  color: var(--background-color);
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.1s ease;
  -webkit-tap-highlight-color: transparent;
}

.cl-download:not(:disabled):active {
  transform: scale(0.99);
  box-shadow: 2px 2px 8px 0 var(--box-shadow-color);
}

.cl-download:disabled {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.32);
  cursor: not-allowed;
}
</style>
