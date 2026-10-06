<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { CvLookupState } from '@/lib/cvUpload';

const props = defineProps<{ uploaded: boolean; lookupState?: CvLookupState }>();
const emit = defineEmits<{
    fileSelected: [file: File];
    download: [];
    retryStatus: [];
}>();

const attachmentText = computed(() => {
    if (props.uploaded) return 'PDF attached';
    if (props.lookupState === 'loading') return 'Checking for an attached CV…';
    if (props.lookupState === 'error') return 'CV status unavailable';
    if (props.lookupState === 'unknown') return 'CV status not checked';
    return 'Attach a PDF file';
});

const fileInputRef = ref<HTMLInputElement | null>(null);
const filePickerButtonRef = ref<HTMLButtonElement | null>(null);
const downloadButtonRef = ref<HTMLButtonElement | null>(null);
const retryButtonRef = ref<HTMLButtonElement | null>(null);
const showLookupNotice = ref(props.lookupState === 'error');

watch(
    () => props.lookupState,
    async (state) => {
        if (state === 'error') {
            showLookupNotice.value = true;
            return;
        }
        // Keep the same focusable retry control while its request is pending.
        if (state === 'loading') return;
        const transferFocus =
            document.activeElement === retryButtonRef.value &&
            (state === 'available' || state === 'missing');
        showLookupNotice.value = false;
        if (!transferFocus) return;
        await nextTick();
        // Closing/changing the editor or moving focus takes precedence.
        if (
            props.lookupState !== state ||
            document.activeElement !== document.body
        )
            return;
        if (props.uploaded) downloadButtonRef.value?.focus();
        else filePickerButtonRef.value?.focus();
    },
);

function retryStatus() {
    // aria-disabled retains keyboard focus; the request guard also prevents
    // Enter, Space and pointer activation from starting duplicate checks.
    if (props.lookupState === 'error') emit('retryStatus');
}

function openFilePicker() {
    fileInputRef.value?.click();
}

function onChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // Allow selecting the same file after a failed upload.
    if (!file) return;
    emit('fileSelected', file);
}
</script>

<template>
    <div class="cl-action">
        <button
            ref="filePickerButtonRef"
            type="button"
            class="cl-action__row"
            :aria-busy="lookupState === 'loading'"
            :aria-describedby="
                lookupState === 'error' ? 'cv-lookup-error' : undefined
            "
            @click="openFilePicker"
        >
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
                <span class="cl-action__sub" aria-live="polite">{{
                    attachmentText
                }}</span>
            </span>
        </button>
        <button
            ref="downloadButtonRef"
            type="button"
            class="cl-action__dl"
            :disabled="!uploaded"
            aria-label="Download CV"
            title="Download CV"
            @click="$emit('download')"
        >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                    d="M12 4v11M12 15l-4-4M12 15l4-4"
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
        </button>
    </div>

    <div
        v-if="showLookupNotice && !uploaded"
        class="cv-lookup-notice"
        data-testid="cv-lookup-notice"
    >
        <p
            id="cv-lookup-error"
            :role="lookupState === 'loading' ? 'status' : 'alert'"
        >
            <template v-if="lookupState === 'loading'">
                Checking whether a CV is attached…
            </template>
            <template v-else>
                Could not check whether a CV is attached. Check your connection
                and try again.
            </template>
        </p>
        <button
            ref="retryButtonRef"
            type="button"
            :aria-disabled="lookupState === 'loading'"
            :aria-busy="lookupState === 'loading'"
            @click="retryStatus"
        >
            {{ lookupState === 'loading' ? 'Checking CV…' : 'Retry CV lookup' }}
        </button>
    </div>

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
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: 16px;
    background: #fff;
    color: var(--text-color);
    font-family: 'Inter', sans-serif;
}

.cl-action__row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1 1 auto;
    min-width: 0;
    border: none;
    background: transparent;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 0.1s ease;
    -webkit-tap-highlight-color: transparent;
}

.cl-action__row:active {
    transform: scale(0.99);
}

.cl-action__dl {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 11px;
    border: 1px solid var(--border-color);
    background: #fff;
    color: var(--text-color);
    cursor: pointer;
    transition: transform 0.1s ease;
    -webkit-tap-highlight-color: transparent;
}

.cl-action__dl:active:not(:disabled) {
    transform: scale(0.94);
}

.cl-action__dl:disabled {
    color: rgba(0, 0, 0, 0.22);
    border-color: rgba(0, 0, 0, 0.1);
    background: rgba(0, 0, 0, 0.03);
    cursor: default;
}

.cl-action__dl svg {
    width: 20px;
    height: 20px;
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

.cv-lookup-notice {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-color);
}

.cv-lookup-notice p {
    margin: 0 0 8px;
}

.cv-lookup-notice button {
    padding: 8px 12px;
    border: 1px solid currentColor;
    border-radius: 8px;
    color: inherit;
    background: transparent;
    font: inherit;
    cursor: pointer;
}

.cv-lookup-notice button[aria-disabled='true'] {
    opacity: 0.6;
    cursor: default;
}
</style>
