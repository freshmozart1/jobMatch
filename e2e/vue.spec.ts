import {
    test,
    expect,
    type Locator,
    type Page,
    type Route,
} from '@playwright/test';
import {
    APPLICATION_EDITOR_DIALOG_ID,
    APPLICATION_EDITOR_NAME,
} from '../src/components/application/constants';

const mockJob = {
    sourceHostname: 'example.com',
    sourceJobId: 'mobile-layout-test',
    sourceUrl: 'https://example.com/jobs/mobile-layout-test',
    title: 'Frontend Developer',
    company: 'Example Company',
    location: 'Hamburg',
    descriptionText: 'A deterministic job used for mobile layout coverage.',
    postedAt: 'Today',
    scrapedAt: '2026-09-07T00:00:00.000Z',
    tags: ['Frontend', 'TypeScript'],
    duplicateKey: 'example:mobile-layout-test',
    companyAddresses: [],
    embedding: [],
    match: 0.87,
};

const mockJobs = [
    mockJob,
    {
        ...mockJob,
        sourceJobId: 'mobile-layout-test-2',
        sourceUrl: 'https://example.com/jobs/mobile-layout-test-2',
        title: 'Backend Developer',
        descriptionText: 'The next deterministic job in the swipe deck.',
        duplicateKey: 'example:mobile-layout-test-2',
        match: 0.82,
    },
];

async function loadPopulatedMatchPage(
    page: Page,
    viewport: { width: number; height: number },
    activeScrape = false,
): Promise<void> {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        window.localStorage.setItem(
            'jobmatch.searchkeywords',
            JSON.stringify(['frontend']),
        );
    });
    if (activeScrape) {
        await page.addInitScript((jobs) => {
            const originalFetch = window.fetch.bind(window);
            window.fetch = (input, init) => {
                if (String(input).endsWith('/scrape/linkedin')) {
                    const encoder = new TextEncoder();
                    const stream = new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify({
                                        type: 'progress',
                                        keyword: 'frontend',
                                        stage: 'scanning',
                                        current: 7,
                                        total: 28,
                                        failed: 1,
                                        dropped: 2,
                                    })}\n\n`,
                                ),
                            );
                            for (const job of jobs) {
                                controller.enqueue(
                                    encoder.encode(
                                        `data: ${JSON.stringify({ type: 'job', job })}\n\n`,
                                    ),
                                );
                            }
                            init?.signal?.addEventListener('abort', () => {
                                controller.error(
                                    new DOMException(
                                        'The user aborted a request.',
                                        'AbortError',
                                    ),
                                );
                            });
                        },
                    });
                    return Promise.resolve(
                        new Response(stream, {
                            status: 200,
                            headers: {
                                'Content-Type': 'text/event-stream',
                            },
                        }),
                    );
                }
                return originalFetch(input, init);
            };
        }, mockJobs);
    } else {
        await page.route('**/scrape/linkedin', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'text/event-stream',
                body: mockJobs
                    .map(
                        (job) =>
                            `data: ${JSON.stringify({ type: 'job', job })}\n\n`,
                    )
                    .join(''),
            });
        });
    }
    await page.route('**/cv/*/status', async (route) => {
        await route.fulfill({ status: 404 });
    });
    await page.goto('/');

    await expect(page.locator('.match-filter')).toBeVisible();
    await expect(
        page.locator('.job-card-stack__current .job-card'),
    ).toBeVisible();
    await expect(page.locator('.like-container')).toBeVisible();
}

async function openRevisionDialog(
    page: Page,
    viewport: { width: number; height: number },
    draft: string,
    start: number,
    end: number,
) {
    await loadPopulatedMatchPage(page, viewport);
    await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, value),
        {
            key: `jobmatch.coverletter.${mockJob.duplicateKey}`,
            value: draft,
        },
    );

    await page
        .getByRole('button', { name: `Open ${APPLICATION_EDITOR_NAME}` })
        .click();
    await page.locator('.cl-action__row').first().click();
    await expect(page.locator(`#${APPLICATION_EDITOR_DIALOG_ID}`)).toHaveCSS(
        'transform',
        'none',
    );

    const textarea = page.locator('.cl-textarea');
    await expect(textarea).toHaveValue(draft);
    await textarea.evaluate(
        (element, range) => {
            const input = element as HTMLTextAreaElement;
            input.setSelectionRange(range.start, range.end);
            input.dispatchEvent(new Event('select', { bubbles: true }));
        },
        { start, end },
    );

    const revisionCard = page.locator('.cl-revision');
    await expect(revisionCard).toHaveRole('dialog');
    return { revisionCard, textarea };
}

async function expectRevisionContained(
    page: Page,
    revisionCard: Locator,
): Promise<void> {
    const instruction = revisionCard.getByLabel(
        'How should AI revise this selection?',
    );
    await instruction.focus();
    await expect(instruction).toBeFocused();

    const [revisionBox, instructionBox] = await Promise.all([
        revisionCard.boundingBox(),
        instruction.boundingBox(),
    ]);
    expect(revisionBox).not.toBeNull();
    expect(instructionBox).not.toBeNull();
    expect(instructionBox!.x).toBeGreaterThanOrEqual(revisionBox!.x - 0.5);
    expect(instructionBox!.x + instructionBox!.width).toBeLessThanOrEqual(
        revisionBox!.x + revisionBox!.width + 0.5,
    );

    const outline = await instruction.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
            style: style.outlineStyle,
            width: Number.parseFloat(style.outlineWidth),
            offset: Number.parseFloat(style.outlineOffset),
        };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);
    const outlineExtent = outline.width + outline.offset;
    expect(instructionBox!.x - revisionBox!.x).toBeGreaterThan(outlineExtent);
    expect(
        revisionBox!.x +
            revisionBox!.width -
            (instructionBox!.x + instructionBox!.width),
    ).toBeGreaterThan(outlineExtent);

    const documentWidths = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
        ),
    }));
    expect(documentWidths.scroll).toBeLessThanOrEqual(documentWidths.client);
}

