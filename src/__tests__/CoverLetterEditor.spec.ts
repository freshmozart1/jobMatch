import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CoverLetterEditor from '@/components/coverLetter/CoverLetterEditor.vue'
import type { ScrapedJob } from '@/components/jobCard/types'

const baseJob: ScrapedJob = {
  sourceHostname: 'de.linkedin.com',
  sourceJobId: '1001',
  sourceUrl: 'https://de.linkedin.com/jobs/view/1001/',
  title: 'Frontend Engineer',
  company: 'Example GmbH',
  location: 'Hamburg',
  descriptionText: 'Some description.',
  scrapedAt: '2026-06-08T10:00:00.000Z',
  duplicateKey: 'linkedin:1001',
  embedding: [],
}

function mountEditor(
  jobOverrides: Partial<ScrapedJob> = {},
  extra: { text?: string; statusLabel?: string; words?: number } = {},
) {
  return mount(CoverLetterEditor, {
    props: {
      job: { ...baseJob, ...jobOverrides },
      text: extra.text ?? '',
      statusLabel: extra.statusLabel ?? 'Draft auto-saves as you type',
      words: extra.words ?? 0,
    },
  })
}

describe('CoverLetterEditor', () => {
  describe('parseDescription', () => {
    it('renders plain text without any <strong> elements', () => {
      const wrapper = mountEditor({ descriptionText: 'Plain text only' })
      expect(wrapper.find('.cl-paper__jobdesc strong').exists()).toBe(false)
      expect(wrapper.find('.cl-paper__jobdesc').text()).toBe('Plain text only')
    })

    it('wraps **word** in a <strong> element', () => {
      const wrapper = mountEditor({ descriptionText: 'Hello **world**!' })
      expect(wrapper.find('.cl-paper__jobdesc strong').text()).toBe('world')
      expect(wrapper.find('.cl-paper__jobdesc').text()).toBe('Hello world!')
    })

    it('handles multiple bold segments', () => {
      const wrapper = mountEditor({ descriptionText: '**A** and **B**' })
      const strongs = wrapper.findAll('.cl-paper__jobdesc strong')
      // fallow-ignore-next-line code-duplication
      expect(strongs).toHaveLength(2)
      expect(strongs[0]!.text()).toBe('A')
      expect(strongs[1]!.text()).toBe('B')
    })

    it('handles bold at the start of text', () => {
      const wrapper = mountEditor({ descriptionText: '**Bold** then plain' })
      expect(wrapper.find('.cl-paper__jobdesc strong').text()).toBe('Bold')
      expect(wrapper.find('.cl-paper__jobdesc').text()).toBe('Bold then plain')
    })

    it('handles bold at the end of text', () => {
      const wrapper = mountEditor({ descriptionText: 'Plain then **Bold**' })
      expect(wrapper.find('.cl-paper__jobdesc strong').text()).toBe('Bold')
      expect(wrapper.find('.cl-paper__jobdesc').text()).toBe('Plain then Bold')
    })

    it('does not render the description section when descriptionText is empty', () => {
      const wrapper = mountEditor({ descriptionText: '' })
      expect(wrapper.find('.cl-paper__jobdesc').exists()).toBe(false)
    })
  })

  describe('word count', () => {
    it('shows "1 word" for words=1', () => {
      const wrapper = mountEditor({}, { words: 1 })
      expect(wrapper.findAll('.cl-meta span')[1]!.text()).toBe('1 word')
    })

    it('shows "2 words" for words=2', () => {
      const wrapper = mountEditor({}, { words: 2 })
      expect(wrapper.findAll('.cl-meta span')[1]!.text()).toBe('2 words')
    })

    it('shows "0 words" for words=0', () => {
      const wrapper = mountEditor({}, { words: 0 })
      expect(wrapper.findAll('.cl-meta span')[1]!.text()).toBe('0 words')
    })
  })

  describe('statusLabel', () => {
    it('displays the statusLabel prop in the first meta span', () => {
      const wrapper = mountEditor({}, { statusLabel: 'Saved to server' })
      expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Saved to server')
    })
  })

  describe('textarea', () => {
    it('emits "input" with the typed value when the textarea changes', async () => {
      const wrapper = mountEditor()
      await wrapper.find('.cl-textarea').setValue('Hello')
      expect(wrapper.emitted('input')).toBeTruthy()
      expect(wrapper.emitted('input')![0]).toEqual(['Hello'])
    })
  })
})
