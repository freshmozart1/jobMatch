import type { InjectionKey } from 'vue';
import type { ScrapedJob } from '@/components/jobCard/types';
import { postJson } from './api';

type SaveState = {
    status: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
    jobCreateFailed: boolean;
};

type Draft = { text: string; revision: number };
type Listener = (state: SaveState) => void;
type Entry = {
    job: ScrapedJob;
    draft: Draft;
    savedText: string | null;
    readyRevision: number;
    state: SaveState;
    listeners: Set<Listener>;
    timer: ReturnType<typeof setTimeout> | null;
    running: Promise<boolean> | null;
    jobSaved: boolean;
    creatingJob: Promise<boolean> | null;
};

// Segmentation/embedding happens on each upload, so retain the typing pause.
const UPLOAD_DEBOUNCE_MS = 3000;

export const coverLetterSavesKey: InjectionKey<
    ReturnType<typeof createCoverLetterSaves>
> = Symbol('coverLetterSaves');

/** One page owns the queue; editor instances only hold disposable sessions. */
export function createCoverLetterSaves() {
    const entries = new Map<string, Entry>();

    function notify(
        entry: Entry,
        status: SaveState['status'],
        jobCreateFailed = false,
    ) {
        entry.state = { status, jobCreateFailed };
        entry.listeners.forEach((listener) => listener(entry.state));
    }

    function clearTimer(entry: Entry) {
        if (entry.timer === null) return;
        clearTimeout(entry.timer);
        entry.timer = null;
    }

    function releaseIfIdle(entry: Entry) {
        if (
            entry.listeners.size === 0 &&
            !entry.running &&
            entry.timer === null
        ) {
            entries.delete(entry.job.duplicateKey);
        }
    }

    function ensureJob(entry: Entry): Promise<boolean> {
        if (entry.jobSaved) return Promise.resolve(true);
        if (entry.creatingJob) return entry.creatingJob;
        entry.creatingJob = postJson('/jobs/create', {
            job: entry.job,
            like: true,
        })
            .then(() => {
                entry.jobSaved = true;
                return true;
            })
            .catch((error: unknown) => {
                console.error(
                    'Failed to create job in database:',
                    error instanceof Error ? error.message : String(error),
                );
                return false;
            })
            .finally(() => {
                entry.creatingJob = null;
            });
        return entry.creatingJob;
    }

    async function persist(entry: Entry, snapshot: Draft): Promise<boolean> {
        notify(entry, 'saving');
        if (!(await ensureJob(entry))) {
            if (snapshot.revision === entry.draft.revision)
                notify(entry, 'error', true);
            return false;
        }
        try {
            await postJson('/cover-letters/upload/text', {
                coverLetterText: snapshot.text,
                jobDuplicateKey: entry.job.duplicateKey,
            });
            entry.savedText = snapshot.text;
            return true;
        } catch (error) {
            if (snapshot.revision === entry.draft.revision)
                notify(entry, 'error');
            console.error(
                'Failed to upload cover letter:',
                error instanceof Error ? error.message : String(error),
            );
            return false;
        }
    }

    function hasReadyDraft(entry: Entry): boolean {
        return (
            entry.readyRevision >= entry.draft.revision &&
            entry.draft.text.trim().length > 0 &&
            entry.draft.text !== entry.savedText
        );
    }

    function reflectLatestDraft(entry: Entry) {
        if (!entry.draft.text.trim()) notify(entry, 'idle');
        else
            notify(
                entry,
                entry.draft.text === entry.savedText ? 'saved' : 'pending',
            );
    }

    async function drain(entry: Entry): Promise<boolean> {
        while (hasReadyDraft(entry)) {
            const snapshot = entry.draft;
            const saved = await persist(entry, snapshot);
            // A failed old revision must not discard a newer queued edit.
            if (!saved && snapshot.revision === entry.draft.revision)
                return false;
            reflectLatestDraft(entry);
        }
        reflectLatestDraft(entry);
        return !entry.draft.text.trim() || entry.draft.text === entry.savedText;
    }

    function flush(entry: Entry): Promise<boolean> {
        clearTimer(entry);
        entry.readyRevision = entry.draft.revision;
        if (entry.running) return entry.running;
        entry.running = drain(entry).finally(() => {
            entry.running = null;
            releaseIfIdle(entry);
        });
        return entry.running;
    }

    function connect(job: ScrapedJob, initialText: string, listener: Listener) {
        let entry = entries.get(job.duplicateKey);
        if (!entry) {
            entry = {
                job,
                draft: { text: initialText, revision: 0 },
                savedText: null,
                readyRevision: -1,
                state: { status: 'idle', jobCreateFailed: false },
                listeners: new Set(),
                timer: null,
                running: null,
                jobSaved: false,
                creatingJob: null,
            };
            entries.set(job.duplicateKey, entry);
        }
        // Capture this entry, never component props that can change or unmount.
        const current = entry;
        let connected = true;
        current.listeners.add(listener);
        listener(current.state);

        return {
            initialText: current.draft.text,
            update(text: string) {
                if (!connected) return;
                clearTimer(current);
                current.draft = { text, revision: current.draft.revision + 1 };
                if (!current.running && text === current.savedText) {
                    notify(current, 'saved');
                    return;
                }
                notify(current, 'pending');
                current.timer = setTimeout(
                    () => void flush(current),
                    UPLOAD_DEBOUNCE_MS,
                );
            },
            flush: () => (connected ? flush(current) : Promise.resolve(false)),
            async ensureJob() {
                if (!connected) return false;
                const saved = await ensureJob(current);
                if (!saved && connected) notify(current, 'error', true);
                return saved;
            },
            close() {
                if (!connected) return;
                connected = false;
                current.listeners.delete(listener);
                if (current.timer !== null || current.running)
                    void flush(current);
                releaseIfIdle(current);
            },
        };
    }

    return { connect };
}
