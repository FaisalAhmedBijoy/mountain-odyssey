import { expect, test } from '@playwright/test';

test('loads the test mountain and shows the HUD at Khare', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?mountain=test-peak');
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('altitude')).toHaveText(/^5,0\d\d m$/);
  await expect(page.getByTestId('guide')).toContainText(/High Camp · \d+(\.\d)? (m|km)/);
  await expect(page.getByText('Click to play')).toBeVisible();
  await expect(page.getByText('Synthetic test terrain')).toBeVisible();
  expect(errors).toEqual([]);
});

test('shows a clear error for an unknown mountain', async ({ page }) => {
  await page.goto('/?mountain=nowhere');
  await expect(page.getByRole('alert')).toContainText('Unknown mountain "nowhere"');
});
