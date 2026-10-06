import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ApplicationEditorPage from '@/pages/match/ApplicationEditorPage.vue';
import CvFileInput from '@/components/CvFileInput.vue';
import { createCvUpload } from '@/lib/cvUpload';
import type { ScrapedJob } from '@/components/jobCard/types';

const job: ScrapedJob = {
    sourceHostname: 'example.com',
    sourceJobId: 'A',
    sourceUrl: 'https://example.com/A',
    title: 'Engineer A',
    company: 'Synthetic Co',
    location: 'Berlin',
    postedAt: 'Today',
    scrapedAt: '2026-10-01',
    tags: [],
    duplicateKey: 'example:A',
    companyAddresses: [],
    embedding: [],
};
const jobB = { ...job, duplicateKey: 'example:B', title: 'Engineer B' };
const pdf = (name: string) =>
    new File(['%PDF-1.4 synthetic ' + name], name, { type: 'application/pdf' });
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
const response = (status = 201) =>
    new Response(
        JSON.stringify({
            message: status >= 400 ? 'Synthetic rejection' : 'OK',
            ...(status === 404 ? { error: 'CV not found' } : {}),
        }),
        { status },
    );

describe('CV upload recovery', () => {
    let wrapper: ReturnType<typeof mount<typeof ApplicationEditorPage>>;
    let statuses: ReturnType<typeof deferred<Response>>[];
    let uploads: {
        body: FormData;
        response: ReturnType<typeof deferred<Response>>;
    }[];
    let createResponse: () => Promise<Response>;
    let downloads: string[];

    beforeEach(() => {
        statuses = [];
        uploads = [];
        downloads = [];
        createResponse = () => Promise.resolve(response());
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
            () => {},
        );
        vi.stubGlobal(
            'URL',
            class extends URL {
                static createObjectURL = vi.fn(() => 'blob:synthetic');
                static revokeObjectURL = vi.fn();
            },
        );
        vi.stubGlobal(
            'fetch',
            vi.fn((input: string, init?: RequestInit) => {
                if (input.endsWith('/status')) {
                    const pending = deferred<Response>();
                    statuses.push(pending);
                    return pending.promise;
                }
                if (input.endsWith('/jobs/create')) return createResponse();
                if (input.endsWith('/cv/upload')) {
                    const pending = deferred<Response>();
                    uploads.push({
                        body: init!.body as FormData,
                        response: pending,
                    });
                    return pending.promise;
                }
                if (input.includes('/cv/')) {
                    downloads.push(input);
                    return Promise.resolve(new Response('synthetic pdf'));
                }
                throw new Error('Unexpected request ' + input);
            }),
        );
    });
    afterEach(async () => {
        wrapper?.unmount();
        await flushPromises();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        window.localStorage.clear();
    });
    async function open(existing = false, settleStatus = true) {
        wrapper = mount(ApplicationEditorPage, { props: { job } });
        if (settleStatus) statuses[0]!.resolve(response(existing ? 200 : 404));
        await flushPromises();
    }
    async function choose(file: File) {
        wrapper.findComponent(CvFileInput).vm.$emit('fileSelected', file);
        await flushPromises();
    }
    const notice = () => wrapper.find('[data-testid="cv-upload-notice"]');
    const retry = () => notice().find('button');
    const download = () => wrapper.find('[aria-label="Download CV"]');
    const lookupNotice = () => wrapper.find('[data-testid="cv-lookup-notice"]');

    it('shows a pending lookup without prompting for a new attachment', async () => {
        await open(false, false);
        expect(wrapper.text()).toContain('Checking for an attached CV');
        expect(wrapper.text()).not.toContain('Attach a PDF file');
        expect(download().attributes('disabled')).toBeDefined();
        expect(lookupNotice().exists()).toBe(false);
    });

    it.each(['Job not found', 'CV not found'])(
        'confirms no attachment only for the known 404 detail %s',
        async (error) => {
            await open(false, false);
            statuses[0]!.resolve(
                new Response(
                    JSON.stringify({
                        message: 'Error checking CV status',
                        error,
                    }),
                    { status: 404 },
                ),
            );
            await flushPromises();
            expect(wrapper.text()).toContain('Attach a PDF file');
            expect(lookupNotice().exists()).toBe(false);
            expect(download().attributes('disabled')).toBeDefined();
        },
    );

    for (const failure of [
        'http',
        'network',
        'unexpected404',
        'non404Missing',
        'malformed404',
        'invalidJson',
    ] as const) {
        it(`retries a ${failure} lookup without falsely claiming the CV is missing`, async () => {
            await open(false, false);
            if (failure === 'network')
                statuses[0]!.reject(new TypeError('offline'));
            else if (failure === 'http') statuses[0]!.resolve(response(500));
            else if (failure === 'unexpected404')
                statuses[0]!.resolve(
                    new Response(JSON.stringify({ error: 'Route not found' }), {
                        status: 404,
                    }),
                );
            else if (failure === 'non404Missing')
                statuses[0]!.resolve(
                    new Response(JSON.stringify({ error: 'CV not found' }), {
                        status: 500,
                    }),
                );
            else
                statuses[0]!.resolve(
                    new Response('invalid json', {
                        status: failure === 'invalidJson' ? 200 : 404,
                    }),
                );
            await flushPromises();
            expect(wrapper.text()).toContain('CV status unavailable');
            expect(wrapper.text()).not.toContain('Attach a PDF file');
            expect(lookupNotice().find('[role="alert"]').text()).toContain(
                'Could not check whether a CV is attached',
            );
            expect(wrapper.text()).not.toContain('Route not found');
            expect(download().attributes('disabled')).toBeDefined();
            const retryLookup = lookupNotice().find('button');
            await retryLookup.trigger('click');
            await retryLookup.trigger('click');
            await flushPromises();
            expect(statuses).toHaveLength(2);
            expect(wrapper.text()).toContain('Checking for an attached CV');
            expect(
                lookupNotice().find('button').attributes('aria-disabled'),
            ).toBe('true');
            expect(lookupNotice().find('[role="status"]').exists()).toBe(true);
            statuses[1]!.resolve(response(200));
            await flushPromises();
            expect(wrapper.text()).toContain('PDF attached');
            expect(download().attributes('disabled')).toBeUndefined();
            expect(uploads).toHaveLength(0);
        });
    }

    it('allows another lookup retry after failure and then confirms a missing attachment', async () => {
        await open(false, false);
        statuses[0]!.resolve(response(500));
        await flushPromises();
        await lookupNotice().find('button').trigger('click');
        statuses[1]!.reject(new TypeError('still offline'));
        await flushPromises();
        expect(lookupNotice().find('[role="alert"]').exists()).toBe(true);
        await lookupNotice().find('button').trigger('click');
        statuses[2]!.resolve(response(404));
        await flushPromises();
        expect(wrapper.text()).toContain('Attach a PDF file');
        expect(lookupNotice().exists()).toBe(false);
    });

    it('preserves upload failure feedback when a lookup retry discovers an attachment', async () => {
        await open(false, false);
        statuses[0]!.resolve(response(500));
        await flushPromises();
        await choose(pdf('replacement.pdf'));
        uploads[0]!.response.resolve(response(500));
        await flushPromises();
        expect(notice().find('[role="alert"]').text()).toContain(
            'replacement.pdf',
        );
        await lookupNotice().find('button').trigger('click');
        statuses[1]!.resolve(response(200));
        await flushPromises();
        expect(notice().find('[role="alert"]').text()).toContain(
            'replacement.pdf',
        );
        expect(notice().text()).toContain('an attached CV remains available');
        expect(download().attributes('disabled')).toBeUndefined();
        expect(lookupNotice().exists()).toBe(false);
    });

    it.each(['missing', 'error'] as const)(
        'keeps an acknowledged upload available after a late %s lookup retry',
        async (result) => {
            await open(false, false);
            statuses[0]!.resolve(response(500));
            await flushPromises();
            await lookupNotice().find('button').trigger('click');
            await choose(pdf('acknowledged.pdf'));
            uploads[0]!.response.resolve(response());
            await flushPromises();
            expect(wrapper.text()).toContain('PDF attached');
            statuses[1]!.resolve(response(result === 'missing' ? 404 : 500));
            await flushPromises();
            expect(wrapper.text()).toContain('PDF attached');
            expect(lookupNotice().exists()).toBe(false);
            expect(download().attributes('disabled')).toBeUndefined();
        },
    );

    it.each(['success', 'error'] as const)(
        'ignores a late %s retry from an earlier A/B/A session',
        async (result) => {
            await open(false, false);
            statuses[0]!.resolve(response(500));
            await flushPromises();
            await lookupNotice().find('button').trigger('click');
            await wrapper.setProps({ job: jobB });
            await wrapper.setProps({ job });
            statuses[3]!.resolve(response(404));
            await flushPromises();
            statuses[1]!.resolve(response(result === 'success' ? 200 : 500));
            await flushPromises();
            expect(wrapper.text()).toContain('Attach a PDF file');
            expect(lookupNotice().exists()).toBe(false);
            expect(download().attributes('disabled')).toBeDefined();
        },
    );

    it.each(['deactivate', 'back'] as const)(
        'ignores a late retry after %s and reopening',
        async (close) => {
            await open(false, false);
            statuses[0]!.resolve(response(500));
            await flushPromises();
            await lookupNotice().find('button').trigger('click');
            if (close === 'deactivate')
                await wrapper.setProps({ active: false });
            else
                await wrapper.find('.app-editor-header__back').trigger('click');
            await wrapper.setProps({ active: false });
            await wrapper.setProps({ active: true });
            statuses[2]!.resolve(response(404));
            await flushPromises();
            statuses[1]!.reject(new TypeError('old failure'));
            await flushPromises();
            expect(wrapper.text()).toContain('Attach a PDF file');
            expect(lookupNotice().exists()).toBe(false);
        },
    );

    it('ignores a lookup completion and retry after the helper is disposed', async () => {
        const cv = createCvUpload();
        cv.open(job.duplicateKey, () => Promise.resolve(true));
        statuses[0]!.reject(new TypeError('offline'));
        await flushPromises();
        expect(cv.lookupState.value).toBe('error');
        cv.retryStatus();
        cv.close();
        statuses[1]!.resolve(response(200));
        await flushPromises();
        cv.retryStatus();
        expect(cv.lookupState.value).toBe('unknown');
        expect(cv.uploaded.value).toBe(false);
        expect(statuses).toHaveLength(2);
    });

    for (const existing of [false, true]) {
        for (const failure of ['http', 'network', 'validation'] as const) {
            it(`recovers ${existing ? 'replacement' : 'first-time'} ${failure} failure with the original file`, async () => {
                await open(existing);
                const intended = pdf('intended.pdf');
                await choose(intended);
                expect(notice().find('[role="status"]').text()).toContain(
                    'intended.pdf',
                );
                if (failure === 'network')
                    uploads[0]!.response.reject(
                        new TypeError('Failed to fetch'),
                    );
                else
                    uploads[0]!.response.resolve(
                        response(failure === 'validation' ? 400 : 500),
                    );
                await flushPromises();
                expect(notice().find('[role="alert"]').text()).toContain(
                    'intended.pdf',
                );
                expect(notice().text()).toContain('try again');
                expect((download().element as HTMLButtonElement).disabled).toBe(
                    !existing,
                );
                expect(
                    notice()
                        .text()
                        .includes('an attached CV remains available'),
                ).toBe(existing);
                await download().trigger('click');
                await flushPromises();
                expect(downloads.map((url) => new URL(url).pathname)).toEqual(
                    existing ? ['/cv/example:A'] : [],
                );
                await retry().trigger('click');
                await retry().trigger('click');
                await flushPromises();
                expect(uploads).toHaveLength(2);
                expect(retry().attributes('disabled')).toBeDefined();
                expect(uploads[1]!.body.get('file')).toBe(intended);
                expect(uploads[1]!.body.get('jobDuplicateKey')).toBe(
                    job.duplicateKey,
                );
                uploads[1]!.response.resolve(response());
                await flushPromises();
                expect(notice().find('[role="status"]').text()).toContain(
                    'Uploaded intended.pdf',
                );
                expect(download().attributes('disabled')).toBeUndefined();
                expect(notice().find('button').exists()).toBe(false);
            });
        }
    }

    it('makes job preparation failure visible and retries without losing the file', async () => {
        await open();
        createResponse = () => Promise.resolve(response(500));
        const file = pdf('prepare.pdf');
        await choose(file);
        expect(uploads).toHaveLength(0);
        expect(notice().find('[role="alert"]').text()).toContain('prepare');
        createResponse = () => Promise.resolve(response());
        await retry().trigger('click');
        await flushPromises();
        expect(uploads[0]!.body.get('file')).toBe(file);
        uploads[0]!.response.resolve(response());
        await flushPromises();
        expect(download().attributes('disabled')).toBeUndefined();
    });

    it('serializes newer selections and cannot attach an old success label to the latest file', async () => {
        await open();
        const first = pdf('old.pdf');
        const latest = pdf('latest.pdf');
        await choose(first);
        await choose(pdf('skipped.pdf'));
        await choose(latest);
        expect(uploads).toHaveLength(1);
        expect(notice().text()).toContain('latest.pdf');
        uploads[0]!.response.resolve(response());
        await flushPromises();
        expect(uploads).toHaveLength(2);
        expect(uploads[1]!.body.get('file')).toBe(latest);
        expect(notice().text()).not.toContain('Uploaded');
        uploads[1]!.response.resolve(response(400));
        await flushPromises();
        expect(notice().find('[role="alert"]').text()).toContain('latest.pdf');
        expect(download().attributes('disabled')).toBeUndefined();
        await retry().trigger('click');
        await flushPromises();
        expect(uploads[2]!.body.get('file')).toBe(latest);
    });

    it('uploads only the latest chosen file after job preparation completes', async () => {
        await open();
        const prepared = deferred<Response>();
        createResponse = () => prepared.promise;
        await choose(pdf('before-prepare.pdf'));
        const latest = pdf('after-prepare.pdf');
        await choose(latest);
        expect(uploads).toHaveLength(0);
        prepared.resolve(response());
        await flushPromises();
        expect(uploads).toHaveLength(1);
        expect(uploads[0]!.body.get('file')).toBe(latest);
        uploads[0]!.response.resolve(response());
        await flushPromises();
        expect(notice().text()).toContain('Uploaded after-prepare.pdf');
    });

    it('replaces a failed retry intent when another file is selected', async () => {
        await open();
        await choose(pdf('failed.pdf'));
        uploads[0]!.response.resolve(response(400));
        await flushPromises();
        const newer = pdf('new.pdf');
        await choose(newer);
        uploads[1]!.response.reject(new TypeError('offline'));
        await flushPromises();
        await retry().trigger('click');
        await flushPromises();
        expect(uploads[2]!.body.get('file')).toBe(newer);
        expect(notice().text()).not.toContain('failed.pdf');
    });

    it('ignores an old failure while the latest selection is waiting', async () => {
        await open();
        await choose(pdf('old.pdf'));
        await choose(pdf('new.pdf'));
        uploads[0]!.response.reject(new TypeError('offline'));
        await flushPromises();
        expect(notice().find('[role="alert"]').exists()).toBe(false);
        expect(notice().text()).toContain('new.pdf');
        uploads[1]!.response.resolve(response());
        await flushPromises();
        expect(notice().text()).toContain('Uploaded new.pdf');
    });

    it('does not let a late missing status downgrade a successful upload', async () => {
        await open(false, false);
        await choose(pdf('new.pdf'));
        uploads[0]!.response.resolve(response());
        await flushPromises();
        statuses[0]!.resolve(response(404));
        await flushPromises();
        expect(download().attributes('disabled')).toBeUndefined();
        expect(notice().text()).toContain('Uploaded new.pdf');
    });

    it('uses a late existing status to preserve attachment availability after failure', async () => {
        await open(false, false);
        await choose(pdf('replacement.pdf'));
        uploads[0]!.response.resolve(response(500));
        await flushPromises();
        statuses[0]!.resolve(response(200));
        await flushPromises();
        expect(notice().find('[role="alert"]').exists()).toBe(true);
        expect(notice().text()).toContain('an attached CV remains available');
        expect(download().attributes('disabled')).toBeUndefined();
    });

    it('guards status across A/B/A sessions and clears the previous job attachment immediately', async () => {
        await open(true);
        await wrapper.setProps({ job: jobB });
        expect(download().attributes('disabled')).toBeDefined();
        await wrapper.setProps({ job });
        statuses[2]!.resolve(response(404));
        await flushPromises();
        statuses[1]!.resolve(response(200));
        await flushPromises();
        expect(download().attributes('disabled')).toBeDefined();
    });

    it('ignores the first A status after switching away and reopening A', async () => {
        await open(false, false);
        await wrapper.setProps({ job: jobB });
        await wrapper.setProps({ job });
        statuses[2]!.resolve(response(404));
        await flushPromises();
        statuses[0]!.resolve(response(200));
        await flushPromises();
        expect(download().attributes('disabled')).toBeDefined();
        expect(notice().exists()).toBe(false);
    });

    it('uploads a different job while the old job remains pending, without accepting its late completion', async () => {
        await open();
        await choose(pdf('A-pending.pdf'));
        await wrapper.setProps({ job: jobB });
        statuses[1]!.resolve(response(404));
        await flushPromises();
        const fileB = pdf('B.pdf');
        await choose(fileB);
        expect(uploads).toHaveLength(2);
        expect(uploads[1]!.body.get('jobDuplicateKey')).toBe(jobB.duplicateKey);
        expect(uploads[1]!.body.get('file')).toBe(fileB);
        uploads[1]!.response.resolve(response());
        await flushPromises();
        expect(notice().text()).toContain('Uploaded B.pdf');
        uploads[0]!.response.reject(new TypeError('late A failure'));
        await flushPromises();
        expect(notice().text()).toContain('Uploaded B.pdf');
        expect(notice().find('[role="alert"]').exists()).toBe(false);
        expect(download().attributes('disabled')).toBeUndefined();
    });

    it('does not let an upload from an old A session acknowledge a new A session', async () => {
        await open();
        await choose(pdf('old-session.pdf'));
        await wrapper.setProps({ job: jobB });
        await wrapper.setProps({ job });
        statuses[2]!.resolve(response(404));
        await flushPromises();
        uploads[0]!.response.resolve(response());
        await flushPromises();
        expect(notice().exists()).toBe(false);
        expect(download().attributes('disabled')).toBeDefined();
    });

    it.each(['job', 'close', 'unmount'] as const)(
        'does not upload after ensureJob resolves following %s',
        async (change) => {
            await open();
            const prepared = deferred<Response>();
            createResponse = () => prepared.promise;
            await choose(pdf('never-sent.pdf'));
            if (change === 'job') await wrapper.setProps({ job: jobB });
            else if (change === 'close')
                await wrapper.setProps({ active: false });
            else wrapper.unmount();
            prepared.resolve(response());
            await flushPromises();
            expect(uploads).toHaveLength(0);
        },
    );

    it('does not let a closed-session upload erase a reopened selection failure', async () => {
        await open();
        await choose(pdf('closed.pdf'));
        await wrapper.setProps({ active: false });
        await wrapper.setProps({ active: true });
        await choose(pdf('reopened.pdf'));
        uploads[0]!.response.resolve(response());
        await flushPromises();
        expect(uploads[1]!.body.get('file')).toHaveProperty(
            'name',
            'reopened.pdf',
        );
        uploads[1]!.response.resolve(response(500));
        await flushPromises();
        expect(notice().find('[role="alert"]').text()).toContain(
            'reopened.pdf',
        );
        expect(download().attributes('disabled')).toBeDefined();
    });
});
