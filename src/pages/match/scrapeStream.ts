import type { ScrapedJob } from '@/components/jobCard/types';

export type ScrapeProgressFrame =
    | {
          type: 'progress';
          keyword: string;
          stage: 'loading';
          discovered: number;
      }
    | {
          type: 'progress';
          keyword: string;
          stage: 'scanning';
          current: number;
          total: number;
          failed: number;
          dropped: number;
      };

export type ScrapeStreamFrame =
    | { type: 'job'; job: ScrapedJob }
    | ScrapeProgressFrame
    | {
          type: 'error';
          error: string;
          reason: string;
          keyword?: string;
      };
