import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { JobCardContainer, LikeContainer } from '@/components'
import MatchPage from '@/pages/match/MatchPage.vue'
import type { ScrapedJob } from '@/components/jobCard/types'

const testJobs: ScrapedJob[] = [
  {
    sourceHostname: 'de.linkedin.com',
    sourceJobId: '1001',
    sourceUrl: 'https://de.linkedin.com/jobs/view/full-stack-engineer-1001/',
    title: 'Full Stack Engineer',
    company: 'Example GmbH',
    location: 'Hamburg',
    descriptionText: 'Build product features.',
    scrapedAt: '2026-06-08T10:00:00.000Z',
    duplicateKey: 'linkedin:1001',
  },
  {
    sourceHostname: 'de.linkedin.com',
    sourceJobId: '1002',
    sourceUrl: 'https://de.linkedin.com/jobs/view/frontend-engineer-1002/',
    title: 'Frontend Engineer',
    company: 'Another GmbH',
    location: 'Hamburg',
    descriptionText: 'Build UI features.',
    scrapedAt: '2026-06-08T11:00:00.000Z',
    duplicateKey: 'linkedin:1002',
  },
]

const jobLinksByKeyword = {
  'Full Stack Engineer': testJobs.map((job) => job.sourceUrl),
}

function createJsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

function mockFetchPipeline(options: { failedJobPageUrls?: string[] } = {}) {
  const failedJobPageUrls = new Set(options.failedJobPageUrls ?? [])
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const requestBody = init?.body ? JSON.parse(init.body.toString()) : undefined

    if (url.endsWith('/scrape/linkedin/job-links')) {
      return createJsonResponse(jobLinksByKeyword)
    }

    if (url.endsWith('/jobs/filter-job-links')) {
      return createJsonResponse(requestBody)
    }

    if (url.endsWith('/scrape/linkedin/job-page')) {
      const jobUrl = requestBody?.url as string

      if (failedJobPageUrls.has(jobUrl)) {
        return createJsonResponse({ error: 'Failed to scrape job page.' }, { status: 502 })
      }

      const job = testJobs.find((candidate) => candidate.sourceUrl === jobUrl)

      if (!job) {
        return createJsonResponse({ error: 'Unknown test job.' }, { status: 404 })
      }

      return createJsonResponse(job)
    }

    return createJsonResponse({ error: 'Unexpected request.' }, { status: 500 })
  })

  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

async function mountLoadedMatchPage() {
  const wrapper = mount(MatchPage)

  await vi.waitFor(() => {
    expect(wrapper.findComponent(JobCardContainer).exists()).toBe(true)
  })

  return wrapper
}

function dragCurrentCard(wrapper: ReturnType<typeof mount>, clientX: number) {
  const card = wrapper.find('.job-card-stack__current .job-card').element
  card.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0 }))
  card.dispatchEvent(new MouseEvent('pointermove', { clientX }))
  return card
}

