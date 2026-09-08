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

    test('renders with non-zero height and accepts input', async ({ page }) => {
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

    test('keeps keyboard focus in the named dialog and restores its launcher', async ({
        page,
    }) => {
        const main = page.locator('.match-page');
        const trigger = page.getByRole('button', { name: 'Add keywords' });

        await trigger.focus();
        await page.keyboard.press('Enter');

        const dialog = page.locator('#search-dialog');
        const heading = dialog.getByRole('heading', {
            level: 1,
            name: 'Search Jobs',
        });
        const backButton = dialog.getByRole('button', { name: 'Back' });
        const lastControl = dialog.locator('#se-date-posted');

        await expect(dialog).toHaveRole('dialog');
        await expect(dialog).toHaveAccessibleName('Search Jobs');
        await expect(heading).toBeFocused();
        await expect(main).toHaveAttribute('inert', '');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');

        await page.keyboard.press('Tab');
        await expect(backButton).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(lastControl).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(backButton).toBeFocused();

        await page.keyboard.press('Escape');

        await expect(dialog).not.toHaveClass(/overlay--open/);
        await expect(main).not.toHaveAttribute('inert', '');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(trigger).toBeFocused();
    });
});
