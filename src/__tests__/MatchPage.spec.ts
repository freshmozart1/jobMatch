import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import { JobCard, LikeContainer } from '@/components'
import MatchPage from '@/pages/match/MatchPage.vue'

describe('MatchPage', () => {
  it('renders one job card from the mock job', () => {
    const wrapper = mount(MatchPage)

    expect(wrapper.findAllComponents(JobCard)).toHaveLength(1)
    expect(wrapper.find('.job-card__title').text().length).toBeGreaterThan(0)
  })

  it('renders the like container below the job card', () => {
    const wrapper = mount(MatchPage)

    expect(wrapper.findAllComponents(LikeContainer)).toHaveLength(1)
    expect(wrapper.find('.like-container__button--dislike').exists()).toBe(true)
    expect(wrapper.find('.like-container__button--like').exists()).toBe(true)
  })

  it('increases like and decreases dislike opacity when dragging right', async () => {
    const wrapper = mount(MatchPage)
    const card = wrapper.find('.job-card').element

    card.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0 }))
    card.dispatchEvent(new MouseEvent('pointermove', { clientX: 160 }))
    await wrapper.vm.$nextTick()

    const like = wrapper.findComponent(LikeContainer)
    expect(like.props('likeOpacity')).toBeGreaterThan(0.33)
    expect(like.props('dislikeOpacity')).toBeLessThan(0.33)
  })

  it('increases dislike and decreases like opacity when dragging left', async () => {
    const wrapper = mount(MatchPage)
    const card = wrapper.find('.job-card').element

    card.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0 }))
    card.dispatchEvent(new MouseEvent('pointermove', { clientX: -160 }))
    await wrapper.vm.$nextTick()

    const like = wrapper.findComponent(LikeContainer)
    expect(like.props('dislikeOpacity')).toBeGreaterThan(0.33)
    expect(like.props('likeOpacity')).toBeLessThan(0.33)
  })

  it('resets both opacities to 0.33 after the pointer is released', async () => {
    const wrapper = mount(MatchPage)
    const card = wrapper.find('.job-card').element

    card.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0 }))
    card.dispatchEvent(new MouseEvent('pointermove', { clientX: 160 }))
    card.dispatchEvent(new MouseEvent('pointerup', { clientX: 160 }))
    await wrapper.vm.$nextTick()

    const like = wrapper.findComponent(LikeContainer)
    expect(like.props('likeOpacity')).toBe(0.33)
    expect(like.props('dislikeOpacity')).toBe(0.33)
  })
})
