/**
 * @jest-environment jsdom
 */

/**
 * Link Popup Tests
 *
 * Tests for setupLinkInterception — the feature that intercepts clicks on
 * links inside rendered paste content and shows a popup offering
 * "Copy Link" and "Open in New Tab" instead of navigating away.
 */

import { setupLinkInterception } from '../../../src/presentation/components/paste-viewer-view.js';

describe('setupLinkInterception', () => {
  let container: HTMLElement;
  let windowOpenSpy: jest.SpyInstance;
  let clipboardSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create a content container with some rendered links
    container = document.createElement('div');
    container.id = 'content';
    container.innerHTML = `
      <p>Some text with <a href="https://example.com">a link</a> and
      <a href="https://other.org/path?q=1">another link</a>.</p>
      <p>Plain text paragraph (no link).</p>
    `;
    document.body.appendChild(container);

    windowOpenSpy = jest.spyOn(window, 'open').mockReturnValue(null);

    // Mock clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    clipboardSpy = navigator.clipboard.writeText as jest.Mock;

    setupLinkInterception(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    windowOpenSpy.mockRestore();
    jest.clearAllTimers();
  });

  // ─── Popup appearance ───────────────────────────────────────────────────────

  it('should show a popup when a link in the content is clicked', () => {
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    anchor.click();

    const popup = document.querySelector('.link-popup');
    expect(popup).not.toBeNull();
  });

  it('should show "Copy Link" and "Open in New Tab" buttons in the popup', () => {
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    anchor.click();

    const buttons = document.querySelectorAll('.link-popup-btn');
    const labels = Array.from(buttons).map(b => b.textContent);
    expect(labels).toContain('Copy Link');
    expect(labels).toContain('Open in New Tab');
  });

  it('should not show a popup when a non-link element is clicked', () => {
    const para = container.querySelector('p:last-child') as HTMLElement;
    para.click();

    const popup = document.querySelector('.link-popup');
    expect(popup).toBeNull();
  });

  it('should prevent default navigation when a link is clicked', () => {
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

    anchor.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  // ─── Open in New Tab ─────────────────────────────────────────────────────────

  it('should open link in a new tab when "Open in New Tab" is clicked', () => {
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    anchor.click();

    const openBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('.link-popup-btn'))
      .find(b => b.textContent === 'Open in New Tab')!;
    openBtn.click();

    expect(windowOpenSpy).toHaveBeenCalledWith(
      anchor.href,
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('should pass noopener and noreferrer when opening a new tab', () => {
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    anchor.click();

    const openBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('.link-popup-btn'))
      .find(b => b.textContent === 'Open in New Tab')!;
    openBtn.click();

    const [, target, features] = windowOpenSpy.mock.calls[0];
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
    expect(features).toContain('noreferrer');
  });

  it('should dismiss the popup after "Open in New Tab" is clicked', () => {
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    anchor.click();

    const openBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('.link-popup-btn'))
      .find(b => b.textContent === 'Open in New Tab')!;
    openBtn.click();

    const popup = document.querySelector('.link-popup');
    expect(popup).toBeNull();
  });

  // ─── Copy Link ──────────────────────────────────────────────────────────────

  it('should copy the link URL to the clipboard when "Copy Link" is clicked', () => {
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    anchor.click();

    const copyBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('.link-popup-btn'))
      .find(b => b.textContent === 'Copy Link')!;
    copyBtn.click();

    expect(clipboardSpy).toHaveBeenCalledWith(anchor.href);
  });

  it('should show "✓ Copied!" confirmation after copying', () => {
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    anchor.click();

    const copyBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('.link-popup-btn'))
      .find(b => b.textContent === 'Copy Link')!;
    copyBtn.click();

    expect(copyBtn.textContent).toBe('✓ Copied!');
  });

  // ─── Popup dismissal ─────────────────────────────────────────────────────────

  it('should dismiss the popup when the Escape key is pressed', () => {
    jest.useFakeTimers();
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    anchor.click();

    // Flush the deferred listener registration
    jest.runAllTimers();

    expect(document.querySelector('.link-popup')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('.link-popup')).toBeNull();
    jest.useRealTimers();
  });

  it('should dismiss the popup when clicking outside of it', () => {
    jest.useFakeTimers();
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    anchor.click();

    jest.runAllTimers();

    expect(document.querySelector('.link-popup')).not.toBeNull();

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('.link-popup')).toBeNull();
    jest.useRealTimers();
  });

  it('should replace an existing popup when a second link is clicked', () => {
    const anchors = container.querySelectorAll('a');
    anchors[0].click();
    expect(document.querySelectorAll('.link-popup').length).toBe(1);

    anchors[1].click();
    expect(document.querySelectorAll('.link-popup').length).toBe(1);
  });

  // ─── Security ────────────────────────────────────────────────────────────────

  it('should not show a popup for javascript: links', () => {
    container.innerHTML = '<p><a href="javascript:alert(1)">bad link</a></p>';
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    anchor.click();

    expect(document.querySelector('.link-popup')).toBeNull();
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('should not navigate to the current tab when a link is clicked', () => {
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    // window.location.href should not have been set to the link URL
    // (JSDOM doesn't throw on location.href assignment, so we just verify
    // that window.open was NOT called for navigation, and the popup appeared)
    expect(document.querySelector('.link-popup')).not.toBeNull();
    expect(windowOpenSpy).not.toHaveBeenCalled(); // not opened yet, only on button click
  });
});
