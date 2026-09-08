import { test, expect, type Page } from '@playwright/test';

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

async function loadPopulatedMatchPage(
    page: Page,
    viewport: { width: number; height: number },
): Promise<void> {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        window.localStorage.setItem(
            'jobmatch.searchkeywords',
            JSON.stringify(['frontend']),
        );
    });
    await page.route('**/scrape/linkedin', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body: `data: ${JSON.stringify(mockJob)}\n\n`,
        });
    });
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

test('unmounts the Application Editor after its closing animation and reopens cleanly', async ({
    page,
}) => {
    await loadPopulatedMatchPage(page, { width: 390, height: 844 });

    const overlay = page.locator('.overlay').first();
    const editor = overlay.locator('.editor');
    const editButton = page.getByRole('button', {
        name: 'Open application editor',
    });

    await editButton.click();
    await expect(editor).toBeVisible();

    await editor.getByRole('button', { name: 'Back' }).click();

    await expect(overlay).not.toHaveClass(/overlay--open/);
    await expect(editor).toHaveCount(0);

    await editButton.click();

    await expect(editor).toBeVisible();
    await expect(editor.locator('.cl-header__title')).toHaveText(
        'Application Editor',
    );
});
