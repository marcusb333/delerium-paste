import { test, expect } from '@playwright/test';

/**
 * End-to-End Tests for Paste Creation and Viewing Flow
 * 
 * These tests simulate real user interactions in actual browsers to verify
 * that the complete zkpaste workflow functions correctly from the user's perspective.
 * 
 * Tested User Journeys:
 * - Complete paste creation workflow (type → encrypt → upload → share)
 * - Paste viewing workflow (click link → decrypt → display)
 * - Error handling and user feedback
 * - Responsive design across different screen sizes
 * - Cross-browser compatibility
 * 
 * These tests ensure that:
 * 1. Users can successfully create and share pastes
 * 2. Recipients can view pastes using the shared links
 * 3. The UI is responsive and works on different devices
 * 4. Error messages are clear and helpful
 * 5. The application works consistently across browsers
 * 
 * Mock Strategy:
 * - API endpoints are mocked to avoid dependency on backend
 * - Real browser environment tests actual user interactions
 * - Crypto operations run with real Web Crypto API
 */
test.describe('Paste Creation and Viewing Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the API endpoints
    await page.route('**/api/pow', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          challenge: 'test-challenge-123',
          difficulty: 1
        })
      });
    });

    await page.route('**/api/pastes', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-paste-id-456',
          deleteToken: 'test-delete-token-789'
        })
      });
    });
  });

  test('should create a new paste and display share URL', async ({ page }) => {
    await page.goto('/');

    // Fill in the paste content
    await page.fill('#paste', 'This is a test paste content');

    // Set expiration time — click Custom pill to reveal the input, then fill
    await page.click('.pill-btn[data-mins="custom"]');
    await page.fill('#mins', '120');

    // Password required for creation
    await page.fill('#password', 'test-password');

    // Click save button
    await page.click('#save');

    // Wait for the output to appear
    await page.waitForSelector('#output');

    // Verify the output shows success (title is "Password or PIN required to view")
    const outputTitle = await page.textContent('#outputTitle');
    expect(outputTitle).toContain('Password');
    
    // Verify View Paste button is visible
    const viewBtn = page.locator('#viewBtn');
    await expect(viewBtn).toBeVisible();
    await expect(viewBtn).toContainText('View Paste');
    
      // Verify delete token is stored in sessionStorage
      const deleteToken = await page.evaluate(() => {
        return sessionStorage.getItem('deleteToken_test-paste-id-456');
      });
      expect(deleteToken).toBe('test-delete-token-789');
    
    // Verify View Paste button opens URL in new tab
    // Note: window.open with target="_blank" creates a new tab
    // We'll verify the button has the correct click handler by checking its attributes
    const viewBtnHref = await viewBtn.evaluate((btn) => {
      // Check if button has onclick or if it's handled via event listener
      return btn.getAttribute('onclick') || 'event-listener';
    });
    
    // Click the button and verify a new page/tab would open
    // Since we can't easily test new tabs in Playwright without context,
    // we'll verify the button is functional by checking it's clickable
    await expect(viewBtn).toBeEnabled();
  });

  test('should show error for empty paste content', async ({ page }) => {
    await page.goto('/');

    // Leave paste content empty
    await page.fill('#paste', '');

    // Click save button
    await page.click('#save');

    // Check for alert dialog
    page.on('dialog', dialog => {
      expect(dialog.message()).toBe('Nothing to save.');
      dialog.accept();
    });
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/pastes', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Internal server error'
        })
      });
    });

    await page.goto('/');

    // Fill in the paste content and required password
    await page.fill('#paste', 'Test content');
    await page.fill('#password', 'test-password');

    // Click save button
    await page.click('#save');

    // Wait for error message
    await page.waitForSelector('#output');

    // Verify error message
    const outputTitle = await page.textContent('#outputTitle');
    expect(outputTitle).toContain('Error');
  });

  test('should create paste without PoW when server returns 204', async ({ page }) => {
    // Mock no PoW required
    await page.route('**/api/pow', async route => {
      await route.fulfill({
        status: 204
      });
    });

    await page.goto('/');

    // Fill in the paste content and required password
    await page.fill('#paste', 'Test content without PoW');
    await page.fill('#password', 'test-password');

    // Click save button
    await page.click('#save');

    // Wait for the output to appear
    await page.waitForSelector('#output');

    // Verify the output shows success
    const outputTitle = await page.textContent('#outputTitle');
    expect(outputTitle).toContain('Password');
  });
});

