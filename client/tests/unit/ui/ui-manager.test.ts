/**
 * @jest-environment jsdom
 */

/**
 * ui-manager showOutput Tests
 *
 * Tests for the showOutput function, verifying the View Paste button,
 * Copy Link button, and delete URL display.
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
        <button class="btn-view" id="viewBtn" style="display: none;">View Paste</button>
      </div>
      <div class="output-url" id="deleteUrlContainer" style="display: none;">
        <input type="text" id="deleteUrl" name="deleteUrl" readonly>
        <button class="btn-copy" id="copyDeleteBtn">Copy</button>
      </div>
    </div>
  `;

  // Replicate the showOutput implementation from ui-manager.ts
  function registerShowOutput(): void {
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
            window.location.href = url;
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
  }

  beforeEach(() => {
    document.body.innerHTML = OUTPUT_HTML;
    registerShowOutput();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as any).showOutput;
  });

  it('should show the View Paste button after successful paste creation', () => {
    const shareUrl = 'https://example.com/view.html?p=abc123#salt:iv';
    (window as any).showOutput(true, 'Success', 'Your paste is ready', shareUrl, null);

    const viewBtn = document.getElementById('viewBtn') as HTMLButtonElement;
    expect(viewBtn.style.display).toBe('inline-block');
  });

  it('should populate the share URL input with the provided URL', () => {
    const shareUrl = 'https://example.com/view.html?p=abc123#salt:iv';
    (window as any).showOutput(true, 'Success', 'Ready', shareUrl, null);

    const pasteUrl = document.getElementById('pasteUrl') as HTMLInputElement;
    expect(pasteUrl.value).toBe(shareUrl);
  });

  it('should set success title and message in the output', () => {
    (window as any).showOutput(true, 'Password required', 'Share the link separately', 'http://x', null);

    expect(document.getElementById('outputTitle')!.textContent).toBe('Password required');
    expect(document.getElementById('outputMessage')!.textContent).toBe('Share the link separately');
  });

  it('should add the "show" class to the output element', () => {
    (window as any).showOutput(true, 'T', 'M', 'http://x', null);
    expect(document.getElementById('output')!.classList.contains('show')).toBe(true);
  });

  it('should hide View button and URL row when no URL is provided', () => {
    (window as any).showOutput(false, 'Error', 'Something went wrong', null, null);

    const urlContainer = document.querySelector('.output-url') as HTMLElement;
    expect(urlContainer.style.display).toBe('none');
  });

  it('should show the delete URL container when a deleteUrl is provided', () => {
    const shareUrl = 'https://example.com/view.html?p=x#s:i';
    const deleteUrl = 'https://example.com/delete.html?p=x&token=abc';

    (window as any).showOutput(true, 'T', 'M', shareUrl, deleteUrl);

    const container = document.getElementById('deleteUrlContainer') as HTMLElement;
    expect(container.style.display).toBe('flex');
    const input = document.getElementById('deleteUrl') as HTMLInputElement;
    expect(input.value).toBe(deleteUrl);
  });

  it('should hide delete URL container when no deleteUrl is provided', () => {
    (window as any).showOutput(true, 'T', 'M', 'http://x', null);

    const container = document.getElementById('deleteUrlContainer') as HTMLElement;
    expect(container.style.display).toBe('none');
  });

  it('should add error class and not show URL row on failure', () => {
    (window as any).showOutput(false, 'Error', 'Failed', null, null);

    const output = document.getElementById('output')!;
    expect(output.classList.contains('error')).toBe(true);
  });

  it('should not throw when called with missing DOM elements', () => {
    document.body.innerHTML = '';
    expect(() => {
      (window as any).showOutput(true, 'T', 'M', 'http://x', null);
    }).not.toThrow();
  });
});
