<script setup lang="ts">
import type { CvUploadNotice } from '@/lib/cvUpload';

defineProps<{ notice: CvUploadNotice; uploaded: boolean }>();
defineEmits<{ retry: [] }>();
</script>

<template>
    <div class="cv-upload-notice" data-testid="cv-upload-notice">
        <p :role="notice.phase === 'error' ? 'alert' : 'status'">
            <template v-if="notice.phase === 'error'"
                >{{ notice.fileName }}:
            </template>
            {{ notice.message }}
        </p>
        <p v-if="notice.phase === 'error' && uploaded">
            The replacement was not confirmed; an attached CV remains available.
        </p>
        <button
            v-if="notice.phase !== 'success'"
            type="button"
            :disabled="notice.phase === 'pending'"
            @click="$emit('retry')"
        >
            {{ notice.phase === 'pending' ? 'Uploading…' : 'Retry CV upload' }}
        </button>
    </div>
</template>

<style scoped>
.cv-upload-notice {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-color);
    overflow-wrap: anywhere;
}
p {
    margin: 0 0 8px;
}
button {
    padding: 8px 12px;
    border: 1px solid currentColor;
    border-radius: 8px;
    color: inherit;
    background: transparent;
    font: inherit;
    cursor: pointer;
}
button:disabled {
    opacity: 0.6;
    cursor: default;
}
</style>