test('keeps the card and like controls visible on mobile portrait', async ({
    page,
}) => {
    await loadPopulatedMatchPage(page, { width: 390, height: 844 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(390);

    const documentHeight = await page.evaluate(() =>
        Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
        ),
    );
    expect(documentHeight).toBeLessThanOrEqual(844);

    const likeContainerBox = await page
        .locator('.like-container')
        .boundingBox();
    expect(likeContainerBox).not.toBeNull();
    expect(likeContainerBox!.y + likeContainerBox!.height).toBeLessThanOrEqual(
        844,
    );
    await expect(page.locator('.like-container')).toHaveCSS(
        'position',
        'sticky',
    );
});

test('keeps live progress and populated controls inside a mobile viewport', async ({
    page,
}) => {
    await loadPopulatedMatchPage(page, { width: 390, height: 844 }, true);

    await expect(page.locator('.scrape-progress__primary')).toHaveText(
        'Scanning “frontend”: 7 of 28',
    );
    await expect(page.locator('.scrape-progress__warning')).toHaveText(
        '3 results couldn’t be read',
    );

    const documentHeight = await page.evaluate(() =>
        Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
        ),
    );
    expect(documentHeight).toBeLessThanOrEqual(844);

    const likeContainerBox = await page
        .locator('.like-container')
        .boundingBox();
    expect(likeContainerBox).not.toBeNull();
    expect(likeContainerBox!.y + likeContainerBox!.height).toBeLessThanOrEqual(
        844,
    );
});

test('keeps sticky like controls visible while swiping on compact portrait', async ({
    page,
}) => {
    await page.route('**/jobs/create', async (route) => {
        await route.fulfill({ status: 201, body: '{}' });
    });
    await loadPopulatedMatchPage(page, { width: 360, height: 640 });

    const card = page.locator('.job-card-stack__current .job-card');
    const likeContainer = page.locator('.like-container');

    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();
    await page.mouse.move(
        cardBox!.x + cardBox!.width / 2,
        cardBox!.y + cardBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        cardBox!.x + cardBox!.width / 2 + 180,
        cardBox!.y + cardBox!.height / 2,
    );
    await expect(likeContainer).toBeVisible();
    await page.mouse.up();
    await expect(likeContainer).toBeVisible();
});

