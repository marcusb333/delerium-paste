/**
 * dom-helpers.ts - DOM manipulation and UI utilities
 * 
 * Provides helpers for DOM ready state, event handlers, and UI setup
 */

/**
 * Execute callback when DOM is ready
 */
export function onDomReady(callback: () => void): void {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  } else {
    callback();
  }
}

/**
 * Setup character counter for textarea.
 * Counter is hidden when usage is below 80%, shown with warning at 80%+, danger at 90%+.
 */
export function setupCharCounter(maxCharacters: number): void {
  if (typeof document === 'undefined') return;
  const textarea = document.getElementById('paste') as HTMLTextAreaElement | null;
  const counter = document.getElementById('charCounter');
  if (!textarea || !counter) return;

  const updateCounter = (): void => {
    const length = textarea.value.length;
    const ratio = length / maxCharacters;
    counter.textContent = `${length.toLocaleString()} / ${maxCharacters.toLocaleString()}`;
    counter.classList.remove('warning', 'danger');
    if (ratio >= 0.9) {
      counter.classList.add('danger');
      counter.style.display = '';
    } else if (ratio >= 0.8) {
      counter.classList.add('warning');
      counter.style.display = '';
    } else {
      counter.style.display = 'none';
    }
  };

  updateCounter();
  textarea.addEventListener('input', updateCounter);
}

/**
 * Setup copy button for viewing paste content
 */
export function setupViewCopyButton(): void {
  if (typeof document === 'undefined') return;
  // Use copyContentBtn (view page) or fall back to copyBtn for backwards compatibility
  const copyBtn = (document.getElementById('copyContentBtn') || document.getElementById('copyBtn')) as HTMLButtonElement | null;
  const copyText = document.getElementById('copyText');
  const content = document.getElementById('content');
  if (!copyBtn || !copyText || !content) return;

  copyBtn.addEventListener('click', () => {
    const text = content.textContent ?? '';
    const finish = () => {
      copyText.textContent = '✓ Copied!';
      copyBtn.classList.add('copied');
      window.setTimeout(() => {
        copyText.textContent = 'Copy to Clipboard';
        copyBtn.classList.remove('copied');
      }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(finish).catch(() => {
        finish();
      });
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    finish();
  });
}

/**
 * Setup URL input selection behavior
 */
export function setupUrlInputSelection(): void {
  if (typeof document === 'undefined') return;
  const urlInput = document.getElementById('pasteUrl') as HTMLInputElement | null;
  if (!urlInput) return;
  urlInput.addEventListener('click', () => {
    urlInput.select();
    urlInput.setSelectionRange(0, urlInput.value.length);
  });
}

/**
 * Setup single-view toggle to disable max views input
 */
export function setupSingleViewToggle(): void {
  if (typeof document === 'undefined') return;
  const singleViewCheckbox = document.getElementById('single') as HTMLInputElement;
  const viewsInput = document.getElementById('views') as HTMLInputElement;
  
  if (singleViewCheckbox && viewsInput) {
    singleViewCheckbox.addEventListener('change', function() {
      if (this.checked) {
        viewsInput.disabled = true;
        viewsInput.style.opacity = '0.5';
        viewsInput.title = 'Disabled when single-view is selected';
      } else {
        viewsInput.disabled = false;
        viewsInput.style.opacity = '1';
        viewsInput.title = '';
      }
    });
  }
}

/**
 * Setup expiration pill buttons to update minutes input.
 * Handles preset values (60, 1440, 10080) and a "custom" option that reveals the number input.
 */
export function setupExpirationPresets(): void {
  if (typeof document === 'undefined') return;
  const minsInput = document.getElementById('mins') as HTMLInputElement | null;
  const pillButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.pill-btn[data-mins]'));
  if (!minsInput || pillButtons.length === 0) return;

  const setActivePill = (activeBtn: HTMLButtonElement): void => {
    pillButtons.forEach((btn) => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  };

  const applyPreset = (value: string, button: HTMLButtonElement): void => {
    if (value === 'custom') {
      setActivePill(button);
      minsInput.style.display = '';
      minsInput.focus();
      return;
    }

    const mins = Number.parseInt(value, 10);
    if (!Number.isFinite(mins)) return;
    setActivePill(button);
    minsInput.value = String(mins);
    minsInput.style.display = 'none';
    minsInput.dispatchEvent(new Event('input', { bubbles: true }));
    minsInput.dispatchEvent(new Event('change', { bubbles: true }));
  };

  pillButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.mins;
      if (!value) return;
      applyPreset(value, button);
    });
  });
}

/**
 * Setup "Create New Paste" button navigation
 */
export function setupNewPasteButton(): void {
  if (typeof document === 'undefined') return;
  const newPasteBtn = document.getElementById('newPasteBtn') as HTMLButtonElement | null;
  if (!newPasteBtn) return;

  newPasteBtn.addEventListener('click', (event) => {
    event.preventDefault();
    // Use URL constructor to preserve directory structure in case of subdirectory deployments
    const targetUrl = new URL('index.html', window.location.href).toString();
    window.location.assign(targetUrl);
  });
}
