<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import type { ScrapedJob } from '@/components/jobCard/types';
import { getBlob, getJson, postFormData, postJson } from '@/lib/api';
import {
    coverLetterSavesKey,
    createCoverLetterSaves,
} from '@/lib/coverLetterSaves';
import { CoverLetterEditor } from '@/components/coverLetter';
import type { CoverLetterRevisionSelection } from '@/components/coverLetter';
import {
    APPLICATION_EDITOR_NAME,
    ApplicationEditorHeader,
    ApplicationEditorMenu,
    COVER_LETTER_NAME,
} from '@/components/application';

const props = withDefaults(
    defineProps<{ job: ScrapedJob; active?: boolean }>(),
    { active: true },
);
const emit = defineEmits<{ back: [] }>();

const storageKey = computed(
    () => 'jobmatch.coverletter.' + props.job.duplicateKey,
);
const text = ref('');
const view = ref<'menu' | 'letter'>('menu');
const revising = ref(false);
const revisionError = ref<string | null>(null);
let revisionAbortController: AbortController | null = null;

function resetRevision() {
    revisionError.value = null;
}

function abortRevision() {
    revisionAbortController?.abort();
    revisionAbortController = null;
    revising.value = false;
    resetRevision();
}

const cvUploaded = ref(false);

const letterDone = computed(() => text.value.trim().length > 0);

const saves = inject(coverLetterSavesKey, createCoverLetterSaves, true);
let saveSession: ReturnType<typeof saves.connect> | null = null;
const saveStatus = ref<'idle' | 'pending' | 'saving' | 'saved' | 'error'>(
    'idle',
);
const jobCreateFailed = ref(false);

type DocumentKind = 'cover-letter' | 'application';
type DocumentRequest = {
    kind: DocumentKind;
    key: string;
    session: ReturnType<typeof saves.connect>;
};
const downloadStatus = ref<string | null>(null);
const downloadError = ref<string | null>(null);
const documentDownloadBusy = computed(() => downloadStatus.value !== null);
let documentRequest: DocumentRequest | null = null;
let retryDocumentKind: DocumentKind | null = null;

// Fetches a blob, triggers a browser download for it, and cleans up the
// object URL afterwards. Each call site gets its own instance so an
// in-flight CV download never blocks a cover-letter (or application)
// download, and vice versa.
function createBlobDownload() {
    let inFlight = false;
    let abortController: AbortController | null = null;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingRevoke: (() => void) | null = null;

    async function run(
        fetchBlob: (signal: AbortSignal) => Promise<Blob>,
        filename: string,
    ) {
        if (inFlight) return;
        inFlight = true;
        const controller = new AbortController();
        abortController = controller;
        try {
            const blob = await fetchBlob(controller.signal);
            if (controller.signal.aborted) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            const cleanup = () => {
                URL.revokeObjectURL(url);
                a.remove();
                cleanupTimer = null;
                pendingRevoke = null;
            };
            pendingRevoke = cleanup;
            cleanupTimer = setTimeout(cleanup, 0);
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError')
                return;
            throw error;
        } finally {
            inFlight = false;
            abortController = null;
        }
    }

    function abort() {
        abortController?.abort();
        if (cleanupTimer !== null) {
            clearTimeout(cleanupTimer);
            pendingRevoke?.();
        }
    }

    return { run, abort };
}

const applicationDownload = createBlobDownload();
const coverLetterDownload = createBlobDownload();
const cvDownload = createBlobDownload();

watch(
    () => props.job.duplicateKey,
    async (newKey) => {
        cancelDocumentDownload();
        abortRevision();
        saveSession?.close();
        view.value = 'menu';
        let draft = '';
        try {
            draft = window.localStorage.getItem(storageKey.value) ?? '';
        } catch {
            // The coordinator retains an in-flight draft if storage is unavailable.
        }
        saveSession = saves.connect(props.job, draft, (state) => {
            saveStatus.value = state.status;
            jobCreateFailed.value = state.jobCreateFailed;
        });
        text.value = saveSession.initialText;
        try {
            await getJson(`/cv/${newKey}/status`);
            if (newKey === props.job.duplicateKey) cvUploaded.value = true;
        } catch {
            // 404 → no CV on server; also covers network errors
            if (newKey === props.job.duplicateKey) cvUploaded.value = false;
        }
    },
    { immediate: true },
);

watch(
    () => props.active,
    (active) => {
        if (!active) cancelDocumentDownload();
    },
);

