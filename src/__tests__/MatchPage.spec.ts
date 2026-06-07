import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import { JobCardContainer, LikeContainer } from '@/components'
import MatchPage from '@/pages/match/MatchPage.vue'
import jobsData from '@/mockups/job.json'

function dragCurrentCard(wrapper: ReturnType<typeof mount>, clientX: number) {
  const card = wrapper.find('.job-card-stack__current .job-card').element
  card.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0 }))
  card.dispatchEvent(new MouseEvent('pointermove', { clientX }))
  return card
}

describe('MatchPage', () => {
  it('renders the top job card from the mock jobs', () => {
    const wrapper = mount(MatchPage)

    const container = wrapper.findComponent(JobCardContainer)
    expect(container.exists()).toBe(true)
    expect(container.props('job')).toMatchObject({ title: jobsData[0]!.title })
  })

  it('renders a single like container for the top card', () => {
    const wrapper = mount(MatchPage)

    expect(wrapper.findAllComponents(LikeContainer)).toHaveLength(1)
    expect(wrapper.find('.like-container__button--dislike').exists()).toBe(true)
    expect(wrapper.find('.like-container__button--like').exists()).toBe(true)
  })

  it('increases like and decreases dislike opacity when dragging right', async () => {
    const wrapper = mount(MatchPage)
    dragCurrentCard(wrapper, 160)
    await wrapper.vm.$nextTick()

    const like = wrapper.findComponent(LikeContainer)
    expect(like.props('likeOpacity')).toBeGreaterThan(0.33)
    expect(like.props('dislikeOpacity')).toBeLessThan(0.33)
  })

  it('increases dislike and decreases like opacity when dragging left', async () => {
    const wrapper = mount(MatchPage)
    dragCurrentCard(wrapper, -160)
    await wrapper.vm.$nextTick()

    const like = wrapper.findComponent(LikeContainer)
    expect(like.props('dislikeOpacity')).toBeGreaterThan(0.33)
    expect(like.props('likeOpacity')).toBeLessThan(0.33)
  })

  it('scales the next card up while dragging', async () => {
    const wrapper = mount(MatchPage)
    expect(wrapper.find('.job-card-stack__next').attributes('style')).toContain('scale(0)')

    dragCurrentCard(wrapper, 80)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.job-card-stack__next').attributes('style')).toContain('scale(0.5)')
  })

  it('snaps back and keeps the same top card when dragged below the threshold', async () => {
    const wrapper = mount(MatchPage)
    const card = dragCurrentCard(wrapper, 80)
    card.dispatchEvent(new MouseEvent('pointerup', { clientX: 80 }))
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(JobCardContainer).props('job')).toMatchObject({
      title: jobsData[0]!.title,
    })
    expect(wrapper.find('.job-card-stack__next').attributes('style')).toContain('scale(0)')
  })

  it('advances to the next card after committing a swipe', async () => {
    const wrapper = mount(MatchPage)
    const card = dragCurrentCard(wrapper, 200)
    card.dispatchEvent(new MouseEvent('pointerup', { clientX: 200 }))
    card.dispatchEvent(new Event('transitionend'))
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(JobCardContainer).props('job')).toMatchObject({
      title: jobsData[1]!.title,
    })
  })

  it('shows an empty state after every job has been swiped away', async () => {
    const wrapper = mount(MatchPage)

    for (let i = 0; i < jobsData.length; i++) {
      const card = wrapper.find('.job-card-stack__current .job-card').element
      card.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0 }))
      card.dispatchEvent(new MouseEvent('pointermove', { clientX: 200 }))
      card.dispatchEvent(new MouseEvent('pointerup', { clientX: 200 }))
      card.dispatchEvent(new Event('transitionend'))
      await wrapper.vm.$nextTick()
    }

    expect(wrapper.find('.job-card-stack__current').exists()).toBe(false)
    expect(wrapper.find('.job-card-stack__empty').text()).toBe('No more jobs')
  })
})
