import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ApplicationEditorPage from '@/pages/match/ApplicationEditorPage.vue'
import type { ScrapedJob } from '@/components/jobCard/types'

const job2: ScrapedJob = {
  sourceHostname: 'de.linkedin.com',
  sourceJobId: '2002',
  sourceUrl: 'https://de.linkedin.com/jobs/view/2002/',
  title: 'Backend Engineer',
  company: 'Other GmbH',
  location: 'Berlin',
  scrapedAt: '2026-06-08T10:00:00.000Z',
  duplicateKey: 'linkedin:2002',
  embedding: [0.5, 0.5],
}

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

  async function mountAndOpen(draftText?: string) {
    if (draftText !== undefined)
      window.localStorage.setItem('jobmatch.coverletter.linkedin:1001', draftText)
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await wrapper.find('.cl-action').trigger('click')
    return wrapper
  }

  async function typeAndFlush(wrapper: ReturnType<typeof mount>, text: string) {
    await wrapper.find('.cl-textarea').setValue(text)
    await vi.runAllTimersAsync()
    await flushPromises()
  }

  function getCalledUrls(): string[] {
    return fetchMock.mock.calls.map((c: unknown[]) => c[0] as string)
  }

  function expectEndpointsCalled(expectedJobs: boolean, expectedCoverLetter: boolean) {
    const urls = getCalledUrls()
    expect(urls.some((u) => u.includes('/jobs/create'))).toBe(expectedJobs)
    expect(urls.some((u) => u.includes('/cover-letters/upload/text'))).toBe(expectedCoverLetter)
  }

  // --- menu view ---

  it('mounts in the menu view with "Application Editor" header', () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    expect(wrapper.find('.cl-header__title').text()).toBe('Application Editor')
    expect(wrapper.find('.cl-menu').exists()).toBe(true)
  })

  it('navigates to the letter view when "Cover Letter" is clicked', async () => {
    const wrapper = await mountAndOpen()
    expect(wrapper.find('.cl-header__title').text()).toBe('Cover Letter')
    expect(wrapper.find('.cl-textarea').exists()).toBe(true)
  })

  it('back from the letter view returns to the menu without emitting back', async () => {
    const wrapper = await mountAndOpen()
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

  it('disables the download button when no CV has been uploaded', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 404 })))
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await flushPromises()
    expect((wrapper.find('.cl-download').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables the download button after the server confirms a CV exists', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await flushPromises()
    expect((wrapper.find('.cl-download').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('re-fetches CV status for the new job when the active job changes', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await flushPromises()
    fetchMock.mockClear()
    await wrapper.setProps({ job: job2 })
    await flushPromises()
    const urls = getCalledUrls()
    expect(urls.some((u) => u.includes('/cv/linkedin:2002/status'))).toBe(true)
  })

  // --- cover letter editor ---

  it('loads saved cover letter text from localStorage into the textarea', async () => {
    const wrapper = await mountAndOpen('Saved draft')
    expect((wrapper.find('.cl-textarea').element as HTMLTextAreaElement).value).toBe('Saved draft')
  })

  it('shows "Saved as draft" status when localStorage text is present on load', async () => {
    const wrapper = await mountAndOpen('Saved draft')
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Saved as draft')
  })

  it('updates the word count as text is typed', async () => {
    const wrapper = await mountAndOpen()
    await wrapper.find('.cl-textarea').setValue('Hello world')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cl-meta').text()).toContain('2 words')
  })

  it('uses the singular "word" for a single word', async () => {
    const wrapper = await mountAndOpen()
    await wrapper.find('.cl-textarea').setValue('Hello')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cl-meta').text()).toContain('1 word')
  })

  it('shows the default status label when no text has been typed', async () => {
    const wrapper = await mountAndOpen()
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Draft auto-saves as you type')
  })

  it('sets status to "Saving soon…" immediately after typing', async () => {
    const wrapper = await mountAndOpen()
    await wrapper.find('.cl-textarea').setValue('Hello')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Saving soon…')
  })

  it('uploads text and shows "Saved to server" after the 3s debounce fires', async () => {
    const wrapper = await mountAndOpen()
    await wrapper.find('.cl-textarea').setValue('Hello world')
    await vi.runAllTimersAsync()
    await flushPromises()
    const urls = getCalledUrls()
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
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) // CV status check
      .mockResolvedValueOnce(new Response('{}', { status: 201 })) // /jobs/create succeeds
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
      ) // /cover-letters/upload/text fails
    const wrapper = await mountAndOpen()
    await typeAndFlush(wrapper, 'Hello')
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Save failed — retrying on next edit')
  })

  it('shows job creation error and does not call cover letter upload when job creation fails', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    )
    const wrapper = await mountAndOpen()
    await typeAndFlush(wrapper, 'Hello')
    expectEndpointsCalled(true, false)
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
      'Job could not be saved — cover letter not stored. Will retry on next edit.',
    )
  })

  it('skips the upload pipeline and stays idle when the textarea is empty', async () => {
    const wrapper = await mountAndOpen()
    await typeAndFlush(wrapper, '')
    expectEndpointsCalled(false, false)
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Draft auto-saves as you type')
  })

  it('renders bold segments from **bold** markdown in the job description', async () => {
    const wrapper = await mountAndOpen()
    expect(wrapper.find('.cl-paper__jobdesc strong').text()).toBe('Requirements')
    expect(wrapper.find('.cl-paper__jobdesc').text()).toContain('3 years experience.')
  })

  // --- CV upload ---

  async function selectCvFile(wrapper: ReturnType<typeof mount>, file: File) {
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
  }

  it('sends FormData with file and jobDuplicateKey to POST /cv/upload on file selection', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await flushPromises()
    fetchMock.mockClear()
    const file = new File(['content'], 'cv.pdf', { type: 'application/pdf' })
    await selectCvFile(wrapper, file)
    const cvUploadCall = fetchMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('/cv/upload'),
    )
    expect(cvUploadCall).toBeDefined()
    const body = (cvUploadCall![1] as RequestInit).body as FormData
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('file')).toBe(file)
    expect(body.get('jobDuplicateKey')).toBe(job.duplicateKey)
  })

  it('enables the download button after a successful CV upload', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 })) // CV status check — no CV yet
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await flushPromises()
    expect((wrapper.find('.cl-download').element as HTMLButtonElement).disabled).toBe(true)
    const file = new File(['content'], 'cv.pdf', { type: 'application/pdf' })
    await selectCvFile(wrapper, file)
    expect((wrapper.find('.cl-download').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps the download button disabled when the CV upload returns an error', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 404 })) // CV status check — no CV
      .mockResolvedValueOnce(new Response('{}', { status: 201 })) // /jobs/create succeeds
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
      ) // /cv/upload fails
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await flushPromises()
    const file = new File(['content'], 'cv.pdf', { type: 'application/pdf' })
    await selectCvFile(wrapper, file)
    expect((wrapper.find('.cl-download').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls /jobs/create before /cv/upload when a file is selected', async () => {
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await flushPromises()
    fetchMock.mockClear()
    const file = new File(['content'], 'cv.pdf', { type: 'application/pdf' })
    await selectCvFile(wrapper, file)
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string)
    const jobsCreateIndex = urls.findIndex((u) => u.includes('/jobs/create'))
    const cvUploadIndex = urls.findIndex((u) => u.includes('/cv/upload'))
    expect(jobsCreateIndex).toBeGreaterThanOrEqual(0)
    expect(cvUploadIndex).toBeGreaterThan(jobsCreateIndex)
  })

  it('does not call /cv/upload when job creation fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 404 })) // CV status check — no CV
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
      ) // /jobs/create fails
    const wrapper = mount(ApplicationEditorPage, { props: { job } })
    await flushPromises()
    fetchMock.mockClear()
    const file = new File(['content'], 'cv.pdf', { type: 'application/pdf' })
    await selectCvFile(wrapper, file)
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(urls.some((u) => u.includes('/cv/upload'))).toBe(false)
  })

  // --- download application ---

  describe('download application', () => {
    function makeDownloadMocks() {
      const createObjectURL = vi.fn(() => 'blob:fake')
      const revokeObjectURL = vi.fn()
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
      const anchorClick = vi.fn()
      let capturedAnchor: HTMLAnchorElement | null = null
      const originalCreate = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          const a = originalCreate('a')
          a.click = anchorClick
          capturedAnchor = a
          return a
        }
        return originalCreate(tag)
      })
      return {
        createObjectURL,
        revokeObjectURL,
        anchorClick,
        getAnchor: () => capturedAnchor,
        restore: () => { vi.restoreAllMocks(); vi.unstubAllGlobals() },
      }
    }

    it('calls GET /application/:duplicateKey when download button is clicked', async () => {
      const { anchorClick, revokeObjectURL, getAnchor, restore } = makeDownloadMocks()

      const wrapper = mount(ApplicationEditorPage, { props: { job } })
      await flushPromises()
      fetchMock.mockClear()
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(new Blob(['%PDF']), { status: 200 })),
      )

      await wrapper.find('.cl-download').trigger('click')
      await flushPromises()

      const urls = getCalledUrls()
      expect(urls.some((u) => u.includes('/application/linkedin:1001'))).toBe(true)
      expect(anchorClick).toHaveBeenCalled()
      expect(getAnchor()?.download).toBe('application-linkedin-1001.pdf')

      await vi.runAllTimersAsync()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')

      restore()
    })

    it('passes an AbortSignal to the fetch call', async () => {
      const { restore } = makeDownloadMocks()

      const wrapper = mount(ApplicationEditorPage, { props: { job } })
      await flushPromises()
      fetchMock.mockClear()
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(new Blob(['%PDF']), { status: 200 })),
      )

      await wrapper.find('.cl-download').trigger('click')
      await flushPromises()

      const downloadCall = fetchMock.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('/application/'),
      )
      expect(downloadCall).toBeDefined()
      expect((downloadCall![1] as RequestInit).signal).toBeInstanceOf(AbortSignal)

      restore()
    })

    it('ignores a second click while a download is already in progress', async () => {
      const { anchorClick, restore } = makeDownloadMocks()

      let resolveFirst!: () => void
      fetchMock
        .mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 200 }))) // CV status
        .mockImplementationOnce(
          () => new Promise<Response>((res) => { resolveFirst = () => res(new Response(new Blob(['%PDF']), { status: 200 })) }),
        ) // first download — held pending

      const wrapper = mount(ApplicationEditorPage, { props: { job } })
      await flushPromises()

      // first click — download starts but fetch is still pending
      wrapper.find('.cl-download').trigger('click')
      // second click — should be ignored
      await wrapper.find('.cl-download').trigger('click')

      resolveFirst()
      await flushPromises()

      // fetch should have been called exactly once for the download endpoint
      const downloadCalls = fetchMock.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).includes('/application/'),
      )
      expect(downloadCalls).toHaveLength(1)
      expect(anchorClick).toHaveBeenCalledTimes(1)

      restore()
    })

    it('revokes the blob URL via onBeforeUnmount when the component unmounts before the timer fires', async () => {
      const { revokeObjectURL, restore } = makeDownloadMocks()

      const wrapper = mount(ApplicationEditorPage, { props: { job } })
      await flushPromises()
      fetchMock.mockClear()
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(new Blob(['%PDF']), { status: 200 })),
      )

      await wrapper.find('.cl-download').trigger('click')
      await flushPromises()
      // do NOT run timers — simulate unmount before the setTimeout fires
      wrapper.unmount()

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')

      restore()
    })

    it('aborts the in-flight fetch when the component unmounts', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      let rejectFetch!: (reason: unknown) => void
      fetchMock
        .mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 200 }))) // CV status
        .mockImplementationOnce(
          () => new Promise<Response>((_, rej) => { rejectFetch = rej }),
        )

      const wrapper = mount(ApplicationEditorPage, { props: { job } })
      await flushPromises()

      wrapper.find('.cl-download').trigger('click')
      // unmount before the fetch resolves — should abort
      wrapper.unmount()

      // simulate the aborted fetch rejecting with DOMException
      rejectFetch(new DOMException('Aborted', 'AbortError'))
      await flushPromises()

      // AbortError must be suppressed — no console.error for download
      expect(consoleError).not.toHaveBeenCalledWith(
        'Failed to download application:',
        expect.anything(),
      )

      consoleError.mockRestore()
    })

    it('logs to console.error when the download request fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      fetchMock
        .mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 200 }))) // CV status
        .mockImplementation(() =>
          Promise.resolve(
            new Response(JSON.stringify({ error: 'Cover letter not found' }), { status: 404 }),
          ),
        )

      const wrapper = mount(ApplicationEditorPage, { props: { job } })
      await flushPromises()

      await wrapper.find('.cl-download').trigger('click')
      await flushPromises()

      expect(consoleError).toHaveBeenCalledWith(
        'Failed to download application:',
        'Cover letter not found',
      )
      consoleError.mockRestore()
    })
  })

  // --- lifecycle ---

  it('flushes a pending upload when the component is unmounted', async () => {
    const wrapper = await mountAndOpen()
    await wrapper.find('.cl-textarea').setValue('Draft text')
    await wrapper.vm.$nextTick()
    // timer is pending but not yet fired

    wrapper.unmount()
    // onBeforeUnmount fires uploadNow(); flush the async chain
    await flushPromises()

    expectEndpointsCalled(true, true)
  })

  it('only calls /jobs/create once across multiple edits for the same job', async () => {
    const wrapper = await mountAndOpen()
    await typeAndFlush(wrapper, 'First edit')
    await typeAndFlush(wrapper, 'Second edit')
    const urls = getCalledUrls()
    const jobsCreateCalls = urls.filter((u) => u.includes('/jobs/create'))
    expect(jobsCreateCalls).toHaveLength(1)
  })

  it('retries job creation on the next edit after a failure', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 404 })) // CV status check (no CV)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
      ) // first /jobs/create fails
      .mockResolvedValueOnce(new Response('{}', { status: 201 })) // retry /jobs/create succeeds
      .mockResolvedValueOnce(new Response('{}', { status: 201 })) // /cover-letters/upload/text succeeds
    const wrapper = await mountAndOpen()

    // First edit — job creation fails
    await typeAndFlush(wrapper, 'First edit')
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
      'Job could not be saved — cover letter not stored. Will retry on next edit.',
    )

    // Second edit — job creation retries and succeeds
    await typeAndFlush(wrapper, 'Second edit')
    expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe('Saved to server')
    const urls = getCalledUrls()
    expect(urls.filter((u) => u.includes('/jobs/create'))).toHaveLength(2)
    expect(urls.some((u) => u.includes('/cover-letters/upload/text'))).toBe(true)
  })
})
