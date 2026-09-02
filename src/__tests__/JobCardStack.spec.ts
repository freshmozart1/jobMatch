import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import { JobCardStack, JobCardContainer } from '@/components';
import type { ScrapedJob } from '@/components/jobCard/types';
import { swipeTopCard } from './testUtils';

function createJob(overrides: Partial<ScrapedJob> = {}): ScrapedJob {
    return {
        sourceHostname: 'de.linkedin.com',
        sourceJobId: '1',
        sourceUrl: 'https://de.linkedin.com/jobs/view/1/',
        title: 'A Job',
        company: 'A Company',
        location: 'Hamburg',
        descriptionText: 'A description.',
        postedAt: 'Vor 1 Tag',
        scrapedAt: '2026-06-02T14:42:54.764Z',
        tags: [],
        duplicateKey: 'linkedin:1',
        companyAddresses: [
            {
                streetAddress: 'Musterstraße 1',
                city: 'Hamburg',
                postalCode: '20095',
                countryCode: 'DE',
            },
        ],
        embedding: [],
        ...overrides,
    };
}

describe('JobCardStack', () => {
    const jobs = [
        createJob({ title: 'First', duplicateKey: 'k1' }),
        createJob({ title: 'Second', duplicateKey: 'k2' }),
    ];

    it('shows the first job on top initially', () => {
        const wrapper = mount(JobCardStack, { props: { jobs } });

        expect(
            wrapper.findComponent(JobCardContainer).props('job'),
        ).toMatchObject({
            title: 'First',
        });
    });

    it('advances the index when the top card emits a swipe', async () => {
        const wrapper = mount(JobCardStack, { props: { jobs } });

        swipeTopCard(wrapper);
        await wrapper.vm.$nextTick();

        expect(
            wrapper.findComponent(JobCardContainer).props('job'),
        ).toMatchObject({
            title: 'Second',
        });
    });

    it('renders the empty state once all jobs are swiped away', async () => {
        const wrapper = mount(JobCardStack, { props: { jobs } });

        swipeTopCard(wrapper);
        await wrapper.vm.$nextTick();
        swipeTopCard(wrapper);
        await wrapper.vm.$nextTick();

        expect(wrapper.findComponent(JobCardContainer).exists()).toBe(false);
        expect(wrapper.find('.job-card-stack__empty').text()).toBe(
            'No more jobs',
        );
    });

    it('shows a loading indicator when the stack is empty and isLoading is true', () => {
        const wrapper = mount(JobCardStack, {
            props: { jobs: [], isLoading: true },
        });

        expect(wrapper.find('.job-card-stack__loading').exists()).toBe(true);
        expect(wrapper.find('.job-card-stack__empty').exists()).toBe(false);
    });

    it('shows the empty label when the stack is empty and isLoading is false', () => {
        const wrapper = mount(JobCardStack, {
            props: { jobs: [], isLoading: false },
        });

        expect(wrapper.find('.job-card-stack__empty').exists()).toBe(true);
        expect(wrapper.find('.job-card-stack__loading').exists()).toBe(false);
    });

    it('renders a cancel button beside the loading label while loading', () => {
        const wrapper = mount(JobCardStack, {
            props: { jobs: [], isLoading: true },
        });

        expect(wrapper.find('.job-card-stack__loading').text()).toBe(
            'Loading more jobs...',
        );
        expect(wrapper.find('.scrape-cancel').exists()).toBe(true);
        expect(wrapper.find('.scrape-cancel').text()).toBe('Cancel');
    });

    it('renders the cancel button after the last job is swiped away while still loading', async () => {
        const wrapper = mount(JobCardStack, {
            props: { jobs, isLoading: true },
        });

        swipeTopCard(wrapper);
        await wrapper.vm.$nextTick();
        swipeTopCard(wrapper);
        await wrapper.vm.$nextTick();

        expect(wrapper.find('.scrape-cancel').exists()).toBe(true);
    });

    it('emits cancel when the cancel button is clicked', async () => {
        const wrapper = mount(JobCardStack, {
            props: { jobs: [], isLoading: true },
        });

        await wrapper.find('.scrape-cancel').trigger('click');

        expect(wrapper.emitted('cancel')).toHaveLength(1);
    });

    it('renders no cancel button in the plain empty state', () => {
        const wrapper = mount(JobCardStack, {
            props: { jobs: [], isLoading: false },
        });

        expect(wrapper.find('.scrape-cancel').exists()).toBe(false);
    });
});
