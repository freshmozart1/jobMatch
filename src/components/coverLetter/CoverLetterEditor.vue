<script setup lang="ts">
import { computed } from 'vue'
import type { ScrapedJob } from '@/components/jobCard/types'

const props = defineProps<{ job: ScrapedJob; text: string; statusLabel: string; words: number }>()
defineEmits<{ input: [value: string] }>()

const safeUrl = computed(() =>
  props.job.sourceUrl.startsWith('https://') ? props.job.sourceUrl : null,
)

type Segment = { text: string; bold: boolean }

function parseDescription(raw: string): Segment[] {
  const segments: Segment[] = []
  const pattern = /\*\*(.+?)\*\*/gs
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw)) !== null) {
    if (match.index > lastIndex)
      segments.push({ text: raw.slice(lastIndex, match.index), bold: false })
    segments.push({ text: match[1] ?? '', bold: true })
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < raw.length) segments.push({ text: raw.slice(lastIndex), bold: false })
  return segments
}
</script>

<template>
  <div class="cl-body cl--letter">
    <div class="cl-paper">
      <div class="cl-paper__subject">
        <div class="cl-paper__subject-text">
          <span class="cl-paper__subject-title">{{ job.title }}</span>
          <span class="cl-paper__subject-company">{{ job.company }}</span>
        </div>
        <a
          v-if="safeUrl"
          class="cl-paper__subject-link"
          :href="safeUrl"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`View job posting: ${job.title} at ${job.company}`"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M14 5h5v5M19 5l-8 8"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M18 14v3.5A2.5 2.5 0 0 1 15.5 20h-9A2.5 2.5 0 0 1 4 17.5v-9A2.5 2.5 0 0 1 6.5 6H10"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </a>
      </div>
      <div v-if="job.descriptionText" class="cl-paper__jobdesc">
        <template v-for="(seg, i) in parseDescription(job.descriptionText)" :key="i">
          <strong v-if="seg.bold">{{ seg.text }}</strong>
          <template v-else>{{ seg.text }}</template>
        </template>
      </div>
      <textarea
        class="cl-textarea"
        :value="text"
        placeholder="I am writing to express my interest in this role…"
        :spellcheck="false"
        @input="$emit('input', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>
  </div>

  <div class="cl-meta">
    <span>{{ statusLabel }}</span>
    <span>{{ words }} {{ words === 1 ? 'word' : 'words' }}</span>
  </div>
</template>

<style scoped>
/* Cover letter editor */
.cl-body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.cl--letter {
  background: #f1f1f3;
  padding: 16px;
}

.cl-paper {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  padding: 26px 24px 30px;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.cl-paper__subject {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--border-color);
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}

.cl-paper__subject-text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cl-paper__subject-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-color);
  text-transform: none;
  letter-spacing: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cl-paper__subject-company {
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  color: var(--border-color);
}

.cl-paper__subject-link {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--border-color);
  text-decoration: none;
  transition: opacity 0.15s ease;
}

.cl-paper__subject-link:hover {
  opacity: 0.6;
}

.cl-paper__subject-link svg {
  width: 14px;
  height: 14px;
}

.cl-paper__jobdesc {
  max-height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-color);
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  overscroll-behavior: contain;
}

.cl-paper__jobdesc strong {
  font-weight: 700;
}

.cl-textarea {
  width: 100%;
  flex: 1 1 auto;
  min-height: 160px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 22px;
  color: var(--text-color);
  padding: 10px 0;
}

.cl-textarea::placeholder {
  color: rgba(0, 0, 0, 0.3);
}

.cl-meta {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px calc(var(--match-bottom-safe-area) + 8px);
  font-size: 12px;
  color: var(--border-color);
  background: var(--background-color);
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
</style>