function onChange(v: string) {
    if (!saveSession) return;
    text.value = v;
    try {
        window.localStorage.setItem(storageKey.value, v);
    } catch {
        /* ignore */
    }
    saveSession.update(v);
}

function handleBack() {
    if (view.value === 'letter') {
        abortRevision();
        view.value = 'menu';
    } else {
        cancelDocumentDownload();
        void saveSession?.flush();
        emit('back');
    }
}

async function onCvFileSelected(file: File) {
    const keyAtStart = props.job.duplicateKey;
    const jobCreated = await saveSession?.ensureJob();
    if (!jobCreated || keyAtStart !== props.job.duplicateKey) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('jobDuplicateKey', keyAtStart);
    try {
        await postFormData('/cv/upload', formData);
        if (keyAtStart === props.job.duplicateKey) cvUploaded.value = true;
    } catch (error) {
        console.error(
            'Failed to upload CV:',
            error instanceof Error ? error.message : error,
        );
    }
}

function cancelDocumentDownload() {
    documentRequest = null;
    downloadStatus.value = null;
    downloadError.value = null;
    retryDocumentKind = null;
    applicationDownload.abort();
    coverLetterDownload.abort();
}

function isCurrentDocumentRequest(request: DocumentRequest): boolean {
    return (
        documentRequest === request &&
        props.active &&
        saveSession === request.session &&
        props.job.duplicateKey === request.key
    );
}

function fetchDocument(request: DocumentRequest) {
    const downloader =
        request.kind === 'application'
            ? applicationDownload
            : coverLetterDownload;
    const route =
        request.kind === 'application' ? '/application/' : '/cover-letters/';
    return downloader.run(
        (signal) => getBlob(route + request.key, signal),
        request.kind + '-' + request.key.replace(/:/g, '-') + '.pdf',
    );
}

async function saveAndDownloadDocument(request: DocumentRequest) {
    while (isCurrentDocumentRequest(request)) {
        const requestedText = text.value;
        if (!requestedText.trim()) {
            downloadError.value = 'Write a cover letter before downloading it.';
            return;
        }
        const saved = await request.session.flush();
        if (!isCurrentDocumentRequest(request)) return;
        if (saveStatus.value === 'error') {
            downloadError.value =
                'Could not save the latest cover letter. Please try again.';
            return;
        }
        // A newer edit may still be debounced when the older write settles.
        // Flush that revision too, and never use a false result as an acknowledgement.
        if (
            !saved ||
            text.value !== requestedText ||
            saveStatus.value !== 'saved'
        )
            continue;

        downloadStatus.value = 'Downloading PDF…';
        await fetchDocument(request);
        return;
    }
}

async function downloadDocument(kind: DocumentKind) {
    if (documentRequest || !saveSession || !props.active) return;
    const request = { kind, key: props.job.duplicateKey, session: saveSession };
    documentRequest = request;
    retryDocumentKind = kind;
    downloadError.value = null;
    downloadStatus.value = 'Saving latest cover letter…';
    try {
        await saveAndDownloadDocument(request);
    } catch (error) {
        if (!isCurrentDocumentRequest(request)) return;
        downloadError.value = 'Could not download the PDF. Please try again.';
        console.error(
            kind === 'application'
                ? 'Failed to download application:'
                : 'Failed to download cover letter:',
            error instanceof Error ? error.message : String(error),
        );
    } finally {
        if (isCurrentDocumentRequest(request)) {
            documentRequest = null;
            downloadStatus.value = null;
        }
    }
}

function downloadCoverLetter() {
    return downloadDocument('cover-letter');
}

function retryDocumentDownload() {
    if (retryDocumentKind) void downloadDocument(retryDocumentKind);
}

async function downloadCv() {
    try {
        await cvDownload.run(
            (signal) => getBlob('/cv/' + props.job.duplicateKey, signal),
            'cv-' + props.job.duplicateKey.replace(/:/g, '-') + '.pdf',
        );
    } catch (error) {
        console.error(
            'Failed to download CV:',
            error instanceof Error ? error.message : String(error),
        );
    }
}

// The combined PDF only makes sense once both documents exist — with just one,
// "Download application" downloads that one document instead.
async function downloadApplication() {
    if (letterDone.value && cvUploaded.value) {
        await downloadDocument('application');
    } else if (letterDone.value) {
        await downloadCoverLetter();
    } else if (cvUploaded.value) {
        await downloadCv();
    }
}