for (const { control, expectedLike } of [
    { control: 'Dislike', expectedLike: false },
    { control: 'Like', expectedLike: true },
]) {
    test(`${control} button rates the current job and advances the deck`, async ({
        page,
    }) => {
        await page.route('**/jobs/create', async (route) => {
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: '{}',
            });
        });
        await loadPopulatedMatchPage(page, { width: 390, height: 844 });

        const createRequest = page.waitForRequest('**/jobs/create');
        await page.getByRole('button', { name: control, exact: true }).click();
        const request = await createRequest;

        await expect(
            page.locator('.job-card-stack__current .job-card'),
        ).toContainText(mockJobs[1].title);
        expect(request.postDataJSON()).toEqual({
            job: mockJobs[0],
            like: expectedLike,
        });
    });
}

test('keeps rated jobs dismissed across match filters without skipping unseen cards', async ({
    page,
}) => {
    const ratedKeys: string[] = [];
    await page.route('**/jobs/create', async (route) => {
        ratedKeys.push(route.request().postDataJSON().job.duplicateKey);
        await route.fulfill({ status: 201, body: '{}' });
    });
    await loadPopulatedMatchPage(page, { width: 390, height: 844 });
    const current = page.locator('.job-card-stack__current h2');
    await expect(current).toHaveText(mockJobs[0].title);
    await page.getByRole('button', { name: 'Like', exact: true }).click();
    await expect(current).toHaveText(mockJobs[1].title);
    const filter = page.getByRole('switch', {
        name: 'Only show jobs at or above the minimum match',
    });
    await filter.click();
    await expect(current).toHaveText(mockJobs[1].title);
    const threshold = page.getByRole('spinbutton', {
        name: 'Minimum match percentage',
    });
    await threshold.fill('85');
    await expect(current).toHaveCount(0);
    await threshold.fill('80');
    await expect(current).toHaveText(mockJobs[1].title);
    await filter.click();
    await expect(current).toHaveText(mockJobs[1].title);
    await page.getByRole('button', { name: 'Dislike', exact: true }).click();
    await expect(current).toHaveCount(0);
    await filter.click();
    await expect(current).toHaveCount(0);
    expect(ratedKeys).toEqual(mockJobs.map((job) => job.duplicateKey));
});

test('retries an offline Dislike without rescraping or changing the intended rating', async ({
    page,
}) => {
    const attempts: Route[] = [];
    let scrapeRequests = 0;
    page.on('request', (request) => {
        if (request.url().endsWith('/scrape/linkedin')) scrapeRequests++;
    });
    await page.route('**/jobs/create', async (route) => {
        attempts.push(route);
        if (attempts.length === 1) await route.abort('internetdisconnected');
    });
    await loadPopulatedMatchPage(page, { width: 360, height: 640 });
    await page.getByRole('button', { name: 'Dislike', exact: true }).click();
    const recovery = page.locator(
        `[data-rating-key="${mockJob.duplicateKey}"]`,
    );
    await expect(recovery.getByRole('alert')).toContainText(
        'Could not confirm Dislike',
    );
    await expect(recovery).toContainText(mockJob.title);
    await expect(page.locator('.job-card-stack__current h2')).toHaveText(
        mockJobs[1].title,
    );
    await page
        .getByRole('switch', {
            name: 'Only show jobs at or above the minimum match',
        })
        .click();
    await expect(recovery).toBeVisible();
    const controls = await page.locator('.like-container').boundingBox();
    expect(controls).not.toBeNull();
    expect(controls!.y + controls!.height).toBeLessThanOrEqual(640);
    const retry = recovery.getByRole('button', {
        name: `Retry Dislike for ${mockJob.title}`,
    });
    await retry.click();
    await expect.poll(() => attempts.length).toBe(2);
    await expect(retry).toBeDisabled();
    await expect(recovery.getByRole('status')).toContainText(
        'Retrying Dislike',
    );
    expect(attempts[1].request().postDataJSON()).toEqual({
        job: mockJob,
        like: false,
    });
    await attempts[1].fulfill({
        status: 201,
        contentType: 'application/json',
        body: '{}',
    });
    await expect(recovery).toHaveCount(0);
    await expect(page.locator('.job-card-stack__current h2')).toHaveText(
        mockJobs[1].title,
    );
    expect(attempts).toHaveLength(2);
    expect(scrapeRequests).toBe(1);
});

