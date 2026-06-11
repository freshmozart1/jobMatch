import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import { MatchFilterBar } from '@/components'

function mountBar(props: { enabled?: boolean; threshold?: number } = {}) {
  return mount(MatchFilterBar, {
    props: { enabled: false, threshold: 50, ...props },
  })
}

describe('MatchFilterBar', () => {
  it('reads "Show all jobs" and disables the input when off', () => {
    const wrapper = mountBar({ enabled: false })

    expect(wrapper.find('.match-filter__label').text()).toBe('Show all jobs')
    expect(wrapper.find('.match-filter__switch').attributes('aria-checked')).toBe('false')
    expect(wrapper.find('.match-filter__num input').attributes('disabled')).toBeDefined()
  })

  it('reads "Min. match" and enables the input when on', () => {
    const wrapper = mountBar({ enabled: true })

    expect(wrapper.find('.match-filter__label').text()).toBe('Min. match')
    expect(wrapper.find('.match-filter__switch').attributes('aria-checked')).toBe('true')
    expect(wrapper.find('.match-filter__num input').attributes('disabled')).toBeUndefined()
  })

  it('emits the toggled enabled value when the switch is clicked', async () => {
    const wrapper = mountBar({ enabled: false })

    await wrapper.find('.match-filter__switch').trigger('click')

    expect(wrapper.emitted('update:enabled')).toEqual([[true]])
  })

  it('emits a clamped threshold when the number input changes', async () => {
    const wrapper = mountBar({ enabled: true })

    await wrapper.find('.match-filter__num input').setValue('80')
    await wrapper.find('.match-filter__num input').setValue('250')

    const emitted = wrapper.emitted('update:threshold') ?? []
    expect(emitted[0]).toEqual([80])
    expect(emitted[emitted.length - 1]).toEqual([100])
  })
})
