import { test, expect } from '@playwright/test';

/**
 * End-to-End Tests for Paste Deletion Flow
 * 
 * These tests verify that the delete functionality works correctly across
 * different scenarios including success cases, error cases, and edge cases.
 * 
 * Test Coverage:
 * - Successful deletion with valid token
 * - Invalid/missing deletion tokens
 * - Missing paste ID
 * - Already deleted/non-existent pastes
 * - UI loading states and feedback
 * - Error message clarity
 * - Button state management
 * 
 * These tests ensure that:
 * 1. Users can successfully delete pastes with valid deletion tokens
 * 2. Invalid deletion attempts are properly blocked
 * 3. Error messages are clear and helpful
 * 4. UI provides proper feedback during deletion process
 * 5. Security is maintained (unauthorized deletions are prevented)
 */

test.describe('Delete Page - Valid Deletion Flow', () => {
  test('should successfully delete a paste with valid token', async ({ page }) => {
    // Mock successful deletion - add delay to see loading state
    await page.route('**/api/pastes/test-paste-123**', async route => {
      if (route.request().method() === 'DELETE') {
        // Add small delay to allow loading state to be visible
        await new Promise(resolve => setTimeout(resolve, 100));
        await route.fulfill({
          status: 204,
          body: ''
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to delete page with valid parameters
    await page.goto('/delete.html?p=test-paste-123&token=valid-token-456');

    // Verify confirmation message is shown
    await expect(page.locator('.message.info')).toBeVisible();
    await expect(page.locator('.message.info')).toContainText('Confirm Deletion');
    await expect(page.locator('.message.info')).toContainText('Are you sure you want to permanently delete this paste?');

    // Verify delete button is present and enabled
    const deleteBtn = page.locator('#confirmDelete');
    await expect(deleteBtn).toBeVisible();
    await expect(deleteBtn).toBeEnabled();
    await expect(deleteBtn).toHaveText('Yes, Delete Paste');

    // Click delete button and immediately check loading state
    const clickPromise = deleteBtn.click();
    
    // Wait for loading state (button disabled and shows "Deleting...")
    await expect(deleteBtn).toBeDisabled({ timeout: 1000 });
    await expect(deleteBtn).toContainText('Deleting...');
    
    // Wait for click to complete
    await clickPromise;

    // Wait for success message (button will be removed when content is replaced)
    await expect(page.locator('.message.success')).toBeVisible();
    await expect(page.locator('.message.success')).toContainText('Paste Deleted');
    await expect(page.locator('.message.success')).toContainText('The paste has been permanently deleted');

    // Verify delete button is no longer visible (content replaced)
    await expect(deleteBtn).not.toBeVisible();
  });

  test('should handle 200 OK response as success', async ({ page }) => {
    // Some servers might return 200 instead of 204
    await page.route('**/api/pastes/test-paste-123**', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/delete.html?p=test-paste-123&token=valid-token-456');
    await page.click('#confirmDelete');

    // Should show success message for 200 OK
    await expect(page.locator('.message.success')).toBeVisible();
    await expect(page.locator('.message.success')).toContainText('Paste Deleted');
  });
});

test.describe('Delete Page - Invalid Token/Unauthorized', () => {
  test('should show error for invalid deletion token', async ({ page }) => {
    // Mock 403 Forbidden response - add delay to see loading state
    await page.route('**/api/pastes/test-paste-123**', async route => {
      if (route.request().method() === 'DELETE') {
        // Add small delay to allow loading state to be visible
        await new Promise(resolve => setTimeout(resolve, 100));
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'invalid_token' })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/delete.html?p=test-paste-123&token=wrong-token');
    
    const deleteBtn = page.locator('#confirmDelete');
    
    // Click and check loading state immediately
    const clickPromise = deleteBtn.click();
    await expect(deleteBtn).toBeDisabled({ timeout: 1000 });
    await expect(deleteBtn).toContainText('Deleting...');
    await clickPromise;

    // Wait for error message
    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Deletion Failed');
    await expect(page.locator('.message.error')).toContainText('invalid_token');

    // Note: Button is removed when content.innerHTML is replaced with error message
    // This is current behavior - button is not restored on error
    await expect(deleteBtn).not.toBeVisible();
  });

  test('should show error when token is missing from URL', async ({ page }) => {
    // Navigate without token parameter
    await page.goto('/delete.html?p=test-paste-123');

    // Should show error immediately without making API call
    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Invalid Delete Link');
    await expect(page.locator('.message.error')).toContainText('Missing paste ID or deletion token');

    // Delete button should not be present
    await expect(page.locator('#confirmDelete')).not.toBeVisible();
  });

  test('should show error for backend unauthorized response', async ({ page }) => {
    // Mock 401 Unauthorized response
    await page.route('**/api/pastes/test-paste-123**', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unauthorized' })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/delete.html?p=test-paste-123&token=expired-token');
    await page.click('#confirmDelete');

    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Deletion Failed');
  });
});

test.describe('Delete Page - Missing/Invalid Parameters', () => {
  test('should show error when paste ID is missing', async ({ page }) => {
    // Navigate without paste ID
    await page.goto('/delete.html?token=some-token');

    // Should show error immediately
    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Invalid Delete Link');
    await expect(page.locator('.message.error')).toContainText('Missing paste ID or deletion token');
  });

  test('should show error when both parameters are missing', async ({ page }) => {
    // Navigate with no parameters
    await page.goto('/delete.html');

    // Should show error immediately
    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Invalid Delete Link');
    await expect(page.locator('.message.error')).toContainText('Missing paste ID or deletion token');
  });

  test('should handle empty parameter values', async ({ page }) => {
    // Navigate with empty parameters
    await page.goto('/delete.html?p=&token=');

    // Should show error for empty values
    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Invalid Delete Link');
  });
});

test.describe('Delete Page - Non-Existent Pastes', () => {
  test('should show error when paste does not exist (404)', async ({ page }) => {
    // Mock 404 Not Found response
    await page.route('**/api/pastes/non-existent-id**', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Paste not found' })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/delete.html?p=non-existent-id&token=some-token');
    await page.click('#confirmDelete');

    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Deletion Failed');
    await expect(page.locator('.message.error')).toContainText('Paste not found');
  });

  test('should handle already deleted paste gracefully', async ({ page }) => {
    // Mock 404 for already deleted paste
    await page.route('**/api/pastes/already-deleted**', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Paste not found or already deleted' })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/delete.html?p=already-deleted&token=valid-token');
    await page.click('#confirmDelete');

    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Deletion Failed');
  });
});

test.describe('Delete Page - Network and Server Errors', () => {
  test('should show error on network failure', async ({ page }) => {
    // Simulate network error - add delay to see loading state
    await page.route('**/api/pastes/test-paste**', async route => {
      if (route.request().method() === 'DELETE') {
        // Add small delay to allow loading state to be visible
        await new Promise(resolve => setTimeout(resolve, 100));
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });

    await page.goto('/delete.html?p=test-paste&token=test-token');
    
    const deleteBtn = page.locator('#confirmDelete');
    
    // Click and check loading state immediately
    const clickPromise = deleteBtn.click();
    await expect(deleteBtn).toBeDisabled({ timeout: 1000 });
    await expect(deleteBtn).toContainText('Deleting...');
    await clickPromise;

    // Should show network error message
    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Deletion Failed');
    await expect(page.locator('.message.error')).toContainText('Error:');

    // Note: Button is removed when content.innerHTML is replaced with error message
    await expect(deleteBtn).not.toBeVisible();
  });

  test('should handle 500 server error', async ({ page }) => {
    // Mock 500 Internal Server Error
    await page.route('**/api/pastes/test-paste**', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/delete.html?p=test-paste&token=test-token');
    await page.click('#confirmDelete');

    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Deletion Failed');
    await expect(page.locator('.message.error')).toContainText('Internal server error');
  });

  test('should handle non-JSON error responses', async ({ page }) => {
    // Mock response with non-JSON body - add delay to see loading state
    await page.route('**/api/pastes/test-paste**', async route => {
      if (route.request().method() === 'DELETE') {
        // Add small delay to allow loading state to be visible
        await new Promise(resolve => setTimeout(resolve, 100));
        await route.fulfill({
          status: 400,
          contentType: 'text/plain',
          body: 'Bad Request'
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/delete.html?p=test-paste&token=test-token');
    
    const deleteBtn = page.locator('#confirmDelete');
    
    // Click and check loading state immediately
    const clickPromise = deleteBtn.click();
    await expect(deleteBtn).toBeDisabled({ timeout: 1000 });
    await expect(deleteBtn).toContainText('Deleting...');
    await clickPromise;

    // Should show fallback error message
    await expect(page.locator('.message.error')).toBeVisible();
    await expect(page.locator('.message.error')).toContainText('Deletion Failed');
    await expect(page.locator('.message.error')).toContainText('Error: Unknown error');

    // Note: Button is removed when content.innerHTML is replaced with error message
    await expect(deleteBtn).not.toBeVisible();
  });
});

test.describe('Delete Page - UI and UX', () => {
  test('should properly encode special characters in URL parameters', async ({ page }) => {
    const specialId = 'paste-with-special-chars!@#';
    const specialToken = 'token-with-special!@#$%';
    const encodedId = encodeURIComponent(specialId);
    const encodedToken = encodeURIComponent(specialToken);

    await page.route(`**/api/pastes/${encodedId}**`, async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 204,
          body: ''
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/delete.html?p=${encodedId}&token=${encodedToken}`);
    await page.click('#confirmDelete');

    await expect(page.locator('.message.success')).toBeVisible();
  });

  test('should have proper button styling and states', async ({ page }) => {
    await page.route('**/api/pastes/test-paste?token=test-token', async route => {
      // Delay response to see loading state
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 204,
        body: ''
      });
    });

    await page.goto('/delete.html?p=test-paste&token=test-token');

    const deleteBtn = page.locator('#confirmDelete');
    
    // Initial state - enabled and danger styling
    await expect(deleteBtn).toBeEnabled();
    await expect(deleteBtn).toHaveClass(/danger/);

    // Click and verify loading state
    await deleteBtn.click();
    await expect(deleteBtn).toBeDisabled();
    await expect(deleteBtn).toContainText('Deleting...');
  });

  test('should show cancel button that closes window', async ({ page }) => {
    await page.goto('/delete.html?p=test-paste&token=test-token');

    // Verify cancel button exists
    const cancelBtn = page.locator('button:has-text("Cancel")');
    await expect(cancelBtn).toBeVisible();
    await expect(cancelBtn).toBeEnabled();
  });

  test('should display version information', async ({ page }) => {
    await page.goto('/delete.html?p=test-paste&token=test-token');

    // Verify version display
    const versionDisplay = page.locator('.version-display');
    await expect(versionDisplay).toBeVisible();
    await expect(versionDisplay).toContainText('v1.4.7');
    
    // Verify it links to GitHub
    await expect(versionDisplay).toHaveAttribute('href', 'https://github.com/SnarkyB/delerium-paste');
  });
});

test.describe('Delete Page - Accessibility', () => {
  test('should have proper page title', async ({ page }) => {
    await page.goto('/delete.html?p=test-paste&token=test-token');
    await expect(page).toHaveTitle('Delete Paste');
  });

  test('should have proper heading structure', async ({ page }) => {
    await page.goto('/delete.html?p=test-paste&token=test-token');
    
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Delete Paste');
  });

  test('should have visible and clear warning messages', async ({ page }) => {
    await page.goto('/delete.html?p=test-paste&token=test-token');
    
    // Verify warning message is prominent
    await expect(page.locator('.message.info')).toBeVisible();
    await expect(page.locator('.message.info strong')).toContainText('Confirm Deletion');
    await expect(page.locator('.message.info')).toContainText('This action cannot be undone');
  });
});

test.describe('Delete Page - Security', () => {
  test('should have proper CSP headers', async ({ page }) => {
    await page.goto('/delete.html?p=test-paste&token=test-token');
    
    // Verify CSP meta tag exists
    const cspMeta = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(cspMeta).toHaveCount(1);
    
    const cspContent = await cspMeta.getAttribute('content');
    expect(cspContent).toContain("default-src 'self'");
    expect(cspContent).toContain("frame-ancestors 'none'");
  });

  test('should have no-referrer policy', async ({ page }) => {
    await page.goto('/delete.html?p=test-paste&token=test-token');
    
    const referrerMeta = page.locator('meta[name="referrer"]');
    await expect(referrerMeta).toHaveAttribute('content', 'no-referrer');
  });

  test('should encode URL parameters in API requests', async ({ page }) => {
    let requestUrl = '';
    
    await page.route('**/api/pastes/**', async route => {
      if (route.request().method() === 'DELETE') {
        requestUrl = route.request().url();
        await route.fulfill({
          status: 204,
          body: ''
        });
      } else {
        await route.continue();
      }
    });

    const testId = 'test<>paste';
    const testToken = 'token&special=chars';
    
    await page.goto(`/delete.html?p=${encodeURIComponent(testId)}&token=${encodeURIComponent(testToken)}`);
    await page.click('#confirmDelete');

    // Wait for request to complete
    await page.waitForTimeout(500);

    // Verify URL parameters were properly encoded
    expect(requestUrl).toContain(encodeURIComponent(testId));
    expect(requestUrl).toContain(encodeURIComponent(testToken));
  });
});
