<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ScrapedJob } from '@/components/jobCard/types'
import { postJson } from '@/lib/api'

const props = defineProps<{ job: ScrapedJob }>()
const emit = defineEmits<{ back: [] }>()

const storageKey = computed(() => 'jobmatch.coverletter.' + props.job.duplicateKey)
const text = ref('')
const view = ref<'menu' | 'letter'>('menu')
const fileInputRef = ref<HTMLInputElement | null>(null)

// TODO: backend — load CV uploaded status from server on mount/job change
// (e.g. GET /jobs/{duplicateKey}/cv-status) since it persists across sessions
const cvUploaded = ref(false)

const letterDone = computed(() => text.value.trim().length > 0)

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

// Each upload triggers segmentation + embedding calls on the server, so wait
// for a real pause in typing before persisting.
const UPLOAD_DEBOUNCE_MS = 3000

const saveStatus = ref<SaveStatus>('idle')
const lastUploadedText = ref<string | null>(null)
let uploadTimer: ReturnType<typeof setTimeout> | null = null
let uploadInFlight = false

// Tracks per-job DB creation state within this component instance so we don't
// re-create a job that was already saved, even after switching jobs and back.
const jobDbCreationState = new Map<string, 'saved' | 'failed'>()

// Reactive flag for the current job's creation failure — drives the error label.
const jobCreateFailed = ref(false)

// Mirrors the current job object so the job-change flush can pass the OLD job to
// createJobIfNeeded (props.job has already updated by the time the watch runs).
const prevJob = ref<ScrapedJob>(props.job)

watch(
  () => props.job.duplicateKey,
  (_newKey, oldKey) => {
    const jobToFlush = prevJob.value
    if (oldKey && uploadTimer !== null) {
      void uploadNow(oldKey, text.value, jobToFlush)
    }
    prevJob.value = props.job
    lastUploadedText.value = null
    saveStatus.value = 'idle'
    jobCreateFailed.value = jobDbCreationState.get(props.job.duplicateKey) === 'failed'
    view.value = 'menu'
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

async function createJobIfNeeded(job: ScrapedJob): Promise<boolean> {
  if (jobDbCreationState.get(job.duplicateKey) === 'saved') return true
  try {
    await postJson('/jobs/create', { job, like: true })
    jobDbCreationState.set(job.duplicateKey, 'saved')
    if (job.duplicateKey === props.job.duplicateKey) jobCreateFailed.value = false
    return true
  } catch (error) {
    jobDbCreationState.set(job.duplicateKey, 'failed')
    if (job.duplicateKey === props.job.duplicateKey) {
      jobCreateFailed.value = true
      saveStatus.value = 'error'
    }
    console.error('Failed to create job in database:', error instanceof Error ? error.message : error)
    return false
  }
}

async function uploadNow(
  jobKey: string = props.job.duplicateKey,
  snapshot: string = text.value,
  jobForCreation: ScrapedJob = props.job,
) {
  clearUploadTimer()
  const isCurrentJob = () => jobKey === props.job.duplicateKey
  if (shouldSkipUpload(snapshot, isCurrentJob)) return
  uploadInFlight = true
  try {
    const jobCreated = await createJobIfNeeded(jobForCreation)
    if (!jobCreated) return
    if (isCurrentJob()) saveStatus.value = 'saving'
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
  if (view.value === 'letter') {
    view.value = 'menu'
  } else {
    void uploadNow()
    emit('back')
  }
}

function openFilePicker() {
  fileInputRef.value?.click()
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
      return jobCreateFailed.value
        ? 'Job could not be saved — cover letter not stored. Will retry on next edit.'
        : 'Save failed — retrying on next edit'
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
      <span class="cl-header__title">{{ view === 'letter' ? 'Cover Letter' : 'Application Editor' }}</span>
    </header>

    <!-- Application Editor menu -->
    <div v-if="view === 'menu'" class="cl-menu">
      <p class="cl-menu__lead">
        Build your application for this role — write a tailored cover letter or attach your CV.
      </p>

      <button type="button" class="cl-action" @click="view = 'letter'">
        <span class="cl-action__icon">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span class="cl-action__text">
          <span class="cl-action__title">Cover Letter</span>
          <span class="cl-action__sub">{{ letterDone ? 'Draft written' : 'Write a tailored note' }}</span>
        </span>
        <span :class="['cl-action__check', { 'cl-action__check--on': letterDone }]">
          <svg v-if="letterDone" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="currentColor" />
            <path d="M7.4 12.2l3 3 6.2-6.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" stroke-width="2" />
          </svg>
        </span>
      </button>

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
          <span class="cl-action__sub">{{ cvUploaded ? 'PDF attached' : 'Attach a PDF file' }}</span>
        </span>
        <span :class="['cl-action__check', { 'cl-action__check--on': cvUploaded }]">
          <svg v-if="cvUploaded" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="currentColor" />
            <path d="M7.4 12.2l3 3 6.2-6.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" stroke-width="2" />
          </svg>
        </span>
      </button>

      <!-- TODO: backend — on file change, POST the selected PDF to the upload endpoint;
           set cvUploaded = true on success -->
      <input
        ref="fileInputRef"
        type="file"
        accept="application/pdf,.pdf"
        style="display: none"
      />

      <!-- TODO: backend — implement application download endpoint
           (e.g. GET /jobs/{duplicateKey}/application.pdf) and wire it to this button -->
      <button type="button" class="cl-download" :disabled="!cvUploaded">
        Download application
      </button>
    </div>

    <!-- Cover letter editor -->
    <template v-else>
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
    </template>
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

/* Cover letter editor */
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
