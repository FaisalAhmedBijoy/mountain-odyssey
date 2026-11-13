import { expect, test } from '@playwright/test';

test('Mera prep shows the pack weight, the over-weight warning and keeps boots', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /Nepal/ }).click();
  await page.getByRole('button', { name: /Mera Peak/ }).click();
  await expect(page.getByTestId('pack-weight')).toHaveText('28.7 / 20 kg');
  await expect(page.getByTestId('prep-warnings')).toContainText(
    'Over 20 kg: −18 % speed, +27 % stamina use.',
  );
  await expect(page.getByRole('button', { name: /Mountaineering boots/ })).toBeDisabled();

  await page.getByRole('button', { name: 'Remove O₂ bottle' }).click();
  await page.getByRole('button', { name: 'Remove O₂ bottle' }).click();
  await expect(page.getByTestId('count-o2')).toHaveText('0');
  await expect(page.getByTestId('pack-weight')).toHaveText('21.7 / 20 kg');

  await page.getByRole('button', { name: /Ice axe/ }).click();
  await expect(page.getByTestId('prep-warnings')).toContainText(
    'No ice axe: you cannot climb snow or ice.',
  );

  await page.getByRole('button', { name: 'Mountains', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nepal — choose a mountain' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Patharia prep is light and starts that mountain', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Bangladesh/ }).click();
  await page.getByRole('button', { name: /Patharia Hills/ }).click();
  await expect(page.getByTestId('pack-weight')).toHaveText('12.2 / 20 kg');
  await expect(page.getByTestId('prep-warnings')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start climb' }).click();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-mountain', 'patharia');
});