describe('MatchPage', () => {
  beforeEach(() => {
    mockFetchPipeline()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches LinkedIn job links, filters them, and scrapes job pages', async () => {
    const fetchMock = mockFetchPipeline()

    await mountLoadedMatchPage()

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/scrape/linkedin/job-links',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          keywords: ['Full Stack Engineer'],
          location: 'Hamburg',
          distance: 25,
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/jobs/filter-job-links',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(jobLinksByKeyword),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/scrape/linkedin/job-page',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: testJobs[0]!.sourceUrl }),
      }),
    )
  })

  it('renders the top job card from scraped jobs', async () => {
    const wrapper = await mountLoadedMatchPage()

    const container = wrapper.findComponent(JobCardContainer)
    expect(container.exists()).toBe(true)
    expect(container.props('job')).toMatchObject({ title: testJobs[0]!.title })
  })

  it('renders a scraped job while later job page requests are still pending', async () => {
    const firstJobPageResponse = createDeferred<Response>()
    const secondJobPageResponse = createDeferred<Response>()
    const jobPageResponses = new Map([
      [testJobs[0]!.sourceUrl, firstJobPageResponse],
      [testJobs[1]!.sourceUrl, secondJobPageResponse],
    ])
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      const requestBody = init?.body ? JSON.parse(init.body.toString()) : undefined

      if (url.endsWith('/scrape/linkedin/job-links')) {
        return createJsonResponse(jobLinksByKeyword)
      }

      if (url.endsWith('/jobs/filter-job-links')) {
        return createJsonResponse(requestBody)
      }

      if (url.endsWith('/scrape/linkedin/job-page')) {
        const response = jobPageResponses.get(requestBody?.url as string)

        if (!response) {
          return createJsonResponse({ error: 'Unknown test job.' }, { status: 404 })
        }

        return response.promise
      }

      return createJsonResponse({ error: 'Unexpected request.' }, { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(MatchPage)

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    firstJobPageResponse.resolve(createJsonResponse(testJobs[0]))

    await vi.waitFor(() => {
      expect(wrapper.findComponent(JobCardContainer).props('job')).toMatchObject({
        title: testJobs[0]!.title,
      })
    })
    expect(wrapper.find('.match-page__status--loading').text()).toBe('Loading more jobs...')
    expect(wrapper.find('.job-card-stack__next').exists()).toBe(false)

    secondJobPageResponse.resolve(createJsonResponse(testJobs[1]))

    await vi.waitFor(() => {
      expect(wrapper.find('.match-page__status--loading').exists()).toBe(false)
      expect(wrapper.find('.job-card-stack__next').exists()).toBe(true)
    })
  })

  it('renders a single like container for the top card', async () => {
    const wrapper = await mountLoadedMatchPage()

    expect(wrapper.findAllComponents(LikeContainer)).toHaveLength(1)
    expect(wrapper.find('.like-container__button--dislike').exists()).toBe(true)
    expect(wrapper.find('.like-container__button--like').exists()).toBe(true)
  })

  it('renders the mobile layout anchors for the card stack and sticky controls', async () => {
    const wrapper = await mountLoadedMatchPage()

    expect(wrapper.find('.match-page').exists()).toBe(true)
    expect(wrapper.find('.job-card-stack').exists()).toBe(true)
    expect(wrapper.find('.job-card-stack__current .job-card').exists()).toBe(true)
    expect(wrapper.find('.job-card-stack__current .like-container').exists()).toBe(true)
  })

  it('increases like and decreases dislike opacity when dragging right', async () => {
    const wrapper = await mountLoadedMatchPage()
    dragCurrentCard(wrapper, 160)
    await wrapper.vm.$nextTick()

    const like = wrapper.findComponent(LikeContainer)
    expect(like.props('likeOpacity')).toBeGreaterThan(0.33)
    expect(like.props('dislikeOpacity')).toBeLessThan(0.33)
  })

  it('increases dislike and decreases like opacity when dragging left', async () => {
    const wrapper = await mountLoadedMatchPage()
    dragCurrentCard(wrapper, -160)
    await wrapper.vm.$nextTick()

    const like = wrapper.findComponent(LikeContainer)
    expect(like.props('dislikeOpacity')).toBeGreaterThan(0.33)
    expect(like.props('likeOpacity')).toBeLessThan(0.33)
  })

  it('scales the next card up while dragging', async () => {
    const wrapper = await mountLoadedMatchPage()
    expect(wrapper.find('.job-card-stack__next').attributes('style')).toContain('scale(0.92)')

    dragCurrentCard(wrapper, 80)
    await wrapper.vm.$nextTick()

    const style = wrapper.find('.job-card-stack__next').attributes('style') ?? ''
    const scaleMatch = style.match(/scale\(([\d.]+)\)/)
    const scale = scaleMatch ? parseFloat(scaleMatch[1]!) : 0
    expect(scale).toBeGreaterThan(0.92)
    expect(scale).toBeLessThanOrEqual(1)
  })

  it('snaps back and keeps the same top card when dragged below the threshold', async () => {
    const wrapper = await mountLoadedMatchPage()
    const card = dragCurrentCard(wrapper, 80)
    card.dispatchEvent(new MouseEvent('pointerup', { clientX: 80 }))
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(JobCardContainer).props('job')).toMatchObject({
      title: testJobs[0]!.title,
    })
    expect(wrapper.find('.job-card-stack__next').attributes('style')).toContain('scale(0.92)')
  })

  it('advances to the next card after committing a swipe', async () => {
    const wrapper = await mountLoadedMatchPage()
    const card = dragCurrentCard(wrapper, 200)
    card.dispatchEvent(new MouseEvent('pointerup', { clientX: 200 }))
    card.dispatchEvent(new Event('transitionend'))
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(JobCardContainer).props('job')).toMatchObject({
      title: testJobs[1]!.title,
    })
  })

  it('shows an empty state after every job has been swiped away', async () => {
    const wrapper = await mountLoadedMatchPage()

    for (let i = 0; i < testJobs.length; i++) {
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

  it('renders successful jobs when one job page request fails', async () => {
    mockFetchPipeline({ failedJobPageUrls: [testJobs[1]!.sourceUrl] })

    const wrapper = await mountLoadedMatchPage()

    expect(wrapper.findComponent(JobCardContainer).props('job')).toMatchObject({
      title: testJobs[0]!.title,
    })
    expect(wrapper.find('.match-page__status--warning').text()).toBe('1 job page request failed.')
  })
})
