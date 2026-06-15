<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ScrapedJob } from '@/components/jobCard/types'
import { postJson } from '@/lib/api'
import CvFileInput from '@/components/CvFileInput.vue'
import CoverLetterAction from '@/components/coverLetter/CoverLetterAction.vue'
import CoverLetterEditor from '@/components/coverLetter/CoverLetterEditor.vue'
import ApplicationEditorHeader from '@/components/coverLetter/ApplicationEditorHeader.vue'

const props = defineProps<{ job: ScrapedJob }>()
const emit = defineEmits<{ back: [] }>()

const storageKey = computed(() => 'jobmatch.coverletter.' + props.job.duplicateKey)
const text = ref('')
const view = ref<'menu' | 'letter'>('menu')

// TODO: backend — load CV uploaded status from server on mount/job change
// (e.g. GET /jobs/{duplicateKey}/cv-status) since it persists across sessions
const cvUploaded = ref(false)
const selectedCvFile = ref<File | null>(null)

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
    console.error(
      'Failed to create job in database:',
      error instanceof Error ? error.message : error,
    )
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
    console.error('Failed to upload cover letter:', error instanceof Error ? error.message : error)
  } finally {
    uploadInFlight = false
    if (needsReschedule(jobKey, snapshot)) scheduleUpload()
  }
}

function onChange(v: string) {
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

async function onCvFileSelected(file: File) {
  const jobCreated = await createJobIfNeeded(props.job)
  if (!jobCreated) return
  selectedCvFile.value = file
  cvUploaded.value = true
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
</script>

<template>
  <div class="cl-screen">
    <ApplicationEditorHeader
      :title="view === 'letter' ? 'Cover Letter' : 'Application Editor'"
      @back="handleBack"
    />

    <!-- Application Editor menu -->
    <div v-if="view === 'menu'" class="cl-menu">
      <p class="cl-menu__lead">
        Build your application for this role — write a tailored cover letter or attach your CV.
      </p>

      <CoverLetterAction :done="letterDone" @click="view = 'letter'" />

      <CvFileInput :uploaded="cvUploaded" @fileSelected="onCvFileSelected" />

      <!-- TODO: backend — implement application download endpoint
           (e.g. GET /jobs/{duplicateKey}/application.pdf) and wire it to this button -->
      <button type="button" class="cl-download" :disabled="!cvUploaded">
        Download application
      </button>
    </div>

    <!-- Cover letter editor -->
    <CoverLetterEditor
      v-else
      :job="job"
      :text="text"
      :status-label="statusLabel"
      :words="words"
      @input="onChange"
    />
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
