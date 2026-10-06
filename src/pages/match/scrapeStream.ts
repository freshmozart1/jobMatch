import type { ScrapeStreamFrame } from '@/contracts/jobMatchServer';

export type { ScrapeStreamFrame } from '@/contracts/jobMatchServer';
export type ScrapeProgressFrame = Extract<
    ScrapeStreamFrame,
    { type: 'progress' }
>;
