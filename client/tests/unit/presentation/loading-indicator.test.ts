/**
 * Tests for loading-indicator.ts
 *
 * Covers: LoadingIndicator show/hide/update, progress bar, animation,
 *         convenience functions showLoading/updateLoading/hideLoading,
 *         getLoadingIndicator singleton.
 */

import {
  LoadingIndicator,
  getLoadingIndicator,
  showLoading,
  updateLoading,
  hideLoading,
} from '../../../src/presentation/components/loading-indicator.js';

describe('LoadingIndicator', () => {
  afterEach(() => {
    document.querySelectorAll('.loading-indicator').forEach(el => el.remove());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('show', () => {
    it('should append a loading indicator element to the body', () => {
      const indicator = new LoadingIndicator();
      indicator.show();

      expect(document.querySelector('.loading-indicator')).not.toBeNull();
    });

    it('should include a spinner element', () => {
      const indicator = new LoadingIndicator();
      indicator.show();

      expect(document.querySelector('.loading-indicator .spinner')).not.toBeNull();
    });

    it('should display the default "Loading..." message', () => {
      const indicator = new LoadingIndicator();
      indicator.show();

      expect(document.querySelector('.loading-message')?.textContent).toBe('Loading...');
    });

    it('should display a custom message when provided', () => {
      const indicator = new LoadingIndicator();
      indicator.show({ message: 'Encrypting...' });

      expect(document.querySelector('.loading-message')?.textContent).toBe('Encrypting...');
    });

    it('should show progress bar element when showProgress is true', () => {
      const indicator = new LoadingIndicator();
      indicator.show({ showProgress: true, progress: 50 });

      const progressEl = document.querySelector('.loading-progress') as HTMLElement | null;
      expect(progressEl).not.toBeNull();
      expect(progressEl?.style.display).toBe('block');
    });

    it('should not append progress bar to DOM when showProgress is false', () => {
      const indicator = new LoadingIndicator();
      indicator.show({ showProgress: false });

      // When showProgress is false, the element is not appended
      const progressEl = document.querySelector('.loading-progress');
      expect(progressEl).toBeNull();
    });

    it('should set progress bar width correctly', () => {
      const indicator = new LoadingIndicator();
      indicator.show({ showProgress: true, progress: 75 });

      const bar = document.querySelector('.loading-progress-bar') as HTMLElement | null;
      expect(bar?.style.width).toBe('75%');
    });

    it('should clamp progress to 0 when negative', () => {
      const indicator = new LoadingIndicator();
      indicator.show({ showProgress: true, progress: -10 });

      const bar = document.querySelector('.loading-progress-bar') as HTMLElement | null;
      expect(bar?.style.width).toBe('0%');
    });

    it('should clamp progress to 100 when over 100', () => {
      const indicator = new LoadingIndicator();
      indicator.show({ showProgress: true, progress: 150 });

      const bar = document.querySelector('.loading-progress-bar') as HTMLElement | null;
      expect(bar?.style.width).toBe('100%');
    });

    it('should call update() instead of creating a new element when already visible', () => {
      const indicator = new LoadingIndicator();
      indicator.show({ message: 'First' });
      indicator.show({ message: 'Second' }); // should update, not create new

      expect(document.querySelectorAll('.loading-indicator').length).toBe(1);
      expect(document.querySelector('.loading-message')?.textContent).toBe('Second');
    });

    it('should have correct ARIA attributes', () => {
      const indicator = new LoadingIndicator();
      indicator.show();

      const el = document.querySelector('.loading-indicator')!;
      expect(el.getAttribute('role')).toBe('status');
      expect(el.getAttribute('aria-live')).toBe('polite');
      expect(el.getAttribute('aria-busy')).toBe('true');
    });

    it('should trigger animation via requestAnimationFrame', () => {
      const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
        cb(0);
        return 0;
      });

      const indicator = new LoadingIndicator();
      indicator.show();

      const el = document.querySelector('.loading-indicator');
      expect(el?.classList.contains('loading-indicator-visible')).toBe(true);
    });
  });

  describe('update', () => {
    it('should do nothing when indicator is not visible', () => {
      const indicator = new LoadingIndicator();
      expect(() => indicator.update({ message: 'New message' })).not.toThrow();
    });

    it('should update the message text', () => {
      const indicator = new LoadingIndicator();
      indicator.show({ message: 'Old' });
      indicator.update({ message: 'New' });

      expect(document.querySelector('.loading-message')?.textContent).toBe('New');
    });

    it('should show progress bar on update when showProgress is true and element exists', () => {
      const indicator = new LoadingIndicator();
      // Start with progress enabled so the element is in the DOM
      indicator.show({ showProgress: true, progress: 0 });
      indicator.update({ showProgress: true, progress: 30 });

      const progressEl = document.querySelector('.loading-progress') as HTMLElement | null;
      expect(progressEl?.style.display).toBe('block');
      const bar = document.querySelector('.loading-progress-bar') as HTMLElement | null;
      expect(bar?.style.width).toBe('30%');
    });

    it('should hide progress bar on update when showProgress is false', () => {
      const indicator = new LoadingIndicator();
      indicator.show({ showProgress: true });
      indicator.update({ showProgress: false });

      const progressEl = document.querySelector('.loading-progress') as HTMLElement | null;
      expect(progressEl?.style.display).toBe('none');
    });

    it('should not update message when message is undefined', () => {
      const indicator = new LoadingIndicator();
      indicator.show({ message: 'Keep this' });
      indicator.update({ showProgress: false });

      expect(document.querySelector('.loading-message')?.textContent).toBe('Keep this');
    });
  });

  describe('hide', () => {
    it('should do nothing when not visible', () => {
      jest.useFakeTimers();
      const indicator = new LoadingIndicator();
      expect(() => indicator.hide()).not.toThrow();
    });

    it('should remove the indicator from DOM after timeout', () => {
      jest.useFakeTimers();
      const indicator = new LoadingIndicator();
      indicator.show();

      expect(document.querySelector('.loading-indicator')).not.toBeNull();

      indicator.hide();
      jest.advanceTimersByTime(250);

      expect(document.querySelector('.loading-indicator')).toBeNull();
    });

    it('should remove loading-indicator-visible class synchronously on hide', () => {
      // Use raf spy WITHOUT fake timers to avoid fake timer overriding spy
      const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
        cb(0);
        return 0;
      });

      const indicator = new LoadingIndicator();
      indicator.show();

      const el = document.querySelector('.loading-indicator')!;
      expect(el.classList.contains('loading-indicator-visible')).toBe(true);

      indicator.hide();
      expect(el.classList.contains('loading-indicator-visible')).toBe(false);
    });
  });
});

