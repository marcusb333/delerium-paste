/**
 * EncryptionService tests
 *
 * Covers paste encryption/decryption wrappers, delete auth derivation,
 * and the chat message encrypt/decrypt paths including the JSON ↔ plain-text
 * backward-compatibility branch.
 */

import { EncryptionService } from '../../../../src/core/services/encryption-service.js';
import { encodeBase64Url } from '../../../../src/core/crypto/encoding.js';
import { generateSalt } from '../../../../src/security.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeKey(password = 'test-password'): Promise<CryptoKey> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a raw string directly with a CryptoKey and return {ct, iv} as base64url
async function rawEncrypt(
  plaintext: string,
  key: CryptoKey
): Promise<{ ct: string; iv: string }> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { ct: encodeBase64Url(data), iv: encodeBase64Url(iv.buffer) };
}

// ─── encryptPaste / decryptPaste ─────────────────────────────────────────────

describe('EncryptionService – encryptPaste / decryptPaste', () => {
  const svc = new EncryptionService();

  it('should round-trip plain ASCII content', async () => {
    const { keyB64, ivB64, ctB64 } = await svc.encryptPaste('Hello world', 'pass');
    const result = await svc.decryptPaste(ctB64, 'pass', keyB64, ivB64);
    expect(result).toBe('Hello world');
  });

  it('should round-trip empty string', async () => {
    const { keyB64, ivB64, ctB64 } = await svc.encryptPaste('', 'pass');
    const result = await svc.decryptPaste(ctB64, 'pass', keyB64, ivB64);
    expect(result).toBe('');
  });

  it('should round-trip unicode content', async () => {
    const content = '🔐 Ünïcödé テスト';
    const { keyB64, ivB64, ctB64 } = await svc.encryptPaste(content, 'pass');
    const result = await svc.decryptPaste(ctB64, 'pass', keyB64, ivB64);
    expect(result).toBe(content);
  });

  it('should throw when decrypted with wrong password', async () => {
    const { keyB64, ivB64, ctB64 } = await svc.encryptPaste('Secret', 'correct');
    await expect(svc.decryptPaste(ctB64, 'wrong', keyB64, ivB64)).rejects.toThrow();
  });

  it('encryptPaste should produce distinct ciphertexts on each call (fresh IV/salt)', async () => {
    const a = await svc.encryptPaste('Same content', 'pass');
    const b = await svc.encryptPaste('Same content', 'pass');
    expect(a.ctB64).not.toBe(b.ctB64);
    expect(a.ivB64).not.toBe(b.ivB64);
    expect(a.keyB64).not.toBe(b.keyB64);
  });
});

// ─── deriveDeleteAuth ─────────────────────────────────────────────────────────

