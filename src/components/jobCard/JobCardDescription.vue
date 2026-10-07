<script setup lang="ts">
import { parseDescription } from '@/lib/parseDescription';

defineProps<{ descriptionText: string | undefined }>();
</script>

<template>
    <div v-if="descriptionText" class="job-card__description-frame">
        <div class="job-card__description-scroll">
            <p class="job-card__description">
                <template
                    v-for="(segment, index) in parseDescription(
                        descriptionText,
                    )"
                    :key="index"
                    ><strong v-if="segment.bold">{{ segment.text }}</strong
                    ><template v-else>{{ segment.text }}</template></template
                >
            </p>
        </div>
    </div>
</template>

<style scoped>
.job-card__description-frame {
    position: relative;
    flex: 1 1 0;
    min-height: 0;
    width: 100%;
    overflow: hidden;
}

.job-card__description-frame::before,
.job-card__description-frame::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 12px;
    pointer-events: none;
    z-index: 1;
}

.job-card__description-frame::before {
    top: 0;
    background: linear-gradient(
        to bottom,
        var(--background-color),
        transparent
    );
}

.job-card__description-frame::after {
    bottom: 0;
    background: linear-gradient(to top, var(--background-color), transparent);
}

.job-card__description-scroll {
    height: 100%;
    overflow-y: auto;
}

.job-card__description {
    margin: 0;
    padding: 12px 0;
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    color: var(--text-color);
    text-align: center;
    white-space: pre-wrap;
    word-break: break-word;
}
</style>
