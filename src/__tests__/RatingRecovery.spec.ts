import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import MatchPage from '@/pages/match/MatchPage.vue';
import JobCardContainer from '@/components/jobCard/JobCardContainer.vue';
import type { ScrapedJob } from '@/components/jobCard/types';
import { createSseResponse } from './testUtils';

const jobs: ScrapedJob[] = ['A', 'B', 'C'].map((key, index) => ({
    sourceHostname: 'example.com',
    sourceJobId: key,
    sourceUrl: `https://example.com/jobs/${key}`,
    title: `Job ${key}`,
    company: `Company ${key}`,
    location: 'Berlin',
    descriptionText: 'Synthetic job.',
    postedAt: 'Today',
    scrapedAt: '2026-10-01',
    tags: ['original'],
    duplicateKey: key,
    companyAddresses: [
        {
            streetAddress: 'Original street',
            city: 'Berlin',
            postalCode: '12345',
            countryCode: 'DE',
        },
    ],
    embedding: [1, 0],
    match: 0.9 - index * 0.1,
}));
type Payload = { job: ScrapedJob; like: boolean };
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
const json = (status = 200) =>
    new Response(JSON.stringify({ error: 'Synthetic failure' }), { status });
const stream = (values = jobs) =>
    createSseResponse(values.map((job) => ({ type: 'job', job })));

