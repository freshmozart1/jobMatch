import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CvFileInput from '@/components/CvFileInput.vue'

describe('CvFileInput', () => {
  describe('conditional text (uploaded prop)', () => {
    it('shows "Attach a PDF file" when not uploaded', () => {
      const wrapper = mount(CvFileInput, { props: { uploaded: false } })
      expect(wrapper.find('.cl-action__sub').text()).toBe('Attach a PDF file')
    })

    it('shows "PDF attached" when uploaded', () => {
      const wrapper = mount(CvFileInput, { props: { uploaded: true } })
      expect(wrapper.find('.cl-action__sub').text()).toBe('PDF attached')
    })
  })

  describe('file input accept attribute', () => {
    it('restricts file selection to PDFs', () => {
      const wrapper = mount(CvFileInput, { props: { uploaded: false } })
      expect(wrapper.find('input[type="file"]').attributes('accept')).toBe('application/pdf,.pdf')
    })
  })

  describe('openFilePicker', () => {
    it('clicking the button triggers a click on the hidden file input', async () => {
      const wrapper = mount(CvFileInput, { props: { uploaded: false } })
      const input = wrapper.find('input[type="file"]').element as HTMLInputElement
      const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})
      await wrapper.find('.cl-action').trigger('click')
      expect(clickSpy).toHaveBeenCalledOnce()
    })
  })

  describe('onChange', () => {
    it('emits "fileSelected" with the chosen file', async () => {
      const wrapper = mount(CvFileInput, { props: { uploaded: false } })
      const file = new File(['content'], 'cv.pdf', { type: 'application/pdf' })
      const input = wrapper.find('input[type="file"]')
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
      await input.trigger('change')
      expect(wrapper.emitted('fileSelected')).toBeTruthy()
      expect(wrapper.emitted('fileSelected')![0]).toEqual([file])
    })

    it('does not emit "fileSelected" when no file is selected', async () => {
      const wrapper = mount(CvFileInput, { props: { uploaded: false } })
      const input = wrapper.find('input[type="file"]')
      Object.defineProperty(input.element, 'files', { value: [], configurable: true })
      await input.trigger('change')
      expect(wrapper.emitted('fileSelected')).toBeFalsy()
    })
  })
})
