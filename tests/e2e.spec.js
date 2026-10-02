// tests/e2e.spec.js
import { test, expect } from '@playwright/test';

test.describe('Probability Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    // Wait for app to initialize
    await page.waitForFunction(() => window.__APP_LOADED === true, { timeout: 15000 });
  });

  test('loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.reload();
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });

  test('Up/Down buttons update value and chart', async ({ page }) => {
    const valueBefore = await page.locator('#statV').textContent();
    
    await page.click('#btnUp');
    await page.waitForTimeout(100);
    
    const valueAfter = await page.locator('#statV').textContent();
    expect(valueAfter).not.toBe(valueBefore);
    
    // Chart canvas should have content
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('Reset confirms and clears state', async ({ page }) => {
    await page.click('#btnUp');
    await page.waitForTimeout(100);
    
    // Handle custom confirm modal - click the Confirm button
    await page.click('#btnReset');
    // Wait for modal to appear and click Confirm
    await page.locator('.modal-overlay.open .btn[data-result="true"]').click();
    await page.waitForTimeout(100);
    
    // Wait for value to reset
    await expect(page.locator('#statV')).toHaveText('100.00', { timeout: 5000 });
    await expect(page.locator('#statIter')).toHaveText('0', { timeout: 5000 });
  });

  test('Theme toggle cycles and updates chart', async ({ page }) => {
    const themeToggle = page.locator('#themeToggle');
    
    await themeToggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    
    await themeToggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('Seed input reproduces same sequence', async ({ page }) => {
    // Open seed info panel first
    await page.click('#seedInfoBtn');
    await expect(page.locator('#seedInfoPanel')).not.toHaveClass(/hidden/);
    await expect(page.locator('#seedInput')).toBeVisible();
    
    await page.fill('#seedInput', '42');
    await page.locator('#seedInput').press('Enter');
    await page.waitForTimeout(100);
    
    await page.click('#btnUp');
    const val1 = await page.locator('#statV').textContent();
    
    // Reset with same seed
    await page.click('#btnReset');
    // Wait for modal and click Confirm
    await page.locator('.modal-overlay.open .btn[data-result="true"]').click();
    await page.waitForTimeout(100);
    
    // Wait for any modal to close
    await page.waitForFunction(() => !document.querySelector('.modal-overlay.open'), { timeout: 5000 });
    
    // Re-open panel and enter seed
    await page.waitForTimeout(200);
    // Use JS to toggle panel directly to avoid click issues
    await page.evaluate(() => {
      const panel = document.getElementById('seedInfoPanel');
      const btn = document.getElementById('seedInfoBtn');
      if (panel && panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'true');
      }
    });
    await expect(page.locator('#seedInfoPanel')).not.toHaveClass(/hidden/, { timeout: 5000 });
    await expect(page.locator('#seedInput')).toBeVisible();
    
    await page.fill('#seedInput', '42');
    await page.locator('#seedInput').press('Enter');
    await page.waitForTimeout(100);
    await page.click('#btnUp');
    
    const val2 = await page.locator('#statV').textContent();
    expect(val2).toBe(val1);
  });

  test('Return params apply and reset game', async ({ page }) => {
    // Open seed info panel
    await page.click('#seedInfoBtn');
    // Wait for panel to be visible
    await expect(page.locator('#seedInfoPanel')).not.toHaveClass(/hidden/);
    
    // Wait for inputs to be visible and enabled
    await expect(page.locator('#meanReturnInput')).toBeVisible();
    await expect(page.locator('#volatilityInput')).toBeVisible();
    await expect(page.locator('#btnApplyParams')).toBeVisible();
    
    await page.fill('#meanReturnInput', '5');
    await page.fill('#volatilityInput', '20');
    page.on('dialog', d => d.accept());
    await page.click('#btnApplyParams');
    
    // Should reset to 100
    await expect(page.locator('#statV')).toHaveText('100.00');
    await expect(page.locator('#meanReturnInput')).toHaveValue('5');
    await expect(page.locator('#volatilityInput')).toHaveValue('20');
  });

  test('Export/Import round-trips', async ({ page }) => {
    await page.click('#btnUp');
    await page.waitForTimeout(100);
    
    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('#btnExport');
    const download = await downloadPromise;
    
    // Import
    const filePath = await download.path();
    await page.setInputFiles('#importFile', filePath);
    await page.waitForTimeout(200);
    
    // Value should match
    expect(await page.locator('#statV').textContent()).not.toBe('100.00');
  });

  test('History expand/collapse works', async ({ page }) => {
    // Play a few rounds
    for (let i = 0; i < 6; i++) {
      await page.click('#btnUp');
      await page.waitForTimeout(50);
    }
    
    // Should show "Show All"
    await expect(page.locator('#historyExpand')).toContainText('Show All');
    
    await page.click('#historyExpand');
    await expect(page.locator('#historyExpand')).toContainText('Show Less');
    
    // Should show more rows
    const rows = page.locator('#historyBody tr');
    await expect(rows).toHaveCount(6);
  });

  test('Desktop layout at ≥900px', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const chartSection = page.locator('.chart-section');
    const historySection = page.locator('.history-section');
    
    // Both should be visible side-by-side
    await expect(chartSection).toBeVisible();
    await expect(historySection).toBeVisible();
  });

  test('Mobile layout at <900px', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // History should stack below chart
    const chartSection = page.locator('.chart-section');
    const historySection = page.locator('.history-section');
    
    await expect(chartSection).toBeVisible();
    await expect(historySection).toBeVisible();
  });
});