<script setup lang="ts">
withDefaults(
  defineProps<{
    likeOpacity?: number
    dislikeOpacity?: number
  }>(),
  {
    likeOpacity: 0.33,
    dislikeOpacity: 0.33,
  },
)

defineEmits<{ edit: [] }>()
</script>

<template>
  <div class="like-container">
    <button
      type="button"
      class="like-container__button like-container__button--dislike"
      :style="{ opacity: dislikeOpacity }"
      aria-label="Dislike"
    >
      <svg class="like-container__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M19 15h4V3h-4m-4 0H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2a2 2 0 0 0 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2z"
        />
      </svg>
    </button>
    <button
      type="button"
      class="like-container__button like-container__button--edit"
      aria-label="Write cover letter"
      @click="$emit('edit')"
    >
      <svg class="like-container__icon like-container__icon--edit" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"
        />
      </svg>
    </button>
    <button
      type="button"
      class="like-container__button like-container__button--like"
      :style="{ opacity: likeOpacity }"
      aria-label="Like"
    >
      <svg class="like-container__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10a2 2 0 0 0 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2M1 21h4V9H1v12z"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.like-container {
  box-sizing: border-box;
  position: sticky;
  bottom: var(--match-bottom-safe-area);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: var(--job-card-width);
  min-height: var(--like-container-height);
  padding: var(--like-container-vertical-padding) 24px;
  background: var(--page-background-color, var(--background-color));
}

.like-container__button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.12s ease;
}

.like-container__button:active {
  transform: scale(0.88);
}

.like-container__icon {
  width: 48px;
  height: 48px;
}

.like-container__icon--edit {
  width: 40px;
  height: 40px;
}

.like-container__button--dislike {
  color: var(--accents-pink);
}

.like-container__button--like {
  color: var(--accents-green);
}

.like-container__button--edit {
  color: var(--border-color);
}
</style>
