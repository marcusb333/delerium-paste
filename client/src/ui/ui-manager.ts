/**
 * ui-manager.ts - UI state management and display functions
 * 
 * Manages UI updates for paste creation and viewing
 */

import { removeDeleteToken } from '../utils/storage.js';
import { showLoading as showLoadingIndicator, hideLoading as hideLoadingIndicator } from '../presentation/components/loading-indicator.js';

/**
 * Extended Window interface for UI helper functions
 */
export interface WindowWithUI extends Window {
  updateStatus?: (success: boolean, message: string) => void;
  showInfo?: (expireTs: number) => void;
  showDestroyButton?: (id: string, token: string) => void;
  setButtonLoading?: (show: boolean, message?: string) => void;
  showOutput?: (success: boolean, title: string, message: string, url?: string | null, deleteUrl?: string | null) => void;
}

/**
 * Show loading state with optional message
 */
export function showLoading(show: boolean, message?: string): void {
  const win = window as WindowWithUI;
  
  // Show/hide global loading indicator
  if (show) {
    showLoadingIndicator(message || 'Processing...');
  } else {
    hideLoadingIndicator();
  }
  
  // Update button loading state
  if (typeof win.setButtonLoading === 'function') {
    win.setButtonLoading(show, message);
  } else {
    // Fallback for old UI
    const loading = document.getElementById('loading');
    const form = document.getElementById('pasteForm') as HTMLFormElement;
    const saveBtn = document.getElementById('save') as HTMLButtonElement;
    
    if (loading) loading.style.display = show ? 'block' : 'none';
    if (form) form.style.display = show ? 'none' : 'block';
    if (saveBtn) saveBtn.disabled = show;
  }
}

/**
 * Show error message
 */
export function showError(message: string): void {
  const win = window as WindowWithUI;
  if (typeof win.showOutput === 'function') {
    win.showOutput(false, 'Error', message, null);
  } else {
    // Fallback for old UI
    const out = document.getElementById('out');
    if (out) {
      out.textContent = `Error: ${message}`;
      out.style.color = 'red';
    }
  }
}

/**
 * Show success result
 */
export function showSuccess(shareUrl: string, deleteUrl: string): void {
  const win = window as WindowWithUI;
  if (typeof win.showOutput === 'function') {
    const title = 'Password or PIN required to view';
    const message = 'Share this link and provide the password or PIN separately.';
    win.showOutput(true, title, message, shareUrl, deleteUrl);
  } else {
    // Fallback for old UI
    const out = document.getElementById('out');
    if (out) {
      const title = 'Your protected paste is ready!';
      out.textContent = `${title}\n\nShare URL:\n${shareUrl}\n\nDelete URL:\n${deleteUrl}\n\nRemember to send the password or PIN separately.`;
      out.style.color = '';
    }
  }
}

/**
 * Initialize window UI functions
 */