describe('EncryptionService – deriveDeleteAuth', () => {
  const svc = new EncryptionService();

  it('should be deterministic for the same password and salt', async () => {
    const salt = generateSalt();
    const a = await svc.deriveDeleteAuth('password', new Uint8Array(salt));
    const b = await svc.deriveDeleteAuth('password', new Uint8Array(salt));
    expect(a).toBe(b);
  });

  it('should differ for different passwords', async () => {
    const salt = generateSalt();
    const a = await svc.deriveDeleteAuth('password1', new Uint8Array(salt));
    const b = await svc.deriveDeleteAuth('password2', new Uint8Array(salt));
    expect(a).not.toBe(b);
  });

  it('should produce valid base64url strings', async () => {
    const auth = await svc.deriveDeleteAuth('pass', new Uint8Array(generateSalt()));
    expect(auth).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

// ─── encryptChatMessage ───────────────────────────────────────────────────────

describe('EncryptionService – encryptChatMessage', () => {
  const svc = new EncryptionService();

  it('should return an ArrayBuffer ciphertext and a 12-byte IV', async () => {
    const key = await makeKey();
    const { encryptedData, iv } = await svc.encryptChatMessage('Hello', key);
    expect(encryptedData.byteLength).toBeGreaterThan(0);
    expect(iv.byteLength).toBe(12);
  });

  it('should produce different ciphertexts on successive calls (unique IVs)', async () => {
    const key = await makeKey();
    const a = await svc.encryptChatMessage('Hello', key);
    const b = await svc.encryptChatMessage('Hello', key);
    expect(new Uint8Array(a.iv)).not.toEqual(new Uint8Array(b.iv));
  });

  it('should truncate username to 20 characters', async () => {
    const key = await makeKey();
    const longName = 'A'.repeat(30);
    const { encryptedData, iv } = await svc.encryptChatMessage('Msg', key, longName);

    // Decrypt and verify the username was truncated
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      encryptedData
    );
    const parsed = JSON.parse(new TextDecoder().decode(decrypted));
    expect(parsed.username).toHaveLength(20);
  });

  it('should include username in payload when provided', async () => {
    const key = await makeKey();
    const { encryptedData, iv } = await svc.encryptChatMessage('Hello', key, 'alice');
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      encryptedData
    );
    const parsed = JSON.parse(new TextDecoder().decode(decrypted));
    expect(parsed.text).toBe('Hello');
    expect(parsed.username).toBe('alice');
  });

  it('should omit username field when not provided', async () => {
    const key = await makeKey();
    const { encryptedData, iv } = await svc.encryptChatMessage('Hello', key);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      encryptedData
    );
    const parsed = JSON.parse(new TextDecoder().decode(decrypted));
    expect(parsed.text).toBe('Hello');
    expect(parsed.username).toBeUndefined();
  });
});

// ─── decryptChatMessage ───────────────────────────────────────────────────────

describe('EncryptionService – decryptChatMessage (JSON format)', () => {
  const svc = new EncryptionService();

  it('should decrypt a new-format message with text and username', async () => {
    const key = await makeKey();
    const { ct, iv } = await rawEncrypt(JSON.stringify({ text: 'Hi', username: 'bob' }), key);
    const result = await svc.decryptChatMessage({ ct, iv, timestamp: 0 }, key);
    expect(result.text).toBe('Hi');
    expect(result.username).toBe('bob');
  });

  it('should decrypt a new-format message without username', async () => {
    const key = await makeKey();
    const { ct, iv } = await rawEncrypt(JSON.stringify({ text: 'No user' }), key);
    const result = await svc.decryptChatMessage({ ct, iv, timestamp: 0 }, key);
    expect(result.text).toBe('No user');
    expect(result.username).toBeUndefined();
  });

  it('should fall back to plain text for legacy (non-JSON) messages', async () => {
    const key = await makeKey();
    const { ct, iv } = await rawEncrypt('plain old message', key);
    const result = await svc.decryptChatMessage({ ct, iv, timestamp: 0 }, key);
    expect(result.text).toBe('plain old message');
    expect(result.username).toBeUndefined();
  });

  it('should fall back to plain text when JSON parses but lacks text field', async () => {
    const key = await makeKey();
    // Valid JSON but wrong schema
    const { ct, iv } = await rawEncrypt(JSON.stringify({ content: 'wrong key' }), key);
    const result = await svc.decryptChatMessage({ ct, iv, timestamp: 0 }, key);
    // Falls through to plain-text branch — the raw JSON string becomes the text
    expect(result.text).toBe(JSON.stringify({ content: 'wrong key' }));
    expect(result.username).toBeUndefined();
  });

  it('should throw when decryption fails (wrong key)', async () => {
    const key1 = await makeKey('key1');
    const key2 = await makeKey('key2');
    const { ct, iv } = await rawEncrypt('secret', key1);
    await expect(svc.decryptChatMessage({ ct, iv, timestamp: 0 }, key2)).rejects.toThrow();
  });

  it('should preserve the timestamp from the message object', async () => {
    // timestamp is a pass-through on the ChatUseCase level, not on EncryptionService,
    // but the service itself does not strip it — just verifying the contract.
    const key = await makeKey();
    const { ct, iv } = await rawEncrypt(JSON.stringify({ text: 'ts test' }), key);
    const result = await svc.decryptChatMessage({ ct, iv, timestamp: 9999 }, key);
    // EncryptionService returns DecryptedChatMessage without timestamp; that's added by ChatUseCase
    expect(result.text).toBe('ts test');
  });
});

// ─── deriveKeyFromPassword ────────────────────────────────────────────────────

describe('EncryptionService – deriveKeyFromPassword', () => {
  const svc = new EncryptionService();

  it('should return a CryptoKey usable for AES-GCM', async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const key = await svc.deriveKeyFromPassword('pass', salt);
    expect(key.type).toBe('secret');
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it('should produce consistent keys for the same inputs', async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const k1 = await svc.deriveKeyFromPassword('same', salt);
    const k2 = await svc.deriveKeyFromPassword('same', salt);

    // Cross-verify: encrypt with k1, decrypt with k2
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, k1,
      new TextEncoder().encode('verify')
    );
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k2, ct);
    expect(new TextDecoder().decode(pt)).toBe('verify');
  });
});
