<script setup lang="ts">
import { computed } from 'vue';
import type { RatingRecovery } from '@/lib/ratingSaves';

const props = defineProps<{ ratings: RatingRecovery[] }>();
defineEmits<{ retry: [key: string] }>();

const rows = computed(() =>
    props.ratings.map((rating) => {
        const choice = rating.like ? 'Like' : 'Dislike';
        const pending = rating.status === 'pending';
        return {
            ...rating,
            choice,
            pending,
            role: pending ? 'status' : 'alert',
            prefix: pending ? 'Retrying' : 'Could not confirm',
            retryLabel: `Retry ${choice} for ${rating.title}`,
            buttonLabel: pending ? 'Retrying…' : 'Try again',
        };
    }),
);
</script>

<template>
    <section
        v-if="rows.length"
        class="rating-recovery"
        aria-label="Ratings needing attention"
    >
        <ul>
            <li
                v-for="rating in rows"
                :key="rating.key"
                :data-rating-key="rating.key"
            >
                <p :role="rating.role">
                    {{ rating.prefix }} {{ rating.choice }} for
                    <strong>{{ rating.title }}</strong> at {{ rating.company }}.
                </p>
                <button
                    type="button"
                    :disabled="rating.pending"
                    :aria-label="rating.retryLabel"
                    @click="$emit('retry', rating.key)"
                >
                    {{ rating.buttonLabel }}
                </button>
            </li>
        </ul>
    </section>
</template>

<style scoped>
.rating-recovery {
    box-sizing: border-box;
    width: var(--job-card-width);
    height: var(--rating-recovery-height);
    flex: 0 0 var(--rating-recovery-height);
    overflow-y: auto;
    margin-bottom: var(--match-card-control-gap);
    padding: 8px;
    border: 1px solid var(--warning);
    border-radius: 12px;
    color: var(--text-color);
    font-size: 13px;
    line-height: 1.4;
}
ul {
    list-style: none;
    margin: 0;
    padding: 0;
}
li {
    display: flex;
    align-items: center;
    gap: 8px;
}
li + li {
    margin-top: 12px;
}
p {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
}
button {
    flex: 0 0 auto;
    padding: 8px;
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
