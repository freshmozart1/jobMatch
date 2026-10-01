import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import MatchPage from '@/pages/match/MatchPage.vue';
import type { ScrapedJob } from '@/components/jobCard/types';
import { swipeTopCard } from './testUtils';

function job(key: string, match: number): ScrapedJob {
    return {
        sourceHostname: 'example.com',
        sourceJobId: key,
        sourceUrl: `https://example.com/jobs/${key}`,
        title: `Job ${key}`,
        company: 'Example',
        location: 'Berlin',
        descriptionText: 'Synthetic job.',
        postedAt: 'Today',
        scrapedAt: '2026-10-01',
        tags: [],
        duplicateKey: key,
        companyAddresses: [],
        embedding: [],
        match,
    };
}
const jobs = [job('A', 0.9), job('B', 0.8), job('C', 0.3), job('D', 0.7)];
function controlledStream() {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let settled = false;
    const encoder = new TextEncoder();
    const response = new Response(
        new ReadableStream<Uint8Array>({
            start(c) {
                controller = c;
            },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
    );
    return {
        response,
        push(value: ScrapedJob) {
            controller.enqueue(
                encoder.encode(
                    `data: ${JSON.stringify({ type: 'job', job: value })}\n\n`,
                ),
            );
        },
        close() {
            if (!settled) {
                settled = true;
                controller.close();
            }
        },
        abort() {
            if (!settled) {
                settled = true;
                controller.error(new DOMException('Aborted', 'AbortError'));
            }
        },
    };
}

describe('consumed jobs across filtered views', () => {
    let wrapper: ReturnType<typeof mount>;
    let streams: ReturnType<typeof controlledStream>[];
    let ratings: { job: ScrapedJob; like: boolean }[];
    beforeEach(async () => {
        localStorage.setItem('jobmatch.searchkeywords', '["engineer"]');
        streams = [];
        ratings = [];
        vi.stubGlobal(
            'fetch',
            vi.fn((input: string, init?: RequestInit) => {
                if (input.endsWith('/scrape/linkedin')) {
                    const stream = controlledStream();
                    streams.push(stream);
                    init?.signal?.addEventListener('abort', () =>
                        stream.abort(),
                    );
                    return Promise.resolve(stream.response);
                }
                if (input.endsWith('/jobs/create'))
                    ratings.push(JSON.parse(init!.body as string));
                return Promise.resolve(new Response('{}'));
            }),
        );
        wrapper = mount(MatchPage);
        await flushPromises();
    });
    afterEach(async () => {
        wrapper.unmount();
        await flushPromises();
        vi.unstubAllGlobals();
        localStorage.clear();
    });
    async function push(...values: ScrapedJob[]) {
        values.forEach((v) => streams[streams.length - 1]!.push(v));
        await flushPromises();
    }
    function current() {
        return wrapper.find('.job-card-stack__current h2').text();
    }
    async function swipe() {
        swipeTopCard(wrapper);
        await flushPromises();
    }
    async function toggle() {
        await wrapper.find('.match-filter__switch').trigger('click');
    }
    async function threshold(value: number) {
        await wrapper.find('.match-filter__num input').setValue(value);
    }

    it('never repeats or skips cards across filter toggles and threshold changes', async () => {
        await push(...jobs);
        streams[0]!.close();
        await flushPromises();
        expect(current()).toBe('Job A');
        await swipe();
        expect(current()).toBe('Job B');
        await toggle();
        expect(current()).toBe('Job B');
        await threshold(85);
        expect(wrapper.find('.job-card-stack__current').exists()).toBe(false);
        await threshold(25);
        expect(current()).toBe('Job B');
        await swipe();
        expect(current()).toBe('Job C');
        await swipe();
        expect(current()).toBe('Job D');
        await toggle();
        expect(current()).toBe('Job D');
        await swipe();
        await toggle();
        await threshold(0);
        expect(wrapper.find('.job-card-stack__current').exists()).toBe(false);
        expect(ratings.map((r) => r.job.duplicateKey)).toEqual([
            'A',
            'B',
            'C',
            'D',
        ]);
    });

    it('reveals unswiped hidden jobs after lowering the threshold', async () => {
        await push(jobs[2]!, jobs[0]!, jobs[1]!);
        await toggle();
        expect(current()).toBe('Job A');
        await swipe();
        expect(current()).toBe('Job B');
        await threshold(20);
        expect(current()).toBe('Job C');
        await swipe();
        expect(current()).toBe('Job B');
        await swipe();
        await toggle();
        expect(wrapper.find('.job-card-stack__current').exists()).toBe(false);
        expect(ratings.map((r) => r.job.duplicateKey)).toEqual(['A', 'C', 'B']);
    });

    it('refills an exhausted filtered stream without resurrecting duplicates', async () => {
        await push(jobs[0]!);
        await swipe();
        expect(wrapper.find('.job-card-stack__loading').exists()).toBe(true);
        await push(jobs[0]!, jobs[2]!);
        await toggle();
        expect(wrapper.find('.job-card-stack__current').exists()).toBe(false);
        await push(jobs[1]!);
        expect(current()).toBe('Job B');
        await swipe();
        await threshold(20);
        expect(current()).toBe('Job C');
        await swipe();
        streams[0]!.close();
        await flushPromises();
        expect(wrapper.find('.job-card-stack__empty').exists()).toBe(true);
        expect(ratings.map((r) => r.job.duplicateKey)).toEqual(['A', 'B', 'C']);
    });

    it('keeps only unswiped partial results after cancellation', async () => {
        await push(jobs[0]!, jobs[1]!);
        await swipe();
        await toggle();
        await threshold(95);
        await wrapper.find('.scrape-cancel').trigger('click');
        await flushPromises();
        await threshold(50);
        expect(current()).toBe('Job B');
        await swipe();
        await toggle();
        expect(wrapper.find('.job-card-stack__empty').text()).toBe(
            'Search stopped',
        );
        expect(ratings.map((r) => r.job.duplicateKey)).toEqual(['A', 'B']);
    });

    it('resets consumed keys when a new search starts', async () => {
        await push(jobs[0]!, jobs[1]!);
        await swipe();
        await wrapper.find('.match-filter__search').trigger('click');
        localStorage.setItem('jobmatch.searchdateposted', 'week');
        wrapper.findComponent({ name: 'SearchPage' }).vm.$emit('back');
        await flushPromises();
        expect(streams).toHaveLength(2);
        await push(jobs[0]!, jobs[1]!);
        expect(current()).toBe('Job A');
        await swipe();
        expect(current()).toBe('Job B');
        expect(ratings.map((r) => r.job.duplicateKey)).toEqual(['A', 'A']);
    });
});
