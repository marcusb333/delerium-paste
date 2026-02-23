import { AesGcmCryptoProvider } from '../../../../src/core/crypto/aes-gcm';

const cryptoProvider = new AesGcmCryptoProvider();
const genKey = () => cryptoProvider.generateKey();
const encryptString = (text: string) => cryptoProvider.encrypt(text);
const decryptParts = (keyB64: string, ivB64: string, ctB64: string) => 
  cryptoProvider.decrypt({ key: keyB64, iv: ivB64, ciphertext: ctB64 });

/**
 * Encryption Functions Test Suite
 * 
 * Tests the core cryptographic functions that implement the zero-knowledge encryption:
 * - genKey: Generates AES-256-GCM encryption keys for secure data protection
 * - encryptString: Encrypts plaintext using AES-256-GCM with random IV and key
 * - decryptParts: Decrypts ciphertext using provided key, IV, and encrypted data
 * 
 * These functions are the foundation of the zero-knowledge paste system, ensuring:
 * 1. Client-side encryption before data leaves the browser
 * 2. Server never sees unencrypted content
 * 3. Each paste uses unique encryption parameters (key + IV)
 * 4. Strong AES-256-GCM encryption with authentication
 * 
 * Mock Strategy:
 * - We mock the Web Crypto API (crypto.subtle) to test our logic without actual encryption
 * - This allows deterministic testing while verifying correct API usage
 */

// Mock crypto.subtle methods for deterministic testing
const mockGenerateKey = jest.fn();
const mockImportKey = jest.fn();
const mockExportKey = jest.fn();
const mockEncrypt = jest.fn();
const mockDecrypt = jest.fn();

// Mock crypto key object that matches the CryptoKey interface
const mockKey = {
  type: 'secret',
  algorithm: { name: 'AES-GCM', length: 256 },
  usages: ['encrypt', 'decrypt'],
  extractable: true
} as CryptoKey;

// Save real subtle so we restore it after each test (other tests e.g. paste-viewer need real Web Crypto)
const subtle = global.crypto?.subtle as unknown as Record<string, unknown> | undefined;
const originalGenerateKey = subtle?.generateKey;
const originalImportKey = subtle?.importKey;
const originalExportKey = subtle?.exportKey;
const originalEncrypt = subtle?.encrypt;
const originalDecrypt = subtle?.decrypt;

beforeEach(() => {
  jest.clearAllMocks();
  (global.crypto.subtle as any).generateKey = mockGenerateKey;
  (global.crypto.subtle as any).importKey = mockImportKey;
  (global.crypto.subtle as any).exportKey = mockExportKey;
  (global.crypto.subtle as any).encrypt = mockEncrypt;
  (global.crypto.subtle as any).decrypt = mockDecrypt;
});

afterEach(() => {
  if (originalGenerateKey != null) (global.crypto.subtle as any).generateKey = originalGenerateKey;
  if (originalImportKey != null) (global.crypto.subtle as any).importKey = originalImportKey;
  if (originalExportKey != null) (global.crypto.subtle as any).exportKey = originalExportKey;
  if (originalEncrypt != null) (global.crypto.subtle as any).encrypt = originalEncrypt;
  if (originalDecrypt != null) (global.crypto.subtle as any).decrypt = originalDecrypt;
});

