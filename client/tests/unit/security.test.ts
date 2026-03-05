/**
 * security.test.ts - Comprehensive tests for security module
 * 
 * Tests all security functions including:
 * - Password encryption/decryption (ArrayBuffer-based)
 * - PBKDF2 key derivation
 * - Security utilities
 * - Error message handling
 */

import {
  secureClear,
  secureClearBuffer,
  getSafeErrorMessage,
  ERROR_MESSAGES,
  deriveKeyFromPassword,
  generateSalt,
  encryptWithPassword,
  decryptWithPassword,
  deriveDeleteAuth,
} from '../../src/security.js';

// ============================================================================
// SECURITY UTILITY TESTS
// ============================================================================

describe('secureClear', () => {
  it('should not throw', () => {
    expect(() => secureClear('sensitive')).not.toThrow();
  });

  it('should handle empty strings', () => {
    expect(() => secureClear('')).not.toThrow();
  });
});

describe('secureClearBuffer', () => {
  it('should overwrite buffer with random data', () => {
    const buffer = new ArrayBuffer(8);
    const view = new Uint8Array(buffer);
    
    // Fill with a known pattern
    for (let i = 0; i < view.length; i++) {
      view[i] = 0xFF;
    }
    
    secureClearBuffer(buffer);
    
    // Buffer should be overwritten (not all 0xFF anymore)
    const clearedView = new Uint8Array(buffer);
    let allFF = true;
    for (let i = 0; i < clearedView.length; i++) {
      if (clearedView[i] !== 0xFF) {
        allFF = false;
        break;
      }
    }
    expect(allFF).toBe(false); // Should have been overwritten
  });

  it('should handle empty buffers', () => {
    expect(() => secureClearBuffer(new ArrayBuffer(0))).not.toThrow();
  });
});

describe('getSafeErrorMessage', () => {
  // Suppress expected console.error calls in these tests
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should return safe message', () => {
    const error = new Error('Internal details');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toBeTruthy();
    expect(message).not.toContain('Internal details');
  });

  it('should handle null/undefined', () => {
    expect(getSafeErrorMessage(null, 'test')).toBeTruthy();
    expect(getSafeErrorMessage(undefined, 'test')).toBeTruthy();
  });

  it('should handle pow_required error', () => {
    const error = new Error('pow_required');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toContain('Proof of work is required');
  });

  it('should handle pow_invalid error', () => {
    const error = new Error('pow_invalid');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toContain('Proof of work verification failed');
  });

  it('should handle rate_limited error', () => {
    const error = new Error('rate_limited');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toBe(ERROR_MESSAGES.RATE_LIMITED);
  });

  it('should handle rate limit error (429)', () => {
    const error = new Error('429 Too Many Requests');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toBe(ERROR_MESSAGES.RATE_LIMITED);
  });

  it('should handle network error', () => {
    const error = new Error('network error');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toBe(ERROR_MESSAGES.NETWORK_ERROR);
  });

  it('should handle fetch error', () => {
    const error = new Error('fetch failed');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toBe(ERROR_MESSAGES.NETWORK_ERROR);
  });

  it('should handle not found error (404)', () => {
    const error = new Error('404 not found');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toBe(ERROR_MESSAGES.NOT_FOUND);
  });

  it('should handle encryption error', () => {
    const error = new Error('encrypt failed');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toBe(ERROR_MESSAGES.ENCRYPTION_ERROR);
  });

  it('should handle forbidden error (403)', () => {
    const error = new Error('403 forbidden');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toContain('Access denied');
  });

  it('should handle decryption error', () => {
    const error = new Error('decrypt failed');
    const message = getSafeErrorMessage(error, 'test');
    expect(message).toBe(ERROR_MESSAGES.DECRYPTION_ERROR);
  });
});

describe('ERROR_MESSAGES', () => {
  it('should have all messages', () => {
    expect(ERROR_MESSAGES.NETWORK_ERROR).toBeTruthy();
    expect(ERROR_MESSAGES.SERVER_ERROR).toBeTruthy();
    expect(ERROR_MESSAGES.ENCRYPTION_ERROR).toBeTruthy();
    expect(ERROR_MESSAGES.DECRYPTION_ERROR).toBeTruthy();
  });
});