onBeforeUnmount(() => {
    cancelDocumentDownload();
    saveSession?.close();
    saveSession = null;
    cvDownload.abort();
    abortRevision();
});

const generating = ref(false);

async function generateCoverLetter() {
    if (generating.value || revising.value) return;
    resetRevision();
    generating.value = true;
    const keyAtStart = props.job.duplicateKey;
    // The endpoint never used the embedding — strip it from the request body.
    const { embedding, ...jobData } = props.job;
    void embedding;
    try {
        const { coverLetter } = await postJson<{ coverLetter: string }>(
            '/cover-letters/create/text',
            jobData,
        );
        if (keyAtStart !== props.job.duplicateKey) return;
        onChange(coverLetter);
    } catch (error) {
        console.error(
            'Failed to generate cover letter:',
            error instanceof Error ? error.message : String(error),
        );
    } finally {
        generating.value = false;
    }
}

async function reviseCoverLetter(selection: CoverLetterRevisionSelection) {
    if (revising.value) return;

    const draftAtStart = text.value;
    if (
        draftAtStart.slice(selection.start, selection.end) !==
        selection.selectedText
    ) {
        revisionError.value =
            'The selection changed. Select the passage again and retry.';
        return;
    }

    const keyAtStart = props.job.duplicateKey;
    const controller = new AbortController();
    revisionAbortController = controller;
    revising.value = true;
    resetRevision();

    try {
        const { replacementText } = await postJson<{
            replacementText: string;
        }>(
            '/cover-letters/revise/text',
            {
                selectedText: selection.selectedText,
                instruction: selection.instruction,
                coverLetterText: draftAtStart,
                job: {
                    title: props.job.title,
                    company: props.job.company,
                    location: props.job.location,
                    description: props.job.descriptionText,
                },
            },
            controller.signal,
        );
        if (
            keyAtStart !== props.job.duplicateKey ||
            text.value !== draftAtStart
        ) {
            return;
        }
        if (
            typeof replacementText !== 'string' ||
            replacementText.trim().length === 0
        ) {
            throw new Error('The server returned an invalid replacement.');
        }

        onChange(
            draftAtStart.slice(0, selection.start) +
                replacementText +
                draftAtStart.slice(selection.end),
        );
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
            return;
        revisionError.value = 'Could not revise this text. Please try again.';
        console.error(
            'Failed to revise cover letter selection:',
            error instanceof Error ? error.message : String(error),
        );
    } finally {
        if (revisionAbortController === controller) {
            revisionAbortController = null;
            revising.value = false;
        }
    }
}

const words = computed(() =>
    text.value.trim() ? text.value.trim().split(/\s+/).length : 0,
);

const statusLabel = computed(() => {
    switch (saveStatus.value) {
        case 'pending':
            return 'Saving soon…';
        case 'saving':
            return 'Saving…';
        case 'saved':
            return 'Saved to server';
        case 'error':
            return jobCreateFailed.value
                ? 'Job could not be saved — cover letter not stored. Will retry on next edit.'
                : 'Save failed — retrying on next edit';
        default:
            return words.value > 0
                ? 'Saved as draft'
                : 'Draft auto-saves as you type';
    }
});
</script>

<template>
    <div class="editor">
        <ApplicationEditorHeader
            :title="
                view === 'letter' ? COVER_LETTER_NAME : APPLICATION_EDITOR_NAME
            "
            @back="handleBack"
        />

        <div
            v-if="downloadStatus || downloadError"
            class="editor__download-notice"
        >
            <p v-if="downloadStatus" role="status">{{ downloadStatus }}</p>
            <p v-if="downloadError" role="alert">{{ downloadError }}</p>
            <button
                v-if="downloadError"
                type="button"
                class="editor__download-retry"
                @click="retryDocumentDownload"
            >
                Try download again
            </button>
        </div>

        <!-- Application Editor menu -->
        <ApplicationEditorMenu
            v-if="view === 'menu'"
            :letter-done="letterDone"
            :cv-uploaded="cvUploaded"
            :document-download-busy="documentDownloadBusy"
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
            :revising="revising"
            :revision-error="revisionError"
            @input="onChange"
            @generate="generateCoverLetter"
            @revise="reviseCoverLetter"
            @reset-revision="resetRevision"
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
.editor__download-notice {
    padding: 12px 18px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-color);
}
.editor__download-notice p {
    margin: 0;
}
.editor__download-retry {
    margin-top: 8px;
    padding: 8px 12px;
    border: 1px solid currentColor;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
}
</style>
