<script setup lang="ts">
defineProps<{
    label: string;
    secondary: string;
    warning: string | null;
}>();
</script>

<template>
    <div class="scrape-progress">
        <p class="scrape-progress__primary" role="status" aria-live="polite">
            {{ label }}
        </p>
        <p class="scrape-progress__secondary">
            {{ secondary }}
        </p>
        <p v-if="warning" class="scrape-progress__warning" role="status">
            {{ warning }}
        </p>
    </div>
</template>

<style scoped>
.scrape-progress {
    box-sizing: border-box;
    display: flex;
    min-height: var(--scrape-progress-height);
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: var(--job-card-width);
    color: var(--border-color);
    text-align: center;
}

.scrape-progress p {
    margin: 0;
    font-family: 'Inter', sans-serif;
}

.scrape-progress__primary {
    font-size: 15px;
    font-weight: 600;
}

.scrape-progress__secondary,
.scrape-progress__warning {
    font-size: 13px;
    line-height: 18px;
}

.scrape-progress__warning {
    color: var(--warning);
}
</style>
