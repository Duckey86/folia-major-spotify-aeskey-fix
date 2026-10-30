import { expect, test } from './fixtures';

// Setup remains usable inside the real scrollable account sheet, including on narrow screens.
test('first-time setup opens official pages, saves, pairs, and stays configured on reopening', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=soloistSetup');
    const setup = page.getByTestId('soloist-setup');
    await expect(setup.getByRole('status')).toHaveText('Not Configured');
    await page.screenshot({ path: 'test-results/soloist-first-run.png' });
    await setup.getByRole('button', { name: 'Generate Soloist API Key' }).click();
    await expect(page.getByTestId('opened-link')).toHaveText('key');
    const input = setup.getByLabel('Soloist API key', { exact: true });
    await expect(input).toHaveAttribute('type', 'password');
    await input.fill('dummy-ui-test-api-key');
    await expect(setup.getByRole('button', { name: 'Save and start Soloist', exact: true })).toBeDisabled();
    await setup.getByRole('button', { name: 'Official Soloist Downloads' }).click();
    await expect(page.getByTestId('opened-link')).toHaveText('downloads');
    await setup.getByRole('button', { name: 'Locate soloist.exe' }).click();
    await setup.getByRole('button', { name: 'Save and start Soloist', exact: true }).click();
    await expect(page.getByTestId('saved')).toHaveText('true');
    await expect(setup.getByRole('status')).toHaveText('Waiting for Pairing');
    await expect(setup).toContainText('Folia Audio');
    await expect(input).toHaveCount(0);
    await page.getByRole('button', { name: 'Simulate pairing', exact: true }).click();
    await expect(setup.getByRole('status')).toHaveText('Connected');
    await page.getByRole('button', { name: 'Remount setup' }).click();
    await expect(setup.getByRole('status')).toHaveText('Connected');
    await expect(setup.getByRole('button', { name: 'Generate Soloist API Key' })).toHaveCount(0);
});

test('existing users get compact status, change-key and reconnect without repeating setup', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=soloistSetup&scenario=existing');
    const setup = page.getByTestId('soloist-setup');
    await expect(setup.getByRole('status')).toHaveText('Connected');
    await expect(setup.locator('ol')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/soloist-existing-user.png' });
    await setup.getByRole('button', { name: 'Change API Key' }).click();
    const input = setup.getByLabel('Soloist API key', { exact: true });
    await expect(input).toBeEmpty();
    await input.fill('replacement-ui-test-key');
    await setup.getByRole('button', { name: 'Cancel key change' }).click();
    await expect(input).toHaveCount(0);
    await setup.getByRole('button', { name: 'Change API Key' }).click();
    await expect(input).toBeEmpty();
    await input.fill('replacement-ui-test-key');
    await setup.getByRole('button', { name: 'Save and start Soloist', exact: true }).click();
    await expect(setup.getByRole('status')).toHaveText('Waiting for Pairing');
    await setup.getByRole('button', { name: 'Reconnect', exact: true }).click();
    await expect(page.getByTestId('saved')).toHaveText('true');
});

test('expired build recovery opens official downloads and shows replacement instructions', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=soloistSetup&scenario=expired');
    const setup = page.getByTestId('soloist-setup');
    await expect(setup.getByRole('alert')).toContainText('build has expired');
    await setup.getByRole('button', { name: 'Official Soloist Downloads' }).click();
    await expect(page.getByTestId('opened-link')).toHaveText('downloads');
    await expect(setup.getByRole('button', { name: 'Locate soloist.exe' })).toBeVisible();
});

test('the guide works in Chinese on a narrow account window', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh-CN'));
    await page.goto('/dev-probe.html?probe=soloistSetup');
    const setup = page.getByTestId('soloist-setup');
    await expect(setup.getByRole('status')).toHaveText('未配置');
    await page.screenshot({ path: 'test-results/soloist-chinese-narrow.png' });
    await setup.getByRole('button', { name: '生成 Soloist API 密钥' }).click();
    await expect(page.getByTestId('opened-link')).toHaveText('key');
    await setup.getByRole('button', { name: '选择 soloist.exe' }).click();
    const box = await setup.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
