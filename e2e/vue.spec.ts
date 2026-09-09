import { test, expect, type Locator, type Page } from '@playwright/test';
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