for (const existing of [false, true]) {
    test(`recovers a ${existing ? 'replacement' : 'first-time'} CV upload with the intended PDF`, async ({
        page,
    }) => {
        await loadPopulatedMatchPage(page, { width: 360, height: 640 });
        await page.route('**/cv/*/status', async (route) => {
            await route.fulfill({
                status: existing ? 200 : 404,
                contentType: 'application/json',
                body: '{}',
            });
        });
        await page.route('**/jobs/create', async (route) => {
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: '{}',
            });
        });
        await page.route(`**/cv/${mockJob.duplicateKey}`, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/pdf',
                body: '%PDF-1.4 previous synthetic CV',
            });
        });
        const uploads: Route[] = [];
        await page.route('**/cv/upload', async (route) => {
            uploads.push(route);
            if (uploads.length === 1)
                await route.fulfill({
                    status: existing ? 500 : 400,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'Synthetic rejection' }),
                });
        });
        await page
            .getByRole('button', {
                name: `Open ${APPLICATION_EDITOR_NAME}`,
            })
            .click();
        const editor = page.locator(`#${APPLICATION_EDITOR_DIALOG_ID}`);
        await expect(
            editor.getByRole('button', { name: 'Download CV', exact: true }),
        ).toHaveJSProperty('disabled', !existing);
        await editor.locator('input[type="file"]').setInputFiles({
            name: 'intended-cv.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4 intended synthetic CV'),
        });
        const notice = editor.getByTestId('cv-upload-notice');
        await expect(notice.getByRole('alert')).toContainText(
            'intended-cv.pdf',
        );
        await expect(notice.getByRole('alert')).toContainText('try again');
        const cvDownload = editor.getByRole('button', {
            name: 'Download CV',
            exact: true,
        });
        await expect(cvDownload).toHaveJSProperty('disabled', !existing);
        await expect(
            notice
                .locator('p')
                .filter({ hasText: 'an attached CV remains available' }),
        ).toHaveCount(existing ? 1 : 0);
        await notice.getByRole('button', { name: 'Retry CV upload' }).click();
        await expect.poll(() => uploads.length).toBe(2);
        await expect(notice.getByRole('button')).toBeDisabled();
        await expect(notice.getByRole('status')).toContainText(
            'Uploading intended-cv.pdf',
        );
        const body = uploads[1].request().postDataBuffer()!.toString();
        expect(body).toContain('filename="intended-cv.pdf"');
        expect(body).toContain('%PDF-1.4 intended synthetic CV');
        expect(body).toContain(mockJob.duplicateKey);
        await uploads[1].fulfill({
            status: 201,
            contentType: 'application/json',
            body: '{}',
        });
        await expect(notice.getByRole('status')).toContainText(
            'Uploaded intended-cv.pdf',
        );
        await expect(cvDownload).toBeEnabled();
        await expect(notice.getByRole('button')).toHaveCount(0);
        expect(uploads).toHaveLength(2);
        const width = await notice.evaluate(
            (element) => element.getBoundingClientRect().width,
        );
        expect(width).toBeLessThanOrEqual(360);
    });
}

