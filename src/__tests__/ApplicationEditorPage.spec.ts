import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ApplicationEditorPage from '@/pages/match/ApplicationEditorPage.vue';
import type { ScrapedJob } from '@/components/jobCard/types';

const job2: ScrapedJob = {
    sourceHostname: 'de.linkedin.com',
    sourceJobId: '2002',
    sourceUrl: 'https://de.linkedin.com/jobs/view/2002/',
    title: 'Backend Engineer',
    company: 'Other GmbH',
    location: 'Berlin',
    descriptionText: 'Backend role requirements.',
    postedAt: 'Vor 1 Tag',
    scrapedAt: '2026-06-08T10:00:00.000Z',
    tags: [],
    duplicateKey: 'linkedin:2002',
    companyAddresses: [
        {
            streetAddress: 'Musterstraße 1',
            city: 'Hamburg',
            postalCode: '20095',
            countryCode: 'DE',
        },
    ],
    embedding: [],
};

const job: ScrapedJob = {
    sourceHostname: 'de.linkedin.com',
    sourceJobId: '1001',
    sourceUrl: 'https://de.linkedin.com/jobs/view/1001/',
    title: 'Frontend Engineer',
    company: 'Example GmbH',
    location: 'Hamburg',
    descriptionText: '**Requirements**: 3 years experience.',
    postedAt: 'Vor 1 Tag',
    scrapedAt: '2026-06-08T10:00:00.000Z',
    tags: [],
    duplicateKey: 'linkedin:1001',
    companyAddresses: [
        {
            streetAddress: 'Musterstraße 1',
            city: 'Hamburg',
            postalCode: '20095',
            countryCode: 'DE',
        },
    ],
    embedding: [],
};

