import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ApplicationEditorPage from '@/pages/match/ApplicationEditorPage.vue';
import {
    coverLetterSavesKey,
    createCoverLetterSaves,
} from '@/lib/coverLetterSaves';
import type { ScrapedJob } from '@/components/jobCard/types';

const job: ScrapedJob = {
    sourceHostname: 'example.com',
    sourceJobId: 'acknowledgement',
    sourceUrl: 'https://example.com/jobs/acknowledgement',
    title: 'Synthetic Engineer',
    company: 'Example Company',
    location: 'Berlin',
    descriptionText: 'Synthetic job.',
    postedAt: 'Today',
    scrapedAt: '2026-10-01',
    tags: [],
    duplicateKey: 'example:acknowledgement',
    companyAddresses: [],
    embedding: [],
};
const generatedText = 'Generated opening. Generated closing.';
const generatedRecord = {
    text: generatedText,
    segments: [
        { kind: 'opening', text: 'Generated opening.', embedding: [1, 0] },
        { kind: 'closing', text: 'Generated closing.', embedding: [0, 1] },
    ],
};
type StoredRecord = typeof generatedRecord;
const json = (body: unknown = {}, status = 200) =>
    new Response(JSON.stringify(body), { status });
function deferred() {
    let resolve!: (response: Response) => void;
    const promise = new Promise<Response>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}
const documentCases = [
    { button: '[aria-label="Download cover letter"]', path: '/cover-letters/' },
    { button: '.cl-download', path: '/application/' },
];

