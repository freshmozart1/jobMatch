import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import JobCardTag from '@/components/jobCard/JobCardTag.vue'

describe('JobCardTag', () => {
  it('renders the tag text and is visible by default', () => {
    const wrapper = mount(JobCardTag, { props: { tag: 'TypeScript' } })
    expect(wrapper.find('.job-card__tag').text()).toBe('TypeScript')
    expect(wrapper.find('.job-card__tag').isVisible()).toBe(true)
  })

  // The overflow-detection path (scrollWidth > clientWidth → hidden) cannot be
  // tested in JSDOM because it has no layout engine: scrollWidth and clientWidth
  // are always 0, so onMounted never triggers the hide branch.
})
