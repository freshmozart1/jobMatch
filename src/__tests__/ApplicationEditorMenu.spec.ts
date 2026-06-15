import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ApplicationEditorMenu from '@/components/application/ApplicationEditorMenu.vue'
import CvFileInput from '@/components/CvFileInput.vue'

function mountMenu(props: { letterDone?: boolean; cvUploaded?: boolean } = {}) {
  return mount(ApplicationEditorMenu, {
    props: {
      letterDone: props.letterDone ?? false,
      cvUploaded: props.cvUploaded ?? false,
    },
  })
}

describe('ApplicationEditorMenu', () => {
  describe('download button', () => {
    it('is disabled when cvUploaded is false', () => {
      const wrapper = mountMenu({ cvUploaded: false })
      expect((wrapper.find('.cl-download').element as HTMLButtonElement).disabled).toBe(true)
    })

    it('is enabled when cvUploaded is true', () => {
      const wrapper = mountMenu({ cvUploaded: true })
      expect((wrapper.find('.cl-download').element as HTMLButtonElement).disabled).toBe(false)
    })
  })

  describe('cover letter action', () => {
    it('emits "openLetter" when the cover letter action is clicked', async () => {
      const wrapper = mountMenu()
      await wrapper.findAll('.cl-action')[0].trigger('click')
      expect(wrapper.emitted('openLetter')).toBeTruthy()
    })
  })

  describe('file selection', () => {
    it('re-emits "fileSelected" when the CvFileInput child emits it', async () => {
      const wrapper = mountMenu()
      const file = new File(['content'], 'cv.pdf', { type: 'application/pdf' })
      await wrapper.findComponent(CvFileInput).vm.$emit('fileSelected', file)
      expect(wrapper.emitted('fileSelected')).toBeTruthy()
      expect(wrapper.emitted('fileSelected')![0]).toEqual([file])
    })
  })
})
