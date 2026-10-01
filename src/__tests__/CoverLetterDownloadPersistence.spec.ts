import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ApplicationEditorPage from '@/pages/match/ApplicationEditorPage.vue';
import type { ScrapedJob } from '@/components/jobCard/types';

const job: ScrapedJob = {
    sourceHostname: 'example.com',
    sourceJobId: 'download-test',
    sourceUrl: 'https://example.com/jobs/download-test',
    title: 'Synthetic Engineer',
    company: 'Example Company',
    location: 'Berlin',
    descriptionText: 'Synthetic job.',
    postedAt: 'Today',
    scrapedAt: '2026-10-01',
    tags: [],
    duplicateKey: 'example:download-test',
    companyAddresses: [],
    embedding: [],
};
const documentCases = [
    {
        name: 'cover letter',
        button: '[aria-label="Download cover letter"]',
        path: '/cover-letters/',
    },
    {
        name: 'combined application',
        button: '.cl-download',
        path: '/application/',
    },
];
const json = (body: unknown = {}, status = 200) =>
    new Response(JSON.stringify(body), { status });
function deferredResponse() {
    let resolve!: (response: Response) => void;
    const promise = new Promise<Response>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

describe('download the latest persisted cover letter', () => {
    let wrapper: ReturnType<typeof mount>;
    let uploads: {
        text: string;
        response: ReturnType<typeof deferredResponse>;
    }[];
    let downloads: string[];
    let anchorClick: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:synthetic'),
            revokeObjectURL: vi.fn(),
        });
        anchorClick = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => {});
        uploads = [];
        downloads = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: string, init?: RequestInit) => {
                if (input.endsWith('/cover-letters/upload/text')) {
                    const response = deferredResponse();
                    const body = JSON.parse(init!.body as string) as {
                        coverLetterText: string;
                    };
                    uploads.push({ text: body.coverLetterText, response });
                    return response.promise;
                }
                if (init?.method === 'POST' || input.endsWith('/status'))
                    return json();
                downloads.push(input);
                return new Response(new Blob(['%PDF-synthetic']));
            }),
        );
        wrapper = mount(ApplicationEditorPage, { props: { job } });
        await flushPromises();
        await wrapper.find('.cl-action__row').trigger('click');
    });

    afterEach(async () => {
        wrapper.unmount();
        await flushPromises(); // let close-time persistence reach the mocked request
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        window.localStorage.clear();
    });

    async function type(text: string) {
        await wrapper.find('.cl-textarea').setValue(text);
    }
    async function menu() {
        await wrapper.find('.app-editor-header__back').trigger('click');
    }
    async function settleUpload(index: number, status = 200) {
        uploads[index]!.response.resolve(
            json({ error: 'Synthetic save failure' }, status),
        );
        await flushPromises();
    }

    it.each(documentCases)(
        'flushes an immediate $name download before its PDF GET',
        async ({ button, path }) => {
            await type('Newest draft');
            await menu();
            await wrapper.find(button).trigger('click');
            await flushPromises();
            expect(uploads.map((upload) => upload.text)).toEqual([
                'Newest draft',
            ]);
            expect(downloads).toEqual([]);
            expect(wrapper.find('[role="status"]').text()).toContain('Saving');
            expect(
                (wrapper.find(button).element as HTMLButtonElement).disabled,
            ).toBe(true);
            await settleUpload(0);
            expect(downloads).toEqual([
                expect.stringContaining(path + job.duplicateKey),
            ]);
            expect(anchorClick).toHaveBeenCalledTimes(1);
        },
    );

    it.each(documentCases)(
        'waits for older A and newest B before the $name GET and ignores rapid clicks',
        async ({ button, path }) => {
            await type('Draft A');
            await vi.advanceTimersByTimeAsync(3000);
            await flushPromises();
            await type('Draft B');
            await menu();
            await wrapper.find(button).trigger('click');
            await wrapper.find(button).trigger('click');
            await flushPromises();
            expect(uploads.map((upload) => upload.text)).toEqual(['Draft A']);
            expect(downloads).toEqual([]);
            await settleUpload(0);
            expect(uploads.map((upload) => upload.text)).toEqual([
                'Draft A',
                'Draft B',
            ]);
            expect(downloads).toEqual([]);
            await settleUpload(1);
            expect(downloads).toEqual([
                expect.stringContaining(path + job.duplicateKey),
            ]);
            expect(anchorClick).toHaveBeenCalledTimes(1);
        },
    );

    it('flushes an edit made during the awaited save even when its debounce has not fired', async () => {
        await type('Draft A');
        await menu();
        await wrapper.find('.cl-download').trigger('click');
        await flushPromises();
        await wrapper.find('.cl-action__row').trigger('click');
        await type('Draft B after download was requested');
        await menu();
        await settleUpload(0);
        expect(uploads.map((upload) => upload.text)).toEqual([
            'Draft A',
            'Draft B after download was requested',
        ]);
        expect(downloads).toEqual([]);
        await settleUpload(1);
        expect(downloads).toHaveLength(1);
    });

    it.each(documentCases)(
        'blocks the $name PDF after a failed save and exposes a working retry',
        async ({ button, path }) => {
            await type('Draft requiring retry');
            await menu();
            await wrapper.find(button).trigger('click');
            await flushPromises();
            await settleUpload(0, 500);
            expect(downloads).toEqual([]);
            expect(wrapper.find('[role="alert"]').text()).toContain(
                'save the latest cover letter',
            );
            await wrapper.find('.editor__download-retry').trigger('click');
            await flushPromises();
            expect(uploads.map((upload) => upload.text)).toEqual([
                'Draft requiring retry',
                'Draft requiring retry',
            ]);
            expect(downloads).toEqual([]);
            await settleUpload(1);
            expect(downloads).toEqual([
                expect.stringContaining(path + job.duplicateKey),
            ]);
            expect(wrapper.find('[role="alert"]').exists()).toBe(false);
        },
    );

    it.each(['job switch', 'close', 'unmount'])(
        'does not start a PDF download after %s during saving',
        async (action) => {
            await type('Draft A');
            await menu();
            await wrapper.find('.cl-download').trigger('click');
            await flushPromises();
            if (action === 'job switch')
                await wrapper.setProps({
                    job: { ...job, duplicateKey: 'example:other' },
                });
            else if (action === 'close')
                await wrapper.setProps({ active: false });
            else wrapper.unmount();
            await settleUpload(0);
            expect(downloads).toEqual([]);
            expect(anchorClick).not.toHaveBeenCalled();
        },
    );
});
