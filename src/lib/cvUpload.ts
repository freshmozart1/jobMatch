import { ref, shallowRef } from 'vue';
import { getJson, postFormData } from './api';

export type CvUploadNotice = {
    phase: 'pending' | 'error' | 'success';
    fileName: string;
    message: string;
};
type Session = {
    key: string;
    ensureJob: () => Promise<boolean>;
    uploaded: boolean;
};
type Selection = { session: Session; file: File };

/** One editor owns its selected File and serial upload queue. */
export function createCvUpload() {
    const uploaded = ref(false);
    const notice = shallowRef<CvUploadNotice | null>(null);
    let session: Session | null = null;
    let selection: Selection | null = null;
    const queues = new Map<string, Promise<void>>();

    function current(intent: Selection) {
        return session === intent.session && selection === intent;
    }

    async function checkStatus(context: Session) {
        let exists = false;
        try {
            await getJson(`/cv/${context.key}/status`);
            exists = true;
        } catch {
            // Initial status failures retain the existing unavailable state.
        }
        if (session === context && !context.uploaded) uploaded.value = exists;
    }

    function close() {
        session = null;
        selection = null;
        notice.value = null;
        uploaded.value = false;
    }

    function open(key: string, ensureJob: () => Promise<boolean>) {
        close();
        const context: Session = { key, ensureJob, uploaded: false };
        session = context;
        void checkStatus(context);
    }

    async function upload(intent: Selection) {
        if (!current(intent)) return;
        let failure =
            'Could not prepare this job for the CV upload. Please try again.';
        try {
            const ready = await intent.session.ensureJob();
            if (!current(intent)) return;
            if (!ready) throw new Error('Job preparation failed');
            failure =
                'Upload could not be confirmed. Check your connection, use a valid PDF, and try again or choose another file.';
            const body = new FormData();
            body.append('file', intent.file);
            body.append('jobDuplicateKey', intent.session.key);
            await postFormData('/cv/upload', body);
            // A superseded selection may have attached a CV before the next
            // serial upload starts, but must never acknowledge that newer file.
            if (session === intent.session) {
                intent.session.uploaded = true;
                uploaded.value = true;
            }
            if (!current(intent)) return;
            notice.value = {
                phase: 'success',
                fileName: intent.file.name,
                message: `Uploaded ${intent.file.name}.`,
            };
        } catch {
            if (!current(intent)) return;
            notice.value = {
                phase: 'error',
                fileName: intent.file.name,
                message: failure,
            };
        }
    }

    function start(intent: Selection) {
        notice.value = {
            phase: 'pending',
            fileName: intent.file.name,
            message: `Uploading ${intent.file.name}…`,
        };
        const key = intent.session.key;
        const queued = (queues.get(key) ?? Promise.resolve()).then(() =>
            upload(intent),
        );
        queues.set(key, queued);
        void queued.finally(() => {
            if (queues.get(key) === queued) queues.delete(key);
        });
    }

    function select(file: File) {
        if (!session) return;
        if (selection?.file === file && notice.value?.phase === 'pending')
            return;
        selection = { session, file };
        start(selection);
    }

    function retry() {
        if (!selection || notice.value?.phase !== 'error') return;
        start(selection);
    }

    return { uploaded, notice, open, close, select, retry };
}
