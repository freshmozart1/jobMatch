<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ScrapedJob } from '@/components/jobCard/types'
import { postJson } from '@/lib/api'

const props = defineProps<{ job: ScrapedJob }>()
const emit = defineEmits<{ back: [] }>()

const storageKey = computed(() => 'jobmatch.coverletter.' + props.job.duplicateKey)
const text = ref('')

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

// Each upload triggers segmentation + embedding calls on the server, so wait
// for a real pause in typing before persisting.
const UPLOAD_DEBOUNCE_MS = 3000

const saveStatus = ref<SaveStatus>('idle')
const lastUploadedText = ref<string | null>(null)
let uploadTimer: ReturnType<typeof setTimeout> | null = null
let uploadInFlight = false

watch(
  () => props.job.duplicateKey,
  (_newKey, oldKey) => {
    if (oldKey && uploadTimer !== null) {
      void uploadNow(oldKey, text.value)
    }
    lastUploadedText.value = null
    saveStatus.value = 'idle'
    try {
      text.value = window.localStorage.getItem(storageKey.value) ?? ''
    } catch {
      text.value = ''
    }
  },
  { immediate: true },
)

function clearUploadTimer() {
  if (uploadTimer !== null) {
    clearTimeout(uploadTimer)
    uploadTimer = null
  }
}

function scheduleUpload() {
  clearUploadTimer()
  if (text.value === lastUploadedText.value) {
    saveStatus.value = 'saved'
    return
  }
  saveStatus.value = 'pending'
  uploadTimer = setTimeout(() => void uploadNow(), UPLOAD_DEBOUNCE_MS)
}

function shouldSkipUpload(snapshot: string, isCurrentJob: () => boolean): boolean {
  if (!snapshot.trim()) {
    if (isCurrentJob()) saveStatus.value = 'idle'
    return true
  }
  return snapshot === lastUploadedText.value || uploadInFlight
}

function needsReschedule(jobKey: string, snapshot: string): boolean {
  return (
    jobKey === props.job.duplicateKey &&
    text.value !== snapshot &&
    text.value !== lastUploadedText.value
  )
}

async function uploadNow(jobKey: string = props.job.duplicateKey, snapshot: string = text.value) {
  clearUploadTimer()
  const isCurrentJob = () => jobKey === props.job.duplicateKey
  if (shouldSkipUpload(snapshot, isCurrentJob)) return
  uploadInFlight = true
  if (isCurrentJob()) saveStatus.value = 'saving'
  try {
    await postJson('/cover-letters/upload/text', {
      coverLetterText: snapshot,
      jobDuplicateKey: jobKey,
    })
    if (isCurrentJob()) {
      lastUploadedText.value = snapshot
      saveStatus.value = 'saved'
    }
  } catch (error) {
    if (isCurrentJob()) saveStatus.value = 'error'
    console.error(
      'Failed to upload cover letter:',
      error instanceof Error ? error.message : error,
    )
  } finally {
    uploadInFlight = false
    if (needsReschedule(jobKey, snapshot)) scheduleUpload()
  }
}

function onChange(e: Event) {
  const v = (e.target as HTMLTextAreaElement).value
  text.value = v
  try {
    window.localStorage.setItem(storageKey.value, v)
  } catch {
    /* ignore */
  }
  scheduleUpload()
}

function handleBack() {
  void uploadNow()
  emit('back')
}

onBeforeUnmount(() => {
  if (uploadTimer !== null) {
    void uploadNow()
  }
})

const words = computed(() => (text.value.trim() ? text.value.trim().split(/\s+/).length : 0))

const statusLabel = computed(() => {
  switch (saveStatus.value) {
    case 'pending':
      return 'Saving soon…'
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'Saved to server'
    case 'error':
      return 'Save failed — retrying on next edit'
    default:
      return words.value > 0 ? 'Saved as draft' : 'Draft auto-saves as you type'
  }
})

type Segment = { text: string; bold: boolean }

function parseDescription(raw: string): Segment[] {
  const segments: Segment[] = []
  const pattern = /\*\*(.+?)\*\*/gs
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw)) !== null) {
    if (match.index > lastIndex)
      segments.push({ text: raw.slice(lastIndex, match.index), bold: false })
    segments.push({ text: match[1] ?? '', bold: true })
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < raw.length) segments.push({ text: raw.slice(lastIndex), bold: false })
  return segments
}
</script>

<template>
  <div class="cl-screen">
    <header class="cl-header">
      <button type="button" class="cl-header__back" @click="handleBack">
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
      <span class="cl-header__title">Cover Letter</span>
    </header>

    <div class="cl-body cl--letter">
      <div class="cl-paper">
        <div class="cl-paper__subject">
          <div class="cl-marquee">
            <div class="cl-marquee__track">
              <span class="cl-marquee__item">{{ job.title }}</span>
              <span class="cl-marquee__item" aria-hidden="true">{{ job.title }}</span>
            </div>
          </div>
        </div>
        <div v-if="job.descriptionText" class="cl-paper__jobdesc">
          <template v-for="(seg, i) in parseDescription(job.descriptionText)" :key="i">
            <strong v-if="seg.bold">{{ seg.text }}</strong>
            <template v-else>{{ seg.text }}</template>
          </template>
        </div>
        <textarea
          class="cl-textarea"
          :value="text"
          placeholder="I am writing to express my interest in this role…"
          :spellcheck="false"
          @input="onChange"
        />
      </div>
    </div>

    <div class="cl-meta">
      <span>{{ statusLabel }}</span>
      <span>{{ words }} {{ words === 1 ? 'word' : 'words' }}</span>
    </div>
  </div>
</template>

<style scoped>
.cl-screen {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background-color);
}

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

.cl-body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.cl--letter {
  background: #f1f1f3;
  padding: 16px;
}

.cl-paper {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  padding: 26px 24px 30px;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.cl-paper__subject {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--border-color);
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}

.cl-marquee {
  overflow: hidden;
  white-space: nowrap;
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 14px,
    #000 calc(100% - 14px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 14px,
    #000 calc(100% - 14px),
    transparent 100%
  );
}

.cl-marquee__track {
  display: inline-flex;
  animation: cl-marquee-scroll 16s linear infinite;
  will-change: transform;
}

.cl-marquee__item {
  white-space: nowrap;
  padding-right: 3em;
}

@keyframes cl-marquee-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cl-marquee__track {
    animation: none;
  }
}

.cl-paper__jobdesc {
  max-height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-color);
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  overscroll-behavior: contain;
}

.cl-paper__jobdesc strong {
  font-weight: 700;
}

.cl-textarea {
  width: 100%;
  flex: 1 1 auto;
  min-height: 160px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 22px;
  color: var(--text-color);
  padding: 10px 0;
}

.cl-textarea::placeholder {
  color: rgba(0, 0, 0, 0.3);
}

.cl-meta {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px calc(var(--match-bottom-safe-area) + 8px);
  font-size: 12px;
  color: var(--border-color);
  background: var(--background-color);
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
</style>
