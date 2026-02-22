/**
 * Paste Viewer View Component
 *
 * Presentation layer component for paste viewing.
 * Handles DOM manipulation and delegates business logic to use cases.
 * Renders decrypted content as sanitized markdown via marked.js + hljs.
 */

import { ViewPasteUseCase } from '../../application/use-cases/view-paste-use-case.js';
import { DeletePasteUseCase } from '../../application/use-cases/delete-paste-use-case.js';
import { PasteService } from '../../core/services/paste-service.js';
import { secureClear, getSafeErrorMessage } from '../../security.js';
import { sanitizeHtml } from '../../core/utils/sanitize.js';
import { WindowWithUI } from '../../ui/ui-manager.js';
import type { PasteMetadata } from '../../core/models/paste.js';
import { isFailure } from '../../core/models/result.js';

/**
 * Intercept clicks on links inside rendered paste content.
 * Instead of navigating away, shows a small popup offering:
 *   - Copy Link  (copies the resolved href to clipboard)
 *   - Open in New Tab  (window.open with noopener,noreferrer)
 *
 * Uses event delegation — a single listener on the container element.
 */
export function setupLinkInterception(container: HTMLElement): void {
  let popup: HTMLElement | null = null;
  let cleanupListeners: (() => void) | null = null;

  const dismissPopup = (): void => {
    popup?.remove();
    popup = null;
    cleanupListeners?.();
    cleanupListeners = null;
  };

  container.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;

    // Defense in depth: never act on javascript: URLs
    // (sanitizeHtml already strips these, but be explicit)
    if (/^javascript:/i.test(anchor.getAttribute('href')?.trim() ?? '')) return;

    e.preventDefault();
    e.stopPropagation();
    dismissPopup();

    const resolvedHref = anchor.href; // absolute resolved URL

    popup = document.createElement('div');
    popup.className = 'link-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Link options');

    const copyBtn = document.createElement('button');
    copyBtn.className = 'link-popup-btn';
    copyBtn.textContent = 'Copy Link';
    copyBtn.type = 'button';

    const openBtn = document.createElement('button');
    openBtn.className = 'link-popup-btn';
    openBtn.textContent = 'Open in New Tab';
    openBtn.type = 'button';

    copyBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(resolvedHref).catch(() => { /* silent */ });
      }
      copyBtn.textContent = '✓ Copied!';
      window.setTimeout(dismissPopup, 1500);
    });

    openBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      window.open(resolvedHref, '_blank', 'noopener,noreferrer');
      dismissPopup();
    });

    popup.appendChild(copyBtn);
    popup.appendChild(openBtn);

    // Position below the click, clamped inside the viewport
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = e.clientY + 10;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    document.body.appendChild(popup);

    // Dismiss on outside click (deferred so this click event doesn't close it immediately)
    const onDocClick = (ev: MouseEvent): void => {
      if (popup && !popup.contains(ev.target as Node)) dismissPopup();
    };
    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') dismissPopup();
    };
    window.setTimeout(() => {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKeyDown);
    }, 0);
    cleanupListeners = () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };

    copyBtn.focus();
  });
}

/**
 * Render decrypted text content into the #content element as sanitized markdown.
 * Falls back to plain-text display if marked is unavailable.
 * SECURITY: sanitizeHtml() is called before every innerHTML assignment.
 */
function renderMarkdown(container: HTMLElement, text: string): void {
  if (typeof marked !== 'undefined') {
    const raw = marked.parse(text, { gfm: true, breaks: true });
    // SECURITY: sanitizeHtml strips all dangerous tags/attrs before innerHTML assignment
    const safeHtml = sanitizeHtml(raw);
    container.innerHTML = safeHtml;
  } else {
    // Fallback: plain text (safe — textContent only)
    container.textContent = text;
  }

  // Syntax-highlight code blocks
  if (typeof hljs !== 'undefined') {
    const blocks = container.querySelectorAll<HTMLElement>('pre code');
    blocks.forEach(block => hljs.highlightElement(block));
  }
}

/**
 * Paste viewer view component
 */
export class PasteViewerView {
  private pasteService = new PasteService();

  constructor(
    private viewUseCase: ViewPasteUseCase,
    private deleteUseCase: DeletePasteUseCase
  ) {}

  /**
   * Check if chat should be initialized for this paste
   */
  shouldInitChat(_meta: PasteMetadata): boolean {
    return true;
  }

  /**
   * Setup destroy button for password-based deletion
   */
  private setupDestroyButton(pasteId: string, deleteAuth: string): void {
    const destroyBtn = document.getElementById('destroyBtn') as HTMLButtonElement | null;
    if (!destroyBtn) return;

    destroyBtn.style.display = 'inline-flex';

    let storedDeleteAuth: string | null = deleteAuth;
    let isUsed = false;

    const cleanup = (): void => {
      if (storedDeleteAuth) {
        secureClear(storedDeleteAuth);
        storedDeleteAuth = null;
      }
    };
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);

