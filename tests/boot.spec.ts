/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { bootToTitle } from './harness';

test('a visible boot refusal fails immediately instead of waiting for game readiness', async ({ page }) => {
  // A broken readiness wait would consume 90 seconds; the fixture's deadline
  // makes that old behavior fail without spending that entire interval.
  test.setTimeout(10_000);
  await page.route('**/*', (route) => route.fulfill({
    contentType: 'text/html', body: '<div id="boot-error">Known-bad WebGL boot refusal</div>',
  }));
  await expect(bootToTitle(page)).rejects.toThrow('Known-bad WebGL boot refusal');
});
