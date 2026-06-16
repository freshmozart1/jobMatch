import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { JobCardContainer, LikeContainer } from '@/components'
import MatchPage from '@/pages/match/MatchPage.vue'
import type { ScrapedJob } from '@/components/jobCard/types'
import { swipeTopCard } from './testUtils'

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
    embedding: [0.9, 0.1],
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
    embedding: [0.1, 0.9],
  },
]

// Cosine similarity the mock server returns for each job's embedding.
const similarityByEmbedding = new Map<string, number>([
  [JSON.stringify(testJobs[0]!.embedding), 0.9],
  [JSON.stringify(testJobs[1]!.embedding), 0.3],
])

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

function buildFetchMock(
  jobPageHandler: (jobUrl: string) => Promise<Response>,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const requestBody = init?.body ? JSON.parse(init.body.toString()) : undefined

    if (url.endsWith('/scrape/linkedin/job-links')) {
      return createJsonResponse(jobLinksByKeyword)
    }
    if (url.endsWith('/jobs/filter-job-links')) {
      return createJsonResponse(requestBody)
    }
    if (url.endsWith('/scrape/linkedin/job-page')) {
      return jobPageHandler(requestBody?.url as string)
    }
    if (url.endsWith('/jobs/liked-average-similarity')) {
      const similarity = similarityByEmbedding.get(JSON.stringify(requestBody)) ?? null
      return createJsonResponse({ similarity })
    }

    return createJsonResponse({ error: 'Unexpected request.' }, { status: 500 })
  })
}

