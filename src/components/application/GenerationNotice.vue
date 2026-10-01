<script setup lang="ts">
defineProps<{
    discarded: boolean;
    restorationFailed: boolean;
    hasText: boolean;
}>();
defineEmits<{ retry: [] }>();
</script>

<template>
    <div v-if="discarded || restorationFailed" class="generation-notice">
        <p v-if="discarded" role="status">
            Your draft was kept; the generated text was discarded.
        </p>
        <p v-if="restorationFailed" role="alert">
            Your draft is not saved to the server.
            {{
                hasText
                    ? 'Try saving it again.'
                    : 'Add some text before saving again.'
            }}
        </p>
        <button
            v-if="restorationFailed"
            type="button"
            class="editor__save-retry"
            :disabled="!hasText"
            @click="$emit('retry')"
        >
            Try saving again
        </button>
    </div>
</template>

<style scoped>
.generation-notice {
    padding: 12px 18px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-color);
}
.generation-notice p {
    margin: 0;
}
.editor__save-retry {
    margin-top: 8px;
    padding: 8px 12px;
    border: 1px solid currentColor;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
}
.editor__save-retry:disabled {
    cursor: default;
    opacity: 0.5;
}
</style>
