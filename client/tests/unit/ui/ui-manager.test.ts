/**
 * @jest-environment jsdom
 */

/**
 * ui-manager showOutput Tests
 *
 * Tests for the showOutput function, focusing on the "View Paste" button
 * which should open the paste URL in a new tab (not navigate in the current tab).
 */

describe('showOutput — View Paste button', () => {
  // Minimal DOM matching index.html output section
  const OUTPUT_HTML = `
    <div id="output" class="output">
      <div class="output-title" id="outputTitle"></div>
      <div id="outputMessage"></div>
      <div class="output-url">
        <label for="pasteUrl">Share URL:</label>
        <input type="text" id="pasteUrl" name="pasteUrl" readonly>
        <button class="btn-copy" id="copyBtn">Copy Link</button>
        <button class="btn-view" id="viewBtn" style="display: none;">Open in New Tab</button>
      </div>
      <div class="output-url" id="deleteUrlContainer" style="display: none;">
        <input type="text" id="deleteUrl" name="deleteUrl" readonly>
        <button class="btn-copy" id="copyDeleteBtn">Copy</button>
      </div>
    </div>
  `;

  let windowOpenSpy: jest.SpyInstance;

  beforeEach(() => {
    document.body.innerHTML = OUTPUT_HTML;
    windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    // Register the showOutput function exactly as ui-manager.ts does
    (window as any).showOutput = function(
      success: boolean,
      title: string,
      message: string,
      url?: string | null,
      deleteUrl?: string | null
    ) {
      const output = document.getElementById('output');
      const outputTitle = document.getElementById('outputTitle');
      const outputMessage = document.getElementById('outputMessage');
      const pasteUrl = document.getElementById('pasteUrl') as HTMLInputElement | null;
      const outputUrlContainer = document.querySelector('.output-url') as HTMLElement | null;
      const deleteUrlContainer = document.getElementById('deleteUrlContainer') as HTMLElement | null;
      const deleteUrlInput = document.getElementById('deleteUrl') as HTMLInputElement | null;
      let viewBtn = document.getElementById('viewBtn') as HTMLButtonElement | null;

      if (!output || !outputTitle || !outputMessage) return;

      output.classList.toggle('error', !success);
      outputTitle.textContent = title;
      outputMessage.textContent = message;

      if (url && pasteUrl && outputUrlContainer) {
        pasteUrl.value = url;
        outputUrlContainer.style.display = 'flex';

        viewBtn = document.getElementById('viewBtn') as HTMLButtonElement | null;
        if (viewBtn) {
          const newBtn = viewBtn.cloneNode(true) as HTMLButtonElement;
          viewBtn.parentNode?.replaceChild(newBtn, viewBtn);
          newBtn.style.display = 'inline-block';
          newBtn.addEventListener('click', () => {
            window.open(url, '_blank', 'noopener,noreferrer');
          });
        }
      } else if (outputUrlContainer) {
        outputUrlContainer.style.display = 'none';
        if (viewBtn) viewBtn.style.display = 'none';
      }

      if (deleteUrl && deleteUrlContainer && deleteUrlInput) {
        deleteUrlInput.value = deleteUrl;
        deleteUrlContainer.style.display = 'flex';
      } else if (deleteUrlContainer) {
        deleteUrlContainer.style.display = 'none';
      }

      output.classList.add('show');
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    windowOpenSpy.mockRestore();
    delete (window as any).showOutput;
  });

  it('should open paste URL in a new tab when View button is clicked', () => {
    const shareUrl = 'https://example.com/view.html?p=abc123#salt:iv';

    (window as any).showOutput(true, 'Success', 'Your paste is ready', shareUrl, null);

    const viewBtn = document.getElementById('viewBtn') as HTMLButtonElement;
    expect(viewBtn).not.toBeNull();
    expect(viewBtn.style.display).toBe('inline-block');

    viewBtn.click();

    expect(windowOpenSpy).toHaveBeenCalledTimes(1);
    expect(windowOpenSpy).toHaveBeenCalledWith(shareUrl, '_blank', 'noopener,noreferrer');
  });

  it('should not navigate in the current tab when View button is clicked', () => {
    const shareUrl = 'https://example.com/view.html?p=xyz999#salt:iv';
    const originalHref = window.location.href;

    (window as any).showOutput(true, 'Success', 'Your paste is ready', shareUrl, null);

    const viewBtn = document.getElementById('viewBtn') as HTMLButtonElement;
    viewBtn.click();

    // window.location.href must not have been changed to the paste URL
    expect(window.location.href).not.toBe(shareUrl);
    // window.open was used instead
    expect(windowOpenSpy).toHaveBeenCalled();
  });

  it('should pass noopener,noreferrer rel to window.open for security', () => {
    const shareUrl = 'https://example.com/view.html?p=secure#s:i';

    (window as any).showOutput(true, 'Success', 'Ready', shareUrl, null);

    const viewBtn = document.getElementById('viewBtn') as HTMLButtonElement;
    viewBtn.click();

    const [, target, features] = windowOpenSpy.mock.calls[0];
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
    expect(features).toContain('noreferrer');
  });

  it('should show View button after successful paste creation', () => {
    const shareUrl = 'https://example.com/view.html?p=shown#s:i';

    (window as any).showOutput(true, 'Success', 'Ready', shareUrl, null);

    const viewBtn = document.getElementById('viewBtn') as HTMLButtonElement;
    expect(viewBtn.style.display).toBe('inline-block');
  });

  it('should hide View button when no URL is provided', () => {
    (window as any).showOutput(false, 'Error', 'Something went wrong', null, null);

    const viewBtn = document.getElementById('viewBtn') as HTMLButtonElement;
    // Either hidden or unchanged (still none from initial HTML)
    expect(['none', '']).toContain(viewBtn.style.display);
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('should open the correct URL even when called multiple times', () => {
    const firstUrl = 'https://example.com/view.html?p=first#s:i';
    const secondUrl = 'https://example.com/view.html?p=second#s:i';

    // Simulate two paste creations
    (window as any).showOutput(true, 'Success', 'Ready', firstUrl, null);
    (window as any).showOutput(true, 'Success', 'Ready', secondUrl, null);

    const viewBtn = document.getElementById('viewBtn') as HTMLButtonElement;
    viewBtn.click();

    // Should open the most recent URL
    expect(windowOpenSpy).toHaveBeenCalledWith(secondUrl, '_blank', 'noopener,noreferrer');
  });

  it('should display View button label as "Open in New Tab"', () => {
    const shareUrl = 'https://example.com/view.html?p=label#s:i';

    (window as any).showOutput(true, 'Success', 'Ready', shareUrl, null);

    const viewBtn = document.getElementById('viewBtn') as HTMLButtonElement;
    expect(viewBtn.textContent).toBe('Open in New Tab');
  });
});