    destroyBtn.addEventListener('click', async () => {
      if (isUsed || !storedDeleteAuth) {
        window.alert('Delete authorization has expired. Please refresh the page and try again.');
        return;
      }

      if (!window.confirm('Are you sure you want to permanently delete this paste? This action cannot be undone.')) {
        return;
      }

      const destroyText = document.getElementById('destroyText');
      const originalText = destroyText?.textContent || 'Destroy Paste';

      const authForRequest = storedDeleteAuth;
      isUsed = true;
      secureClear(storedDeleteAuth);
      storedDeleteAuth = null;

      try {
        destroyBtn.disabled = true;
        if (destroyText) destroyText.textContent = 'Deleting...';

        const result = await this.deleteUseCase.execute({
          pasteId,
          method: 'password',
          tokenOrPassword: authForRequest
        });

        secureClear(authForRequest);

        if (result.success) {
          const content = document.getElementById('content');
          if (content) {
            content.textContent = 'Paste has been permanently deleted.';
            content.classList.add('error');
          }
          destroyBtn.style.display = 'none';

          const chatSection = document.getElementById('chatSection');
          if (chatSection) chatSection.style.display = 'none';

          const updateStatus = (window as WindowWithUI).updateStatus;
          if (updateStatus) updateStatus(true, 'Paste deleted');

          window.removeEventListener('beforeunload', cleanup);
          window.removeEventListener('pagehide', cleanup);
        } else {
          window.alert(result.error || 'Failed to delete paste');
          destroyBtn.disabled = false;
          if (destroyText) destroyText.textContent = originalText;
        }
      } catch (error) {
        window.alert(`Failed to delete paste: ${(error as Error).message}`);
        destroyBtn.disabled = false;
        if (destroyText) destroyText.textContent = originalText;
      }
    });
  }

  /**
   * Handle paste viewing
   */
  async handleView(): Promise<{ pasteId: string; metadata: PasteMetadata; deleteAuth: string; salt: Uint8Array; initialPassword?: string } | null> {
    if (!location.pathname.endsWith('view.html')) return null;

    const parsed = this.pasteService.parseViewUrl(new URL(window.location.href));
    if (!parsed) {
      const content = document.getElementById('content');
      if (content) {
        content.textContent = 'Missing paste ID or key.';
        content.classList.remove('loading');
        content.classList.add('error');
      }
      const updateStatus = (window as WindowWithUI).updateStatus;
      if (updateStatus) updateStatus(false, 'Missing information');
      return null;
    }

    const { pasteId, salt, iv } = parsed;
    const content = document.getElementById('content');
    const updateStatus = (window as WindowWithUI).updateStatus;
    const showInfo = (window as WindowWithUI).showInfo;

    try {
      if (updateStatus) updateStatus(true, 'Fetching paste...');

      let lastPassword: string | null = null;
      const passwordPrompt = async (attempt: number, remaining: number): Promise<string | null> => {
        const { getPasswordModal } = await import('./password-modal.js');
        const modal = getPasswordModal();

        const message = attempt === 0
          ? 'This paste is protected. Enter the password or PIN to decrypt it.'
          : undefined;

        const password = await modal.show({
          title: 'Password Required',
          message,
          attempt,
          remainingAttempts: remaining,
          placeholder: 'Enter password or PIN'
        });

        if (password) {
          modal.closeOnSuccess();
          lastPassword = password;
        }

        return password;
      };

      const result = await this.viewUseCase.execute(
        { pasteId, salt, iv, password: '' },
        passwordPrompt
      );

      if (isFailure(result)) {
        throw new Error(result.error);
      }

      const { content: decryptedText, metadata } = result.value;

      if (content) {
        content.classList.remove('loading');
        content.classList.remove('error');
        renderMarkdown(content, decryptedText);
        setupLinkInterception(content);
      }

      if (updateStatus) updateStatus(true, 'Decrypted successfully');
      if (showInfo && metadata) {
        showInfo(metadata.expireTs);
      }

      if (result.value.deleteAuth) {
        this.setupDestroyButton(pasteId, result.value.deleteAuth);
        secureClear(result.value.deleteAuth);
      }

      const saltArray = new Uint8Array(
        await import('../../core/crypto/encoding.js').then(m =>
          new Uint8Array(m.decodeBase64Url(salt))
        )
      );

      const chatPassword = lastPassword ?? undefined;
      if (lastPassword) {
        lastPassword = null;
      }

      return {
        pasteId,
        metadata: result.value.metadata,
        deleteAuth: result.value.deleteAuth,
        salt: saltArray,
        initialPassword: chatPassword
      };
    } catch (e) {
      if (content) {
        const errorMessage = getSafeErrorMessage(e, 'paste viewing');
        content.classList.remove('loading');
        content.classList.add('error');
        content.textContent = errorMessage;
      }
      if (updateStatus) {
        const errorMsg = getSafeErrorMessage(e, 'paste viewing');
        updateStatus(false, errorMsg.length > 50 ? 'Decryption failed' : errorMsg);
      }
      return null;
    }
  }

  /**
   * Setup paste viewing
   */
  setup(): void {
    if (typeof document === 'undefined' || typeof location === 'undefined') return;
    void this.handleView();
  }
}
