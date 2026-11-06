import { expect, test } from '@playwright/test';

test('picks a country, then a mountain, then starts loading it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Choose a country' })).toBeVisible();
  for (const name of ['Nepal', 'India', 'Bangladesh']) {
    await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  }
  await expect(page.getByText('Contains modified Copernicus DEM data')).toBeVisible();

  await page.getByRole('button', { name: /Nepal/ }).click();
  await expect(page.getByRole('heading', { name: 'Nepal — choose a mountain' })).toBeVisible();
  const mera = page.getByRole('button', { name: /Mera Peak/ });
  await expect(mera).toBeEnabled();
  await expect(mera).toContainText('6,476 m');
  await expect(mera).toContainText('Climb');
  const island = page.getByRole('button', { name: /Island Peak/ });
  await expect(island).toBeDisabled();
  await expect(island).toContainText('Coming soon');

  await page.getByRole('button', { name: /Countries/ }).click();
  await page.getByRole('button', { name: /Bangladesh/ }).click();
  await expect(page.getByRole('button', { name: /Keokradong/ })).toContainText('≈ 986 m');

  await page.getByRole('button', { name: /Countries/ }).click();
  await page.getByRole('button', { name: /Nepal/ }).click();
  await page.getByRole('button', { name: /Mera Peak/ }).click();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-mountain', 'mera-peak');
  expect(errors).toEqual([]);
});

test('leaves a deep-linked game for the country screen', async ({ page }) => {
  await page.goto('/?mountain=test-peak');
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Choose another mountain' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a country' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('an unknown mountain id offers a way to the menu', async ({ page }) => {
  await page.goto('/?mountain=nowhere');
  await expect(page.getByRole('alert')).toContainText('Unknown mountain "nowhere".');
  await page.getByRole('button', { name: 'Choose a mountain' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a country' })).toBeVisible();
});