test('keeps Application Editor focus modal, restores its launcher, and reopens cleanly', async ({
    page,
}) => {
    await loadPopulatedMatchPage(page, { width: 390, height: 844 });

    const main = page.locator('.match-page');
    const editButton = page.getByRole('button', {
        name: `Open ${APPLICATION_EDITOR_NAME}`,
    });

    await editButton.focus();
    await page.keyboard.press('Enter');

    const dialog = page.locator(`#${APPLICATION_EDITOR_DIALOG_ID}`);
    const editor = dialog.locator('.editor');
    const heading = dialog.getByRole('heading', {
        level: 1,
        name: APPLICATION_EDITOR_NAME,
    });
    const backButton = dialog.getByRole('button', { name: 'Back' });
    const actionRows = dialog.locator('.cl-action__row');

    await expect(editor).toBeVisible();
    await expect(dialog).toHaveRole('dialog');
    await expect(dialog).toHaveAccessibleName(APPLICATION_EDITOR_NAME);
    await expect(heading).toBeFocused();
    await expect(main).toHaveAttribute('inert', '');
    await expect(editButton).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Tab');
    await expect(backButton).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(actionRows.last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(backButton).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(dialog).not.toHaveClass(/overlay--open/);
    await expect(editor).toHaveCount(0);
    await expect(main).not.toHaveAttribute('inert', '');
    await expect(editButton).toHaveAttribute('aria-expanded', 'false');
    await expect(editButton).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(editor).toBeVisible();
    await expect(heading).toBeFocused();
});

test('saves the latest draft before an application download and retries a failed save', async ({
    page,
}) => {
    const uploads: Route[] = [];
    const downloadedDrafts: string[] = [];
    const draft = 'The latest synthetic application draft.';
    let persistedDraft = '';
    await page.route('**/jobs/create', async (route) => {
        await route.fulfill({ status: 201, body: '{}' });
    });
    await page.route('**/cover-letters/upload/text', (route) => {
        uploads.push(route);
    });
    await page.route('**/application/*', async (route) => {
        downloadedDrafts.push(persistedDraft);
        await route.fulfill({
            status: 200,
            contentType: 'application/pdf',
            body: '%PDF-synthetic',
        });
    });
    await loadPopulatedMatchPage(page, { width: 390, height: 844 });
    await page.route('**/cv/*/status', async (route) => {
        await route.fulfill({ status: 200, body: '{}' });
    });
    await page.evaluate(
        ({ key, draft }) => window.localStorage.setItem(key, draft),
        { key: `jobmatch.coverletter.${mockJob.duplicateKey}`, draft },
    );
    await page
        .getByRole('button', { name: `Open ${APPLICATION_EDITOR_NAME}` })
        .click();
    const editor = page.locator('.editor');
    await expect(editor).toContainText('PDF attached');
    const download = editor.getByRole('button', {
        name: 'Download application',
    });
    await download.click();
    await expect(editor.getByRole('status')).toHaveText(
        'Saving latest cover letter…',
    );
    await expect(download).toBeDisabled();
    await expect(
        editor.getByRole('button', { name: 'Download cover letter' }),
    ).toBeDisabled();
    await expect.poll(() => uploads.length).toBe(1);
    expect(downloadedDrafts).toEqual([]);
    await uploads[0].fulfill({ status: 500, body: 'Synthetic save failure' });
    await expect(editor.getByRole('alert')).toContainText(
        'Could not save the latest cover letter',
    );
    expect(downloadedDrafts).toEqual([]);

    await editor.getByRole('button', { name: 'Try download again' }).click();
    await expect.poll(() => uploads.length).toBe(2);
    expect(downloadedDrafts).toEqual([]);
    const retry = uploads[1];
    persistedDraft = retry.request().postDataJSON().coverLetterText;
    const downloaded = page.waitForEvent('download');
    await retry.fulfill({ status: 201, body: '{}' });
    expect((await downloaded).suggestedFilename()).toBe(
        'application-example-mobile-layout-test.pdf',
    );
    expect(downloadedDrafts).toEqual([draft]);
    await expect(editor.getByRole('alert')).toHaveCount(0);
    await expect(download).toBeEnabled();
});

test('keeps manual edits when generation finishes and restores the server draft', async ({
    page,
}) => {
    const generations: Route[] = [];
    const uploads: Route[] = [];
    let storedDraft = '';
    const manualDraft = 'The manual draft written while AI was working.';
    await page.route('**/jobs/create', async (route) => {
        await route.fulfill({ status: 201, body: '{}' });
    });
    await page.route('**/cover-letters/create/text', (route) => {
        generations.push(route);
    });
    await page.route('**/cover-letters/upload/text', (route) => {
        uploads.push(route);
    });
    await loadPopulatedMatchPage(page, { width: 390, height: 844 });
    await page
        .getByRole('button', { name: `Open ${APPLICATION_EDITOR_NAME}` })
        .click();
    await page.locator('.cl-action__row').first().click();
    await page.locator('.cl-generate').click();
    await expect.poll(() => generations.length).toBe(1);
    const textarea = page.locator('.cl-textarea');
    await textarea.fill(manualDraft);
    expect(uploads).toHaveLength(0);
    storedDraft = 'Generated from older context';
    await generations[0].fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ coverLetter: storedDraft, saved: true }),
    });
    await expect(textarea).toHaveValue(manualDraft);
    await expect(page.locator('.editor')).toContainText(
        'generated text was discarded',
    );
    await expect.poll(() => uploads.length).toBe(1);
    expect(uploads[0].request().postDataJSON().coverLetterText).toBe(
        manualDraft,
    );
    storedDraft = uploads[0].request().postDataJSON().coverLetterText;
    await uploads[0].fulfill({ status: 201, body: '{}' });
    await expect(page.locator('.editor .cl-meta')).toContainText(
        'Saved to server',
    );
    expect(storedDraft).toBe(manualDraft);
    expect(
        await page.evaluate(
            (key) => localStorage.getItem(key),
            `jobmatch.coverletter.${mockJob.duplicateKey}`,
        ),
    ).toBe(manualDraft);
});

