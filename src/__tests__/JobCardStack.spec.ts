import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import { JobCardStack, JobCardContainer } from '@/components'
import type { ScrapedJob } from '@/components/jobCard/types'
import { swipeTopCard } from './testUtils'

function createJob(overrides: Partial<ScrapedJob> = {}): ScrapedJob {
  return {
    sourceHostname: 'de.linkedin.com',
    sourceUrl: 'https://de.linkedin.com/jobs/view/1/',
    title: 'A Job',
    company: 'A Company',
    scrapedAt: '2026-06-02T14:42:54.764Z',
    duplicateKey: 'linkedin:1',
    embedding: [0.1, 0.2, 0.3],
    ...overrides,
  }
}

describe('JobCardStack', () => {
  const jobs = [
    createJob({ title: 'First', duplicateKey: 'k1' }),
    createJob({ title: 'Second', duplicateKey: 'k2' }),
  ]

  it('shows the first job on top initially', () => {
    const wrapper = mount(JobCardStack, { props: { jobs } })

    expect(wrapper.findComponent(JobCardContainer).props('job')).toMatchObject({
      title: 'First',
    })
  })

  it('advances the index when the top card emits a swipe', async () => {
    const wrapper = mount(JobCardStack, { props: { jobs } })

    swipeTopCard(wrapper)
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(JobCardContainer).props('job')).toMatchObject({
      title: 'Second',
    })
  })

  it('renders the empty state once all jobs are swiped away', async () => {
    const wrapper = mount(JobCardStack, { props: { jobs } })

    swipeTopCard(wrapper)
    await wrapper.vm.$nextTick()
    swipeTopCard(wrapper)
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(JobCardContainer).exists()).toBe(false)
    expect(wrapper.find('.job-card-stack__empty').text()).toBe('No more jobs')
  })
})
