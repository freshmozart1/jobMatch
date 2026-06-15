<script setup lang="ts">
import type { ScrapedJob } from '@/components/jobCard/types'

defineProps<{ job: ScrapedJob; text: string; statusLabel: string; words: number }>()
defineEmits<{ input: [value: string] }>()

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
        <div class="cl-marquee">
          <div class="cl-marquee__track">
            <span class="cl-marquee__item">{{ job.title }}</span>
            <span class="cl-marquee__item" aria-hidden="true">{{ job.title }}</span>
          </div>
        </div>
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
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--border-color);
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}

.cl-marquee {
  overflow: hidden;
  white-space: nowrap;
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 14px,
    #000 calc(100% - 14px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 14px,
    #000 calc(100% - 14px),
    transparent 100%
  );
}

.cl-marquee__track {
  display: inline-flex;
  animation: cl-marquee-scroll 16s linear infinite;
  will-change: transform;
}

.cl-marquee__item {
  white-space: nowrap;
  padding-right: 3em;
}

@keyframes cl-marquee-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cl-marquee__track {
    animation: none;
  }
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