function mockFetchPipeline(options: { failedJobPageUrls?: string[] } = {}) {
  const failedJobPageUrls = new Set(options.failedJobPageUrls ?? [])

  const fetchMock = buildFetchMock(async (jobUrl) => {
    if (failedJobPageUrls.has(jobUrl)) {
      return createJsonResponse({ error: 'Failed to scrape job page.' }, { status: 502 })
    }
    const job = testJobs.find((candidate) => candidate.sourceUrl === jobUrl)
    if (!job) {
      return createJsonResponse({ error: 'Unknown test job.' }, { status: 404 })
    }
    return createJsonResponse(job)
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

function expectTopCardStillFirst(wrapper: ReturnType<typeof mount>) {
  expect(wrapper.findComponent(JobCardContainer).props('job')).toMatchObject({
    title: testJobs[0]!.title,
  })
}

describe('MatchPage', () => {
  beforeEach(() => {
    window.localStorage.setItem('jobmatch.searchkeywords', JSON.stringify(['Full Stack Engineer']))
    window.localStorage.setItem('jobmatch.searchcity', 'Hamburg')
    mockFetchPipeline()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
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

  it('does not add a stale scrape result to jobs when a new search has started', async () => {
    const staleJobDeferred = createDeferred<Response>()
    let jobLinksCallCount = 0

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        const requestBody = init?.body ? JSON.parse(init.body.toString()) : undefined

        if (url.endsWith('/scrape/linkedin/job-links')) {
          jobLinksCallCount++
          return createJsonResponse(jobLinksByKeyword)
        }
        if (url.endsWith('/jobs/filter-job-links')) {
          return createJsonResponse(requestBody)
        }
        if (url.endsWith('/scrape/linkedin/job-page')) {
          // Only defer job1 during the first search; resolve it immediately for the second.
          if (requestBody?.url === testJobs[0]!.sourceUrl && jobLinksCallCount === 1) {
            return staleJobDeferred.promise
          }
          const job = testJobs.find((j) => j.sourceUrl === (requestBody?.url as string))
          return createJsonResponse(job ?? { error: 'Unknown' })
        }
        if (url.endsWith('/jobs/liked-average-similarity')) {
          return createJsonResponse({ similarity: null })
        }
        return createJsonResponse({ error: 'Unexpected request.' }, { status: 500 })
      }),
    )

    const wrapper = mount(MatchPage)

    // Wait for job2 to appear — first search is still waiting for job1.
    await vi.waitFor(() => {
      expect(wrapper.findComponent(JobCardContainer).exists()).toBe(true)
    })

    // Trigger a second fetchJobs via the searchOpen watcher:
    // emit 'search' from MatchFilterBar → searchOpen = true
    wrapper.findComponent({ name: 'MatchFilterBar' }).vm.$emit('search')
    await wrapper.vm.$nextTick()
    // emit 'back' from SearchPage → searchOpen = false → watch fires → fetchJobs() called
    wrapper.findComponent({ name: 'SearchPage' }).vm.$emit('back')

    // Wait for the second job-links call to confirm the new search is running.
    await vi.waitFor(() => {
      expect(jobLinksCallCount).toBe(2)
    })

    // Wait for the second search's jobs to appear.
    await vi.waitFor(() => {
      expect(wrapper.findComponent(JobCardContainer).exists()).toBe(true)
    })

    // Resolve the stale first-search job1 response — generation guard must discard it.
    staleJobDeferred.resolve(createJsonResponse(testJobs[0]))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    // Swipe through all cards: count must be testJobs.length, not testJobs.length + 1.
    let swipeCount = 0
    while (wrapper.find('.job-card-stack__current').exists() && swipeCount < testJobs.length + 2) {
      swipeTopCard(wrapper)
      await wrapper.vm.$nextTick()
      swipeCount++
    }
    expect(swipeCount).toBe(testJobs.length)
  })

  it('passes an AbortSignal to job-page scrape requests', async () => {
    const fetchMock = mockFetchPipeline()

    await mountLoadedMatchPage()

    const jobPageCalls = fetchMock.mock.calls.filter((args) =>
      args[0]!.toString().endsWith('/scrape/linkedin/job-page'),
    )
    expect(jobPageCalls.length).toBeGreaterThan(0)
    for (const [, init] of jobPageCalls) {
      expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('limits concurrent job page scrape requests to 2 at a time', async () => {
    const thirdJob: ScrapedJob = {
      sourceHostname: 'de.linkedin.com',
      sourceJobId: '1003',
      sourceUrl: 'https://de.linkedin.com/jobs/view/backend-engineer-1003/',
      title: 'Backend Engineer',
      company: 'Third GmbH',
      location: 'Hamburg',
      descriptionText: 'Build backend features.',
      scrapedAt: '2026-06-08T12:00:00.000Z',
      duplicateKey: 'linkedin:1003',
      embedding: [0.5, 0.5],
    }

    const deferredResponses = new Map([
      [testJobs[0]!.sourceUrl, createDeferred<Response>()],
      [testJobs[1]!.sourceUrl, createDeferred<Response>()],
      [thirdJob.sourceUrl, createDeferred<Response>()],
    ])

    const allThreeJobs = [...testJobs, thirdJob]
    const jobLinksByKeywordWithThree = {
      'Full Stack Engineer': allThreeJobs.map((job) => job.sourceUrl),
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      const requestBody = init?.body ? JSON.parse(init.body.toString()) : undefined

      if (url.endsWith('/scrape/linkedin/job-links')) {
        return createJsonResponse(jobLinksByKeywordWithThree)
      }
      if (url.endsWith('/jobs/filter-job-links')) {
        return createJsonResponse(requestBody)
      }
      if (url.endsWith('/scrape/linkedin/job-page')) {
        const deferred = deferredResponses.get(requestBody?.url as string)
        if (!deferred) return createJsonResponse({ error: 'Unknown URL' }, { status: 404 })
        return deferred.promise
      }
      if (url.endsWith('/jobs/liked-average-similarity')) {
        return createJsonResponse({ similarity: null })
      }
      return createJsonResponse({ error: 'Unexpected request.' }, { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    mount(MatchPage)

    // Wait until exactly 2 job-page scrape requests are in-flight (+ 2 pipeline calls = 4 total).
    await vi.waitFor(() => {
      const jobPageCalls = fetchMock.mock.calls.filter((args) =>
        args[0]!.toString().endsWith('/scrape/linkedin/job-page'),
      )
      expect(jobPageCalls).toHaveLength(2)
    })

    // The third URL must NOT have been requested yet.
    const jobPageUrls = fetchMock.mock.calls
      .filter((args) => args[0]!.toString().endsWith('/scrape/linkedin/job-page'))
      .map((args) => JSON.parse((args[1] as RequestInit).body!.toString()).url as string)
    expect(jobPageUrls).not.toContain(thirdJob.sourceUrl)

    // Resolve the first — the third must now start.
    deferredResponses.get(testJobs[0]!.sourceUrl)!.resolve(createJsonResponse(testJobs[0]))
    await vi.waitFor(() => {
      const jobPageCalls = fetchMock.mock.calls.filter((args) =>
        args[0]!.toString().endsWith('/scrape/linkedin/job-page'),
      )
      expect(jobPageCalls).toHaveLength(3)
    })

    // Clean up remaining deferred promises.
    deferredResponses.get(testJobs[1]!.sourceUrl)!.resolve(createJsonResponse(testJobs[1]))
    deferredResponses.get(thirdJob.sourceUrl)!.resolve(createJsonResponse(thirdJob))
  })

  it('renders a scraped job while later job page requests are still pending', async () => {
    const firstJobPageResponse = createDeferred<Response>()
    const secondJobPageResponse = createDeferred<Response>()
    const jobPageResponses = new Map([
      [testJobs[0]!.sourceUrl, firstJobPageResponse],
      [testJobs[1]!.sourceUrl, secondJobPageResponse],
    ])
    const fetchMock = buildFetchMock(async (jobUrl) => {
      const response = jobPageResponses.get(jobUrl)
      if (!response) {
        return createJsonResponse({ error: 'Unknown test job.' }, { status: 404 })
      }
      return response.promise
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

    expectTopCardStillFirst(wrapper)
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
      swipeTopCard(wrapper)
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

  it('shows the cosine similarity fetched for the top card as a percentage', async () => {
    const wrapper = await mountLoadedMatchPage()

    await vi.waitFor(() => {
      const indicator = wrapper.find(
        '.job-card-stack__current [data-testid="cosineSimilarityIndicator"]',
      )
      expect(indicator.exists()).toBe(true)
      expect(indicator.find('.cosine-indicator__value').text()).toBe('90%')
    })
  })

  it('filters out jobs below the threshold when the match filter is enabled', async () => {
    const wrapper = await mountLoadedMatchPage()

    await vi.waitFor(() => {
      expect(wrapper.find('.job-card-stack__next').exists()).toBe(true)
    })

    await wrapper.find('.match-filter__switch').trigger('click')
    await wrapper.vm.$nextTick()

    // Threshold defaults to 50%: the 90% job stays, the 30% job drops away.
    expectTopCardStillFirst(wrapper)
    expect(wrapper.find('.job-card-stack__next').exists()).toBe(false)
  })

  it('shows the filter empty label when no job meets the threshold', async () => {
    const wrapper = await mountLoadedMatchPage()

    await vi.waitFor(() => {
      expect(wrapper.find('.cosine-indicator__value').exists()).toBe(true)
    })

    await wrapper.find('.match-filter__switch').trigger('click')
    await wrapper.find('.match-filter__num input').setValue('95')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.job-card-stack__current').exists()).toBe(false)
    expect(wrapper.find('.job-card-stack__empty').text()).toBe('No jobs at or above 95% match')
  })
})
