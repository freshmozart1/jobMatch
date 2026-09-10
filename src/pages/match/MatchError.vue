<script setup lang="ts">
withDefaults(defineProps<{ message: string; searchOpen?: boolean }>(), {
    searchOpen: false,
});
const emit = defineEmits<{
    retry: [];
    'open-search': [trigger: HTMLButtonElement];
}>();

function openSearch(event: MouseEvent): void {
    emit('open-search', event.currentTarget as HTMLButtonElement);
}
</script>

<template>
    <div class="match-error">
        <div class="match-error__icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.75v5M12 16.15v.1"
                />
            </svg>
        </div>
        <h2 class="match-error__title">Search failed</h2>
        <p class="match-error__message" role="alert">{{ message }}</p>
        <div class="match-error__actions">
            <button
                type="button"
                class="match-error__retry"
                @click="emit('retry')"
            >
                Try again
            </button>
            <button
                type="button"
                class="match-error__search"
                aria-haspopup="dialog"
                aria-controls="search-dialog"
                :aria-expanded="searchOpen"
                @click="openSearch"
            >
                Edit search
            </button>
        </div>
    </div>
</template>

<style scoped>
.match-error {
    flex: 1 1 0;
    min-height: 0;
    width: var(--job-card-width);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 14px;
    padding-bottom: 8vh;
}

.match-error__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 1px solid var(--error);
    color: var(--error);
    margin-bottom: 4px;
}

.match-error__icon svg {
    width: 28px;
    height: 28px;
}

.match-error__title {
    margin: 0;
    font-family: 'Inter', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: var(--border-color);
}

.match-error__message {
    margin: 0;
    max-width: 240px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
    color: var(--error);
    text-wrap: pretty;
}

.match-error__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 6px;
}

.match-error__retry {
    padding: 11px 22px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--border-color);
    color: var(--background-color);
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
    -webkit-tap-highlight-color: transparent;
}

.match-error__retry:hover {
    opacity: 0.85;
}

.match-error__retry:active {
    opacity: 0.7;
}

.match-error__search {
    padding: 11px 22px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--background-color);
    color: var(--text-color);
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.12s ease;
    -webkit-tap-highlight-color: transparent;
}

.match-error__search:active {
    transform: scale(0.97);
}
</style>
