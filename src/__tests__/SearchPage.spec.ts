import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SearchPage from '@/pages/match/SearchPage.vue'

describe('SearchPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
  })

  it('shows the empty-state message when no keywords are provided', () => {
    const wrapper = mount(SearchPage, { props: { keywords: [] } })
    expect(wrapper.find('.se-empty').exists()).toBe(true)
    expect(wrapper.find('.se-tags').exists()).toBe(false)
  })

  it('adds a keyword on Enter and emits update:keywords', async () => {
    const wrapper = mount(SearchPage, { props: { keywords: [] } })
    await wrapper.find('#se-input').setValue('react')
    await wrapper.find('#se-input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:keywords')).toBeTruthy()
    expect(wrapper.emitted('update:keywords')![0]).toEqual([['react']])
  })

  it('splits on comma and emits the left part as a new keyword', async () => {
    const wrapper = mount(SearchPage, { props: { keywords: [] } })
    await wrapper.find('#se-input').setValue('react,')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:keywords')![0]).toEqual([['react']])
  })

  it('adds a keyword on blur when the draft is non-empty', async () => {
    const wrapper = mount(SearchPage, { props: { keywords: [] } })
    await wrapper.find('#se-input').setValue('remote')
    await wrapper.find('#se-input').trigger('blur')
    expect(wrapper.emitted('update:keywords')![0]).toEqual([['remote']])
  })

  it('does not add a duplicate keyword (case-insensitive)', async () => {
    const wrapper = mount(SearchPage, { props: { keywords: ['React'] } })
    await wrapper.find('#se-input').setValue('react')
    await wrapper.find('#se-input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:keywords')).toBeFalsy()
  })

  it('disables the input when 5 keywords are present', () => {
    const wrapper = mount(SearchPage, { props: { keywords: ['a', 'b', 'c', 'd', 'e'] } })
    const input = wrapper.find('#se-input').element as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.placeholder).toBe('Maximum of 5 keywords reached')
  })

  it('removes the last keyword on Backspace when the draft is empty', async () => {
    const wrapper = mount(SearchPage, { props: { keywords: ['react', 'remote'] } })
    await wrapper.find('#se-input').trigger('keydown', { key: 'Backspace' })
    expect(wrapper.emitted('update:keywords')![0]).toEqual([['react']])
  })

  it('removes a keyword when its tag remove button is clicked', async () => {
    const wrapper = mount(SearchPage, { props: { keywords: ['react', 'remote'] } })
    await wrapper.findAll('.se-tag__remove')[1]!.trigger('click')
    expect(wrapper.emitted('update:keywords')![0]).toEqual([['react']])
  })

  it('renders existing keywords as colored tags', () => {
    const wrapper = mount(SearchPage, { props: { keywords: ['react', 'remote'] } })
    const tags = wrapper.findAll('.se-tag')
    expect(tags).toHaveLength(2)
    expect(tags[0]!.text()).toContain('react')
    expect(tags[1]!.text()).toContain('remote')
  })

  it('generates a deterministic tag color for the same keyword', () => {
    const w1 = mount(SearchPage, { props: { keywords: ['react'] } })
    const w2 = mount(SearchPage, { props: { keywords: ['react'] } })
    expect(w1.find('.se-tag').attributes('style')).toBe(w2.find('.se-tag').attributes('style'))
  })

  it('saves city to localStorage on city input', async () => {
    const wrapper = mount(SearchPage, { props: { keywords: [] } })
    await wrapper.find('#se-city').setValue('Hamburg')
    expect(window.localStorage.getItem('jobmatch.searchcity')).toBe('Hamburg')
  })

  it('strips non-numeric characters from distance input and saves to localStorage', async () => {
    const wrapper = mount(SearchPage, { props: { keywords: [] } })
    const input = wrapper.find('#se-distance')
    await input.setValue('12abc')
    expect(window.localStorage.getItem('jobmatch.searchdistance')).toBe('12')
    expect((input.element as HTMLInputElement).value).toBe('12')
  })

  it('shows "Saving…" then "Saved" after a keyword is added', async () => {
    const wrapper = mount(SearchPage, { props: { keywords: [] } })
    await wrapper.find('#se-input').setValue('react')
    await wrapper.find('#se-input').trigger('keydown', { key: 'Enter' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cl-meta').text()).toContain('Saving')
    vi.advanceTimersByTime(650)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cl-meta').text()).toContain('Saved')
  })

  it('emits back when the back button is clicked', async () => {
    const wrapper = mount(SearchPage, { props: { keywords: [] } })
    await wrapper.find('.cl-header__back').trigger('click')
    expect(wrapper.emitted('back')).toBeTruthy()
  })
})
