import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import MatchPage from '@/pages/match/MatchPage.vue';
import { APPLICATION_EDITOR_DIALOG_ID } from '@/components/application';
import type { ScrapedJob } from '@/components/jobCard/types';
import { createDeferred as deferred, createSseResponse } from './testUtils';

const job: ScrapedJob = {
    sourceHostname: 'example.com',
    sourceJobId: 'escape',
    sourceUrl: 'https://example.com/escape',
    title: 'Synthetic Engineer',
    company: 'Example',
    location: 'Berlin',
    postedAt: 'Today',
    scrapedAt: '2026-10-01',
    tags: [],
    duplicateKey: 'example:escape',
    companyAddresses: [],
    embedding: [],
    match: 1,
};
const draft = 'Selected sentence. Remaining sentence.';
const storageKey = `jobmatch.coverletter.${job.duplicateKey}`;

describe('nested revision Escape in the full MatchPage', () => {
    let wrapper: ReturnType<typeof mount<typeof MatchPage>>;
    let revisions: {
        signal: AbortSignal;
        response: ReturnType<typeof deferred<Response>>;
    }[];
    beforeEach(() => {
        revisions = [];
        window.localStorage.setItem(
            'jobmatch.searchkeywords',
            JSON.stringify(['engineer']),
        );
        window.localStorage.setItem(storageKey, draft);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string, init?: RequestInit) => {
                if (url.endsWith('/scrape/linkedin'))
                    return Promise.resolve(
                        createSseResponse([{ type: 'job', job }]),
                    );
                if (url.endsWith('/cover-letters/revise/text')) {
                    const response = deferred<Response>();
                    revisions.push({
                        signal: init!.signal as AbortSignal,
                        response,
                    });
                    return response.promise; // Deliberately ignore abort to test late completion guards.
                }
                if (url.endsWith('/status'))
                    return Promise.resolve(new Response('{}', { status: 404 }));
                return Promise.resolve(new Response('{}', { status: 201 }));
            }),
        );
    });
    afterEach(async () => {
        wrapper?.unmount();
        await flushPromises();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        window.localStorage.clear();
    });
    const dialog = () => wrapper.find(`#${APPLICATION_EDITOR_DIALOG_ID}`);
    const textarea = () => wrapper.find<HTMLTextAreaElement>('.cl-textarea');
    const launcher = () => wrapper.find('.like-container__button--edit');
    async function open(letter = true) {
        wrapper = mount(MatchPage, { attachTo: document.body });
        await flushPromises();
        await launcher().trigger('click');
        await flushPromises();
        if (letter) await wrapper.find('.cl-action__row').trigger('click');
        await flushPromises();
    }
    async function select() {
        textarea().element.focus();
        textarea().element.setSelectionRange(0, 18);
        await textarea().trigger('select');
        const instruction = wrapper.find<HTMLInputElement>(
            '.cl-revision__instruction',
        );
        await instruction.setValue('Make it clear.');
        instruction.element.focus();
        return instruction;
    }
    async function escape(element: Element) {
        const event = new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        });
        element.dispatchEvent(event);
        await flushPromises();
        return event;
    }
    async function finishOuterClose() {
        await dialog().trigger('transitionend', { propertyName: 'visibility' });
        await flushPromises();
    }
    async function startRevision() {
        await select();
        await wrapper.find('.cl-revision').trigger('submit');
        await flushPromises();
    }

    it.each(['instruction', 'textarea'] as const)(
        'dismisses from %s first, restores editing focus, then closes the outer editor',
        async (target) => {
            await open();
            const instruction = await select();
            const event = await escape(
                target === 'instruction'
                    ? instruction.element
                    : textarea().element,
            );
            expect(event.defaultPrevented).toBe(true);
            expect(wrapper.find('.cl-revision').exists()).toBe(false);
            expect(dialog().classes()).toContain('overlay--open');
            expect(document.activeElement).toBe(textarea().element);
            expect(textarea().element.value).toBe(draft);
            expect(textarea().element.selectionStart).toBe(
                textarea().element.selectionEnd,
            );
            expect(window.localStorage.getItem(storageKey)).toBe(draft);
            await escape(textarea().element);
            expect(dialog().classes()).not.toContain('overlay--open');
            await finishOuterClose();
            expect(document.activeElement).toBe(launcher().element);
            expect(
                wrapper.find('.match-page').attributes('inert'),
            ).toBeUndefined();
        },
    );

    it('clears instruction state before a newly selected form is opened', async () => {
        await open();
        await select();
        await escape(textarea().element);
        textarea().element.setSelectionRange(0, 18);
        await textarea().trigger('select');
        expect(
            wrapper.find<HTMLInputElement>('.cl-revision__instruction').element
                .value,
        ).toBe('');
        expect(
            wrapper.find('.cl-revision__apply').attributes('disabled'),
        ).toBeDefined();
    });

    it('aborts a pending revision on first Escape and ignores a late success', async () => {
        await open();
        await startRevision();
        const cancel = wrapper.find('.cl-revision__cancel');
        expect(cancel.attributes('disabled')).toBeUndefined();
        expect(document.activeElement).toBe(cancel.element);
        await escape(cancel.element);
        expect(revisions[0]!.signal.aborted).toBe(true);
        expect(dialog().classes()).toContain('overlay--open');
        expect(document.activeElement).toBe(textarea().element);
        expect(textarea().element.disabled).toBe(false);
        revisions[0]!.response.resolve(
            new Response(JSON.stringify({ replacementText: 'Stale rewrite.' })),
        );
        await flushPromises();
        expect(textarea().element.value).toBe(draft);
        expect(window.localStorage.getItem(storageKey)).toBe(draft);
        expect(wrapper.find('.cl-revision').exists()).toBe(false);
    });

    it('keeps a new revision pending when a cancelled one later rejects', async () => {
        await open();
        await startRevision();
        await escape(wrapper.find('.cl-revision__cancel').element);
        await startRevision();
        expect(revisions).toHaveLength(2);
        revisions[0]!.response.reject(new Error('Late provider failure'));
        await flushPromises();
        expect(textarea().element.disabled).toBe(true);
        expect(wrapper.find('.cl-revision__error').exists()).toBe(false);
        revisions[1]!.response.resolve(
            new Response(
                JSON.stringify({ replacementText: 'Current rewrite.' }),
            ),
        );
        await flushPromises();
        expect(textarea().element.value).toBe(
            'Current rewrite. Remaining sentence.',
        );
    });

    it('also cancels a pending revision with its visible Cancel control', async () => {
        await open();
        await startRevision();
        await wrapper.find('.cl-revision__cancel').trigger('click');
        await flushPromises();
        expect(revisions[0]!.signal.aborted).toBe(true);
        expect(dialog().classes()).toContain('overlay--open');
        expect(document.activeElement).toBe(textarea().element);
    });

    it.each([false, true])(
        'closes outer menu/letter without an inner form (letter=%s)',
        async (letter) => {
            await open(letter);
            await escape(
                letter
                    ? textarea().element
                    : dialog().find('.app-editor-header__back').element,
            );
            expect(dialog().classes()).not.toContain('overlay--open');
            await finishOuterClose();
            expect(document.activeElement).toBe(launcher().element);
        },
    );

    it('respects a child that has already prevented Escape', async () => {
        await open();
        textarea().element.addEventListener(
            'keydown',
            (event) => event.preventDefault(),
            { once: true },
        );
        await escape(textarea().element);
        expect(dialog().classes()).toContain('overlay--open');
    });

    it('keeps capture Tab trapping and focus containment while the inner form is open', async () => {
        await open();
        await select();
        const first = dialog().find<HTMLButtonElement>(
            '.app-editor-header__back',
        );
        const last = wrapper.find<HTMLButtonElement>('.cl-generate');
        first.element.focus();
        first.element.addEventListener(
            'keydown',
            (event) => event.stopPropagation(),
            { once: true },
        );
        await first.trigger('keydown', { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(last.element);
        await last.trigger('keydown', { key: 'Tab' });
        expect(document.activeElement).toBe(first.element);
        wrapper.find<HTMLElement>('.match-page').element.focus();
        expect(document.activeElement).toBe(dialog().find('h1').element);
        expect(wrapper.find('.cl-revision').exists()).toBe(true);
    });

    it('preserves Search Escape and launcher focus restoration', async () => {
        window.localStorage.removeItem('jobmatch.searchkeywords');
        wrapper = mount(MatchPage, { attachTo: document.body });
        const trigger = wrapper.find('.match-empty__cta');
        await trigger.trigger('click');
        const search = wrapper.find('#search-dialog');
        await escape(search.find('#se-input').element);
        expect(search.classes()).not.toContain('overlay--open');
        await search.trigger('transitionend', { propertyName: 'visibility' });
        await flushPromises();
        expect(document.activeElement).toBe(trigger.element);
    });
});
