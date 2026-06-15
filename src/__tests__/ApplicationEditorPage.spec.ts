import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ApplicationEditorPage from '@/pages/match/ApplicationEditorPage.vue'
import type { ScrapedJob } from '@/components/jobCard/types'

const job: ScrapedJob = {
  sourceHostname: 'de.linkedin.com',
  sourceJobId: '1001',
  sourceUrl: 'https://de.linkedin.com/jobs/view/1001/',
  title: 'Frontend Engineer',
  company: 'Example GmbH',
  location: 'Hamburg',
  descriptionText: '**Requirements**: 3 years experience.',
  scrapedAt: '2026-06-08T10:00:00.000Z',
  duplicateKey: 'linkedin:1001',
  embedding: [0.9, 0.1],
}

describe('ApplicationEditorPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Use mockImplementation so each call gets a fresh Response (body streams are single-use).
    fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    window.localStorage.clear()
  })

  // --- menu view ---

  it('mounts in the menu view with "Application Editor" header', () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    expect(wrapper.find('.cl-header__title').text()).toBe('Application Editor')
    expect(wrapper.find('.cl-menu').exists()).toBe(true)
  })

  it('navigates to the letter view when "Cover Letter" is clicked', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    expect(wrapper.find('.cl-header__title').text()).toBe('Cover Letter')
    expect(wrapper.find('.cl-textarea').exists()).toBe(true)
  })

  it('back from the letter view returns to the menu without emitting back', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    await wrapper.find('.cl-header__back').trigger('click')
    expect(wrapper.find('.cl-menu').exists()).toBe(true)
    expect(wrapper.emitted('back')).toBeFalsy()
  })

  it('back from the menu emits back', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-header__back').trigger('click')
    expect(wrapper.emitted('back')).toBeTruthy()
  })

  it('shows "Write a tailored note" when no letter draft exists', () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    expect(wrapper.find('.cl-action .cl-action__sub').text()).toBe('Write a tailored note')
  })

  it('shows "Draft written" when localStorage has a saved draft', () => {
    window.localStorage.setItem('jobmatch.coverletter.linkedin:1001', 'My cover letter')
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    expect(wrapper.find('.cl-action .cl-action__sub').text()).toBe('Draft written')
  })

  it('disables the download button when no CV has been uploaded', () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    expect((wrapper.find('.cl-download').element as HTMLButtonElement).disabled).toBe(true)
  })

  // --- cover letter editor ---

  it('loads saved cover letter text from localStorage into the textarea', async () => {
    window.localStorage.setItem('jobmatch.coverletter.linkedin:1001', 'Saved draft')
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    expect((wrapper.find('.cl-textarea').element as HTMLTextAreaElement).value).toBe('Saved draft')
  })

  it('shows "Saved as draft" status when localStorage text is present on load', async () => {
    window.localStorage.setItem('jobmatch.coverletter.linkedin:1001', 'Saved draft')
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Saved as draft')
  })

  it('updates the word count as text is typed', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    await wrapper.find('.cl-textarea').setValue('Hello world')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cl-meta').text()).toContain('2 words')
  })

  it('uses the singular "word" for a single word', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    await wrapper.find('.cl-textarea').setValue('Hello')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cl-meta').text()).toContain('1 word')
  })

  it('shows the default status label when no text has been typed', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Draft auto-saves as you type')
  })

  it('sets status to "Saving soon…" immediately after typing', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    await wrapper.find('.cl-textarea').setValue('Hello')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Saving soon…')
  })

  it('uploads text and shows "Saved to server" after the 3s debounce fires', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    await wrapper.find('.cl-textarea').setValue('Hello world')
    await vi.runAllTimersAsync()
    await flushPromises()
    const urls: string[] = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string)
    const jobsCreateIndex = urls.findIndex((u) => u.includes('/jobs/create'))
    const coverLetterIndex = urls.findIndex((u) => u.includes('/cover-letters/upload/text'))
    expect(jobsCreateIndex).toBeGreaterThanOrEqual(0)
    expect(coverLetterIndex).toBeGreaterThan(jobsCreateIndex)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/cover-letters/upload/text'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Hello world'),
      }),
    )
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Saved to server')
  })

  it('shows "Save failed" when the cover letter upload returns an error but job creation succeeded', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 201 })) // /jobs/create succeeds
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
      ) // /cover-letters/upload/text fails
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    await wrapper.find('.cl-textarea').setValue('Hello')
    await vi.runAllTimersAsync()
    await flushPromises()
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Save failed — retrying on next edit')
  })

  it('shows job creation error and does not call cover letter upload when job creation fails', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    )
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    await wrapper.find('.cl-textarea').setValue('Hello')
    await vi.runAllTimersAsync()
    await flushPromises()
    const urls: string[] = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(urls.some((u) => u.includes('/jobs/create'))).toBe(true)
    expect(urls.some((u) => u.includes('/cover-letters/upload/text'))).toBe(false)
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
      'Job could not be saved — cover letter not stored. Will retry on next edit.',
    )
  })

  it('skips the upload and stays idle when the textarea is empty', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    await wrapper.find('.cl-textarea').setValue('')
    await vi.runAllTimersAsync()
    await flushPromises()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Draft auto-saves as you type')
  })

  it('renders bold segments from **bold** markdown in the job description', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    expect(wrapper.find('.cl-paper__jobdesc strong').text()).toBe('Requirements')
    expect(wrapper.find('.cl-paper__jobdesc').text()).toContain('3 years experience.')
  })

  // --- lifecycle ---

  it('flushes a pending upload when the component is unmounted', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    await wrapper.find('.cl-textarea').setValue('Draft text')
    await wrapper.vm.$nextTick()
    // timer is pending but not yet fired

    wrapper.unmount()
    // onBeforeUnmount fires uploadNow(); flush the async chain
    await flushPromises()

    const urls: string[] = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(urls.some((u) => u.includes('/jobs/create'))).toBe(true)
    expect(urls.some((u) => u.includes('/cover-letters/upload/text'))).toBe(true)
  })

  it('only calls /jobs/create once across multiple edits for the same job', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    await wrapper.find('.cl-textarea').setValue('First edit')
    await vi.runAllTimersAsync()
    await flushPromises()
    await wrapper.find('.cl-textarea').setValue('Second edit')
    await vi.runAllTimersAsync()
    await flushPromises()
    const urls: string[] = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string)
    const jobsCreateCalls = urls.filter((u) => u.includes('/jobs/create'))
    expect(jobsCreateCalls).toHaveLength(1)
  })

  it('retries job creation on the next edit after a failure', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
      ) // first /jobs/create fails
      .mockResolvedValueOnce(new Response('{}', { status: 201 })) // retry /jobs/create succeeds
      .mockResolvedValueOnce(new Response('{}', { status: 201 })) // /cover-letters/upload/text succeeds
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')

    // First edit — job creation fails
    await wrapper.find('.cl-textarea').setValue('First edit')
    await vi.runAllTimersAsync()
    await flushPromises()
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
      'Job could not be saved — cover letter not stored. Will retry on next edit.',
    )

    // Second edit — job creation retries and succeeds
    await wrapper.find('.cl-textarea').setValue('Second edit')
    await vi.runAllTimersAsync()
    await flushPromises()
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Saved to server')
    const urls: string[] = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(urls.filter((u) => u.includes('/jobs/create'))).toHaveLength(2)
    expect(urls.some((u) => u.includes('/cover-letters/upload/text'))).toBe(true)
  })
})