describe('ApplicationEditorPage', () => {
    let fetchMock: Mock<typeof fetch>;

    beforeEach(() => {
        // Use mockImplementation so each call gets a fresh Response (body streams are single-use).
        fetchMock = vi
            .fn<typeof fetch>()
            .mockImplementation(() =>
                Promise.resolve(new Response('{}', { status: 200 })),
            );
        vi.stubGlobal('fetch', fetchMock);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        window.localStorage.clear();
    });

    async function mountAndOpen(draftText?: string) {
        if (draftText !== undefined)
            window.localStorage.setItem(
                'jobmatch.coverletter.linkedin:1001',
                draftText,
            );
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        await wrapper.find('.cl-action__row').trigger('click');
        return wrapper;
    }

    async function typeAndFlush(
        wrapper: ReturnType<typeof mount>,
        text: string,
    ) {
        await wrapper.find('.cl-textarea').setValue(text);
        await vi.runAllTimersAsync();
        await flushPromises();
    }

    function getCalledUrls(): string[] {
        return fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    }

    function expectEndpointsCalled(
        expectedJobs: boolean,
        expectedCoverLetter: boolean,
    ) {
        const urls = getCalledUrls();
        expect(urls.some((u) => u.includes('/jobs/create'))).toBe(expectedJobs);
        expect(urls.some((u) => u.includes('/cover-letters/upload/text'))).toBe(
            expectedCoverLetter,
        );
    }

    function makeDownloadMocks() {
        const createObjectURL = vi.fn(() => 'blob:fake');
        const revokeObjectURL = vi.fn();
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
        const anchorClick = vi.fn();
        let capturedAnchor: HTMLAnchorElement | null = null;
        const originalCreate = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation(
            (tag: string) => {
                if (tag === 'a') {
                    const a = originalCreate('a');
                    a.click = anchorClick;
                    capturedAnchor = a;
                    return a;
                }
                return originalCreate(tag);
            },
        );
        return {
            createObjectURL,
            revokeObjectURL,
            anchorClick,
            getAnchor: () => capturedAnchor,
            restore: () => {
                vi.restoreAllMocks();
                vi.unstubAllGlobals();
            },
        };
    }

    function seedDraft() {
        window.localStorage.setItem(
            'jobmatch.coverletter.linkedin:1001',
            'My cover letter draft',
        );
    }

    // --- menu view ---

    it('mounts in the menu view with "Application Editor" header', () => {
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        expect(wrapper.find('.cl-header__title').text()).toBe(
            'Application Editor',
        );
        expect(wrapper.find('.cl-menu').exists()).toBe(true);
    });

    it('navigates to the letter view when "Cover Letter" is clicked', async () => {
        const wrapper = await mountAndOpen();
        expect(wrapper.find('.cl-header__title').text()).toBe('Cover Letter');
        expect(wrapper.find('.cl-textarea').exists()).toBe(true);
    });

    it('back from the letter view returns to the menu without emitting back', async () => {
        const wrapper = await mountAndOpen();
        await wrapper.find('.cl-header__back').trigger('click');
        expect(wrapper.find('.cl-menu').exists()).toBe(true);
        expect(wrapper.emitted('back')).toBeFalsy();
    });

    it('back from the menu emits back', async () => {
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        await wrapper.find('.cl-header__back').trigger('click');
        expect(wrapper.emitted('back')).toBeTruthy();
    });

    it('shows "Write a tailored note" when no letter draft exists', () => {
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        expect(wrapper.find('.cl-action .cl-action__sub').text()).toBe(
            'Write a tailored note',
        );
    });

    it('shows "Draft written" when localStorage has a saved draft', () => {
        window.localStorage.setItem(
            'jobmatch.coverletter.linkedin:1001',
            'My cover letter',
        );
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        expect(wrapper.find('.cl-action .cl-action__sub').text()).toBe(
            'Draft written',
        );
    });

    it('disables the download button when neither a CV nor a cover letter draft exists', async () => {
        fetchMock.mockImplementation(() =>
            Promise.resolve(new Response('{}', { status: 404 })),
        );
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        await flushPromises();
        expect(
            (wrapper.find('.cl-download').element as HTMLButtonElement)
                .disabled,
        ).toBe(true);
    });

    it('enables the download button after the server confirms a CV exists', async () => {
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        await flushPromises();
        expect(
            (wrapper.find('.cl-download').element as HTMLButtonElement)
                .disabled,
        ).toBe(false);
    });

    it('enables the download button when a cover letter draft exists, even without a CV', async () => {
        window.localStorage.setItem(
            'jobmatch.coverletter.linkedin:1001',
            'My cover letter draft',
        );
        fetchMock.mockImplementation(() =>
            Promise.resolve(new Response('{}', { status: 404 })),
        );
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        await flushPromises();
        expect(
            (wrapper.find('.cl-download').element as HTMLButtonElement)
                .disabled,
        ).toBe(false);
    });

    it('re-fetches CV status for the new job when the active job changes', async () => {
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        await flushPromises();
        fetchMock.mockClear();
        await wrapper.setProps({ job: job2 });
        await flushPromises();
        const urls = getCalledUrls();
        expect(urls.some((u) => u.includes('/cv/linkedin:2002/status'))).toBe(
            true,
        );
    });

    // --- cover letter editor ---

    it('loads saved cover letter text from localStorage into the textarea', async () => {
        const wrapper = await mountAndOpen('Saved draft');
        expect(
            (wrapper.find('.cl-textarea').element as HTMLTextAreaElement).value,
        ).toBe('Saved draft');
    });

    it('shows "Saved as draft" status when localStorage text is present on load', async () => {
        const wrapper = await mountAndOpen('Saved draft');
        expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
            'Saved as draft',
        );
    });

    it('updates the word count as text is typed', async () => {
        const wrapper = await mountAndOpen();
        await wrapper.find('.cl-textarea').setValue('Hello world');
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.cl-meta').text()).toContain('2 words');
    });

    it('uses the singular "word" for a single word', async () => {
        const wrapper = await mountAndOpen();
        await wrapper.find('.cl-textarea').setValue('Hello');
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.cl-meta').text()).toContain('1 word');
    });

    it('shows the default status label when no text has been typed', async () => {
        const wrapper = await mountAndOpen();
        expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
            'Draft auto-saves as you type',
        );
    });

    it('sets status to "Saving soon…" immediately after typing', async () => {
        const wrapper = await mountAndOpen();
        await wrapper.find('.cl-textarea').setValue('Hello');
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
            'Saving soon…',
        );
    });

    it('uploads text and shows "Saved to server" after the 3s debounce fires', async () => {
        const wrapper = await mountAndOpen();
        await wrapper.find('.cl-textarea').setValue('Hello world');
        await vi.runAllTimersAsync();
        await flushPromises();
        const urls = getCalledUrls();
        const jobsCreateIndex = urls.findIndex((u) =>
            u.includes('/jobs/create'),
        );
        const coverLetterIndex = urls.findIndex((u) =>
            u.includes('/cover-letters/upload/text'),
        );
        expect(jobsCreateIndex).toBeGreaterThanOrEqual(0);
        expect(coverLetterIndex).toBeGreaterThan(jobsCreateIndex);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/cover-letters/upload/text'),
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('Hello world'),
            }),
        );
        expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
            'Saved to server',
        );
    });

    it('shows "Save failed" when the cover letter upload returns an error but job creation succeeded', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('{}', { status: 200 })) // CV status check
            .mockResolvedValueOnce(new Response('{}', { status: 201 })) // /jobs/create succeeds
            .mockResolvedValue(
                new Response(JSON.stringify({ error: 'Server error' }), {
                    status: 500,
                }),
            ); // /cover-letters/upload/text fails
        const wrapper = await mountAndOpen();
        await typeAndFlush(wrapper, 'Hello');
        expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
            'Save failed — retrying on next edit',
        );
    });

    it('shows job creation error and does not call cover letter upload when job creation fails', async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ error: 'Server error' }), {
                status: 500,
            }),
        );
        const wrapper = await mountAndOpen();
        await typeAndFlush(wrapper, 'Hello');
        expectEndpointsCalled(true, false);
        expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
            'Job could not be saved — cover letter not stored. Will retry on next edit.',
        );
    });

    it('skips the upload pipeline and stays idle when the textarea is empty', async () => {
        const wrapper = await mountAndOpen();
        await typeAndFlush(wrapper, '');
        expectEndpointsCalled(false, false);
        expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
            'Draft auto-saves as you type',
        );
    });

    it('renders bold segments from **bold** markdown in the job description', async () => {
        const wrapper = await mountAndOpen();
        expect(wrapper.find('.cl-paper__jobdesc strong').text()).toBe(
            'Requirements',
        );
        expect(wrapper.find('.cl-paper__jobdesc').text()).toContain(
            '3 years experience.',
        );
    });

    // --- generate cover letter ---

    // The default beforeEach fetch mock resolves '{}' for every request, which
    // would leave `coverLetter` undefined and break the component's word-count
    // computed. Give /cover-letters/create/text a real body wherever the test
    // doesn't care about its content, matching how other describe blocks scope
    // their mocks to the endpoint under test. `status`/`responseBody` let the
    // failure test reuse this instead of duplicating the URL-branching mock.
    function mockGenerateResponse(
        responseBody: Record<string, unknown> = { coverLetter: 'Generated text' },
        status = 200,
    ) {
        fetchMock.mockImplementation((input: string | URL | Request) => {
            const url = input as string;
            if (url.includes('/cover-letters/create/text')) {
                return Promise.resolve(
                    new Response(JSON.stringify(responseBody), { status }),
                );
            }
            return Promise.resolve(new Response('{}', { status: 200 }));
        });
    }

    // onChange schedules a save on success; let the debounce settle so no
    // pending timers leak into other tests.
    async function drainUploadTimer() {
        await vi.runAllTimersAsync();
        await flushPromises();
    }

    // Shared happy-path setup for the tests below: open the editor, mock a
    // successful generate response, clear the mount-time fetch calls, then
    // click generate and let it settle.
    async function mountAndGenerate() {
        const wrapper = await mountAndOpen();
        mockGenerateResponse();
        fetchMock.mockClear();
        await wrapper.find('.cl-generate').trigger('click');
        await flushPromises();
        return wrapper;
    }

    describe('generate cover letter', () => {
        it('calls POST /cover-letters/create/text exactly once with the job fields, and without embedding, coverLetterIds, or x', async () => {
            await mountAndGenerate();

            const calls = fetchMock.mock.calls.filter((c: unknown[]) =>
                (c[0] as string).includes('/cover-letters/create/text'),
            );
            expect(calls).toHaveLength(1);

            const body = JSON.parse(
                (calls[0]![1] as RequestInit).body as string,
            );
            expect(body.title).toBe(job.title);
            expect(body.company).toBe(job.company);
            expect(body.duplicateKey).toBe(job.duplicateKey);
            expect(body).not.toHaveProperty('embedding');
            expect(body).not.toHaveProperty('coverLetterIds');
            expect(body).not.toHaveProperty('x');

            await drainUploadTimer();
        });

        it('does not call /jobs/top-x-similar-cover-letters', async () => {
            await mountAndGenerate();

            const urls = getCalledUrls();
            expect(
                urls.some((u) => u.includes('/jobs/top-x-similar-cover-letters')),
            ).toBe(false);

            await drainUploadTimer();
        });

        it('fills the textarea with the generated cover letter on success', async () => {
            const wrapper = await mountAndGenerate();

            expect(
                (wrapper.find('.cl-textarea').element as HTMLTextAreaElement)
                    .value,
            ).toBe('Generated text');

            await drainUploadTimer();
        });

        it('logs console.error and leaves the textarea unchanged when the request fails', async () => {
            const consoleError = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});
            const wrapper = await mountAndOpen();
            mockGenerateResponse({ error: 'Server error' }, 500);

            await wrapper.find('.cl-generate').trigger('click');
            await flushPromises();

            expect(consoleError).toHaveBeenCalledWith(
                'Failed to generate cover letter:',
                'Server error',
            );
            expect(
                (wrapper.find('.cl-textarea').element as HTMLTextAreaElement)
                    .value,
            ).toBe('');

            consoleError.mockRestore();
        });
    });

    // --- CV upload ---

    async function selectCvFile(wrapper: ReturnType<typeof mount>, file: File) {
        const input = wrapper.find('input[type="file"]');
        Object.defineProperty(input.element, 'files', {
            value: [file],
            configurable: true,
        });
        await input.trigger('change');
        await flushPromises();
    }

    async function mountAndUploadCvFile() {
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        await flushPromises();
        fetchMock.mockClear();
        const file = new File(['content'], 'cv.pdf', {
            type: 'application/pdf',
        });
        await selectCvFile(wrapper, file);
        const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
        return { wrapper, file, urls };
    }

    it('sends FormData with file and jobDuplicateKey to POST /cv/upload on file selection', async () => {
        const { file } = await mountAndUploadCvFile();
        const cvUploadCall = fetchMock.mock.calls.find((c: unknown[]) =>
            (c[0] as string).includes('/cv/upload'),
        );
        expect(cvUploadCall).toBeDefined();
        const body = (cvUploadCall![1] as RequestInit).body as FormData;
        expect(body).toBeInstanceOf(FormData);
        expect(body.get('file')).toBe(file);
        expect(body.get('jobDuplicateKey')).toBe(job.duplicateKey);
    });

    it('enables the download button after a successful CV upload', async () => {
        fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 })); // CV status check — no CV yet
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        await flushPromises();
        expect(
            (wrapper.find('.cl-download').element as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        const file = new File(['content'], 'cv.pdf', {
            type: 'application/pdf',
        });
        await selectCvFile(wrapper, file);
        expect(
            (wrapper.find('.cl-download').element as HTMLButtonElement)
                .disabled,
        ).toBe(false);
    });

    it('keeps the download button disabled when the CV upload returns an error', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('{}', { status: 404 })) // CV status check — no CV
            .mockResolvedValueOnce(new Response('{}', { status: 201 })) // /jobs/create succeeds
            .mockResolvedValue(
                new Response(JSON.stringify({ error: 'Server error' }), {
                    status: 500,
                }),
            ); // /cv/upload fails
        const wrapper = mount(ApplicationEditorPage, { props: { job } });
        await flushPromises();
        const file = new File(['content'], 'cv.pdf', {
            type: 'application/pdf',
        });
        await selectCvFile(wrapper, file);
        expect(
            (wrapper.find('.cl-download').element as HTMLButtonElement)
                .disabled,
        ).toBe(true);
    });

    it('calls /jobs/create before /cv/upload when a file is selected', async () => {
        const { urls } = await mountAndUploadCvFile();
        const jobsCreateIndex = urls.findIndex((u) =>
            u.includes('/jobs/create'),
        );
        const cvUploadIndex = urls.findIndex((u) => u.includes('/cv/upload'));
        expect(jobsCreateIndex).toBeGreaterThanOrEqual(0);
        expect(cvUploadIndex).toBeGreaterThan(jobsCreateIndex);
    });

    it('does not call /cv/upload when job creation fails', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('{}', { status: 404 })) // CV status check — no CV
            .mockResolvedValue(
                new Response(JSON.stringify({ error: 'Server error' }), {
                    status: 500,
                }),
            ); // /jobs/create fails
        const { urls } = await mountAndUploadCvFile();
        expect(urls.some((u) => u.includes('/cv/upload'))).toBe(false);
    });

    // --- download application ---

    // The combined PDF is only downloaded once both a cover letter draft and a CV
    // exist — every test in this block seeds a draft so cvUploaded (true by
    // default via the mocked CV status check) and letterDone are both true.
    describe('download application', () => {
        async function mountAndClickDownload() {
            seedDraft();
            const mocks = makeDownloadMocks();
            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();
            fetchMock.mockClear();
            fetchMock.mockImplementation(() =>
                Promise.resolve(
                    new Response(new Blob(['%PDF']), { status: 200 }),
                ),
            );
            await wrapper.find('.cl-download').trigger('click');
            await flushPromises();
            return { wrapper, ...mocks };
        }

        it('calls GET /application/:duplicateKey when download button is clicked', async () => {
            const { anchorClick, revokeObjectURL, getAnchor, restore } =
                await mountAndClickDownload();

            const urls = getCalledUrls();
            expect(
                urls.some((u) => u.includes('/application/linkedin:1001')),
            ).toBe(true);
            expect(anchorClick).toHaveBeenCalled();
            expect(getAnchor()?.download).toBe('application-linkedin-1001.pdf');

            await vi.runAllTimersAsync();
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');

            restore();
        });

        it('passes an AbortSignal to the fetch call', async () => {
            const { restore } = await mountAndClickDownload();

            const downloadCall = fetchMock.mock.calls.find((c: unknown[]) =>
                (c[0] as string).includes('/application/'),
            );
            expect(downloadCall).toBeDefined();
            expect((downloadCall![1] as RequestInit).signal).toBeInstanceOf(
                AbortSignal,
            );

            restore();
        });

        it('ignores a second click while a download is already in progress', async () => {
            seedDraft();
            const { anchorClick, restore } = makeDownloadMocks();

            let resolveFirst!: () => void;
            fetchMock
                .mockImplementationOnce(() =>
                    Promise.resolve(new Response('{}', { status: 200 })),
                ) // CV status
                .mockImplementationOnce(
                    () =>
                        new Promise<Response>((res) => {
                            resolveFirst = () =>
                                res(
                                    new Response(new Blob(['%PDF']), {
                                        status: 200,
                                    }),
                                );
                        }),
                ); // first download — held pending

            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();

            // first click — download starts but fetch is still pending
            void wrapper.find('.cl-download').trigger('click');
            // second click — should be ignored
            await wrapper.find('.cl-download').trigger('click');

            resolveFirst();
            await flushPromises();

            // fetch should have been called exactly once for the download endpoint
            const downloadCalls = fetchMock.mock.calls.filter((c: unknown[]) =>
                (c[0] as string).includes('/application/'),
            );
            expect(downloadCalls).toHaveLength(1);
            expect(anchorClick).toHaveBeenCalledTimes(1);

            restore();
        });

        it('revokes the blob URL via onBeforeUnmount when the component unmounts before the timer fires', async () => {
            const { wrapper, revokeObjectURL, restore } =
                await mountAndClickDownload();
            // do NOT run timers — simulate unmount before the setTimeout fires
            wrapper.unmount();

            expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');

            restore();
        });

        it('aborts the in-flight fetch when the component unmounts', async () => {
            seedDraft();
            const consoleError = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});

            let rejectFetch!: (reason: unknown) => void;
            fetchMock
                .mockImplementationOnce(() =>
                    Promise.resolve(new Response('{}', { status: 200 })),
                ) // CV status
                .mockImplementationOnce(
                    () =>
                        new Promise<Response>((_, rej) => {
                            rejectFetch = rej;
                        }),
                );

            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();

            void wrapper.find('.cl-download').trigger('click');
            // unmount before the fetch resolves — should abort
            wrapper.unmount();

            // simulate the aborted fetch rejecting with DOMException
            rejectFetch(new DOMException('Aborted', 'AbortError'));
            await flushPromises();

            // AbortError must be suppressed — no console.error for download
            expect(consoleError).not.toHaveBeenCalledWith(
                'Failed to download application:',
                expect.anything(),
            );

            consoleError.mockRestore();
        });

        it('logs to console.error when the download request fails', async () => {
            seedDraft();
            const consoleError = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});
            fetchMock
                .mockImplementationOnce(() =>
                    Promise.resolve(new Response('{}', { status: 200 })),
                ) // CV status
                .mockImplementation(() =>
                    Promise.resolve(
                        new Response(
                            JSON.stringify({ error: 'Cover letter not found' }),
                            { status: 404 },
                        ),
                    ),
                );

            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();

            await wrapper.find('.cl-download').trigger('click');
            await flushPromises();

            expect(consoleError).toHaveBeenCalledWith(
                'Failed to download application:',
                'Cover letter not found',
            );
            consoleError.mockRestore();
        });
    });

    describe('download application — only one document exists', () => {
        it('downloads only the cover letter when a draft exists but no CV is uploaded', async () => {
            seedDraft();
            const { anchorClick, getAnchor, restore } = makeDownloadMocks();
            fetchMock.mockImplementationOnce(() =>
                Promise.resolve(new Response('{}', { status: 404 })),
            ); // CV status — no CV
            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();
            fetchMock.mockClear();
            fetchMock.mockImplementation(() =>
                Promise.resolve(
                    new Response(new Blob(['%PDF']), { status: 200 }),
                ),
            );

            await wrapper.find('.cl-download').trigger('click');
            await flushPromises();

            const urls = getCalledUrls();
            expect(
                urls.some((u) => u.includes('/cover-letters/linkedin:1001')),
            ).toBe(true);
            expect(urls.some((u) => u.includes('/application/'))).toBe(false);
            expect(anchorClick).toHaveBeenCalled();
            expect(getAnchor()?.download).toBe(
                'cover-letter-linkedin-1001.pdf',
            );

            restore();
        });

        it('downloads only the CV when uploaded but no cover letter draft exists', async () => {
            const { anchorClick, getAnchor, restore } = makeDownloadMocks();
            // beforeEach's default fetch mock resolves 200 for everything, so the
            // CV status check succeeds (cvUploaded true); no draft means letterDone stays false.
            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();
            fetchMock.mockClear();
            fetchMock.mockImplementation(() =>
                Promise.resolve(
                    new Response(new Blob(['%PDF']), { status: 200 }),
                ),
            );

            await wrapper.find('.cl-download').trigger('click');
            await flushPromises();

            const urls = getCalledUrls();
            expect(urls.some((u) => u.endsWith('/cv/linkedin:1001'))).toBe(
                true,
            );
            expect(urls.some((u) => u.includes('/application/'))).toBe(false);
            expect(anchorClick).toHaveBeenCalled();
            expect(getAnchor()?.download).toBe('cv-linkedin-1001.pdf');

            restore();
        });
    });

    // --- download cover letter (per-row) ---

    describe('download cover letter', () => {
        async function mountAndClickCoverLetterDownload() {
            seedDraft();
            const mocks = makeDownloadMocks();
            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();
            fetchMock.mockClear();
            fetchMock.mockImplementation(() =>
                Promise.resolve(
                    new Response(new Blob(['%PDF']), { status: 200 }),
                ),
            );
            await wrapper.findAll('.cl-action__dl')[0]!.trigger('click');
            await flushPromises();
            return { wrapper, ...mocks };
        }

        it('calls GET /cover-letters/:duplicateKey when the row download button is clicked', async () => {
            const { anchorClick, revokeObjectURL, getAnchor, restore } =
                await mountAndClickCoverLetterDownload();

            const urls = getCalledUrls();
            expect(
                urls.some((u) => u.includes('/cover-letters/linkedin:1001')),
            ).toBe(true);
            expect(anchorClick).toHaveBeenCalled();
            expect(getAnchor()?.download).toBe(
                'cover-letter-linkedin-1001.pdf',
            );

            await vi.runAllTimersAsync();
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');

            restore();
        });

        it('ignores a second click while a download is already in progress', async () => {
            seedDraft();
            const { anchorClick, restore } = makeDownloadMocks();

            let resolveFirst!: () => void;
            fetchMock
                .mockImplementationOnce(() =>
                    Promise.resolve(new Response('{}', { status: 200 })),
                ) // CV status
                .mockImplementationOnce(
                    () =>
                        new Promise<Response>((res) => {
                            resolveFirst = () =>
                                res(
                                    new Response(new Blob(['%PDF']), {
                                        status: 200,
                                    }),
                                );
                        }),
                ); // first download — held pending

            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();

            const dlButton = wrapper.findAll('.cl-action__dl')[0]!;
            void dlButton.trigger('click');
            await dlButton.trigger('click');

            resolveFirst();
            await flushPromises();

            const downloadCalls = fetchMock.mock.calls.filter((c: unknown[]) =>
                (c[0] as string).includes('/cover-letters/linkedin:1001'),
            );
            expect(downloadCalls).toHaveLength(1);
            expect(anchorClick).toHaveBeenCalledTimes(1);

            restore();
        });

        it('suppresses the AbortError console log when the component unmounts mid-download', async () => {
            seedDraft();
            const consoleError = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});

            let rejectFetch!: (reason: unknown) => void;
            fetchMock
                .mockImplementationOnce(() =>
                    Promise.resolve(new Response('{}', { status: 200 })),
                ) // CV status
                .mockImplementationOnce(
                    () =>
                        new Promise<Response>((_, rej) => {
                            rejectFetch = rej;
                        }),
                );

            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();

            void wrapper.findAll('.cl-action__dl')[0]!.trigger('click');
            wrapper.unmount();

            rejectFetch(new DOMException('Aborted', 'AbortError'));
            await flushPromises();

            expect(consoleError).not.toHaveBeenCalledWith(
                'Failed to download cover letter:',
                expect.anything(),
            );

            consoleError.mockRestore();
        });
    });

    // --- download cv (per-row) ---

    describe('download cv', () => {
        async function mountAndClickCvDownload() {
            const mocks = makeDownloadMocks();
            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();
            fetchMock.mockClear();
            fetchMock.mockImplementation(() =>
                Promise.resolve(
                    new Response(new Blob(['%PDF']), { status: 200 }),
                ),
            );
            await wrapper.findAll('.cl-action__dl')[1]!.trigger('click');
            await flushPromises();
            return { wrapper, ...mocks };
        }

        it('calls GET /cv/:duplicateKey when the row download button is clicked', async () => {
            const { anchorClick, revokeObjectURL, getAnchor, restore } =
                await mountAndClickCvDownload();

            const urls = getCalledUrls();
            expect(urls.some((u) => u.endsWith('/cv/linkedin:1001'))).toBe(
                true,
            );
            expect(anchorClick).toHaveBeenCalled();
            expect(getAnchor()?.download).toBe('cv-linkedin-1001.pdf');

            await vi.runAllTimersAsync();
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');

            restore();
        });

        it('ignores a second click while a download is already in progress', async () => {
            const { anchorClick, restore } = makeDownloadMocks();

            let resolveFirst!: () => void;
            fetchMock
                .mockImplementationOnce(() =>
                    Promise.resolve(new Response('{}', { status: 200 })),
                ) // CV status
                .mockImplementationOnce(
                    () =>
                        new Promise<Response>((res) => {
                            resolveFirst = () =>
                                res(
                                    new Response(new Blob(['%PDF']), {
                                        status: 200,
                                    }),
                                );
                        }),
                ); // first download — held pending

            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();

            const dlButton = wrapper.findAll('.cl-action__dl')[1]!;
            void dlButton.trigger('click');
            await dlButton.trigger('click');

            resolveFirst();
            await flushPromises();

            // .endsWith excludes the /cv/:key/status call fired on mount, which
            // otherwise shares the '/cv/linkedin:1001' prefix with the download call.
            const downloadCalls = fetchMock.mock.calls.filter((c: unknown[]) =>
                (c[0] as string).endsWith('/cv/linkedin:1001'),
            );
            expect(downloadCalls).toHaveLength(1);
            expect(anchorClick).toHaveBeenCalledTimes(1);

            restore();
        });

        it('suppresses the AbortError console log when the component unmounts mid-download', async () => {
            const consoleError = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});

            let rejectFetch!: (reason: unknown) => void;
            fetchMock
                .mockImplementationOnce(() =>
                    Promise.resolve(new Response('{}', { status: 200 })),
                ) // CV status
                .mockImplementationOnce(
                    () =>
                        new Promise<Response>((_, rej) => {
                            rejectFetch = rej;
                        }),
                );

            const wrapper = mount(ApplicationEditorPage, { props: { job } });
            await flushPromises();

            void wrapper.findAll('.cl-action__dl')[1]!.trigger('click');
            wrapper.unmount();

            rejectFetch(new DOMException('Aborted', 'AbortError'));
            await flushPromises();

            expect(consoleError).not.toHaveBeenCalledWith(
                'Failed to download CV:',
                expect.anything(),
            );

            consoleError.mockRestore();
        });
    });

    // --- lifecycle ---

    it('flushes a pending upload when the component is unmounted', async () => {
        const wrapper = await mountAndOpen();
        await wrapper.find('.cl-textarea').setValue('Draft text');
        await wrapper.vm.$nextTick();
        // timer is pending but not yet fired

        wrapper.unmount();
        // onBeforeUnmount fires uploadNow(); flush the async chain
        await flushPromises();

        expectEndpointsCalled(true, true);
    });

    it('only calls /jobs/create once across multiple edits for the same job', async () => {
        const wrapper = await mountAndOpen();
        await typeAndFlush(wrapper, 'First edit');
        await typeAndFlush(wrapper, 'Second edit');
        const urls = getCalledUrls();
        const jobsCreateCalls = urls.filter((u) => u.includes('/jobs/create'));
        expect(jobsCreateCalls).toHaveLength(1);
    });

    it('retries job creation on the next edit after a failure', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('{}', { status: 404 })) // CV status check (no CV)
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ error: 'Server error' }), {
                    status: 500,
                }),
            ) // first /jobs/create fails
            .mockResolvedValueOnce(new Response('{}', { status: 201 })) // retry /jobs/create succeeds
            .mockResolvedValueOnce(new Response('{}', { status: 201 })); // /cover-letters/upload/text succeeds
        const wrapper = await mountAndOpen();

        // First edit — job creation fails
        await typeAndFlush(wrapper, 'First edit');
        expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
            'Job could not be saved — cover letter not stored. Will retry on next edit.',
        );

        // Second edit — job creation retries and succeeds
        await typeAndFlush(wrapper, 'Second edit');
        expect(wrapper.findAll('.cl-meta span')[0]!.text()).toBe(
            'Saved to server',
        );
        const urls = getCalledUrls();
        expect(urls.filter((u) => u.includes('/jobs/create'))).toHaveLength(2);
        expect(urls.some((u) => u.includes('/cover-letters/upload/text'))).toBe(
            true,
        );
    });
});
