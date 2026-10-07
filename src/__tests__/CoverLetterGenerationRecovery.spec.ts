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
    sourceJobId: 'generation-recovery',
    sourceUrl: 'https://example.com/jobs/generation-recovery',
    title: 'Synthetic Engineer',
    company: 'Example Company',
    location: 'Berlin',
    descriptionText: 'Synthetic job.',
    postedAt: 'Today',
    scrapedAt: '2026-10-06',
    tags: [],
    duplicateKey: 'example:generation-recovery',
    companyAddresses: [],
    embedding: [],
};
const draftKey = `jobmatch.coverletter.${job.duplicateKey}`;
const errorMessage = 'Could not generate a cover letter. Please try again.';
const json = (body: unknown = {}, status = 200) =>
    new Response(JSON.stringify(body), { status });

describe('cover-letter generation failure recovery', () => {
    let wrapper: ReturnType<typeof mount>;
    let saves: ReturnType<typeof createCoverLetterSaves>;
    let generations: ReturnType<typeof deferred<Response>>[];
    let uploads: string[];
    let failRestoration: boolean;

    async function open() {
        wrapper = mount(ApplicationEditorPage, {
            props: { job },
            global: { provide: { [coverLetterSavesKey as symbol]: saves } },
        });
        await flushPromises();
        await wrapper.find('.cl-action__row').trigger('click');
    }

    async function generate() {
        await wrapper.find('.cl-generate').trigger('click');
        await flushPromises();
    }

    async function fail(index = 0) {
        generations[index]!.reject(new TypeError('Failed to fetch'));
        await flushPromises();
    }

    function expectDraft(text: string) {
        expect(
            (wrapper.find('.cl-textarea').element as HTMLTextAreaElement).value,
        ).toBe(text);
        expect(localStorage.getItem(draftKey)).toBe(text);
    }

    function expectAvailable() {
        expect(
            (wrapper.find('.cl-generate').element as HTMLButtonElement)
                .disabled,
        ).toBe(false);
    }

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        saves = createCoverLetterSaves();
        generations = [];
        uploads = [];
        failRestoration = false;
        localStorage.setItem(draftKey, 'Existing manual draft');
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: string, init?: RequestInit) => {
                if (input.endsWith('/cover-letters/create/text')) {
                    const response = deferred<Response>();
                    generations.push(response);
                    return response.promise;
                }
                if (input.endsWith('/cover-letters/upload/text')) {
                    const body = JSON.parse(init!.body as string) as {
                        coverLetterText: string;
                    };
                    uploads.push(body.coverLetterText);
                    return json({}, failRestoration ? 500 : 200);
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

    it.each(['HTTP', 'network', 'invalid response'] as const)(
        'shows a safe alert after a %s failure and preserves manual work',
        async (failure) => {
            await generate();
            await wrapper.find('.cl-textarea').setValue('New manual work');
            if (failure === 'network') {
                await fail();
            } else {
                generations[0]!.resolve(
                    json(
                        { error: 'Private provider details' },
                        failure === 'HTTP' ? 500 : 200,
                    ),
                );
                await flushPromises();
            }
            const alert = wrapper.find('.cl-generation-error');
            expect(alert.attributes('role')).toBe('alert');
            expect(alert.text()).toBe(errorMessage);
            expect(wrapper.text()).not.toContain('Private provider details');
            expect(wrapper.text()).not.toContain('Failed to fetch');
            expect(
                wrapper.find('.cl-generate').attributes('aria-describedby'),
            ).toBe(alert.attributes('id'));
            expectDraft('New manual work');
            expect(uploads).toEqual(['New manual work']);
            expectAvailable();
        },
    );

    it('clears the error for a retry, prevents duplicate attempts, and accepts success', async () => {
        await generate();
        await fail();
        expect(wrapper.find('.cl-generation-error').text()).toBe(errorMessage);
        await generate();
        expect(wrapper.find('.cl-generation-error').exists()).toBe(false);
        expect(
            (wrapper.find('.cl-generate').element as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        await generate();
        expect(generations).toHaveLength(2);
        generations[1]!.resolve(
            json({ coverLetter: 'Successful retry', saved: true }),
        );
        await flushPromises();
        expectDraft('Successful retry');
        expect(wrapper.find('.cl-generation-error').exists()).toBe(false);
        expect(wrapper.find('.cl-meta').text()).toContain('Saved to server');
        expectAvailable();
    });

    it('keeps a repeated failed retry available without replacing the draft', async () => {
        await generate();
        await fail();
        await generate();
        await fail(1);
        expect(wrapper.find('.cl-generation-error').text()).toBe(errorMessage);
        expectDraft('Existing manual draft');
        expectAvailable();
    });

    it('keeps generation failure distinct from a failed draft restoration', async () => {
        failRestoration = true;
        await generate();
        await fail();
        expect(wrapper.find('.cl-generation-error').text()).toBe(errorMessage);
        expect(wrapper.find('.editor__save-retry').exists()).toBe(true);
        expect(
            wrapper.find('.generation-notice [role="alert"]').text(),
        ).toContain('Your draft is not saved to the server.');
        expectDraft('Existing manual draft');
        expectAvailable();
        failRestoration = false;
        await wrapper.find('.editor__save-retry').trigger('click');
        await flushPromises();
        expect(wrapper.find('.editor__save-retry').exists()).toBe(false);
        expect(wrapper.find('.cl-generation-error').text()).toBe(errorMessage);
    });

    it('clears a displayed error on job change, deactivation and outer Back', async () => {
        await generate();
        await fail();
        await wrapper.setProps({ active: false });
        expect(wrapper.find('.cl-generation-error').exists()).toBe(false);
        await wrapper.setProps({ active: true });
        await generate();
        await fail(1);
        await wrapper.setProps({
            job: { ...job, duplicateKey: 'example:other' },
        });
        await wrapper.find('.cl-action__row').trigger('click');
        expect(wrapper.find('.cl-generation-error').exists()).toBe(false);
        await generate();
        await fail(2);
        await wrapper.find('.app-editor-header__back').trigger('click');
        await wrapper.find('.app-editor-header__back').trigger('click');
        expect(wrapper.emitted('back')).toHaveLength(1);
        await wrapper.find('.cl-action__row').trigger('click');
        expect(wrapper.find('.cl-generation-error').exists()).toBe(false);
    });

    it.each(['deactivation', 'job A/B/A', 'outer Back', 'unmount'] as const)(
        'ignores a late failure after %s and restores retry availability',
        async (lifecycle) => {
            await generate();
            if (lifecycle === 'deactivation') {
                await wrapper.setProps({ active: false });
                await wrapper.setProps({ active: true });
            } else if (lifecycle === 'job A/B/A') {
                await wrapper.setProps({
                    job: { ...job, duplicateKey: 'example:other' },
                });
                await wrapper.setProps({ job });
                await wrapper.find('.cl-action__row').trigger('click');
            } else if (lifecycle === 'outer Back') {
                await wrapper.find('.app-editor-header__back').trigger('click');
                await wrapper.find('.app-editor-header__back').trigger('click');
                await wrapper.find('.cl-action__row').trigger('click');
            } else {
                wrapper.unmount();
                await open();
            }
            await fail();
            expect(wrapper.find('.cl-generation-error').exists()).toBe(false);
            expectDraft('Existing manual draft');
            expectAvailable();
        },
    );
});
