<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ uploaded: boolean }>();
const emit = defineEmits<{ fileSelected: [file: File]; download: [] }>();

const fileInputRef = ref<HTMLInputElement | null>(null);

function openFilePicker() {
    fileInputRef.value?.click();
}

function onChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    emit('fileSelected', file);
}
</script>

<template>
    <div class="cl-action">
        <button type="button" class="cl-action__row" @click="openFilePicker">
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
                <span class="cl-action__sub">{{
                    uploaded ? 'PDF attached' : 'Attach a PDF file'
                }}</span>
            </span>
        </button>
        <button
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
</style>
