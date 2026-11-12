import { expect, test } from '@playwright/test';

test('loads the test mountain and shows the HUD at Khare', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shaderErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /shader|WebGLProgram/i.test(m.text())) shaderErrors.push(m.text());
  });
  await page.goto('/?mountain=test-peak');
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('altitude')).toHaveText(/^5,0\d\d m$/);
  await expect(page.getByTestId('guide')).toContainText(/High Camp · \d+(\.\d)? (m|km)/);
  for (const name of ['Stamina', 'Oxygen', 'Warmth', 'Supplies']) {
    await expect(page.getByRole('meter', { name })).toBeVisible();
  }
  await expect(page.getByTestId('items')).toHaveText('Food 4 · Water 4 · O₂ 2 · Pack 28.7 kg');
  await expect(page.getByText('Click to play')).toBeVisible();
  const controls = page.getByTestId('controls');
  await expect(controls).toContainText('Grab wall');
  await expect(controls).toContainText('Rest at camp');
  await page.keyboard.press('KeyH');
  await expect(controls).not.toContainText('Grab wall');
  await expect(controls).toContainText('Controls');
  await page.keyboard.press('KeyH');
  await expect(controls).toContainText('Grab wall');
  await expect(page.getByText('Synthetic test terrain')).toBeVisible();
  expect(errors).toEqual([]);
  expect(shaderErrors).toEqual([]);
});

test('shows a clear error for an unknown mountain', async ({ page }) => {
  await page.goto('/?mountain=nowhere');
  await expect(page.getByRole('alert')).toContainText('Unknown mountain "nowhere"');
});

test('shows the minimap and toggles the full map with Tab', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?mountain=test-peak');
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('img', { name: 'Map' })).toBeVisible();
  await page.keyboard.press('Tab');
  const dialog = page.getByRole('dialog', { name: 'Map of Test Peak' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Khare');
  await expect(dialog).toContainText('High Camp');
  await page.keyboard.press('Tab');
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});
