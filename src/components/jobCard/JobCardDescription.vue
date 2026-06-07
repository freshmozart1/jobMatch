<script setup lang="ts">
defineProps<{ descriptionText: string | undefined }>()

type DescriptionSegment = {
  text: string
  bold: boolean
}

function parseDescription(text: string): DescriptionSegment[] {
  const segments: DescriptionSegment[] = []
  const pattern = /\*\*(.+?)\*\*/gs
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false })
    }
    segments.push({ text: match[1] ?? '', bold: true })
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false })
  }

  return segments
}
</script>

<template>
  <div v-if="descriptionText" class="job-card__description-frame">
    <div class="job-card__description-scroll">
      <p class="job-card__description">
        <template v-for="(segment, index) in parseDescription(descriptionText)" :key="index"
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
  background: linear-gradient(to bottom, var(--background-color), transparent);
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
