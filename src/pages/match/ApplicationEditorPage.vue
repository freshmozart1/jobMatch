<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ScrapedJob } from '@/components/jobCard/types'
import { getBlob, getJson, postFormData, postJson } from '@/lib/api'
import { CoverLetterEditor } from '@/components/coverLetter'
import { ApplicationEditorHeader, ApplicationEditorMenu } from '@/components/application'

const props = defineProps<{ job: ScrapedJob }>()
const emit = defineEmits<{ back: [] }>()

const storageKey = computed(() => 'jobmatch.coverletter.' + props.job.duplicateKey)
const text = ref('')
const view = ref<'menu' | 'letter'>('menu')

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

// Fetches a blob, triggers a browser download for it, and cleans up the
// object URL afterwards. Each call site gets its own instance so an
// in-flight CV download never blocks a cover-letter (or application)
// download, and vice versa.
function createBlobDownload() {
  let inFlight = false
  let abortController: AbortController | null = null
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null
  let pendingRevoke: (() => void) | null = null

  async function run(fetchBlob: (signal: AbortSignal) => Promise<Blob>, filename: string) {
    if (inFlight) return
    inFlight = true
    abortController = new AbortController()
    try {
      const blob = await fetchBlob(abortController.signal)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      const cleanup = () => {
        URL.revokeObjectURL(url)
        a.remove()
        cleanupTimer = null
        pendingRevoke = null
      }
      pendingRevoke = cleanup
      cleanupTimer = setTimeout(cleanup, 0)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      throw error
    } finally {
      inFlight = false
      abortController = null
    }
  }

  function abort() {
    abortController?.abort()
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer)
      pendingRevoke?.()
    }
  }

  return { run, abort }
}

const applicationDownload = createBlobDownload()
const coverLetterDownload = createBlobDownload()
const cvDownload = createBlobDownload()

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
  async (newKey, oldKey) => {
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
    try {
      await getJson(`/cv/${newKey}/status`)
      if (newKey === props.job.duplicateKey) cvUploaded.value = true
    } catch {
      // 404 → no CV on server; also covers network errors
      if (newKey === props.job.duplicateKey) cvUploaded.value = false
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

function needsReschedule(newKey: string, snapshot: string): boolean {
  return (
    newKey === props.job.duplicateKey &&
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
      error instanceof Error ? error.message : String(error),
    )
    return false
  }
}

async function uploadNow(
  newKey: string = props.job.duplicateKey,
  snapshot: string = text.value,
  jobForCreation: ScrapedJob = props.job,
) {
  clearUploadTimer()
  const isCurrentJob = () => newKey === props.job.duplicateKey
  if (shouldSkipUpload(snapshot, isCurrentJob)) return
  uploadInFlight = true
  try {
    const jobCreated = await createJobIfNeeded(jobForCreation)
    if (!jobCreated) return
    if (isCurrentJob()) saveStatus.value = 'saving'
    await postJson('/cover-letters/upload/text', {
      coverLetterText: snapshot,
      jobDuplicateKey: newKey,
    })
    if (isCurrentJob()) {
      lastUploadedText.value = snapshot
      saveStatus.value = 'saved'
    }
  } catch (error) {
    if (isCurrentJob()) saveStatus.value = 'error'
    console.error(
      'Failed to upload cover letter:',
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    uploadInFlight = false
    if (needsReschedule(newKey, snapshot)) scheduleUpload()
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
  const keyAtStart = props.job.duplicateKey
  const jobAtStart = props.job
  const jobCreated = await createJobIfNeeded(jobAtStart)
  if (!jobCreated || keyAtStart !== props.job.duplicateKey) return
  const formData = new FormData()
  formData.append('file', file)
  formData.append('jobDuplicateKey', keyAtStart)
  try {
    await postFormData('/cv/upload', formData)
    if (keyAtStart === props.job.duplicateKey) cvUploaded.value = true
  } catch (error) {
    console.error('Failed to upload CV:', error instanceof Error ? error.message : error)
  }
}

async function downloadApplication() {
  try {
    await applicationDownload.run(
      (signal) => getBlob('/application/' + props.job.duplicateKey, signal),
      'application-' + props.job.duplicateKey.replace(/:/g, '-') + '.pdf',
    )
  } catch (error) {
    console.error(
      'Failed to download application:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

async function downloadCoverLetter() {
  try {
    await coverLetterDownload.run(
      (signal) => getBlob('/cover-letters/' + props.job.duplicateKey, signal),
      'cover-letter-' + props.job.duplicateKey.replace(/:/g, '-') + '.pdf',
    )
  } catch (error) {
    console.error(
      'Failed to download cover letter:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

async function downloadCv() {
  try {
    await cvDownload.run(
      (signal) => getBlob('/cv/' + props.job.duplicateKey, signal),
      'cv-' + props.job.duplicateKey.replace(/:/g, '-') + '.pdf',
    )
  } catch (error) {
    console.error('Failed to download CV:', error instanceof Error ? error.message : String(error))
  }
}

onBeforeUnmount(() => {
  if (uploadTimer !== null) {
    void uploadNow()
  }
  applicationDownload.abort()
  coverLetterDownload.abort()
  cvDownload.abort()
})

const generating = ref(false)

async function generateCoverLetter() {
  if (generating.value) return
  generating.value = true
  const keyAtStart = props.job.duplicateKey
  const { embedding, ...jobData } = props.job
  try {
    const { coverLetterIds } = await postJson<{ coverLetterIds: string[] }>(
      '/jobs/top-x-similar-cover-letters',
      { embedding, x: 3 },
    )
    if (keyAtStart !== props.job.duplicateKey) return
    const { coverLetter } = await postJson<{ coverLetter: string }>('/cover-letters/create/text', {
      ...jobData,
      coverLetterIds,
    })
    if (keyAtStart !== props.job.duplicateKey) return
    onChange(coverLetter)
  } catch (error) {
    console.error(
      'Failed to generate cover letter:',
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    generating.value = false
  }
}

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
  <div class="editor">
    <ApplicationEditorHeader
      :title="view === 'letter' ? 'Cover Letter' : 'Application Editor'"
      @back="handleBack"
    />

    <!-- Application Editor menu -->
    <ApplicationEditorMenu
      v-if="view === 'menu'"
      :letter-done="letterDone"
      :cv-uploaded="cvUploaded"
      @open-letter="view = 'letter'"
      @file-selected="onCvFileSelected"
      @download="downloadApplication"
      @download-cover-letter="downloadCoverLetter"
      @download-cv="downloadCv"
    />

    <!-- Cover letter editor -->
    <CoverLetterEditor
      v-else
      :job="job"
      :text="text"
      :status-label="statusLabel"
      :words="words"
      :generating="generating"
      @input="onChange"
      @generate="generateCoverLetter"
    />
  </div>
</template>

<style scoped>
.editor {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background-color);
}
</style>
