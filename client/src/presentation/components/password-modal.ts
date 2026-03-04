/**
 * Password Modal Component
 * 
 * Reusable modal component for password input with retry logic.
 * Replaces browser prompt() dialogs with a custom, accessible modal.
 */

export interface PasswordModalOptions {
  title?: string;
  message?: string;
  attempt?: number;
  remainingAttempts?: number;
  placeholder?: string;
}

interface PasswordModalResult {
  password: string | null;
  cancelled: boolean;
}

/**
 * Password modal component
 */
export class PasswordModal {
  private modalElement: HTMLDivElement | null = null;
  private backdropElement: HTMLDivElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private resolveCallback: ((result: PasswordModalResult) => void) | null = null;
  private _isOpen = false;
  private currentOptions: PasswordModalOptions | null = null;

  /**
   * Check if modal is currently open
   */
  isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Show password modal and return promise that resolves with password or null
   */
  show(options: PasswordModalOptions = {}): Promise<string | null> {
    return new Promise((resolve) => {
      // If modal is already open, update it and wait for next submission
      if (this._isOpen && this.modalElement) {
        this.updateModal(options);
        // Set new resolve callback for next submission
        // The promise will resolve when user submits again
        this.resolveCallback = (result) => {
          resolve(result.cancelled ? null : result.password);
        };
        // Don't return - we need to wait for the user to submit again
        // The promise stays pending until handleSubmit is called
        return;
      }

      // Create new modal
      this.currentOptions = options;
      this.resolveCallback = (result) => {
        resolve(result.cancelled ? null : result.password);
      };
      this.createModal(options);
      this.open();
    });
  }

  /**
   * Close the modal
   */
  close(): void {
    if (!this._isOpen) return;

    // Resolve with cancelled if still open
    if (this.resolveCallback) {
      this.resolveCallback({ password: null, cancelled: true });
      this.resolveCallback = null;
    }

    this.removeModal();
    this._isOpen = false;
    this.currentOptions = null;
  }

  /**
   * Update existing modal with new options (for retries)
   */
  private updateModal(options: PasswordModalOptions): void {
    if (!this.modalElement) return;

    this.currentOptions = options;

    // Update title if provided
    const titleElement = this.modalElement.querySelector('#modal-title');
    if (titleElement && options.title) {
      titleElement.textContent = options.title;
    }

    // Update retry message - show error for retries
    const retryElement = this.modalElement.querySelector('.modal-retry') as HTMLElement | null;
    if (retryElement) {
      if (options.attempt && options.attempt > 0 && options.remainingAttempts !== undefined) {
        retryElement.textContent = `Incorrect password. ${options.remainingAttempts} attempt${options.remainingAttempts !== 1 ? 's' : ''} remaining.`;
        retryElement.style.display = 'block';
      } else {
        retryElement.style.display = 'none';
      }
    }

    // Update placeholder
    if (this.inputElement && options.placeholder) {
      this.inputElement.placeholder = options.placeholder;
    }

    // Clear input and focus for retry
    if (this.inputElement) {
      this.inputElement.value = '';
      this.inputElement.focus();
    }

    // Clear any previous errors (will be shown via retry message)
    const errorElement = this.modalElement.querySelector('#modal-error') as HTMLElement | null;
    if (errorElement) {
      errorElement.style.display = 'none';
      errorElement.textContent = '';
    }
  }

