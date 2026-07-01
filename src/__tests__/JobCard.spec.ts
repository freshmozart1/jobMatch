import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import { JobCard } from '@/components'
import type { ScrapedJob } from '@/components/jobCard/types'

function createJob(overrides: Partial<ScrapedJob> = {}): ScrapedJob {
  return {
    sourceHostname: 'de.linkedin.com',
    sourceJobId: '4422110097',
    sourceUrl: 'https://de.linkedin.com/jobs/view/4422110097/',
    title: 'Junior Frontend Developer (m/w/d)',
    company: 'Detlev Louis Motorrad-Vertriebsgesellschaft mbH',
    location: 'Hamburg',
    descriptionText: 'Du willst nicht nur Websites bauen.',
    postedAt: 'Vor 8 Monaten',
    scrapedAt: '2026-06-02T14:42:54.764Z',
    tags: ['Berufseinstieg', 'Vollzeit', 'Ingenieurwesen und IT', 'Einzelhandel'],
    duplicateKey: 'linkedin:4422110097',
    companyAddress: {
      streetAddress: 'Musterstraße 1',
      city: 'Hamburg',
      postalCode: '20095',
      countryCode: 'DE',
    },
    embedding: [],
    ...overrides,
  }
}

describe('JobCard', () => {
  it('renders the title from the Figma design', () => {
    const job = createJob()
    const wrapper = mount(JobCard, { props: { job } })

    expect(wrapper.find('.job-card__title').text()).toBe(job.title)
  })

  it('renders the company from the Figma design', () => {
    const job = createJob()
    const wrapper = mount(JobCard, { props: { job } })

    expect(wrapper.find('.job-card__company').text()).toBe(job.company)
  })

  it('renders one tag chip per tag', () => {
    const job = createJob({ tags: ['Berufseinstieg', 'Vollzeit'] })
    const wrapper = mount(JobCard, { props: { job } })

    const chips = wrapper.findAll('.job-card__tag')
    expect(chips).toHaveLength(2)
    expect(chips.map((chip) => chip.text())).toEqual(['Berufseinstieg', 'Vollzeit'])
  })

  it('renders the description text from the Figma design', () => {
    const job = createJob({ descriptionText: 'Eine spannende Stelle.' })
    const wrapper = mount(JobCard, { props: { job } })

    expect(wrapper.find('.job-card__description').text()).toBe('Eine spannende Stelle.')
  })

  it('renders text wrapped in ** as bold', () => {
    const job = createJob({
      descriptionText: 'Arbeit in **Hamburg** ist toll.',
    })
    const wrapper = mount(JobCard, { props: { job } })

    const strong = wrapper.find('.job-card__description strong')
    expect(strong.exists()).toBe(true)
    expect(strong.text()).toBe('Hamburg')
    expect(wrapper.find('.job-card__description').text()).toBe('Arbeit in Hamburg ist toll.')
  })

  it('omits the tag list when no tags are present', () => {
    const job = createJob({ tags: [] })
    const wrapper = mount(JobCard, { props: { job } })

    expect(wrapper.find('.job-card__tags').exists()).toBe(false)
  })

  it('omits the description when descriptionText is missing', () => {
    const job = createJob({ descriptionText: undefined })
    const wrapper = mount(JobCard, { props: { job } })

    expect(wrapper.find('.job-card__description-frame').exists()).toBe(false)
  })

  it('renders the match indicator as a percentage when present', () => {
    const job = createJob({ match: 0.87 })
    const wrapper = mount(JobCard, { props: { job } })

    const indicator = wrapper.find('[data-testid="matchIndicator"]')
    expect(indicator.exists()).toBe(true)
    expect(indicator.find('.cosine-indicator__value').text()).toBe('87%')
    expect(indicator.attributes('role')).toBe('meter')
    expect(indicator.attributes('aria-valuetext')).toBe('Match: 87% — strong match.')
  })

  it('omits the match indicator when match is missing', () => {
    const job = createJob({ match: undefined })
    const wrapper = mount(JobCard, { props: { job } })

    expect(wrapper.find('[data-testid="matchIndicator"]').exists()).toBe(false)
  })
})
