import { describe, expect, expectTypeOf, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { JobCard } from '@/components';
import type { CompanyAddress, ScrapedJob } from '@/components/jobCard/types';
import type {
    CompanyAddress as ServerCompanyAddress,
    ScrapedJob as ServerScrapedJob,
    ScrapeStreamFrame as ServerScrapeStreamFrame,
} from '@/contracts/jobMatchServer';
import type {
    ScrapeProgressFrame,
    ScrapeStreamFrame,
} from '@/pages/match/scrapeStream';

// The API may omit every optional metadata field, including all four fields
// that previously drifted to required in the frontend.
const minimalJob = {
    sourceHostname: 'www.linkedin.com',
    sourceUrl: 'https://www.linkedin.com/jobs/view/minimal/',
    title: 'Minimal wire job',
    company: 'Example GmbH',
    scrapedAt: '2026-10-06T08:00:00.000Z',
    duplicateKey: 'linkedin:minimal',
    companyAddresses: [],
    embedding: [],
} satisfies ScrapedJob;

describe('server wire contract', () => {
    it('preserves the canonical types at the existing frontend import paths', () => {
        expectTypeOf<CompanyAddress>().toEqualTypeOf<ServerCompanyAddress>();
        expectTypeOf<ScrapedJob>().toEqualTypeOf<ServerScrapedJob>();
        expectTypeOf<ScrapeStreamFrame>().toEqualTypeOf<ServerScrapeStreamFrame>();
        expectTypeOf<ScrapeProgressFrame>().toEqualTypeOf<
            Extract<ServerScrapeStreamFrame, { type: 'progress' }>
        >();
    });

    it('requires guards before reading optional job metadata', () => {
        expectTypeOf<ScrapedJob['sourceJobId']>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<ScrapedJob['location']>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<ScrapedJob['postedAt']>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<ScrapedJob['tags']>().toEqualTypeOf<
            string[] | undefined
        >();

        // Never invoked: these unsafe reads must continue to fail type-checking.
        function unsafeMetadataReads(job: ScrapedJob) {
            return [
                // @ts-expect-error The API can omit sourceJobId.
                job.sourceJobId.toUpperCase(),
                // @ts-expect-error The API can omit location.
                job.location.toUpperCase(),
                // @ts-expect-error The API can omit postedAt.
                job.postedAt.toUpperCase(),
                // @ts-expect-error The API can omit tags.
                job.tags.map((tag) => tag.toUpperCase()),
            ];
        }
        expectTypeOf(unsafeMetadataReads)
            .parameter(0)
            .toEqualTypeOf<ScrapedJob>();
    });

    it('keeps job envelopes and progress stages discriminated', () => {
        expectTypeOf<ScrapedJob>().not.toMatchTypeOf<ScrapeStreamFrame>();
        expectTypeOf<{ type: 'job' }>().not.toMatchTypeOf<ScrapeStreamFrame>();
        expectTypeOf<{
            type: 'progress';
            keyword: string;
            stage: 'scanning';
            discovered: number;
        }>().not.toMatchTypeOf<ScrapeStreamFrame>();
        expectTypeOf<
            Extract<ScrapeProgressFrame, { stage: 'loading' }>
        >().toEqualTypeOf<{
            type: 'progress';
            keyword: string;
            stage: 'loading';
            discovered: number;
        }>();
        expectTypeOf<
            Extract<ScrapeProgressFrame, { stage: 'scanning' }>
        >().toEqualTypeOf<{
            type: 'progress';
            keyword: string;
            stage: 'scanning';
            current: number;
            total: number;
            failed: number;
            dropped: number;
        }>();
    });

    it('renders a valid wire job with absent optional metadata', () => {
        const frame = {
            type: 'job',
            job: minimalJob,
        } satisfies ScrapeStreamFrame;
        const wrapper = mount(JobCard, { props: { job: frame.job } });
        expect(wrapper.find('.job-card__title').text()).toBe(minimalJob.title);
        expect(wrapper.find('.job-card__company').text()).toBe(
            minimalJob.company,
        );
        expect(wrapper.find('.job-card__tags').exists()).toBe(false);
        expect(wrapper.find('.job-card__description-frame').exists()).toBe(
            false,
        );
        wrapper.unmount();
    });
});
