/**
 * @jest-environment jsdom
 */

/**
 * PasswordModal tests
 *
 * Covers:
 * - show(): creates modal, resolves with entered password
 * - show(): cancel resolves to null
 * - show(): empty password shows error, does not resolve yet
 * - show() while already open: updates existing modal, swaps callback
 * - close(): resolves outstanding promise as cancelled
 * - closeOnSuccess(): cleans up state without resolving via callback
 * - isOpen() reflects state correctly
 * - Keyboard: Enter submits, Escape cancels
 * - Show/hide password toggle
 * - Retry message shown on attempt > 0
 */

import { PasswordModal, getPasswordModal, showPasswordModal } from '../../../src/presentation/components/password-modal.js';

// jsdom doesn't implement requestAnimationFrame timing, run it synchronously
beforeAll(() => {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

afterAll(() => {
  (window.requestAnimationFrame as jest.Mock).mockRestore();
});

// Use fake timers for the removeModal setTimeout (200ms animation delay)
beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '';
});

afterEach(() => {
  jest.runAllTimers();
  jest.useRealTimers();
  document.body.innerHTML = '';
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInput(): HTMLInputElement {
  return document.querySelector('#modal-password-input') as HTMLInputElement;
}

function clickSubmit(): void {
  const btn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === 'Submit'
  );
  btn?.click();
}

function clickCancel(): void {
  const btn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === 'Cancel'
  );
  btn?.click();
}

// ─── isOpen ───────────────────────────────────────────────────────────────────

describe('PasswordModal – isOpen', () => {
  it('should be false before show() is called', () => {
    const modal = new PasswordModal();
    expect(modal.isOpen()).toBe(false);
  });

  it('should be true after show() is called', () => {
    const modal = new PasswordModal();
    modal.show();
    expect(modal.isOpen()).toBe(true);
  });

  it('should be false after close() is called', () => {
    const modal = new PasswordModal();
    modal.show();
    modal.close();
    jest.runAllTimers();
    expect(modal.isOpen()).toBe(false);
  });
});

// ─── show() – happy path ──────────────────────────────────────────────────────

describe('PasswordModal – show() resolves with password', () => {
  it('should resolve with the entered password when Submit is clicked', async () => {
    const modal = new PasswordModal();
    const promise = modal.show({ title: 'Enter Password' });

    const input = getInput();
    expect(input).not.toBeNull();

    input.value = 'my-password';
    clickSubmit();

    const result = await promise;
    expect(result).toBe('my-password');
  });

  it('should trim whitespace from the entered password', async () => {
    const modal = new PasswordModal();
    const promise = modal.show();

    getInput().value = '  padded  ';
    clickSubmit();

    const result = await promise;
    expect(result).toBe('padded');
  });
});

// ─── show() – cancellation ────────────────────────────────────────────────────

describe('PasswordModal – show() resolves null on cancel', () => {
  it('should resolve with null when Cancel is clicked', async () => {
    const modal = new PasswordModal();
    const promise = modal.show();

    clickCancel();
    jest.runAllTimers();

    const result = await promise;
    expect(result).toBeNull();
  });

  it('should resolve with null when backdrop is clicked', async () => {
    const modal = new PasswordModal();
    const promise = modal.show();

    const backdrop = document.querySelector('.modal-backdrop') as HTMLElement;
    backdrop?.click();
    jest.runAllTimers();

    const result = await promise;
    expect(result).toBeNull();
  });

  it('should resolve with null when close() is called directly', async () => {
    const modal = new PasswordModal();
    const promise = modal.show();

    modal.close();
    jest.runAllTimers();

    const result = await promise;
    expect(result).toBeNull();
  });
});

// ─── show() – empty password validation ──────────────────────────────────────

describe('PasswordModal – empty password', () => {
  it('should show an error and not resolve when empty password is submitted', async () => {
    const modal = new PasswordModal();
    let resolved = false;
    const promise = modal.show().then((v) => { resolved = true; return v; });

    getInput().value = '';
    clickSubmit();

    // Give microtasks a chance to run
    await Promise.resolve();
    expect(resolved).toBe(false);

    const errorEl = document.querySelector('#modal-error') as HTMLElement;
    expect(errorEl?.style.display).toBe('block');
    expect(errorEl?.textContent).toContain('required');

    // Clean up: cancel the modal so the test ends cleanly
    modal.close();
    jest.runAllTimers();
    await promise;
  });
});

// ─── show() while already open ────────────────────────────────────────────────