describe('failed rating recovery', () => {
    let wrapper: ReturnType<typeof mount>;
    let attempts: {
        payload: Payload;
        response: ReturnType<typeof deferred<Response>>;
    }[];
    let acknowledged: Payload[];
    let stored: Map<string, boolean>;
    let scrapeCount: number;
    let nextScrape: Response | Promise<Response>;

    beforeEach(async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem('jobmatch.searchkeywords', '["engineer"]');
        attempts = [];
        acknowledged = [];
        stored = new Map();
        scrapeCount = 0;
        nextScrape = stream();
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: string, init?: RequestInit) => {
                if (input.endsWith('/scrape/linkedin')) {
                    scrapeCount++;
                    return nextScrape;
                }
                if (input.endsWith('/jobs/create')) {
                    const payload = JSON.parse(init!.body as string) as Payload;
                    const response = deferred<Response>();
                    attempts.push({ payload, response });
                    const result = await response.promise;
                    if (result.ok) {
                        stored.set(payload.job.duplicateKey, payload.like);
                        acknowledged.push(payload);
                    }
                    return result;
                }
                return json();
            }),
        );
        wrapper = mount(MatchPage);
        await flushPromises();
    });
    afterEach(async () => {
        wrapper.unmount();
        await flushPromises();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });
    async function rate(like = true) {
        const card = wrapper.find('.job-card-stack__current .job-card');
        await wrapper
            .find(`.like-container__button--${like ? 'like' : 'dislike'}`)
            .trigger('click');
        await card.trigger('transitionend');
        await flushPromises();
    }
    const row = (key: string) => wrapper.find(`[data-rating-key="${key}"]`);
    async function settle(index: number, status = 200) {
        attempts[index]!.response.resolve(json(status));
        await flushPromises();
    }
    async function retry(key: string) {
        await row(key).find('button').trigger('click');
        await flushPromises();
    }
    async function newSearch(
        response: Response | Promise<Response>,
        date = 'week',
    ) {
        nextScrape = response;
        await wrapper.find('.match-filter__search').trigger('click');
        localStorage.setItem('jobmatch.searchdateposted', date);
        wrapper.findComponent({ name: 'SearchPage' }).vm.$emit('back');
        await flushPromises();
    }

    it.each([
        { like: true, failure: 'http' },
        { like: false, failure: 'http' },
        { like: true, failure: 'network' },
        { like: false, failure: 'network' },
    ])(
        'retains and retries like=$like after $failure failure without overlap or rescrape',
        async ({ like, failure }) => {
            await rate(like);
            expect(wrapper.find('.job-card-stack__current h2').text()).toBe(
                'Job B',
            );
            if (failure === 'http') await settle(0, 500);
            else {
                attempts[0]!.response.reject(new TypeError('Offline'));
                await flushPromises();
            }
            expect(row('A').find('[role="alert"]').text()).toContain(
                like ? 'Like' : 'Dislike',
            );
            expect(row('A').text()).toContain('Job A');
            await retry('A');
            await retry('A');
            expect(attempts).toHaveLength(2);
            expect(
                (row('A').find('button').element as HTMLButtonElement).disabled,
            ).toBe(true);
            expect(row('A').text()).toContain('Retrying');
            expect(attempts[1]!.payload).toEqual({ job: jobs[0], like });
            await settle(1);
            expect(row('A').exists()).toBe(false);
            expect(stored.get('A')).toBe(like);
            expect(acknowledged).toEqual([{ job: jobs[0], like }]);
            expect(scrapeCount).toBe(1);
            wrapper
                .findComponent({ name: 'RatingSaveStatus' })
                .vm.$emit('retry', 'A');
            await flushPromises();
            expect(attempts).toHaveLength(2);
        },
    );

    it('captures nested job data rather than retrying a mutable live card', async () => {
        const original = wrapper
            .findComponent(JobCardContainer)
            .props('job') as ScrapedJob;
        await rate(false);
        await settle(0, 500);
        original.title = 'Changed later';
        if (!original.tags) throw new Error('Expected fixture tags.');
        original.tags[0] = 'changed';
        original.embedding[0] = 99;
        original.companyAddresses[0]!.streetAddress = 'Changed later';
        await retry('A');
        expect(attempts[1]!.payload).toEqual(attempts[0]!.payload);
        await settle(1);
        expect(stored.get('A')).toBe(false);
    });

    it('keeps independent failed jobs and removes only the acknowledged retry', async () => {
        await rate(true);
        await rate(false);
        await settle(1, 500);
        await settle(0, 500);
        expect(row('A').exists()).toBe(true);
        expect(row('B').exists()).toBe(true);
        await retry('A');
        await retry('B');
        await settle(2);
        expect(row('A').exists()).toBe(false);
        expect(row('B').exists()).toBe(true);
        expect(
            (row('B').find('button').element as HTMLButtonElement).disabled,
        ).toBe(true);
        await settle(3);
        expect(row('B').exists()).toBe(false);
        expect([...stored]).toEqual([
            ['A', true],
            ['B', false],
        ]);
    });

    it('preserves the original failed choice across filters, a new search and duplicate frames', async () => {
        await rate(false);
        await settle(0, 500);
        await wrapper.find('.match-filter__switch').trigger('click');
        await wrapper.find('.match-filter__num input').setValue(95);
        expect(row('A').exists()).toBe(true);
        const updatedA = { ...jobs[0]!, title: 'Rediscovered A' };
        await newSearch(stream([updatedA, updatedA, jobs[1]!]));
        await wrapper.find('.match-filter__num input').setValue(50);
        expect(wrapper.find('.job-card-stack__current h2').text()).toBe(
            'Job B',
        );
        expect(attempts).toHaveLength(1);
        await retry('A');
        expect(attempts[1]!.payload).toEqual({ job: jobs[0], like: false });
        await settle(1);
        expect(wrapper.find('.job-card-stack__current h2').text()).toBe(
            'Job B',
        );
        expect(scrapeCount).toBe(2);
        await newSearch(stream([updatedA, jobs[1]!]), 'month');
        expect(wrapper.find('.job-card-stack__current h2').text()).toBe(
            'Rediscovered A',
        );
    });

    it('allows recovery while a new scrape is loading', async () => {
        await rate();
        await settle(0, 500);
        const pendingScrape = deferred<Response>();
        await newSearch(pendingScrape.promise);
        expect(wrapper.find('.match-status-fill').exists()).toBe(true);
        expect(row('A').exists()).toBe(true);
        await retry('A');
        await settle(1);
        expect(row('A').exists()).toBe(false);
        expect(scrapeCount).toBe(2);
        pendingScrape.resolve(stream([jobs[0]!, jobs[1]!]));
        await flushPromises();
        expect(wrapper.find('.job-card-stack__current h2').text()).toBe(
            'Job B',
        );
    });

    it('allows recovery independently of a new scrape error', async () => {
        await rate();
        await settle(0, 500);
        await newSearch(json(500));
        expect(wrapper.find('.match-error').exists()).toBe(true);
        expect(row('A').exists()).toBe(true);
        await retry('A');
        await settle(1);
        expect(row('A').exists()).toBe(false);
        expect(wrapper.find('.match-error').exists()).toBe(true);
        expect(scrapeCount).toBe(2);
    });

    it('keeps an unresolved original attempt protected across a new search', async () => {
        await rate(false);
        await newSearch(stream([jobs[0]!, jobs[1]!]));
        expect(wrapper.find('.job-card-stack__current h2').text()).toBe(
            'Job B',
        );
        await rate(true);
        await settle(1, 500);
        await settle(0);
        expect(row('B').exists()).toBe(true);
        expect(stored.get('A')).toBe(false);
        expect(attempts).toHaveLength(2);
        await retry('B');
        await settle(2);
        expect(stored.get('B')).toBe(true);
    });

    it('retries an ambiguous network response with the same upsert payload', async () => {
        await rate(false);
        stored.set('A', false); // server wrote before the response was lost
        attempts[0]!.response.reject(new TypeError('Response lost'));
        await flushPromises();
        await retry('A');
        expect(attempts[1]!.payload).toEqual(attempts[0]!.payload);
        await settle(1);
        expect(stored.size).toBe(1);
        expect(stored.get('A')).toBe(false);
        expect(acknowledged).toHaveLength(1);
    });
});
