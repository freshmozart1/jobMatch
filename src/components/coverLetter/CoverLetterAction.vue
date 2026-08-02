<script setup lang="ts">
defineProps<{ done: boolean }>();
defineEmits<{ click: []; download: [] }>();
</script>

<template>
    <div class="cl-action">
        <button type="button" class="cl-action__row" @click="$emit('click')">
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
                <span class="cl-action__sub">{{
                    done ? 'Draft written' : 'Write a tailored note'
                }}</span>
            </span>
        </button>
        <button
            type="button"
            class="cl-action__dl"
            :disabled="!done"
            aria-label="Download cover letter"
            title="Download cover letter"
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