describe('PasswordModal – show() while already open', () => {
  it('should update modal and swap callback on second call', async () => {
    const modal = new PasswordModal();
    // promise1 is intentionally abandoned: when show() is called a second time
    // the resolveCallback is replaced, so promise1 will never settle on its own.
    void modal.show({ title: 'Attempt 1' });

    // Call show() again (simulating a retry prompt from the use case)
    const promise2 = modal.show({ title: 'Attempt 2', attempt: 1, remainingAttempts: 4 });

    // Submitting should now resolve promise2 (the latest callback)
    getInput().value = 'second-try';
    clickSubmit();

    const result2 = await promise2;
    expect(result2).toBe('second-try');

    modal.closeOnSuccess();
    jest.runAllTimers();
  });

  it('should show retry message when attempt > 0', () => {
    const modal = new PasswordModal();
    modal.show({ attempt: 0 });

    // Now simulate a retry
    modal.show({ attempt: 1, remainingAttempts: 4 });

    const retryEl = document.querySelector('.modal-retry') as HTMLElement;
    expect(retryEl?.style.display).toBe('block');
    expect(retryEl?.textContent).toContain('4 attempts remaining');

    modal.close();
    jest.runAllTimers();
  });
});

// ─── closeOnSuccess() ─────────────────────────────────────────────────────────

describe('PasswordModal – closeOnSuccess()', () => {
  it('should close the modal and set isOpen to false', () => {
    const modal = new PasswordModal();
    modal.show();
    expect(modal.isOpen()).toBe(true);

    modal.closeOnSuccess();
    jest.runAllTimers();

    expect(modal.isOpen()).toBe(false);
  });
});

// ─── Keyboard interactions ────────────────────────────────────────────────────

describe('PasswordModal – keyboard interactions', () => {
  it('should submit on Enter key', async () => {
    const modal = new PasswordModal();
    const promise = modal.show();

    const input = getInput();
    input.value = 'enter-password';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const result = await promise;
    expect(result).toBe('enter-password');
  });

  it('should close on Escape key', async () => {
    const modal = new PasswordModal();
    const promise = modal.show();

    const input = getInput();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    jest.runAllTimers();

    const result = await promise;
    expect(result).toBeNull();
  });
});

// ─── Show/hide toggle ─────────────────────────────────────────────────────────

describe('PasswordModal – show/hide password toggle', () => {
  it('should toggle input type between password and text', () => {
    const modal = new PasswordModal();
    modal.show();

    const input = getInput();
    expect(input.type).toBe('password');

    const toggleBtn = document.querySelector('.modal-toggle-password') as HTMLButtonElement;
    toggleBtn?.click();
    expect(input.type).toBe('text');

    toggleBtn?.click();
    expect(input.type).toBe('password');

    modal.close();
    jest.runAllTimers();
  });
});

// ─── Options rendering ────────────────────────────────────────────────────────

describe('PasswordModal – options rendering', () => {
  it('should render the title option', () => {
    const modal = new PasswordModal();
    modal.show({ title: 'Custom Title' });

    const titleEl = document.querySelector('#modal-title');
    expect(titleEl?.textContent).toBe('Custom Title');

    modal.close();
    jest.runAllTimers();
  });

  it('should render the message option', () => {
    const modal = new PasswordModal();
    modal.show({ message: 'Please enter your password to view this paste.' });

    const messageEl = document.querySelector('.modal-message');
    expect(messageEl?.textContent).toContain('Please enter your password');

    modal.close();
    jest.runAllTimers();
  });

  it('should render the placeholder option', () => {
    const modal = new PasswordModal();
    modal.show({ placeholder: 'Enter PIN' });

    expect(getInput().placeholder).toBe('Enter PIN');

    modal.close();
    jest.runAllTimers();
  });

  it('should show retry message when initial attempt > 0', () => {
    const modal = new PasswordModal();
    modal.show({ attempt: 1, remainingAttempts: 4 });

    const retryEl = document.querySelector('.modal-retry') as HTMLElement;
    expect(retryEl?.style.display).toBe('block');

    modal.close();
    jest.runAllTimers();
  });
});

// ─── Convenience functions ────────────────────────────────────────────────────

describe('getPasswordModal / showPasswordModal', () => {
  it('getPasswordModal should return a singleton', () => {
    const a = getPasswordModal();
    const b = getPasswordModal();
    expect(a).toBe(b);
  });

  it('showPasswordModal should show the modal and resolve on submit', async () => {
    const promise = showPasswordModal({ title: 'Quick Test' });

    getInput().value = 'quick-pass';
    clickSubmit();

    const result = await promise;
    expect(result).toBe('quick-pass');
  });
});