test('downloads acknowledged generation after reopening without re-segmenting it', async ({
    page,
}) => {
    await page.clock.install();
    const originalSegments = [
        { kind: 'opening', text: 'Generated introduction.' },
        { kind: 'closing', text: 'Generated conclusion.' },
    ];
    let storedSegments = originalSegments;
    let plainTextUploads = 0;
    let jobStored = false;
    await page.route('**/cover-letters/create/text', async (route) => {
        await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
                coverLetter: 'Generated introduction. Generated conclusion.',
                saved: true,
            }),
        });
    });
    await page.route('**/cover-letters/upload/text', async (route) => {
        plainTextUploads++;
        storedSegments = [
            {
                kind: 'resegmented',
                text: route.request().postDataJSON().coverLetterText,
            },
        ];
        await route.fulfill({ status: 201, body: '{}' });
    });
    await page.route('**/jobs/create', async (route) => {
        jobStored = true;
        await route.fulfill({ status: 201, body: '{}' });
    });
    await page.route(
        `**/cover-letters/${mockJob.duplicateKey}`,
        async (route) => {
            await route.fulfill({
                status: jobStored ? 200 : 404,
                contentType: 'application/pdf',
                body: '%PDF-synthetic',
            });
        },
    );
    await loadPopulatedMatchPage(page, { width: 390, height: 844 });
    const launcher = page.getByRole('button', {
        name: `Open ${APPLICATION_EDITOR_NAME}`,
    });
    await launcher.click();
    await page.locator('.cl-action__row').first().click();
    await page.locator('.cl-generate').click();
    await expect(page.locator('.editor .cl-meta')).toContainText(
        'Saved to server',
    );
    await page.clock.fastForward(3100);
    await page.locator('.editor').getByRole('button', { name: 'Back' }).click();
    await page.locator('.editor').getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.editor')).toHaveCount(0);
    await launcher.click();
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download cover letter' }).click();
    expect((await file).suggestedFilename()).toBe(
        'cover-letter-example-mobile-layout-test.pdf',
    );
    expect(jobStored).toBe(true);
    expect(plainTextUploads).toBe(0);
    expect(storedSegments).toBe(originalSegments);
});

