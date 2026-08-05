import { test, expect } from '@playwright/test';

test.describe('Search page - distance input on mobile viewport', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');
        // Clear any saved search state from previous runs so the empty
        // state (and its "Add keywords" entry point) is shown.
        await page.evaluate(() => window.localStorage.clear());
        await page.reload();
    });

    test('renders with non-zero height and accepts input', async ({
        page,
    }) => {
        await page.getByRole('button', { name: 'Add keywords' }).click();

        const distanceInput = page.locator('#se-distance');
        await expect(distanceInput).toBeVisible();

        const distanceBox = await distanceInput.boundingBox();
        expect(distanceBox).not.toBeNull();
        expect(distanceBox!.height).toBeGreaterThan(0);

        const numContainerBox = await page
            .locator('.se-num')
            .first()
            .boundingBox();
        expect(numContainerBox).not.toBeNull();
        expect(numContainerBox!.height).toBeGreaterThan(0);

        await distanceInput.fill('25');
        await expect(distanceInput).toHaveValue('25');
    });
});