describe('acknowledged generated cover-letter persistence', () => {
    let wrapper: ReturnType<typeof mount>;
    let saves: ReturnType<typeof createCoverLetterSaves>;
    let generation: ReturnType<typeof deferred>;
    let jobRequests: ReturnType<typeof deferred>[];
    let uploads: { text: string; response: ReturnType<typeof deferred> }[];
    let stored: StoredRecord | null;
    let jobStored: boolean;
    let downloads: { path: string; record: StoredRecord | null }[];

    async function open() {
        wrapper = mount(ApplicationEditorPage, {
            props: { job },
            global: { provide: { [coverLetterSavesKey as symbol]: saves } },
        });
        await flushPromises();
        await wrapper.find('.cl-action__row').trigger('click');
    }
    async function startGeneration() {
        await wrapper.find('.cl-generate').trigger('click');
        await flushPromises();
    }
    async function finishGeneration(saved: unknown = true) {
        if (saved === true) stored = generatedRecord;
        generation.resolve(json({ coverLetter: generatedText, saved }));
        await flushPromises();
    }
    async function debounce() {
        await vi.advanceTimersByTimeAsync(3000);
        await flushPromises();
    }
    async function saveJob(index = 0, status = 200) {
        jobRequests[index]!.resolve(json({}, status));
        await flushPromises();
    }
    async function saveUpload() {
        uploads[0]!.response.resolve(json());
        await flushPromises();
    }
    async function download(button = documentCases[0]!.button) {
        await wrapper.find('.app-editor-header__back').trigger('click');
        await wrapper.find(button).trigger('click');
        await flushPromises();
    }

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:synthetic'),
            revokeObjectURL: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
            () => {},
        );
        saves = createCoverLetterSaves();
        generation = deferred();
        jobRequests = [];
        uploads = [];
        stored = null;
        jobStored = false;
        downloads = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: string, init?: RequestInit) => {
                if (input.endsWith('/cover-letters/create/text'))
                    return generation.promise;
                if (input.endsWith('/jobs/create')) {
                    const response = deferred();
                    jobRequests.push(response);
                    const result = await response.promise;
                    if (result.ok) jobStored = true;
                    return result;
                }
                if (input.endsWith('/cover-letters/upload/text')) {
                    const body = JSON.parse(init!.body as string) as {
                        coverLetterText: string;
                    };
                    const response = deferred();
                    uploads.push({ text: body.coverLetterText, response });
                    const result = await response.promise;
                    if (result.ok)
                        stored = {
                            text: body.coverLetterText,
                            segments: [
                                {
                                    kind: 'resegmented',
                                    text: body.coverLetterText,
                                    embedding: [0.5, 0.5],
                                },
                            ],
                        };
                    return result;
                }
                if (input.endsWith('/status')) return json();
                downloads.push({ path: input, record: stored });
                return jobStored && stored
                    ? new Response(new Blob(['%PDF-synthetic']))
                    : json({ error: 'Missing PDF prerequisite' }, 404);
            }),
        );
        await open();
    });
    afterEach(async () => {
        wrapper.unmount();
        await flushPromises();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('keeps generator segments after debounce, close and reopen without plain-text upload', async () => {
        await startGeneration();
        await finishGeneration();
        await debounce();
        expect(wrapper.find('.cl-meta').text()).toContain('Saved to server');
        expect(
            localStorage.getItem(`jobmatch.coverletter.${job.duplicateKey}`),
        ).toBe(generatedText);
        expect(uploads).toHaveLength(0);
        expect(jobRequests).toHaveLength(0);
        wrapper.unmount();
        await flushPromises();
        await open();
        await debounce();
        expect(wrapper.find('.cl-meta').text()).toContain('Saved to server');
        expect(stored).toBe(generatedRecord);
        expect(uploads).toHaveLength(0);
        await download();
        await saveJob();
        expect(downloads[0]!.record).toBe(generatedRecord);
        expect(uploads).toHaveLength(0);
    });

    it.each(documentCases)(
        'creates the PDF job separately before $path without replacing segments',
        async ({ button, path }) => {
            await startGeneration();
            await finishGeneration();
            await download(button);
            expect(jobRequests).toHaveLength(1);
            expect(downloads).toHaveLength(0);
            expect(uploads).toHaveLength(0);
            await saveJob();
            expect(downloads).toEqual([
                {
                    path: expect.stringContaining(path + job.duplicateKey),
                    record: generatedRecord,
                },
            ]);
            expect(stored).toBe(generatedRecord);
            expect(uploads).toHaveLength(0);
        },
    );

    it('autosaves a later manual edit normally', async () => {
        await startGeneration();
        await finishGeneration();
        await wrapper.find('.cl-textarea').setValue('Manual edit');
        await debounce();
        await saveJob();
        expect(uploads.map((u) => u.text)).toEqual(['Manual edit']);
        await saveUpload();
        expect(stored?.text).toBe('Manual edit');
    });

    it('does not acknowledge stale saved:true output over a newer manual draft', async () => {
        await startGeneration();
        await wrapper.find('.cl-textarea').setValue('Newer manual draft');
        await finishGeneration();
        await saveJob();
        expect(uploads[0]!.text).toBe('Newer manual draft');
        await saveUpload();
        expect(stored?.text).toBe('Newer manual draft');
        expect(
            (wrapper.find('.cl-textarea').element as HTMLTextAreaElement).value,
        ).toBe('Newer manual draft');
        await download();
        expect(downloads[0]!.record?.text).toBe('Newer manual draft');
    });

    it.each([undefined, false, 'true', 1, null])(
        'uses normal autosave when saved is %s',
        async (saved) => {
            await startGeneration();
            // Omit the field when undefined, avoiding the helper's default acknowledgement.
            generation.resolve(
                json({
                    coverLetter: generatedText,
                    ...(saved === undefined ? {} : { saved }),
                }),
            );
            await flushPromises();
            await debounce();
            await saveJob();
            expect(uploads.map((u) => u.text)).toEqual([generatedText]);
            await saveUpload();
            expect(stored?.segments[0]?.kind).toBe('resegmented');
        },
    );

    it('blocks failed PDF job creation and retries without re-uploading the acknowledged letter', async () => {
        await startGeneration();
        await finishGeneration();
        await download();
        await saveJob(0, 500);
        expect(downloads).toHaveLength(0);
        expect(uploads).toHaveLength(0);
        expect(wrapper.find('[role="alert"]').text()).toContain('job');
        await wrapper.find('.editor__download-retry').trigger('click');
        await flushPromises();
        await saveJob(1);
        expect(downloads[0]!.record).toBe(generatedRecord);
        expect(uploads).toHaveLength(0);
    });

    it('saves edits made while PDF job creation is pending before downloading', async () => {
        await startGeneration();
        await finishGeneration();
        await download();
        await wrapper.find('.cl-action__row').trigger('click');
        await wrapper
            .find('.cl-textarea')
            .setValue('New draft during job creation');
        await saveJob();
        expect(downloads).toHaveLength(0);
        expect(uploads[0]!.text).toBe('New draft during job creation');
        await saveUpload();
        expect(downloads[0]!.record?.text).toBe(
            'New draft during job creation',
        );
    });

    it.each(['switch', 'close'])(
        'does not download after %s while PDF job creation is pending',
        async (action) => {
            await startGeneration();
            await finishGeneration();
            await download();
            if (action === 'switch')
                await wrapper.setProps({
                    job: { ...job, duplicateKey: 'example:another' },
                });
            else await wrapper.setProps({ active: false });
            await saveJob();
            expect(downloads).toHaveLength(0);
            expect(uploads).toHaveLength(0);
        },
    );
});