async function openKeyboardRevision(page: Page, draft: string) {
    await page.route('**/jobs/create', async (route) => {
        await route.fulfill({ status: 201, body: '{}' });
    });
    await page.route('**/cover-letters/upload/text', async (route) => {
        await route.fulfill({ status: 201, body: '{}' });
    });
    await loadPopulatedMatchPage(page, { width: 390, height: 844 });
    await page.evaluate(({ key, draft }) => localStorage.setItem(key, draft), {
        key: `jobmatch.coverletter.${mockJob.duplicateKey}`,
        draft,
    });
    await page
        .getByRole('button', { name: `Open ${APPLICATION_EDITOR_NAME}` })
        .click();
    const dialog = page.locator(`#${APPLICATION_EDITOR_DIALOG_ID}`);
    await dialog.locator('.cl-action__row').first().click();
    const textarea = dialog.locator('.cl-textarea');
    await expect(textarea).toHaveValue(draft);
    await textarea.focus();
    await textarea.press('ControlOrMeta+A');
    const form = dialog.locator('.cl-revision');
    await expect(form).toBeVisible();
    const instruction = form.getByLabel('How should AI revise this selection?');
    await instruction.fill('Make it more confident.');
    return { dialog, textarea, form, instruction };
}

for (const target of ['instruction', 'textarea'] as const) {
    test(`Escape from revision ${target} dismisses the inner form before the editor`, async ({
        page,
    }) => {
        const draft = 'A synthetic cover letter for keyboard testing.';
        const { dialog, textarea, form, instruction } =
            await openKeyboardRevision(page, draft);
        await (target === 'instruction' ? instruction : textarea).press(
            'Escape',
        );
        await expect(form).toHaveCount(0);
        await expect(dialog).toBeVisible();
        await expect(textarea).toBeFocused();
        await expect(textarea).toHaveValue(draft);
        await textarea.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(
            page.getByRole('button', {
                name: `Open ${APPLICATION_EDITOR_NAME}`,
            }),
        ).toBeFocused();
    });
}

test('Escape cancels a pending revision and allows a new keyboard-selected revision', async ({
    page,
}) => {
    let requests = 0;
    await page.route('**/cover-letters/revise/text', async (route) => {
        requests++;
        if (requests > 1)
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    replacementText: 'The current revision.',
                }),
            });
    });
    const draft = 'A synthetic draft before cancellation.';
    const { dialog, textarea, form, instruction } = await openKeyboardRevision(
        page,
        draft,
    );
    const sent = page.waitForRequest('**/cover-letters/revise/text');
    await form.getByRole('button', { name: 'Apply' }).click();
    await sent;
    const cancel = form.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeEnabled();
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(form).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(textarea).toBeEnabled();
    await expect(textarea).toBeFocused();
    await expect(textarea).toHaveValue(draft);
    await textarea.press('ControlOrMeta+A');
    await expect(instruction).toHaveValue('');
    await instruction.fill('Try a new revision.');
    await form.getByRole('button', { name: 'Apply' }).click();
    await expect(textarea).toHaveValue('The current revision.');
    await expect(form).toHaveCount(0);
    expect(requests).toBe(2);
});