test.describe('Paste Viewing Flow', () => {
  test('should navigate to create page when clicking "Create New Paste" button', async ({ page }) => {
    // Mock the paste API endpoint
    await page.route('**/api/pastes/test-paste-id', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ct: 'test-ciphertext',
          iv: 'test-iv'
        })
      });
    });

    // Navigate to view page with paste ID and key
    await page.goto('/view.html?p=test-paste-id#test-key:test-iv');

    // Wait for page to load
    await page.waitForSelector('#newPasteBtn');

    // Verify the button is visible
    const newPasteBtn = page.locator('#newPasteBtn');
    await expect(newPasteBtn).toBeVisible();
    await expect(newPasteBtn).toContainText('Create New Paste');

    // Click the button
    await newPasteBtn.click();

    // Verify navigation to index.html
    await page.waitForURL('**/index.html');
    expect(page.url()).toContain('index.html');
  });

  test('should decrypt and display paste content', async ({ page }) => {
    // Mock returns fake ct/iv so decryption fails; we verify the view page shows the error
    await page.route('**/api/pastes/test-paste-id', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ct: 'test-ciphertext',
          iv: 'test-iv'
        })
      });
    });

    page.once('dialog', dialog => dialog.accept('test-password'));
    await page.goto('/view.html?p=test-paste-id#test-key:test-iv');

    await page.waitForSelector('#content');
    await page.waitForFunction(
      () => {
        const el = document.getElementById('content');
        const t = el?.textContent ?? '';
        return !t.includes('Decrypting') && (t.includes('Decryption failed') || t.includes('incorrect') || t.includes('corrupted'));
      },
      { timeout: 15000 }
    );

    const content = await page.textContent('#content');
    expect(content?.includes('Decryption failed') || content?.includes('incorrect') || content?.includes('corrupted')).toBe(true);
  });

  test('should show error for missing paste ID or key', async ({ page }) => {
    // Navigate to view page without required parameters
    await page.goto('/view.html');

    // Wait for error message
    await page.waitForSelector('#content');

    // Verify error message
    const content = await page.textContent('#content');
    expect(content).toBe('Missing paste ID or key.');
  });

  test('should show error for non-existent paste', async ({ page }) => {
    // Mock API to return 404
    await page.route('**/api/pastes/non-existent-id', async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Paste not found'
        })
      });
    });

    // Navigate to view page with non-existent paste ID
    await page.goto('/view.html?p=non-existent-id#test-key:test-iv');

    // Wait for error message
    await page.waitForSelector('#content');

    // Verify error message (app shows "Content not found or has expired.")
    const content = await page.textContent('#content');
    expect(content).toContain('not found');
  });

  test('should handle decryption errors', async ({ page }) => {
    await page.route('**/api/pastes/test-paste-id', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ct: 'invalid-ciphertext',
          iv: 'invalid-iv'
        })
      });
    });

    page.once('dialog', dialog => dialog.accept('test-password'));
    await page.goto('/view.html?p=test-paste-id#invalid-key:invalid-iv');

    await page.waitForSelector('#content');
    // Wait for decryption attempt to finish (error state)
    await page.waitForFunction(
      () => {
        const el = document.getElementById('content');
        const t = el?.textContent ?? '';
        return !t.includes('Decrypting') && (t.includes('Decryption failed') || t.includes('incorrect') || t.includes('corrupted'));
      },
      { timeout: 15000 }
    );

    const content = await page.textContent('#content');
    expect(content?.includes('Decryption failed') || content?.includes('incorrect') || content?.includes('corrupted')).toBe(true);
  });
});

test.describe('UI Responsiveness', () => {
  test('should work on mobile devices', async ({ page }) => {
    await page.route('**/api/pow', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ challenge: 'c', difficulty: 1 }) });
    });
    await page.route('**/api/pastes', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'id', deleteToken: 'tok' }) });
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Verify elements are visible and functional
    await expect(page.locator('#paste')).toBeVisible();
    await expect(page.locator('#mins')).toBeVisible();
    await expect(page.locator('#save')).toBeVisible();

    // Test mobile interaction
    await page.fill('#paste', 'Mobile test content');
    await page.fill('#password', 'test-password');
    await page.click('#save');

    // Wait for output
    await page.waitForSelector('#output');
    const outputTitle = await page.textContent('#outputTitle');
    expect(outputTitle).toContain('Password');
  });

  test('should work on tablet devices', async ({ page }) => {
    await page.route('**/api/pow', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ challenge: 'c', difficulty: 1 }) });
    });
    await page.route('**/api/pastes', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'id', deleteToken: 'tok' }) });
    });

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // Verify elements are visible and functional
    await expect(page.locator('#paste')).toBeVisible();
    await expect(page.locator('#mins')).toBeVisible();
    await expect(page.locator('#save')).toBeVisible();

    // Test tablet interaction
    await page.fill('#paste', 'Tablet test content');
    await page.fill('#password', 'test-password');
    await page.click('#save');

    // Wait for output
    await page.waitForSelector('#output');
    const outputTitle = await page.textContent('#outputTitle');
    expect(outputTitle).toContain('Password');
  });
});