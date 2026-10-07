import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ApplicationEditorPage from '@/pages/match/ApplicationEditorPage.vue';
import {
    coverLetterSavesKey,
    createCoverLetterSaves,
} from '@/lib/coverLetterSaves';
import type { ScrapedJob } from '@/components/jobCard/types';
import { createDeferred as deferred } from './testUtils';

const job: ScrapedJob = {
    sourceHostname: 'example.com',
    sourceJobId: 'generation',
    sourceUrl: 'https://example.com/jobs/generation',
    title: 'Synthetic Engineer',
    company: 'Example Company',
    location: 'Berlin',
    descriptionText: 'Synthetic job.',
    postedAt: 'Today',
    scrapedAt: '2026-10-01',
    tags: [],
    duplicateKey: 'example:generation',
    companyAddresses: [],
    embedding: [],
};
const json = (body: unknown = {}, status = 200) =>
    new Response(JSON.stringify(body), { status });

describe('generation and manual draft persistence', () => {
    let wrapper: ReturnType<typeof mount>;
    let saves: ReturnType<typeof createCoverLetterSaves>;
    let uploads: {
        key: string;
        text: string;
        response: ReturnType<typeof deferred<Response>>;
    }[];
    let generations: {
        key: string;
        response: ReturnType<typeof deferred<Response>>;
    }[];
    let stored: Map<string, string>;

    async function open(currentJob = job) {
        wrapper = mount(ApplicationEditorPage, {
            props: { job: currentJob },
            global: { provide: { [coverLetterSavesKey as symbol]: saves } },
        });
        await flushPromises();
        await wrapper.find('.cl-action__row').trigger('click');
    }
    const type = async (text: string) =>
        wrapper.find('.cl-textarea').setValue(text);
    const generate = async () => {
        await wrapper.find('.cl-generate').trigger('click');
        await flushPromises();
    };
    const debounce = async () => {
        await vi.advanceTimersByTimeAsync(3000);
        await flushPromises();
    };
    const upload = async (index: number, status = 200) => {
        uploads[index]!.response.resolve(json({}, status));
        await flushPromises();
    };
    const generated = async () => {
        generations[0]!.response.resolve(
            json({ coverLetter: 'Generated result', saved: true }),
        );
        await flushPromises();
    };
    function expectDraft(text: string) {
        expect(
            (wrapper.find('.cl-textarea').element as HTMLTextAreaElement).value,
        ).toBe(text);
        expect(
            localStorage.getItem(`jobmatch.coverletter.${job.duplicateKey}`),
        ).toBe(text);
    }

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        saves = createCoverLetterSaves();
        uploads = [];
        generations = [];
        stored = new Map();
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: string, init?: RequestInit) => {
                if (input.endsWith('/cover-letters/create/text')) {
                    const body = JSON.parse(init!.body as string) as {
                        duplicateKey: string;
                    };
                    const response = deferred<Response>();
                    generations.push({ key: body.duplicateKey, response });
                    const result = await response.promise;
                    if (result.ok) {
                        const payload = (await result.clone().json()) as {
                            coverLetter: string;
                        };
                        stored.set(body.duplicateKey, payload.coverLetter);
                    }
                    return result;
                }
                if (input.endsWith('/cover-letters/upload/text')) {
                    const body = JSON.parse(init!.body as string) as {
                        coverLetterText: string;
                        jobDuplicateKey: string;
                    };
                    const response = deferred<Response>();
                    uploads.push({
                        key: body.jobDuplicateKey,
                        text: body.coverLetterText,
                        response,
                    });
                    const result = await response.promise;
                    if (result.ok)
                        stored.set(body.jobDuplicateKey, body.coverLetterText);
                    return result;
                }
                return json();
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

    it('restores a newer manual draft after generation writes its stale result', async () => {
        await generate();
        await type('Manual draft');
        await debounce();
        expect(uploads).toHaveLength(0);
        await generated();
        expectDraft('Manual draft');
        expect(stored.get(job.duplicateKey)).toBe('Generated result');
        expect(uploads.map((u) => u.text)).toEqual(['Manual draft']);
        await upload(0);
        expect(stored.get(job.duplicateKey)).toBe('Manual draft');
        expect(wrapper.text()).toContain('generated text was discarded');
    });

    it('restores an already saved draft after an A/B/A edit rather than comparing text alone', async () => {
        await type('Draft A');
        await debounce();
        await upload(0);
        await generate();
        await type('Draft B');
        await type('Draft A');
        await generated();
        expectDraft('Draft A');
        expect(uploads.map((u) => u.text)).toEqual(['Draft A', 'Draft A']);
        await upload(1);
        expect(stored.get(job.duplicateKey)).toBe('Draft A');
    });

    it('waits for an older upload before starting generation and guards edits during that wait', async () => {
        await type('Old upload');
        await debounce();
        await generate();
        expect(generations).toHaveLength(0);
        await type('Current manual draft');
        await upload(0);
        expect(generations).toHaveLength(1);
        await generated();
        expectDraft('Current manual draft');
        await upload(1);
        expect(stored.get(job.duplicateKey)).toBe('Current manual draft');
    });

    it('continues restoring if the draft changes during the restoration upload', async () => {
        await generate();
        await type('Manual A');
        await generated();
        await type('Manual B');
        await upload(0);
        expect(uploads.map((u) => u.text)).toEqual(['Manual A', 'Manual B']);
        await upload(1);
        expectDraft('Manual B');
        expect(stored.get(job.duplicateKey)).toBe('Manual B');
    });

    it('retains the transaction across close/reopen and never applies the detached response', async () => {
        await type('Original');
        await generate();
        wrapper.unmount();
        await flushPromises();
        await open();
        expect(
            (wrapper.find('.cl-generate').element as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        await type('Reopened draft');
        await generate();
        await debounce();
        expect(generations).toHaveLength(1);
        expect(uploads).toHaveLength(0);
        await generated();
        expectDraft('Reopened draft');
        await upload(0);
        expect(stored.get(job.duplicateKey)).toBe('Reopened draft');
        expect(
            (wrapper.find('.cl-generate').element as HTMLButtonElement)
                .disabled,
        ).toBe(false);
    });

    it('does not revive a generation after closing and reopening during the transition', async () => {
        await type('Original');
        await generate();
        await wrapper.setProps({ active: false });
        await wrapper.setProps({ active: true });
        await generated();
        expectDraft('Original');
        await upload(0);
        expect(stored.get(job.duplicateKey)).toBe('Original');
    });

    it('restores the detached job without changing a different current job', async () => {
        await type('First job manual draft');
        await generate();
        await wrapper.setProps({
            job: { ...job, duplicateKey: 'example:second' },
        });
        await wrapper.find('.cl-action__row').trigger('click');
        await type('Second job draft');
        await generated();
        expect(
            (wrapper.find('.cl-textarea').element as HTMLTextAreaElement).value,
        ).toBe('Second job draft');
        expect(uploads[0]!.key).toBe(job.duplicateKey);
        await upload(0);
        expect(stored.get(job.duplicateKey)).toBe('First job manual draft');
    });

    it('exposes restoration failure and retries the preserved draft', async () => {
        await generate();
        await type('Preserved draft');
        await generated();
        await upload(0, 500);
        expectDraft('Preserved draft');
        expect(wrapper.find('[role="alert"]').text()).toContain('not saved');
        await wrapper.find('.editor__save-retry').trigger('click');
        await flushPromises();
        expect(uploads[1]!.text).toBe('Preserved draft');
        await upload(1);
        expect(stored.get(job.duplicateKey)).toBe('Preserved draft');
        expect(wrapper.find('.editor__save-retry').exists()).toBe(false);
    });

    it('preserves a cleared draft and reports that the server cannot save empty letters', async () => {
        await type('Original');
        await generate();
        await type('');
        await generated();
        expectDraft('');
        expect(uploads).toHaveLength(0);
        expect(wrapper.find('[role="alert"]').text()).toContain(
            'Add some text',
        );
        expect(
            (wrapper.find('.editor__save-retry').element as HTMLButtonElement)
                .disabled,
        ).toBe(true);
    });

    it('reports an unsaved empty draft when it is cleared during restoration', async () => {
        await generate();
        await type('Manual draft');
        await generated();
        await type('');
        await upload(0);
        expectDraft('');
        expect(wrapper.find('[role="alert"]').text()).toContain(
            'Add some text',
        );
        expect(wrapper.find('.cl-meta').text()).not.toContain(
            'Saved to server',
        );
    });

    it('retains a failed detached restoration for the next editor to retry', async () => {
        await type('Detached draft');
        await generate();
        wrapper.unmount();
        await generated();
        await upload(0, 500);
        await open();
        expectDraft('Detached draft');
        expect(wrapper.find('[role="alert"]').text()).toContain('not saved');
        await wrapper.find('.editor__save-retry').trigger('click');
        await flushPromises();
        await upload(1);
        expect(stored.get(job.duplicateKey)).toBe('Detached draft');
    });

    it('restores manual work after a failed generation response', async () => {
        await generate();
        await type('Manual after request');
        generations[0]!.response.resolve(
            json({ error: 'Synthetic provider failure' }, 500),
        );
        await flushPromises();
        expectDraft('Manual after request');
        expect(uploads[0]!.text).toBe('Manual after request');
        await upload(0);
        expect(stored.get(job.duplicateKey)).toBe('Manual after request');
    });

    it.each([500, 200])(
        'retains an unsaved cleared draft after a failed or invalid response (%i)',
        async (status) => {
            await type('Original');
            await generate();
            await type('');
            generations[0]!.response.resolve(
                json({ error: 'Synthetic invalid generation' }, status),
            );
            await flushPromises();
            expectDraft('');
            expect(wrapper.find('[role="alert"]').text()).toContain(
                'Add some text',
            );
            expect(uploads).toHaveLength(0);
            wrapper.unmount();
            await flushPromises();
            await open();
            expectDraft('');
            expect(wrapper.find('[role="alert"]').text()).toContain(
                'Add some text',
            );
            expect(
                (
                    wrapper.find('.editor__save-retry')
                        .element as HTMLButtonElement
                ).disabled,
            ).toBe(true);
        },
    );

    it('waits for generation reconciliation before downloading the current letter', async () => {
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:synthetic'),
            revokeObjectURL: vi.fn(),
        });
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => {});
        const pdfRequests = () =>
            vi
                .mocked(fetch)
                .mock.calls.filter(
                    ([url, init]) =>
                        typeof url === 'string' &&
                        url.includes('/cover-letters/') &&
                        init?.method !== 'POST',
                );
        await generate();
        await type('Draft to download');
        await wrapper.find('.app-editor-header__back').trigger('click');
        await wrapper
            .find('[aria-label="Download cover letter"]')
            .trigger('click');
        await generated();
        expect(pdfRequests()).toHaveLength(0);
        expect(click).not.toHaveBeenCalled();
        await upload(0);
        expect(stored.get(job.duplicateKey)).toBe('Draft to download');
        expect(pdfRequests()).toHaveLength(1);
        expect(click).toHaveBeenCalledOnce();
    });

    it('applies a legacy unacknowledged generation and keeps its debounced upload', async () => {
        await generate();
        generations[0]!.response.resolve(
            json({ coverLetter: 'Generated result' }),
        );
        await flushPromises();
        expectDraft('Generated result');
        expect(uploads).toHaveLength(0);
        await debounce();
        expect(uploads[0]!.text).toBe('Generated result');
        await upload(0);
        expect(stored.get(job.duplicateKey)).toBe('Generated result');
    });
});
