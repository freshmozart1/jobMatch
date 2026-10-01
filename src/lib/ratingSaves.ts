import { shallowRef, toRaw } from 'vue';
import type { ScrapedJob } from '@/components/jobCard/types';
import { postJson } from './api';

type RatingEntry = {
    payload: { job: ScrapedJob; like: boolean };
    status: 'pending' | 'failed';
    hasFailed: boolean;
};
export type RatingRecovery = {
    key: string;
    title: string;
    company: string;
    like: boolean;
    status: RatingEntry['status'];
};

/** Pending choices belong to the page, independently of its current scrape. */
export function createRatingSaves() {
    const entries = new Map<string, RatingEntry>();
    const recoveries = shallowRef<RatingRecovery[]>([]);

    function publish() {
        recoveries.value = [...entries.values()]
            .filter((entry) => entry.hasFailed)
            .map(({ payload, status }) => ({
                key: payload.job.duplicateKey,
                title: payload.job.title,
                company: payload.job.company,
                like: payload.like,
                status,
            }));
    }

    async function attempt(entry: RatingEntry): Promise<void> {
        const key = entry.payload.job.duplicateKey;
        if (entries.get(key) !== entry || entry.status === 'pending') return;
        entry.status = 'pending';
        publish();
        try {
            await postJson('/jobs/create', entry.payload);
            if (entries.get(key) === entry) entries.delete(key);
        } catch (error) {
            if (entries.get(key) !== entry) return;
            entry.status = 'failed';
            entry.hasFailed = true;
            console.error(
                'Failed to save job rating:',
                error instanceof Error ? error.message : String(error),
            );
        } finally {
            publish();
        }
    }

    function enqueue(job: ScrapedJob, like: boolean) {
        if (entries.has(job.duplicateKey)) return;
        const entry: RatingEntry = {
            payload: { job: structuredClone(toRaw(job)), like },
            status: 'failed', // attempt marks pending synchronously, before sending
            hasFailed: false,
        };
        entries.set(job.duplicateKey, entry);
        void attempt(entry);
    }

    function retry(key: string) {
        const entry = entries.get(key);
        if (entry) void attempt(entry);
    }

    return { recoveries, enqueue, retry, keys: () => [...entries.keys()] };
}
