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
    companyAddress: {
      streetAddress: 'Musterstraße 1',
      city: 'Hamburg',
      postalCode: '20095',
      countryCode: 'DE',
    },
    embedding: [],
    match: 0.9,
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
    companyAddress: {
      streetAddress: 'Musterstraße 1',
      city: 'Hamburg',
      postalCode: '20095',
      countryCode: 'DE',
    },
    embedding: [],
    match: 0.3,
  },
]

const playwrightResponseBody = {
  'Full Stack Engineer': {
    searchUrl: 'https://www.linkedin.com/jobs/search?keywords=Full+Stack+Engineer',
    jobs: testJobs,
  },
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

function mockFetch(playwrightHandler?: () => Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString()
    if (url.endsWith('/scrape/linkedin/playwright')) {
      return playwrightHandler ? playwrightHandler() : createJsonResponse(playwrightResponseBody)
    }
    if (url.endsWith('/jobs/create')) {
      return createJsonResponse({})
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

function expectTopCardStillFirst(wrapper: ReturnType<typeof mount>) {
  expect(wrapper.findComponent(JobCardContainer).props('job')).toMatchObject({
    title: testJobs[0]!.title,
  })
}

async function triggerSearchUpdate(wrapper: ReturnType<typeof mount>, keywords: string[]) {
  wrapper.findComponent({ name: 'MatchFilterBar' }).vm.$emit('search')
  await wrapper.vm.$nextTick()
  wrapper.findComponent({ name: 'SearchPage' }).vm.$emit('update:keywords', keywords)
  await wrapper.vm.$nextTick()
  wrapper.findComponent({ name: 'SearchPage' }).vm.$emit('back')
}

async function swipeAllCards(wrapper: ReturnType<typeof mount>, expectedCount: number) {
  let swipeCount = 0
  while (wrapper.find('.job-card-stack__current').exists() && swipeCount < expectedCount + 2) {
    swipeTopCard(wrapper)
    await wrapper.vm.$nextTick()
    swipeCount++
  }
  expect(swipeCount).toBe(expectedCount)
}

describe('MatchPage', () => {
  beforeEach(() => {
    window.localStorage.setItem('jobmatch.searchkeywords', JSON.stringify(['Full Stack Engineer']))
    window.localStorage.setItem('jobmatch.searchcity', 'Hamburg')
    mockFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('calls /scrape/linkedin/playwright with the correct body', async () => {
    const fetchMock = mockFetch()

    await mountLoadedMatchPage()

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/scrape/linkedin/playwright',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          keywords: ['Full Stack Engineer'],
          location: 'Hamburg',
          distance: 25,
          datePosted: '86400',
          maxPages: 1,
        }),
      }),
    )
  })

  it('renders the top job card from scraped jobs', async () => {
    const wrapper = await mountLoadedMatchPage()

    const container = wrapper.findComponent(JobCardContainer)
    expect(container.exists()).toBe(true)
    expect(container.props('job')).toMatchObject({ title: testJobs[0]!.title })
  })

  it('passes an AbortSignal to the playwright scrape request', async () => {
    const fetchMock = mockFetch()

    await mountLoadedMatchPage()

    const playwrightCall = fetchMock.mock.calls.find((args) =>
      args[0]!.toString().endsWith('/scrape/linkedin/playwright'),
    )
    expect(playwrightCall).toBeDefined()
    const init = (playwrightCall as unknown as [unknown, RequestInit])[1]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('discards a stale playwright response when a new search supersedes it', async () => {
    const staleDeferred = createDeferred<Response>()
    let playwrightCallCount = 0

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString().endsWith('/scrape/linkedin/playwright')) {
          playwrightCallCount++
          if (playwrightCallCount === 1) return staleDeferred.promise
          return createJsonResponse(playwrightResponseBody)
        }
        return createJsonResponse({})
      }),
    )

    const wrapper = mount(MatchPage)

    // Trigger a second search while the first is still pending.
    await triggerSearchUpdate(wrapper, ['Backend Developer'])

    await vi.waitFor(() => {
      expect(playwrightCallCount).toBe(2)
    })

    // Second search resolves — its jobs appear.
    await vi.waitFor(() => {
      expect(wrapper.findComponent(JobCardContainer).exists()).toBe(true)
    })

    // Resolve the stale first response — generation guard must discard it.
    staleDeferred.resolve(createJsonResponse(playwrightResponseBody))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    // Swipe count must equal testJobs.length, not doubled.
    await swipeAllCards(wrapper, testJobs.length)
  })

  it('does not re-fetch jobs when the search panel is closed without changing any parameters', async () => {
    const fetchMock = mockFetch()

    const wrapper = await mountLoadedMatchPage()

    const callsBefore = fetchMock.mock.calls.filter((args) =>
      args[0]!.toString().endsWith('/scrape/linkedin/playwright'),
    ).length

    // Open and immediately close the search panel without modifying any params.
    wrapper.findComponent({ name: 'MatchFilterBar' }).vm.$emit('search')
    await wrapper.vm.$nextTick()
    wrapper.findComponent({ name: 'SearchPage' }).vm.$emit('back')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const callsAfter = fetchMock.mock.calls.filter((args) =>
      args[0]!.toString().endsWith('/scrape/linkedin/playwright'),
    ).length

    expect(callsAfter).toBe(callsBefore)
  })

  it('re-fetches jobs when the datePosted filter changes between search-panel opens', async () => {
    const fetchMock = mockFetch()

    const wrapper = await mountLoadedMatchPage()

    const callsBefore = fetchMock.mock.calls.filter((args) =>
      args[0]!.toString().endsWith('/scrape/linkedin/playwright'),
    ).length

    // Change datePosted in localStorage to simulate the user changing the dropdown.
    window.localStorage.setItem('jobmatch.searchdateposted', '604800')

    // Open and close the search panel without changing keywords.
    wrapper.findComponent({ name: 'MatchFilterBar' }).vm.$emit('search')
    await wrapper.vm.$nextTick()
    wrapper.findComponent({ name: 'SearchPage' }).vm.$emit('back')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const callsAfter = fetchMock.mock.calls.filter((args) =>
      args[0]!.toString().endsWith('/scrape/linkedin/playwright'),
    ).length

    expect(callsAfter).toBe(callsBefore + 1)
  })

  it('shows the loading placeholder while the playwright request is pending', async () => {
    const deferred = createDeferred<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString().endsWith('/scrape/linkedin/playwright')) return deferred.promise
        return createJsonResponse({})
      }),
    )

    const wrapper = mount(MatchPage)

    // Jobs not yet available — shows loading placeholder.
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.match-page__status').text()).toBe('Loading jobs...')
    expect(wrapper.findComponent(JobCardContainer).exists()).toBe(false)

    // Resolve the playwright response — card stack appears.
    deferred.resolve(createJsonResponse(playwrightResponseBody))

    await vi.waitFor(() => {
      expect(wrapper.findComponent(JobCardContainer).exists()).toBe(true)
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

  it('shows the match score for the top card as a percentage', async () => {
    const wrapper = await mountLoadedMatchPage()

    await vi.waitFor(() => {
      const indicator = wrapper.find('.job-card-stack__current [data-testid="matchIndicator"]')
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