describe('Encryption Functions', () => {
  describe('genKey', () => {
    /**
     * Tests AES-256-GCM key generation
     * 
     * This function creates a new encryption key for each paste, ensuring
     * that even if one key is compromised, other pastes remain secure.
     * The key is generated with extractable=true so it can be exported
     * and transmitted to the server for storage.
     */
    it('should generate a new encryption key', async () => {
      mockGenerateKey.mockResolvedValue(mockKey);

      const key = await genKey();

      expect(mockGenerateKey).toHaveBeenCalledWith(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      expect(key).toBe(mockKey);
    });

    it('should handle key generation errors', async () => {
      const error = new Error('Key generation failed');
      mockGenerateKey.mockRejectedValue(error);
      
      await expect(genKey()).rejects.toThrow('Key generation failed');
    });
  });

  describe('encryptString', () => {
    it('should encrypt a string and return encrypted data', async () => {
      const plaintext = 'Hello, World!';
      const mockIV = new Uint8Array(12);
      const mockCiphertext = new ArrayBuffer(32);
      const mockRawKey = new ArrayBuffer(32);
      
      mockGenerateKey.mockResolvedValue(mockKey);
      mockEncrypt.mockResolvedValue(mockCiphertext);
      mockExportKey.mockResolvedValue(mockRawKey);
      
      const result = await encryptString(plaintext);
      
      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('ciphertext');
      expect(typeof result.key).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(typeof result.ciphertext).toBe('string');
      
      expect(mockEncrypt).toHaveBeenCalled();
      expect(mockExportKey).toHaveBeenCalled();
    });

    it('should handle empty string', async () => {
      const plaintext = '';
      const mockIV = new Uint8Array(12);
      const mockCiphertext = new ArrayBuffer(0);
      const mockRawKey = new ArrayBuffer(32);
      
      mockGenerateKey.mockResolvedValue(mockKey);
      mockEncrypt.mockResolvedValue(mockCiphertext);
      mockExportKey.mockResolvedValue(mockRawKey);
      
      const result = await encryptString(plaintext);
      
      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('ciphertext');
    });

    it('should handle encryption errors', async () => {
      const plaintext = 'Test';
      const error = new Error('Encryption failed');
      
      mockGenerateKey.mockResolvedValue(mockKey);
      mockEncrypt.mockRejectedValue(error);
      
      await expect(encryptString(plaintext)).rejects.toThrow('Encryption failed');
    });
  });

  describe('decryptParts', () => {
    it('should decrypt encrypted data back to original string', async () => {
      const keyB64 = 'test-key-b64';
      const ivB64 = 'test-iv-b64';
      const ctB64 = 'test-ct-b64';
      const plaintext = 'Hello, World!';
      const mockPlaintextBuffer = new TextEncoder().encode(plaintext);
      
      mockImportKey.mockResolvedValue(mockKey);
      mockDecrypt.mockResolvedValue(mockPlaintextBuffer);
      
      const result = await decryptParts(keyB64, ivB64, ctB64);
      
      expect(result).toBe(plaintext);
      expect(mockImportKey).toHaveBeenCalled();
      expect(mockDecrypt).toHaveBeenCalled();
    });

    it('should handle decryption errors', async () => {
      const keyB64 = 'invalid-key';
      const ivB64 = 'invalid-iv';
      const ctB64 = 'invalid-ct';
      const error = new Error('Decryption failed');
      
      mockImportKey.mockRejectedValue(error);
      
      await expect(decryptParts(keyB64, ivB64, ctB64)).rejects.toThrow('Decryption failed');
    });

    it('should handle empty decrypted content', async () => {
      const keyB64 = 'test-key-b64';
      const ivB64 = 'test-iv-b64';
      const ctB64 = 'test-ct-b64';
      const emptyBuffer = new ArrayBuffer(0);
      
      mockImportKey.mockResolvedValue(mockKey);
      mockDecrypt.mockResolvedValue(emptyBuffer);
      
      const result = await decryptParts(keyB64, ivB64, ctB64);
      
      expect(result).toBe('');
    });
  });
});

// ============================================================================
// Password-Based Encryption (real Web Crypto)
// ============================================================================
// These tests use the REAL webcrypto subtle (restored by the outer afterEach),
// so they are placed in a separate describe with their own setup that bypasses
// the top-level mock.

describe('AesGcmCryptoProvider — password-based encryption (real crypto)', () => {
  // Restore real subtle for these tests
  beforeEach(() => {
    if (originalGenerateKey != null) (global.crypto.subtle as any).generateKey = originalGenerateKey;
    if (originalImportKey != null) (global.crypto.subtle as any).importKey = originalImportKey;
    if (originalExportKey != null) (global.crypto.subtle as any).exportKey = originalExportKey;
    if (originalEncrypt != null) (global.crypto.subtle as any).encrypt = originalEncrypt;
    if (originalDecrypt != null) (global.crypto.subtle as any).decrypt = originalDecrypt;
  });

  it('should encrypt and decrypt a string using password', async () => {
    const provider = new AesGcmCryptoProvider();
    const plaintext = 'Hello, secret world!';
    const password = 'test-password-123';

    const encrypted = await provider.encryptWithPassword(plaintext, password);

    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.key).toBeTruthy(); // salt stored as key
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.algorithm).toBe('AES-GCM-PBKDF2');

    const decrypted = await provider.decryptWithPassword(
      { key: encrypted.key, iv: encrypted.iv, ciphertext: encrypted.ciphertext },
      password
    );

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext each time due to random salt and IV', async () => {
    const provider = new AesGcmCryptoProvider();
    const plaintext = 'same content';
    const password = 'same-password';

    const enc1 = await provider.encryptWithPassword(plaintext, password);
    const enc2 = await provider.encryptWithPassword(plaintext, password);

    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it('should fail to decrypt with wrong password', async () => {
    const provider = new AesGcmCryptoProvider();
    const encrypted = await provider.encryptWithPassword('secret', 'correct-password');

    await expect(
      provider.decryptWithPassword(
        { key: encrypted.key, iv: encrypted.iv, ciphertext: encrypted.ciphertext },
        'wrong-password'
      )
    ).rejects.toThrow();
  });

  it('should encrypt empty string successfully', async () => {
    const provider = new AesGcmCryptoProvider();
    const encrypted = await provider.encryptWithPassword('', 'pass');
    const decrypted = await provider.decryptWithPassword(
      { key: encrypted.key, iv: encrypted.iv, ciphertext: encrypted.ciphertext },
      'pass'
    );
    expect(decrypted).toBe('');
  });

  it('should round-trip unicode and emoji content', async () => {
    const provider = new AesGcmCryptoProvider();
    const plaintext = 'Hello 🌍 emoji and Unicode: 你好世界';
    const encrypted = await provider.encryptWithPassword(plaintext, 'unicode-pass');
    const decrypted = await provider.decryptWithPassword(
      { key: encrypted.key, iv: encrypted.iv, ciphertext: encrypted.ciphertext },
      'unicode-pass'
    );
    expect(decrypted).toBe(plaintext);
  });
});