import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import { LikeContainer } from '@/components'

describe('LikeContainer', () => {
  it('renders a dislike and a like control', () => {
    const wrapper = mount(LikeContainer)

    expect(wrapper.find('.like-container__button--dislike').exists()).toBe(true)
    expect(wrapper.find('.like-container__button--like').exists()).toBe(true)
  })

  it('exposes accessible labels for both controls', () => {
    const wrapper = mount(LikeContainer)

    const labels = wrapper
      .findAll('.like-container__button')
      .map((button) => button.attributes('aria-label'))
    expect(labels).toEqual(['Dislike', 'Like'])
  })

  it('defaults both controls to 0.33 opacity', () => {
    const wrapper = mount(LikeContainer)

    expect(wrapper.find('.like-container__button--dislike').attributes('style')).toContain(
      'opacity: 0.33',
    )
    expect(wrapper.find('.like-container__button--like').attributes('style')).toContain(
      'opacity: 0.33',
    )
  })

  it('applies the provided opacity values to the matching controls', () => {
    const wrapper = mount(LikeContainer, {
      props: { likeOpacity: 1, dislikeOpacity: 0 },
    })

    expect(wrapper.find('.like-container__button--like').attributes('style')).toContain(
      'opacity: 1',
    )
    expect(wrapper.find('.like-container__button--dislike').attributes('style')).toContain(
      'opacity: 0',
    )
  })
})