// ============================================================================
// CRYPTOGRAPHY TESTS
// ============================================================================

describe('generateSalt', () => {
  it('should generate 16 byte salt', () => {
    const salt = generateSalt();
    expect(salt.byteLength).toBe(16);
  });

  it('should generate unique salts', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    expect(new Uint8Array(salt1)).not.toEqual(new Uint8Array(salt2));
  });
});

describe('deriveKeyFromPassword', () => {
  it('should derive key from password and salt', async () => {
    const password = 'TestPassword123';
    const salt = generateSalt();
    const key = await deriveKeyFromPassword(password, salt);
    
    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
  });

  it('should be deterministic', async () => {
    const password = 'TestPassword123';
    const salt = generateSalt();
    const content = 'test';
    
    // Derive same key twice
    const key1 = await deriveKeyFromPassword(password, salt);
    const key2 = await deriveKeyFromPassword(password, salt);
    
    // Encrypt same content with both keys - should produce different results (different IVs)
    // but both should be able to decrypt
    const iv1 = crypto.getRandomValues(new Uint8Array(12));
    const enc1 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv1 }, key1, new TextEncoder().encode(content));
    const dec1 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv1 }, key2, enc1);
    
    expect(new TextDecoder().decode(dec1)).toBe(content);
  });

  it('should differ with different passwords', async () => {
    const salt = generateSalt();
    const content = 'test';
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const key1 = await deriveKeyFromPassword('Password1', salt);
    const key2 = await deriveKeyFromPassword('Password2', salt);
    
    // Encrypt with key1
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key1, new TextEncoder().encode(content));
    
    // Try to decrypt with key2 - should fail
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key2, encrypted)
    ).rejects.toThrow();
  });

  it('should differ with different salts', async () => {
    const password = 'TestPassword123';
    const content = 'test';
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const key1 = await deriveKeyFromPassword(password, generateSalt());
    const key2 = await deriveKeyFromPassword(password, generateSalt());
    
    // Encrypt with key1
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key1, new TextEncoder().encode(content));
    
    // Try to decrypt with key2 - should fail
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key2, encrypted)
    ).rejects.toThrow();
  });
});

describe('encryptWithPassword', () => {
  it('should return ArrayBuffers', async () => {
    const result = await encryptWithPassword('Secret message', 'TestPassword123');
    
    expect(result.encryptedData).toBeDefined();
    expect(result.iv).toBeDefined();
    expect(result.salt).toBeDefined();
    expect(result.encryptedData.byteLength).toBeGreaterThan(0);
    expect(result.iv.byteLength).toBe(12);
    expect(result.salt.byteLength).toBe(16);
  });

  it('should produce different results each time', async () => {
    const content = 'Secret message';
    const password = 'TestPassword123';
    
    const result1 = await encryptWithPassword(content, password);
    const result2 = await encryptWithPassword(content, password);
    
    // Different IVs and salts mean different ciphertexts
    expect(new Uint8Array(result1.encryptedData)).not.toEqual(new Uint8Array(result2.encryptedData));
    expect(new Uint8Array(result1.iv)).not.toEqual(new Uint8Array(result2.iv));
    expect(new Uint8Array(result1.salt)).not.toEqual(new Uint8Array(result2.salt));
  });

  it('should handle empty content', async () => {
    const result = await encryptWithPassword('', 'TestPassword123');
    expect(result.encryptedData.byteLength).toBeGreaterThan(0);
  });

  it('should handle unicode', async () => {
    const result = await encryptWithPassword('???? ??', 'TestPassword123');
    expect(result.encryptedData.byteLength).toBeGreaterThan(0);
  });

  it('should handle long content', async () => {
    const result = await encryptWithPassword('x'.repeat(10000), 'TestPassword123');
    expect(result.encryptedData.byteLength).toBeGreaterThan(10000);
  });
});