test('revises the exact selected cover-letter range through the released server contract', async ({
    page,
}) => {
    const draft = 'Repeated sentence. Repeated sentence.';
    const selectedText = 'Repeated sentence.';
    const replacementText = 'Confident tailored sentence.';
    const instruction = 'Make it more specific and confident.';

    await page.route('**/cover-letters/revise/text', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ replacementText }),
        });
    });
    await page.route('**/jobs/create', async (route) => {
        await route.fulfill({ status: 201, body: '{}' });
    });
    await page.route('**/cover-letters/upload/text', async (route) => {
        await route.fulfill({ status: 201, body: '{}' });
    });
    const start = draft.lastIndexOf(selectedText);
    const { revisionCard, textarea } = await openRevisionDialog(
        page,
        { width: 390, height: 844 },
        draft,
        start,
        start + selectedText.length,
    );

    const selectionPreview = revisionCard.getByRole('group', {
        name: 'Selected text',
    });
    await expect(selectionPreview).toContainText(selectedText);
    const instructionInput = revisionCard.getByLabel(
        'How should AI revise this selection?',
    );
    await instructionInput.focus();
    await expect(instructionInput).toBeFocused();
    await expect(selectionPreview).toContainText(selectedText);
    await instructionInput.fill(instruction);
    await expect(selectionPreview).toContainText(selectedText);
    const revisionRequest = page.waitForRequest('**/cover-letters/revise/text');
    await revisionCard.getByRole('button', { name: 'Apply' }).click();
    const request = await revisionRequest;

    expect(request.postDataJSON()).toEqual({
        selectedText,
        instruction,
        coverLetterText: draft,
        job: {
            title: mockJob.title,
            company: mockJob.company,
            location: mockJob.location,
            description: mockJob.descriptionText,
        },
    });
    const updatedDraft =
        draft.slice(0, start) +
        replacementText +
        draft.slice(start + selectedText.length);
    await expect(textarea).toHaveValue(updatedDraft);
    await expect(revisionCard).toHaveCount(0);
    expect(
        await page.evaluate(
            (key) => window.localStorage.getItem(key),
            `jobmatch.coverletter.${mockJob.duplicateKey}`,
        ),
    ).toBe(updatedDraft);
});

for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
]) {
    test(`keeps revision context and controls contained at ${viewport.width}px`, async ({
        page,
    }) => {
        const selectedText = [
            'A multiline passage should remain readable while focus is elsewhere.',
            'ThisUnbrokenSelectionTextMustWrapInsteadOfWideningTheRevisionDialog'.repeat(
                4,
            ),
            'The final line keeps the preview tall enough to exercise scrolling.',
        ].join('\n');
        const draft = `Before\n${selectedText}\nAfter`;
        const start = draft.indexOf(selectedText);
        const instruction =
            'Make this passage clearer and more persuasive without changing its meaning. '.repeat(
                4,
            );

        await page.route('**/cover-letters/revise/text', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Provider failed' }),
            });
        });
        const { revisionCard } = await openRevisionDialog(
            page,
            viewport,
            draft,
            start,
            start + selectedText.length,
        );
        const selectionPreview = revisionCard.getByRole('group', {
            name: 'Selected text',
        });
        expect(
            await selectionPreview
                .locator('.cl-revision__selection-text')
                .evaluate((element) => element.textContent),
        ).toBe(selectedText);
        await expect(
            selectionPreview.locator('.cl-revision__selection-text'),
        ).toHaveCSS('white-space', 'pre-wrap');
        const previewOverflow = await selectionPreview
            .locator('.cl-revision__selection-text')
            .evaluate((element) => ({
                clientHeight: element.clientHeight,
                overflowWrap: getComputedStyle(element).overflowWrap,
                overflowY: getComputedStyle(element).overflowY,
                scrollHeight: element.scrollHeight,
            }));
        expect(previewOverflow.overflowWrap).toBe('anywhere');
        expect(previewOverflow.overflowY).toBe('auto');
        expect(previewOverflow.scrollHeight).toBeGreaterThan(
            previewOverflow.clientHeight,
        );

        const instructionInput = revisionCard.getByLabel(
            'How should AI revise this selection?',
        );
        await instructionInput.fill(instruction);
        await expect(instructionInput).toHaveCSS('box-sizing', 'border-box');
        await expectRevisionContained(page, revisionCard);

        const applyButton = revisionCard.getByRole('button', {
            name: 'Apply',
        });
        await applyButton.scrollIntoViewIfNeeded();
        await expect(applyButton).toBeVisible();
        await applyButton.click();
        await expect(revisionCard.getByRole('alert')).toHaveText(
            'Could not revise this text. Please try again.',
        );
        await expect(selectionPreview).toContainText(
            'A multiline passage should remain readable',
        );
        await expectRevisionContained(page, revisionCard);
    });
}
