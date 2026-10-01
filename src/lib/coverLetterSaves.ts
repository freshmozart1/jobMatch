import type { InjectionKey } from 'vue';
import type { ScrapedJob } from '@/components/jobCard/types';
import { postJson } from './api';

type SaveState = {
    status: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
    jobCreateFailed: boolean;
    generating: boolean;
    generationDiscarded: boolean;
    restorationFailed: boolean;
};

export type GeneratedCoverLetter = { coverLetter: string; saved?: unknown };

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
    generation: Promise<void> | null;
    generationDiscarded: boolean;
    restoreRequired: boolean;
};

// Segmentation/embedding happens on each upload, so retain the typing pause.
const UPLOAD_DEBOUNCE_MS = 3000;

export const coverLetterSavesKey: InjectionKey<
    ReturnType<typeof createCoverLetterSaves>
> = Symbol('coverLetterSaves');

/** One page owns the queue; editor instances only hold disposable sessions. */
export function createCoverLetterSaves() {
    const entries = new Map<string, Entry>();
    // Keep only persistence metadata after an editor's working entry is released.
    // This cache belongs to the page, never localStorage or another browser tab.
    const acknowledgedDrafts = new Map<
        string,
        { text: string; jobSaved: boolean }
    >();

    function notify(
        entry: Entry,
        status: SaveState['status'],
        jobCreateFailed = false,
    ) {
        entry.state = {
            status,
            jobCreateFailed,
            generating: entry.generation !== null,
            generationDiscarded: entry.generationDiscarded,
            restorationFailed: status === 'error' && entry.restoreRequired,
        };
        entry.listeners.forEach((listener) => listener(entry.state));
    }

    function clearTimer(entry: Entry) {
        if (entry.timer === null) return;
        clearTimeout(entry.timer);
        entry.timer = null;
    }

    function releaseIfIdle(entry: Entry) {
        if (
            entries.get(entry.job.duplicateKey) === entry &&
            entry.listeners.size === 0 &&
            !entry.creatingJob &&
            !entry.running &&
            !entry.generation &&
            !entry.restoreRequired &&
            entry.timer === null
        ) {
            if (entry.savedText !== null) {
                acknowledgedDrafts.set(entry.job.duplicateKey, {
                    text: entry.savedText,
                    jobSaved: entry.jobSaved,
                });
            }
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
                releaseIfIdle(entry);
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
            if (snapshot.revision === entry.draft.revision)
                entry.restoreRequired = false;
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
        if (!entry.draft.text.trim())
            notify(entry, entry.restoreRequired ? 'error' : 'idle');
        else
            notify(
                entry,
                entry.draft.text === entry.savedText ? 'saved' : 'pending',
            );
    }

    async function drain(
        entry: Entry,
        duringGeneration = false,
    ): Promise<boolean> {
        while (
            (!entry.generation || duringGeneration) &&
            hasReadyDraft(entry)
        ) {
            const snapshot = entry.draft;
            const saved = await persist(entry, snapshot);
            // A failed old revision must not discard a newer queued edit.
            if (!saved && snapshot.revision === entry.draft.revision)
                return false;
            reflectLatestDraft(entry);
        }
        reflectLatestDraft(entry);
        return (
            !entry.restoreRequired &&
            (!entry.draft.text.trim() || entry.draft.text === entry.savedText)
        );
    }

    function flushUploads(
        entry: Entry,
        duringGeneration = false,
    ): Promise<boolean> {
        if (entry.restoreRequired && !entry.draft.text.trim()) {
            notify(entry, 'error');
            return Promise.resolve(false);
        }
        clearTimer(entry);
        entry.readyRevision = entry.draft.revision;
        if (entry.running) return entry.running;
        entry.running = drain(entry, duringGeneration).finally(() => {
            entry.running = null;
            releaseIfIdle(entry);
        });
        return entry.running;
    }

    function flush(entry: Entry): Promise<boolean> {
        if (!entry.generation) return flushUploads(entry);
        const afterGeneration = () =>
            entry.state.status === 'error' ? false : flushUploads(entry);
        return entry.generation.then(afterGeneration, afterGeneration);
    }

    async function restoreDraft(entry: Entry) {
        entry.restoreRequired = true;
        while (entry.draft.text.trim()) {
            const saved = await flushUploads(entry, true);
            if (saved || entry.state.status === 'error') return;
            // An edit during restoration may still be debounced; force its write too.
        }
        clearTimer(entry);
        notify(entry, 'error');
    }

    async function receiveGeneration(
        entry: Entry,
        revision: number,
        request: () => Promise<GeneratedCoverLetter>,
        apply: (text: string) => void,
        isCurrent: () => boolean,
    ) {
        let result: GeneratedCoverLetter;
        try {
            result = await request();
            if (
                typeof result.coverLetter !== 'string' ||
                !result.coverLetter.trim()
            )
                throw new Error('The server returned an invalid cover letter.');
        } catch (error) {
            // A failed response does not prove that no server write occurred.
            entry.savedText = null;
            await restoreDraft(entry);
            throw error;
        }
        entry.savedText = null; // Generation itself persisted a different document.
        if (revision === entry.draft.revision && isCurrent()) {
            updateDraft(entry, result.coverLetter, result.saved === true);
            apply(result.coverLetter);
            return;
        }
        entry.generationDiscarded = true;
        await restoreDraft(entry);
    }

    function generate(
        entry: Entry,
        request: () => Promise<GeneratedCoverLetter>,
        apply: (text: string) => void,
        isCurrent: () => boolean,
    ): Promise<void> {
        if (entry.generation) return entry.generation;
        const revision = entry.draft.revision;
        const previousUpload = entry.running;
        clearTimer(entry);
        entry.generationDiscarded = false;
        entry.generation = Promise.resolve()
            .then(async () => {
                await previousUpload;
                await receiveGeneration(
                    entry,
                    revision,
                    request,
                    apply,
                    isCurrent,
                );
            })
            .finally(() => {
                entry.generation = null;
                notify(entry, entry.state.status, entry.state.jobCreateFailed);
                releaseIfIdle(entry);
            });
        notify(entry, entry.state.status, entry.state.jobCreateFailed);
        return entry.generation;
    }

    function updateDraft(entry: Entry, text: string, acknowledged = false) {
        clearTimer(entry);
        entry.draft = { text, revision: entry.draft.revision + 1 };
        if (acknowledged) {
            entry.savedText = text;
            entry.restoreRequired = false;
        }
        if (
            acknowledged ||
            (!entry.running && !entry.generation && text === entry.savedText)
        ) {
            notify(entry, 'saved');
            return;
        }
        notify(entry, 'pending');
        entry.timer = setTimeout(() => void flush(entry), UPLOAD_DEBOUNCE_MS);
    }

    function connect(job: ScrapedJob, initialText: string, listener: Listener) {
        let entry = entries.get(job.duplicateKey);
        if (!entry) {
            const acknowledged = acknowledgedDrafts.get(job.duplicateKey);
            acknowledgedDrafts.delete(job.duplicateKey);
            entry = {
                job,
                draft: { text: initialText, revision: 0 },
                savedText: acknowledged?.text ?? null,
                readyRevision: -1,
                state: {
                    status:
                        acknowledged?.text === initialText ? 'saved' : 'idle',
                    jobCreateFailed: false,
                    generating: false,
                    generationDiscarded: false,
                    restorationFailed: false,
                },
                listeners: new Set(),
                timer: null,
                running: null,
                jobSaved: acknowledged?.jobSaved ?? false,
                creatingJob: null,
                generation: null,
                generationDiscarded: false,
                restoreRequired: false,
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
                updateDraft(current, text);
            },
            flush: () => (connected ? flush(current) : Promise.resolve(false)),
            generate(
                request: () => Promise<GeneratedCoverLetter>,
                apply: (text: string) => void,
                isCurrent: () => boolean,
            ) {
                if (!connected) return Promise.resolve();
                return generate(
                    current,
                    request,
                    apply,
                    () => connected && isCurrent(),
                );
            },
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
                if (
                    current.timer !== null ||
                    current.running ||
                    current.generation
                )
                    void flush(current);
                releaseIfIdle(current);
            },
        };
    }

    return { connect };
}
