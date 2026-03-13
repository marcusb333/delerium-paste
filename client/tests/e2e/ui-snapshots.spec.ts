/**
 * UI Snapshot Tests
 * 
 * Visual regression tests for the UI components using Playwright.
 * These tests capture screenshots and compare them to baseline images.
 */

import { test, expect } from '@playwright/test';

test.describe('UI Snapshots', () => {
  test.beforeEach(async ({ page }) => {
    // Set viewport size for consistency
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('index page - dark mode', async ({ page }) => {
    await page.goto('/');
    
    // Set dark mode
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('index-dark.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('index page - with content', async ({ page }) => {
    await page.goto('/');
    
    // Fill in the form (no #views - single-view/max-views removed from UI)
    await page.fill('#paste', 'This is a test paste content for snapshot testing.');
    await page.click('.pill-btn[data-mins="custom"]');
    await page.fill('#mins', '120');
    
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('index-with-content.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02
    });
  });

  test('index page - character counter warning', async ({ page }) => {
    await page.goto('/');
    
    // Fill textarea with enough content to trigger warning (70% of 1MB)
    const longText = 'a'.repeat(750000);
    await page.fill('#paste', longText);
    
    await page.waitForTimeout(500); // Wait for counter to update
    
    await expect(page).toHaveScreenshot('index-char-warning.png', {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02
    });
  });

  test('index page - password or PIN required', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#password', { state: 'visible' });
    await page.fill('#password', '1234');

    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('index-password-required.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02
    });
  });

  test('index page - mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');
    
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('index-mobile.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('index page - tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/');
    
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('index-tablet.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test.skip('view page - loading state', async ({ page }) => {
    await page.goto('/view.html');
    
    // Page should show loading/error since no paste ID
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('view-loading.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test.skip('view page - dark mode', async ({ page }) => {
    await page.goto('/view.html');
    
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('view-dark.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('preset buttons', async ({ page }) => {
    await page.goto('/');
    
    // Focus on preset buttons area
    const presets = page.locator('.expiration-pills');
    await expect(presets).toHaveScreenshot('preset-buttons.png');
  });

  test('checkbox group styles', async ({ page }) => {
    await page.goto('/');
    
    const checkboxes = page.locator('.option-group').nth(1);
    await expect(checkboxes).toHaveScreenshot('checkbox-group.png');
  });
});

test.describe('UI Interactions', () => {
  test('button hover states', async ({ page }) => {
    await page.goto('/');
    
    const button = page.locator('#save');
    
    // Normal state
    await expect(button).toHaveScreenshot('button-normal.png');
    
    // Hover state
    await button.hover();
    await page.waitForTimeout(200);
    await expect(button).toHaveScreenshot('button-hover.png');
  });

  test.skip('copy button states', async ({ page }) => {
    await page.goto('/');
    
    // Create a paste first
    await page.fill('#paste', 'Test content for copy button');
    await page.click('#save');
    
    // Wait for success message
    await page.waitForSelector('#output.show', { timeout: 10000 });
    
    // Get copy button
    const copyBtn = page.locator('#copyBtn');
    
    // Normal state
    await expect(copyBtn).toHaveScreenshot('copy-button-normal.png');
    
    // Click and capture "copied" state
    await copyBtn.click();
    await page.waitForTimeout(500);
    await expect(copyBtn).toHaveScreenshot('copy-button-copied.png');
  });
});

test.describe('Success and Error States', () => {
  test('success message display', async ({ page }) => {
    await page.goto('/');
    
    // Fill and submit
    await page.fill('#paste', 'Test paste content');
    await page.click('#save');
    
    // Wait for success
    await page.waitForSelector('#output.show', { timeout: 10000 });
    
    const output = page.locator('#output');
    await expect(output).toHaveScreenshot('success-output.png');
  });

  test('error message display', async ({ page }) => {
    await page.goto('/');
    
    // Try to submit without content (should fail validation)
    await page.click('#save');
    
    // Wait a bit for error to show
    await page.waitForTimeout(1000);
    
    // Check if output has error class
    const output = page.locator('#output');
    if (await output.isVisible()) {
      await expect(output).toHaveScreenshot('error-output.png');
    }
  });
});