  /**
   * Create modal DOM elements
   */
  private createModal(options: PasswordModalOptions): void {
    const {
      title = 'Password Required',
      message,
      attempt = 0,
      remainingAttempts = 5,
      placeholder = 'Enter password or PIN'
    } = options;

    // Create backdrop
    this.backdropElement = document.createElement('div');
    this.backdropElement.className = 'modal-backdrop';
    this.backdropElement.setAttribute('role', 'presentation');
    this.backdropElement.setAttribute('aria-hidden', 'true');
    this.backdropElement.addEventListener('click', () => this.close());

    // Create modal container
    this.modalElement = document.createElement('div');
    this.modalElement.className = 'modal';
    this.modalElement.setAttribute('role', 'dialog');
    this.modalElement.setAttribute('aria-modal', 'true');
    this.modalElement.setAttribute('aria-labelledby', 'modal-title');
    this.modalElement.setAttribute('tabindex', '-1');

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    // Title
    const titleElement = document.createElement('h2');
    titleElement.id = 'modal-title';
    titleElement.className = 'modal-title';
    titleElement.textContent = title;

    // Message
    if (message) {
      const messageElement = document.createElement('p');
      messageElement.className = 'modal-message';
      messageElement.textContent = message;
      modalContent.appendChild(messageElement);
    }

    // Retry message container (will be shown/hidden dynamically)
    const retryElement = document.createElement('p');
    retryElement.className = 'modal-retry';
    retryElement.style.display = attempt > 0 ? 'block' : 'none';
    if (attempt > 0) {
      retryElement.textContent = `Incorrect password. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`;
    }
    modalContent.appendChild(retryElement);

    // Input wrapper
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'modal-input-wrapper';

    // Password input
    this.inputElement = document.createElement('input');
    this.inputElement.type = 'password';
    this.inputElement.id = 'modal-password-input';
    this.inputElement.className = 'modal-input';
    this.inputElement.placeholder = placeholder;
    this.inputElement.autocomplete = 'current-password';
    this.inputElement.setAttribute('aria-label', 'Password');
    this.inputElement.setAttribute('aria-required', 'true');

    // Show/hide password toggle
    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'modal-toggle-password';
    toggleButton.setAttribute('aria-label', 'Show password');
    toggleButton.innerHTML = '👁️';
    toggleButton.addEventListener('click', () => {
      if (this.inputElement) {
        const isPassword = this.inputElement.type === 'password';
        this.inputElement.type = isPassword ? 'text' : 'password';
        toggleButton.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        toggleButton.innerHTML = isPassword ? '🙈' : '👁️';
      }
    });

    inputWrapper.appendChild(this.inputElement);
    inputWrapper.appendChild(toggleButton);

    // Error message (initially hidden)
    const errorElement = document.createElement('div');
    errorElement.className = 'modal-error';
    errorElement.id = 'modal-error';
    errorElement.setAttribute('role', 'alert');
    errorElement.setAttribute('aria-live', 'polite');
    errorElement.style.display = 'none';

    // Buttons
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'modal-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => this.close());

    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.className = 'btn btn-primary';
    submitButton.textContent = 'Submit';
    submitButton.addEventListener('click', () => this.handleSubmit());

    buttonGroup.appendChild(cancelButton);
    buttonGroup.appendChild(submitButton);

    // Assemble modal
    modalContent.appendChild(titleElement);
    modalContent.appendChild(inputWrapper);
    modalContent.appendChild(errorElement);
    modalContent.appendChild(buttonGroup);

    this.modalElement.appendChild(modalContent);

    // Add to DOM
    document.body.appendChild(this.backdropElement);
    document.body.appendChild(this.modalElement);

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    // Focus trap: handle keyboard navigation
    this.setupFocusTrap();

    // Handle Enter key
    this.inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  /**
   * Setup focus trap for accessibility
   */
  private setupFocusTrap(): void {
    if (!this.modalElement) return;

    const focusableElements = this.modalElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (!firstElement || !lastElement) return;

    // Focus first element
    firstElement.focus();

    // Trap focus within modal
    this.modalElement.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    });
  }

  /**
   * Handle form submission
   */
  private handleSubmit(): void {
    if (!this.inputElement || !this.resolveCallback) return;

    const password = this.inputElement.value.trim();

    if (!password) {
      this.showError('Password is required');
      return;
    }

    // Resolve with password (don't close modal yet - caller will handle success/failure)
    const result: PasswordModalResult = {
      password,
      cancelled: false
    };

    const callback = this.resolveCallback;
    // Clear resolveCallback - caller will set it again if retry is needed
    this.resolveCallback = null;

    // Clear input for next attempt (but keep modal open)
    this.inputElement.value = '';

    // Resolve the promise (modal stays open until caller closes it)
    callback(result);
  }

  /**
   * Close modal after successful password entry
   */
  closeOnSuccess(): void {
    this.resolveCallback = null;
    this.removeModal();
    this._isOpen = false;
    this.currentOptions = null;
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    if (!this.modalElement) return;

    const errorElement = this.modalElement.querySelector('#modal-error') as HTMLElement | null;
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }

    // Focus input
    if (this.inputElement) {
      this.inputElement.focus();
      this.inputElement.select();
    }
  }

  /**
   * Open modal (add to DOM and animate)
   */
  private open(): void {
    if (!this.modalElement || !this.backdropElement) return;

    // Trigger animation
    requestAnimationFrame(() => {
      if (this.modalElement && this.backdropElement) {
        this.modalElement.classList.add('modal-open');
        this.backdropElement.classList.add('modal-backdrop-open');
      }
    });

    this._isOpen = true;
  }

  /**
   * Remove modal from DOM
   */
  private removeModal(): void {
    // Restore body scroll
    document.body.style.overflow = '';

    // Remove with animation
    if (this.modalElement) {
      this.modalElement.classList.remove('modal-open');
    }
    if (this.backdropElement) {
      this.backdropElement.classList.remove('modal-backdrop-open');
    }

    // Remove from DOM after animation
    setTimeout(() => {
      if (this.modalElement) {
        this.modalElement.remove();
        this.modalElement = null;
      }
      if (this.backdropElement) {
        this.backdropElement.remove();
        this.backdropElement = null;
      }
    }, 200);
  }
}

/**
 * Global modal instance
 */
let modalInstance: PasswordModal | null = null;

/**
 * Get or create modal instance
 */
export function getPasswordModal(): PasswordModal {
  if (!modalInstance) {
    modalInstance = new PasswordModal();
  }
  return modalInstance;
}

/**
 * Show password modal (convenience function)
 */
export async function showPasswordModal(options: PasswordModalOptions = {}): Promise<string | null> {
  const modal = getPasswordModal();
  return modal.show(options);
}
