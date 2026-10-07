import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import MatchPage from '@/pages/match/MatchPage.vue';
import type { ScrapedJob } from '@/components/jobCard/types';
import {
    createDeferred as deferredResponse,
    createSseResponse,
    swipeTopCard,
} from './testUtils';

const job: ScrapedJob = {
    sourceHostname: 'example.com',
    sourceJobId: 'save-lifecycle',
    sourceUrl: 'https://example.com/jobs/save-lifecycle',
    title: 'Synthetic Engineer',
    company: 'Example Company',
    location: 'Berlin',
    descriptionText: 'Synthetic test job.',
    postedAt: 'Today',
    scrapedAt: '2026-10-01T10:00:00.000Z',
    tags: [],
    duplicateKey: 'example:save-lifecycle',
    companyAddresses: [],
    embedding: [],
};
const secondJob = { ...job, duplicateKey: 'example:second-job' };

function jsonResponse(body: unknown = {}, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

describe('cover-letter saves across editor lifetimes', () => {
    let wrapper: ReturnType<typeof mount>;
    let uploads: {
        text: string;
        key: string;
        response: ReturnType<typeof deferredResponse<Response>>;
    }[];
    let storedText: Map<string, string>;

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.localStorage.setItem('jobmatch.searchkeywords', '["engineer"]');
        uploads = [];
        storedText = new Map();
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: string, init?: RequestInit) => {
                if (input.endsWith('/scrape/linkedin')) {
                    return createSseResponse([
                        { type: 'job', job },
                        { type: 'job', job: secondJob },
                    ]);
                }
                if (input.endsWith('/cover-letters/upload/text')) {
                    const body = JSON.parse(init!.body as string) as {
                        coverLetterText: string;
                        jobDuplicateKey: string;
                    };
                    const response = deferredResponse<Response>();
                    uploads.push({
                        text: body.coverLetterText,
                        key: body.jobDuplicateKey,
                        response,
                    });
                    const result = await response.promise;
                    if (result.ok)
                        storedText.set(
                            body.jobDuplicateKey,
                            body.coverLetterText,
                        );
                    return result;
                }
                return jsonResponse();
            }),
        );
        wrapper = mount(MatchPage);
        await flushPromises();
    });

    afterEach(() => {
        wrapper.unmount();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        window.localStorage.clear();
    });

    async function openLetter() {
        await wrapper.find('.like-container__button--edit').trigger('click');
        await wrapper.find('.cl-action__row').trigger('click');
    }

    async function typeLetter(text: string) {
        await wrapper.find('.cl-textarea').setValue(text);
    }

    async function closeEditor() {
        await wrapper.find('.app-editor-header__back').trigger('click');
        await wrapper.find('.app-editor-header__back').trigger('click');
        await wrapper
            .find('#application-editor-dialog')
            .trigger('transitionend', {
                propertyName: 'visibility',
            });
        await flushPromises();
    }

    async function debounce() {
        await vi.advanceTimersByTimeAsync(3000);
        await flushPromises();
    }

    it.each([200, 500])(
        'saves only the newest reopened draft after an old request ends with %i',
        async (status) => {
            await openLetter();
            await typeLetter('Draft A');
            await debounce();
            expect(uploads.map((upload) => upload.text)).toEqual(['Draft A']);

            await typeLetter('Draft B');
            await closeEditor();
            await openLetter();
            await typeLetter('Draft C');
            await debounce();

            // Reopening must join the pending write, not race it with a second request.
            expect(uploads.map((upload) => upload.text)).toEqual(['Draft A']);
            expect(wrapper.find('.cl-meta').text()).not.toContain(
                'Saved to server',
            );

            uploads[0]!.response.resolve(
                jsonResponse({ error: 'Synthetic failure' }, status),
            );
            await flushPromises();
            expect(uploads.map((upload) => upload.text)).toEqual([
                'Draft A',
                'Draft C',
            ]);
            expect(wrapper.find('.cl-meta').text()).toContain('Saving…');
            expect(wrapper.find('.cl-meta').text()).not.toContain(
                'Saved to server',
            );

            uploads[1]!.response.resolve(jsonResponse());
            await flushPromises();
            await debounce();
            expect(storedText.get(job.duplicateKey)).toBe('Draft C');
            expect(
                window.localStorage.getItem(
                    `jobmatch.coverletter.${job.duplicateKey}`,
                ),
            ).toBe('Draft C');
            expect(wrapper.find('.cl-meta').text()).toContain(
                'Saved to server',
            );
            expect(uploads.map((upload) => upload.text)).toEqual([
                'Draft A',
                'Draft C',
            ]);
        },
    );

    it('does not call a restored draft saved while a different revision is still uploading', async () => {
        await openLetter();
        await typeLetter('Original draft');
        await debounce();
        uploads[0]!.response.resolve(jsonResponse());
        await flushPromises();
        expect(wrapper.find('.cl-meta').text()).toContain('Saved to server');

        await typeLetter('Intermediate draft');
        await debounce();
        await typeLetter('Original draft');
        await closeEditor();
        await openLetter();
        await debounce();
        expect(wrapper.find('.cl-meta').text()).not.toContain(
            'Saved to server',
        );
        expect(uploads).toHaveLength(2);

        uploads[1]!.response.resolve(jsonResponse());
        await flushPromises();
        expect(uploads.map((upload) => upload.text)).toEqual([
            'Original draft',
            'Intermediate draft',
            'Original draft',
        ]);
        expect(wrapper.find('.cl-meta').text()).not.toContain(
            'Saved to server',
        );
        uploads[2]!.response.resolve(jsonResponse());
        await flushPromises();
        expect(storedText.get(job.duplicateKey)).toBe('Original draft');
        expect(wrapper.find('.cl-meta').text()).toContain('Saved to server');
    });

    it('lets another job save independently while the previous job is pending', async () => {
        await openLetter();
        await typeLetter('First job draft');
        await debounce();
        await closeEditor();
        swipeTopCard(wrapper);
        await flushPromises();
        await openLetter();
        await typeLetter('Second job draft');
        await debounce();
        expect(uploads.map((upload) => upload.key)).toEqual([
            job.duplicateKey,
            secondJob.duplicateKey,
        ]);
        uploads[1]!.response.resolve(jsonResponse());
        await flushPromises();
        uploads[0]!.response.resolve(jsonResponse());
        await flushPromises();
        expect(storedText.get(secondJob.duplicateKey)).toBe('Second job draft');
        expect(wrapper.find('.cl-meta').text()).toContain('Saved to server');
    });
});
