<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

const MAX_KEYWORDS = 5
const CITY_STORAGE_KEY = 'jobmatch.searchcity'
const DISTANCE_STORAGE_KEY = 'jobmatch.searchdistance'

const props = defineProps<{ keywords: string[] }>()
const emit = defineEmits<{
  'update:keywords': [value: string[]]
  back: []
}>()

function loadFromStorage(key: string): string {
  try { return window.localStorage.getItem(key) ?? '' } catch { return '' }
}

const draft = ref('')
const city = ref(loadFromStorage(CITY_STORAGE_KEY))
const distance = ref(loadFromStorage(DISTANCE_STORAGE_KEY))
const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
let saveTimer: ReturnType<typeof setTimeout> | null = null

onUnmounted(() => {
  if (saveTimer !== null) clearTimeout(saveTimer)
})

function tagColor(kw: string): { background: string; borderColor: string } {
  let hash = 5381
  for (let i = 0; i < kw.length; i++) {
    hash = ((hash * 33 + kw.charCodeAt(i)) >>> 0)
  }
  const hue = Math.round((hash * 137.508) % 360)
  const sat = 60 + (hash % 22)
  return {
    background: `hsl(${hue} ${sat}% 95%)`,
    borderColor: `hsl(${hue} ${Math.max(40, sat - 18)}% 82%)`,
  }
}

function markSaving() {
  saveState.value = 'saving'
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => (saveState.value = 'saved'), 650)
}

function persist(next: string[]) {
  emit('update:keywords', next)
  markSaving()
}

function onCityChange(event: Event) {
  const v = (event.target as HTMLInputElement).value
  city.value = v
  try { window.localStorage.setItem(CITY_STORAGE_KEY, v) } catch {}
  markSaving()
}

function onDistanceChange(event: Event) {
  const el = event.target as HTMLInputElement
  const v = el.value.replace(/[^0-9]/g, '').slice(0, 3)
  distance.value = v
  el.value = v
  try { window.localStorage.setItem(DISTANCE_STORAGE_KEY, v) } catch {}
  markSaving()
}

function addKeywords(raw: string) {
  const incoming = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!incoming.length || props.keywords.length >= MAX_KEYWORDS) return
  const seen = new Set(props.keywords.map((k) => k.toLowerCase()))
  const next = [...props.keywords]
  for (const k of incoming) {
    if (next.length >= MAX_KEYWORDS) break
    if (!seen.has(k.toLowerCase())) {
      seen.add(k.toLowerCase())
      next.push(k)
    }
  }
  if (next.length !== props.keywords.length) persist(next)
}

function removeKeyword(idx: number) {
  persist(props.keywords.filter((_, i) => i !== idx))
}

function onChange(event: Event) {
  const v = (event.target as HTMLInputElement).value
  if (v.includes(',')) {
    const parts = v.split(',')
    const tail = parts.pop()!
    addKeywords(parts.join(','))
    draft.value = tail.trimStart()
  } else {
    draft.value = v
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (draft.value.trim()) {
      addKeywords(draft.value)
      draft.value = ''
    }
  } else if (event.key === 'Backspace' && !draft.value && props.keywords.length) {
    removeKeyword(props.keywords.length - 1)
  }
}

function onBlur() {
  if (draft.value.trim()) {
    addKeywords(draft.value)
    draft.value = ''
  }
}

const atLimit = computed(() => props.keywords.length >= MAX_KEYWORDS)

const hint = computed(() =>
  saveState.value === 'saving'
    ? 'Saving…'
    : saveState.value === 'saved'
      ? 'Saved'
      : 'Keywords auto-save as you type',
)
</script>