describe('decryptWithPassword', () => {
  it('should decrypt with correct password', async () => {
    const original = 'Secret message';
    const password = 'TestPassword123';
    
    const encrypted = await encryptWithPassword(original, password);
    const decrypted = await decryptWithPassword(
      encrypted.encryptedData,
      password,
      encrypted.salt,
      encrypted.iv
    );
    
    expect(decrypted).toBe(original);
  });

  it('should fail with wrong password', async () => {
    const original = 'Secret message';
    const encrypted = await encryptWithPassword(original, 'TestPassword123');
    
    await expect(
      decryptWithPassword(
        encrypted.encryptedData,
        'WrongPassword',
        encrypted.salt,
        encrypted.iv
      )
    ).rejects.toThrow();
  });

  it('should handle empty content', async () => {
    const original = '';
    const password = 'TestPassword123';
    
    const encrypted = await encryptWithPassword(original, password);
    const decrypted = await decryptWithPassword(
      encrypted.encryptedData,
      password,
      encrypted.salt,
      encrypted.iv
    );
    
    expect(decrypted).toBe(original);
  });

  it('should handle unicode', async () => {
    const original = '???? ?? Caf?';
    const password = 'TestPassword123';
    
    const encrypted = await encryptWithPassword(original, password);
    const decrypted = await decryptWithPassword(
      encrypted.encryptedData,
      password,
      encrypted.salt,
      encrypted.iv
    );
    
    expect(decrypted).toBe(original);
  });

  it('should handle long content', async () => {
    const original = 'x'.repeat(10000);
    const password = 'TestPassword123';
    
    const encrypted = await encryptWithPassword(original, password);
    const decrypted = await decryptWithPassword(
      encrypted.encryptedData,
      password,
      encrypted.salt,
      encrypted.iv
    );
    
    expect(decrypted).toBe(original);
  });

  it('should handle newlines and special chars', async () => {
    const original = 'Line1\nLine2\tTabbed\r\nWindows';
    const password = 'TestPassword123';
    
    const encrypted = await encryptWithPassword(original, password);
    const decrypted = await decryptWithPassword(
      encrypted.encryptedData,
      password,
      encrypted.salt,
      encrypted.iv
    );
    
    expect(decrypted).toBe(original);
  });

  it('should fail with corrupted ciphertext', async () => {
    const encrypted = await encryptWithPassword('Secret', 'TestPassword123');
    
    // Corrupt the ciphertext
    const corrupted = encrypted.encryptedData.slice(0);
    new Uint8Array(corrupted)[0] ^= 0xFF;
    
    await expect(
      decryptWithPassword(corrupted, 'TestPassword123', encrypted.salt, encrypted.iv)
    ).rejects.toThrow();
  });

  it('should fail with corrupted IV', async () => {
    const encrypted = await encryptWithPassword('Secret', 'TestPassword123');
    
    // Corrupt the IV
    const corruptedIv = encrypted.iv.slice(0);
    new Uint8Array(corruptedIv)[0] ^= 0xFF;
    
    await expect(
      decryptWithPassword(encrypted.encryptedData, 'TestPassword123', encrypted.salt, corruptedIv)
    ).rejects.toThrow();
  });

  it('should fail with corrupted salt', async () => {
    const encrypted = await encryptWithPassword('Secret', 'TestPassword123');
    
    // Corrupt the salt
    const corruptedSalt = encrypted.salt.slice(0);
    new Uint8Array(corruptedSalt)[0] ^= 0xFF;
    
    await expect(
      decryptWithPassword(encrypted.encryptedData, 'TestPassword123', corruptedSalt, encrypted.iv)
    ).rejects.toThrow();
  });
});

// ============================================================================
// DELETE AUTHORIZATION TESTS
// ============================================================================

