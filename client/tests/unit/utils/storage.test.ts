/**
 * Storage Utilities Test Suite
 * 
 * Tests the browser storage utilities for sessionStorage and localStorage
 * management, including delete token storage and retrieval.
 */

import {
  sessionStorageSafe,
  localStorageSafe,
  storeDeleteToken,
  getDeleteToken,
  removeDeleteToken
} from '../../../src/utils/storage';

describe('Storage Utilities', () => {
  beforeEach(() => {
    // Clear storage before each test
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('sessionStorageSafe', () => {
    it('should return sessionStorage when available', () => {
      const storage = sessionStorageSafe();
      expect(storage).toBe(window.sessionStorage);
    });

    it('should return null when sessionStorage access throws (e.g. Safari private mode)', () => {
      const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
      Object.defineProperty(window, 'sessionStorage', {
        get() { throw new Error('SecurityError: The operation is insecure.'); },
        configurable: true,
      });
      try {
        expect(sessionStorageSafe()).toBeNull();
      } finally {
        if (original) Object.defineProperty(window, 'sessionStorage', original);
      }
    });
  });

  describe('localStorageSafe', () => {
    it('should return localStorage when available', () => {
      const storage = localStorageSafe();
      expect(storage).toBe(window.localStorage);
    });

    it('should return null when localStorage access throws (e.g. Safari private mode)', () => {
      const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', {
        get() { throw new Error('SecurityError: The operation is insecure.'); },
        configurable: true,
      });
      try {
        expect(localStorageSafe()).toBeNull();
      } finally {
        if (original) Object.defineProperty(window, 'localStorage', original);
      }
    });
  });

  describe('Delete Token Management', () => {
    const testId = 'test-paste-id';
    const testToken = 'test-delete-token-123';

    it('should store delete token in sessionStorage', () => {
      storeDeleteToken(testId, testToken);
      
      const stored = sessionStorage.getItem(`deleteToken_${testId}`);
      expect(stored).toBe(testToken);
    });

    it('should retrieve stored delete token', () => {
      storeDeleteToken(testId, testToken);
      
      const retrieved = getDeleteToken(testId);
      expect(retrieved).toBe(testToken);
    });

    it('should return null for non-existent token', () => {
      const retrieved = getDeleteToken('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should remove delete token from sessionStorage', () => {
      storeDeleteToken(testId, testToken);
      expect(getDeleteToken(testId)).toBe(testToken);
      
      removeDeleteToken(testId);
      expect(getDeleteToken(testId)).toBeNull();
    });

    it('should migrate token from localStorage to sessionStorage', () => {
      // Manually store in localStorage (legacy)
      localStorage.setItem(`deleteToken_${testId}`, testToken);
      
      // Retrieve should migrate to sessionStorage
      const retrieved = getDeleteToken(testId);
      expect(retrieved).toBe(testToken);
      
      // Should now be in sessionStorage
      expect(sessionStorage.getItem(`deleteToken_${testId}`)).toBe(testToken);
      
      // Should be removed from localStorage
      expect(localStorage.getItem(`deleteToken_${testId}`)).toBeNull();
    });

    it('should clean up localStorage when storing new token', () => {
      // Set legacy token in localStorage
      localStorage.setItem(`deleteToken_${testId}`, 'old-token');
      
      // Store new token
      storeDeleteToken(testId, testToken);
      
      // Should be in sessionStorage
      expect(sessionStorage.getItem(`deleteToken_${testId}`)).toBe(testToken);
      
      // Should be removed from localStorage
      expect(localStorage.getItem(`deleteToken_${testId}`)).toBeNull();
    });

    it('should handle multiple tokens independently', () => {
      const id1 = 'paste-1';
      const id2 = 'paste-2';
      const token1 = 'token-1';
      const token2 = 'token-2';
      
      storeDeleteToken(id1, token1);
      storeDeleteToken(id2, token2);
      
      expect(getDeleteToken(id1)).toBe(token1);
      expect(getDeleteToken(id2)).toBe(token2);
      
      removeDeleteToken(id1);
      
      expect(getDeleteToken(id1)).toBeNull();
      expect(getDeleteToken(id2)).toBe(token2);
    });
  });
});