export function initializeWindowUI(): void {
  if (typeof window === 'undefined') return;
  
  const win = window as WindowWithUI;
  
  win.setButtonLoading = (loading: boolean, message?: string) => {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('save') as HTMLButtonElement | null;
    const btnText = document.getElementById('btnText');
    if (!btn || !btnText) return;
    if (loading) {
      btn.disabled = true;
      const loadingMessage = message || 'Processing...';
      btnText.innerHTML = `<span class="spinner"></span> ${loadingMessage}`;
    } else {
      btn.disabled = false;
      btnText.innerHTML = '<span class="btn-icon">🔒</span> Encrypt & Upload';
    }
  };

  win.showOutput = (success: boolean, title: string, message: string, url?: string | null, deleteUrl?: string | null) => {
    if (typeof document === 'undefined') return;
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

      const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement | null;
      if (copyBtn) {
        const newCopyBtn = copyBtn.cloneNode(true) as HTMLButtonElement;
        copyBtn.parentNode?.replaceChild(newCopyBtn, copyBtn);
        newCopyBtn.addEventListener('click', () => {
          if (!pasteUrl.value) return;
          const originalText = newCopyBtn.textContent || 'Copy Link';
          const handleComplete = () => {
            newCopyBtn.textContent = '✓ Copied!';
            newCopyBtn.classList.add('copied');
            window.setTimeout(() => {
              newCopyBtn.textContent = originalText;
              newCopyBtn.classList.remove('copied');
            }, 2000);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pasteUrl.value).then(handleComplete).catch(handleComplete);
          } else {
            pasteUrl.select();
            pasteUrl.setSelectionRange(0, pasteUrl.value.length);
            document.execCommand('copy');
            handleComplete();
          }
        });
      }
    } else if (outputUrlContainer) {
      outputUrlContainer.style.display = 'none';
      if (viewBtn) {
        viewBtn.style.display = 'none';
      }
    }

    // Show delete URL if provided
    if (deleteUrl && deleteUrlContainer && deleteUrlInput) {
      deleteUrlInput.value = deleteUrl;
      deleteUrlContainer.style.display = 'flex';

      const copyDeleteBtn = document.getElementById('copyDeleteBtn') as HTMLButtonElement | null;
      if (copyDeleteBtn) {
        const newCopyDeleteBtn = copyDeleteBtn.cloneNode(true) as HTMLButtonElement;
        copyDeleteBtn.parentNode?.replaceChild(newCopyDeleteBtn, copyDeleteBtn);
        newCopyDeleteBtn.addEventListener('click', () => {
          if (!deleteUrlInput.value) return;
          const originalText = newCopyDeleteBtn.textContent || 'Copy';
          const handleComplete = () => {
            newCopyDeleteBtn.textContent = '✓ Copied!';
            newCopyDeleteBtn.classList.add('copied');
            window.setTimeout(() => {
              newCopyDeleteBtn.textContent = originalText;
              newCopyDeleteBtn.classList.remove('copied');
            }, 2000);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(deleteUrlInput.value).then(handleComplete).catch(handleComplete);
          } else {
            deleteUrlInput.select();
            deleteUrlInput.setSelectionRange(0, deleteUrlInput.value.length);
            document.execCommand('copy');
            handleComplete();
          }
        });
      }
    } else if (deleteUrlContainer) {
      deleteUrlContainer.style.display = 'none';
    }

    output.classList.add('show');
    output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  win.updateStatus = (success: boolean, message: string) => {
    if (typeof document === 'undefined') return;
    const statusBadge = document.getElementById('statusBadge');
    if (!statusBadge) return;
    statusBadge.classList.remove('loading');
    statusBadge.innerHTML = success ? `<span>✓</span><span>${message}</span>` : `<span>✗</span><span>${message}</span>`;
  };

  win.showInfo = (expires: number) => {
    if (typeof document === 'undefined') return;
    const infoBar = document.getElementById('infoBar');
    const expiresInfo = document.getElementById('expiresInfo');
    if (!infoBar || !expiresInfo) return;

    if (expires) {
      const date = new Date(expires * 1000);
      const now = new Date();
      const diff = date.getTime() - now.getTime();

      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 24) {
          const days = Math.floor(hours / 24);
          expiresInfo.textContent = `${days} day${days > 1 ? 's' : ''}`;
        } else if (hours > 0) {
          expiresInfo.textContent = `${hours} hour${hours > 1 ? 's' : ''}`;
        } else {
          expiresInfo.textContent = `${minutes} minute${minutes > 1 ? 's' : ''}`;
        }
      } else {
        expiresInfo.textContent = 'Expired';
      }
    }

    infoBar.style.display = 'flex';
  };

  win.showDestroyButton = (pasteId: string, deleteToken: string) => {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById('destroyBtn');
    if (!existing) return;
    const btn = existing.cloneNode(true) as HTMLButtonElement;
    existing.parentNode?.replaceChild(btn, existing);
    btn.style.display = 'inline-flex';

    btn.addEventListener('click', async () => {
      if (!window.confirm('Are you sure you want to permanently delete this paste? This action cannot be undone.')) {
        return;
      }

      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Deleting...';

      try {
        const res = await fetch(`/api/pastes/${encodeURIComponent(pasteId)}?token=${encodeURIComponent(deleteToken)}`, {
          method: 'DELETE'
        });

        if (res.ok || res.status === 204) {
          removeDeleteToken(pasteId);
          const content = document.getElementById('content');
          if (content) {
            content.textContent = 'Paste has been permanently deleted.';
            content.classList.add('error');
          }
          btn.style.display = 'none';
          if (typeof win.updateStatus === 'function') {
            win.updateStatus(true, 'Paste deleted');
          }
        } else {
          const err = await res.json().catch(() => ({ error: 'Unknown error' }));
          window.alert(`Failed to delete paste: ${err.error || 'Invalid token or paste not found'}`);
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
      } catch (error) {
        window.alert(`Failed to delete paste: ${(error as Error).message}`);
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });
  };
}