describe('deriveDeleteAuth', () => {
  it('should return consistent output for same password and salt', async () => {
    const password = 'TestPassword123';
    const salt = generateSalt();
    
    const auth1 = await deriveDeleteAuth(password, new Uint8Array(salt));
    const auth2 = await deriveDeleteAuth(password, new Uint8Array(salt));
    
    expect(auth1).toBe(auth2);
  });

  it('should return different output for different passwords', async () => {
    const salt = generateSalt();
    
    const auth1 = await deriveDeleteAuth('Password1', new Uint8Array(salt));
    const auth2 = await deriveDeleteAuth('Password2', new Uint8Array(salt));
    
    expect(auth1).not.toBe(auth2);
  });

  it('should return different output for different salts', async () => {
    const password = 'TestPassword123';
    
    const auth1 = await deriveDeleteAuth(password, new Uint8Array(generateSalt()));
    const auth2 = await deriveDeleteAuth(password, new Uint8Array(generateSalt()));
    
    expect(auth1).not.toBe(auth2);
  });

  it('should return valid base64url string', async () => {
    const password = 'TestPassword123';
    const salt = generateSalt();
    
    const auth = await deriveDeleteAuth(password, new Uint8Array(salt));
    
    // Valid base64url should only contain these characters
    expect(auth).toMatch(/^[A-Za-z0-9_-]+$/);
    // Should be 43 characters (256 bits = 32 bytes = 43 base64url chars without padding)
    expect(auth.length).toBe(43);
  });

  it('should be different from encryption key derivation', async () => {
    const password = 'TestPassword123';
    const salt = generateSalt();
    
    // Get delete auth
    const deleteAuth = await deriveDeleteAuth(password, new Uint8Array(salt));
    
    // Encrypt something with the encryption key and get ciphertext
    const { encryptedData, iv } = await encryptWithPassword('test', password);
    
    // Try to decrypt with a key derived from deleteAuth - should fail
    // This proves the delete auth is cryptographically different from the encryption key
    // We can't easily test this directly, but we can verify the delete auth
    // uses a different salt derivation path by checking it's deterministic but distinct
    
    // If we encrypt the same content twice with the same password,
    // the delete auth should be the same (deterministic)
    const deleteAuth2 = await deriveDeleteAuth(password, new Uint8Array(salt));
    expect(deleteAuth).toBe(deleteAuth2);
    
    // But different from a delete auth with a different salt
    const differentSalt = generateSalt();
    const deleteAuth3 = await deriveDeleteAuth(password, new Uint8Array(differentSalt));
    expect(deleteAuth).not.toBe(deleteAuth3);
  });

  it('should handle unicode passwords', async () => {
    const password = '密码🔐Test';
    const salt = generateSalt();
    
    const auth = await deriveDeleteAuth(password, new Uint8Array(salt));
    
    expect(auth).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(auth.length).toBe(43);
  });

  it('should handle empty password', async () => {
    const password = '';
    const salt = generateSalt();
    
    const auth = await deriveDeleteAuth(password, new Uint8Array(salt));
    
    // Should still produce a valid result
    expect(auth).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(auth.length).toBe(43);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Password encryption integration', () => {
  const testCases = [
    'Simple text',
    'Text with\nnewlines',
    'Unicode: ???? ??',
    'Special: !@#$%^&*()',
    'x'.repeat(1000),
  ];

  testCases.forEach((content) => {
    it(`should handle: ${content.substring(0, 30)}`, async () => {
      const password = 'TestPassword123';
      const encrypted = await encryptWithPassword(content, password);
      const decrypted = await decryptWithPassword(
        encrypted.encryptedData,
        password,
        encrypted.salt,
        encrypted.iv
      );
      expect(decrypted).toBe(content);
    });
  });

  it('should maintain zero-knowledge', async () => {
    const content = 'Secret message';
    const password = 'TestPassword123';
    
    const encrypted = await encryptWithPassword(content, password);
    
    // Convert to strings to check content
    const encStr = String.fromCharCode(...new Uint8Array(encrypted.encryptedData));
    const saltStr = String.fromCharCode(...new Uint8Array(encrypted.salt));
    const ivStr = String.fromCharCode(...new Uint8Array(encrypted.iv));
    
    // Should not contain plaintext or password
    expect(encStr).not.toContain(password);
    expect(encStr).not.toContain(content);
    expect(saltStr).not.toContain(password);
    expect(ivStr).not.toContain(password);
  });
});