<template>
  <div class="cl-screen">
    <header class="cl-header">
      <button type="button" class="cl-header__back" @click="emit('back')">
        <svg width="11" height="18" viewBox="0 0 11 18" fill="none" aria-hidden="true">
          <path
            d="M9 2L2 9l7 7"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Back
      </button>
      <span class="cl-header__title">Search Jobs</span>
    </header>

    <div class="se-body">
      <label class="se-field-label" for="se-input">Search keywords</label>
      <input
        id="se-input"
        class="se-input"
        type="text"
        :value="draft"
        :disabled="atLimit"
        :placeholder="atLimit ? 'Maximum of 5 keywords reached' : 'e.g. react, remote, senior…'"
        autocomplete="off"
        @input="onChange"
        @keydown="onKeyDown"
        @blur="onBlur"
      />
      <p class="se-help">
        {{
          atLimit
            ? 'Remove a keyword to add another (max 5).'
            : `Separate multiple keywords with a comma. ${MAX_KEYWORDS - keywords.length} left.`
        }}
      </p>

      <div v-if="keywords.length > 0" class="se-tags" role="list" aria-label="Saved keywords">
        <span
          v-for="(kw, i) in keywords"
          :key="kw + i"
          class="se-tag"
          role="listitem"
          :style="tagColor(kw)"
        >
          <span class="se-tag__text">{{ kw }}</span>
          <button
            type="button"
            class="se-tag__remove"
            :aria-label="'Remove ' + kw"
            @click="removeKeyword(i)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M3 3l6 6M9 3l-6 6"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </span>
      </div>
      <p v-else class="se-empty">No keywords yet. Add a few to focus your feed.</p>

      <label class="se-field-label se-field-label--spaced" for="se-city">
        Location <span class="se-field-label__opt">(optional)</span>
      </label>
      <input
        id="se-city"
        class="se-input"
        type="text"
        :value="city"
        autocomplete="off"
        placeholder="e.g. Hamburg"
        @input="onCityChange"
      />
      <p class="se-help">Narrow results to a single city.</p>

      <label class="se-field-label se-field-label--spaced" for="se-distance">
        Distance <span class="se-field-label__opt">(optional)</span>
      </label>
      <div class="se-num">
        <input
          id="se-distance"
          class="se-num__input"
          type="text"
          inputmode="numeric"
          :value="distance"
          autocomplete="off"
          placeholder="25"
          @input="onDistanceChange"
        />
        <span class="se-num__unit">km</span>
      </div>
      <p class="se-help">Search radius around the location, in kilometers.</p>
    </div>

    <div class="cl-meta">
      <span class="cl-meta__hint">
        <span class="se-save-dot" :data-state="saveState" />
        {{ hint }}
      </span>
      <span>{{ keywords.length }}/{{ MAX_KEYWORDS }} {{ keywords.length === 1 ? 'keyword' : 'keywords' }}</span>
    </div>
  </div>
</template>

<style scoped>
.cl-screen {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background-color);
}

.cl-header {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: calc(54px + 6px) 16px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.07);
  background: var(--background-color);
}

.cl-header__back {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  padding: 6px 4px;
  margin-left: -4px;
  color: var(--text-color);
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.cl-header__title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 15px;
  font-weight: 700;
  color: var(--text-color);
}

.cl-meta {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px calc(34px + 8px);
  font-size: 12px;
  color: var(--border-color);
  background: var(--background-color);
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.cl-meta__hint {
  display: flex;
  align-items: center;
  gap: 6px;
}

.se-body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 20px 18px;
}

.se-field-label {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--border-color);
  margin-bottom: 8px;
}

.se-field-label--spaced {
  margin-top: 26px;
  padding-top: 22px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.se-field-label__opt {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.7;
}

.se-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: #fff;
  padding: 12px 14px;
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-color);
  outline: none;
  box-shadow: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.se-input:focus {
  border-color: var(--border-color);
  box-shadow: 2px 2px 8px 0 var(--box-shadow-color, rgba(0, 0, 0, 0.08));
}

.se-input::placeholder {
  color: rgba(0, 0, 0, 0.3);
}

.se-input:disabled {
  background: rgba(0, 0, 0, 0.03);
  color: var(--border-color);
  cursor: not-allowed;
}

.se-help {
  margin: 8px 2px 0;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: var(--border-color);
}

.se-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
}

.se-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 12px;
  border-radius: 999px;
  border: 1px solid;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  animation: se-tag-in 0.2s ease;
}

.se-tag__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-color);
  cursor: pointer;
  transition: background 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.se-tag__remove:hover {
  background: rgba(0, 0, 0, 0.18);
}

.se-empty {
  margin-top: 24px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: var(--border-color);
  text-align: center;
}

.se-num {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}

.se-num:focus-within {
  box-shadow: 2px 2px 8px 0 var(--box-shadow-color, rgba(0, 0, 0, 0.08));
}

.se-num__input {
  flex: 1 1 auto;
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  padding: 12px 14px;
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-color);
}

.se-num__input::placeholder {
  color: rgba(0, 0, 0, 0.3);
  font-weight: 500;
}

.se-num__unit {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--border-color);
  color: var(--background-color);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.se-save-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--border-color);
  transition: background 0.2s ease;
}

.se-save-dot[data-state='saving'] {
  background: var(--accents-green);
  animation: se-save-pulse 0.7s ease-in-out infinite;
}

.se-save-dot[data-state='saved'] {
  background: var(--accents-green);
}

@keyframes se-tag-in {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes se-save-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}

@media (prefers-reduced-motion: reduce) {
  .se-save-dot[data-state='saving'] {
    animation: none;
  }
  .se-tag {
    animation: none;
  }
}
</style>