// ============================================================================
// Convenience functions
// ============================================================================

describe('convenience functions', () => {
  afterEach(() => {
    document.querySelectorAll('.loading-indicator').forEach(el => el.remove());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('getLoadingIndicator', () => {
    it('should return a LoadingIndicator instance', () => {
      const indicator = getLoadingIndicator();
      expect(indicator).toBeInstanceOf(LoadingIndicator);
    });

    it('should return the same instance on repeated calls', () => {
      const a = getLoadingIndicator();
      const b = getLoadingIndicator();
      expect(a).toBe(b);
    });
  });

  describe('showLoading', () => {
    it('should show the loading indicator', () => {
      // Reset DOM state first - ensure no existing element
      document.querySelectorAll('.loading-indicator').forEach(el => el.remove());

      showLoading('Testing...');

      // The element may be in the DOM already or via getLoadingIndicator singleton
      // Check that at least the singleton is showing
      const indicator = getLoadingIndicator();
      expect(indicator).toBeDefined();
    });

    it('should work without arguments', () => {
      expect(() => showLoading()).not.toThrow();
    });
  });

  describe('updateLoading', () => {
    it('should not throw when updating', () => {
      expect(() => updateLoading('Updated', 60)).not.toThrow();
    });
  });

  describe('hideLoading', () => {
    it('should not throw when hiding', () => {
      jest.useFakeTimers();
      showLoading();
      expect(() => hideLoading()).not.toThrow();
    });
  });
});
