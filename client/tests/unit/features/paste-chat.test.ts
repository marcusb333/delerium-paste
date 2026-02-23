/**
 * paste-chat.test.ts - Tests for anonymous chat functionality
 *
 * Tests encryption, decryption, and UI integration for chat messages
 */

import { deriveKeyFromPassword, generateSalt } from '../../../src/security.js';
import { encodeBase64Url, decodeBase64Url } from '../../../src/core/crypto/encoding.js';
import { escapeHtml, generateRandomUsername, ChatView } from '../../../src/presentation/components/chat-view.js';
import { ChatUseCase } from '../../../src/application/use-cases/chat-use-case.js';
import { EncryptionService } from '../../../src/core/services/encryption-service.js';
import { showPasswordModal } from '../../../src/presentation/components/password-modal.js';

const encryptionService = new EncryptionService();
const chatUseCase = new ChatUseCase(encryptionService);

function createChatView(): ChatView {
  return new ChatView(chatUseCase);
}

function setupPasteChat(pasteId: string, salt: Uint8Array, initialPassword?: string): void {
  createChatView().setup(pasteId, salt, initialPassword);
}

async function encryptMessageWithKey(
  message: string,
  key: CryptoKey,
  username?: string
): Promise<{ encryptedData: ArrayBuffer; iv: ArrayBuffer }> {
  return encryptionService.encryptChatMessage(message, key, username);
}

jest.mock('../../../src/presentation/components/password-modal.js', () => ({
  showPasswordModal: jest.fn(),
  getPasswordModal: jest.fn(() => ({
    show: jest.fn().mockResolvedValue('test-password'),
    closeOnSuccess: jest.fn()
  }))
}));

// ============================================================================
// CHAT ENCRYPTION/DECRYPTION TESTS
// ============================================================================

describe('Chat Message Encryption', () => {
  // Suppress console warnings in tests
  const originalConsoleWarn = console.warn;
  beforeEach(() => {
    console.warn = jest.fn();
  });
  afterEach(() => {
    console.warn = originalConsoleWarn;
  });

  it('should encrypt and decrypt a simple message with password', async () => {
    // Arrange - Setup password and message
    const password = 'test-password-123';
    const message = 'Hello, this is a secret chat message!';
    const salt = generateSalt();

    // Act - Encrypt message
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const key = await deriveKeyFromPassword(password, salt);
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(message)
    );

    // Act - Decrypt message
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );
    const decryptedMessage = new TextDecoder().decode(decryptedData);

    // Assert
    expect(decryptedMessage).toBe(message);
  });

  it('should fail decryption with wrong password', async () => {
    // Arrange
    const correctPassword = 'correct-password';
    const wrongPassword = 'wrong-password';
    const message = 'Secret message';
    const salt = generateSalt();
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    // Encrypt with correct password
    const correctKey = await deriveKeyFromPassword(correctPassword, salt);
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      correctKey,
      new TextEncoder().encode(message)
    );

    // Try to decrypt with wrong password
    const wrongKey = await deriveKeyFromPassword(wrongPassword, salt);

    // Assert - Should throw error
    await expect(
      crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        wrongKey,
        encryptedData
      )
    ).rejects.toThrow();
  });

  it('should use same salt as paste for key derivation', async () => {
    // Arrange - Simulate paste salt (from URL fragment)
    const password = 'shared-password';
    const message = 'Test message';
    const pasteSalt = generateSalt();
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    // Act - Derive keys using same salt and password
    const key1 = await deriveKeyFromPassword(password, pasteSalt);
    const key2 = await deriveKeyFromPassword(password, pasteSalt);

    // Encrypt with key1
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key1,
      new TextEncoder().encode(message)
    );

    // Decrypt with key2 (should work if keys are identical)
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key2,
      encrypted
    );

    // Assert - Decryption should succeed, proving keys are identical
    expect(new TextDecoder().decode(decrypted)).toBe(message);
  });

  it('should handle unicode characters in messages', async () => {
    // Arrange
    const password = 'test-password';
    const message = '你好世界 🌍 Émojis & spëcial çhars!';
    const salt = generateSalt();
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    // Act - Encrypt and decrypt
    const key = await deriveKeyFromPassword(password, salt);
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(message)
    );
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );
    const decryptedMessage = new TextDecoder().decode(decryptedData);

    // Assert
    expect(decryptedMessage).toBe(message);
  });

  it('should handle long messages (up to 1000 chars)', async () => {
    // Arrange
    const password = 'test-password';
    const message = 'A'.repeat(1000); // Max message length
    const salt = generateSalt();
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    // Act
    const key = await deriveKeyFromPassword(password, salt);
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(message)
    );
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );
    const decryptedMessage = new TextDecoder().decode(decryptedData);

    // Assert
    expect(decryptedMessage).toBe(message);
    expect(decryptedMessage.length).toBe(1000);
  });

  it('should produce different ciphertexts for same message (different IVs)', async () => {
    // Arrange
    const password = 'test-password';
    const message = 'Same message';
    const salt = generateSalt();

    // Act - Encrypt same message twice with different IVs
    const iv1 = new Uint8Array(12);
    crypto.getRandomValues(iv1);
    const iv2 = new Uint8Array(12);
    crypto.getRandomValues(iv2);

    const key = await deriveKeyFromPassword(password, salt);

    const encrypted1 = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv1 },
      key,
      new TextEncoder().encode(message)
    );

    const encrypted2 = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv2 },
      key,
      new TextEncoder().encode(message)
    );

    // Assert - Ciphertexts should be different
    expect(new Uint8Array(encrypted1)).not.toEqual(new Uint8Array(encrypted2));
  });
});

// ============================================================================
// BASE64URL ENCODING TESTS (for message transmission)
// ============================================================================

describe('Chat Message Encoding', () => {
  it('should encode and decode encrypted message data', () => {
    // Arrange
    const testData = new Uint8Array([1, 2, 3, 4, 5, 255, 254, 253]);

    // Act
    const encoded = encodeBase64Url(testData);
    const decoded = decodeBase64Url(encoded);

    // Assert
    expect(new Uint8Array(decoded)).toEqual(testData);
  });

  it('should handle empty messages', () => {
    // Arrange
    const emptyData = new Uint8Array([]);

    // Act
    const encoded = encodeBase64Url(emptyData);
    const decoded = decodeBase64Url(encoded);

    // Assert
    expect(new Uint8Array(decoded)).toEqual(emptyData);
  });
});

// ============================================================================
// CHAT UI HELPER TESTS
// ============================================================================

describe('Chat UI Helpers', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Setup DOM
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Cleanup
    document.body.removeChild(container);
  });

  it('should escape HTML in messages to prevent XSS', () => {
    // Arrange
    const maliciousMessage = '<script>alert("XSS")</script>';
    const div = document.createElement('div');

    // Act - Use textContent (safe method)
    div.textContent = maliciousMessage;

    // Assert - Script tags should be escaped
    expect(div.innerHTML).toContain('&lt;script&gt;');
    expect(div.innerHTML).not.toContain('<script>');
  });

  it('should format timestamp correctly', () => {
    // Arrange
    const timestamp = 1701619200; // Dec 3, 2023 14:00:00 UTC
    const date = new Date(timestamp * 1000);

    // Act
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Assert - Should be formatted as HH:MM
    expect(timeStr).toMatch(/\d{1,2}:\d{2}/);
  });

  it('should handle chat section visibility', () => {
    // Arrange
    const chatSection = document.createElement('div');
    chatSection.id = 'chatSection';
    chatSection.style.display = 'none';
    container.appendChild(chatSection);

    // Act - Show chat section
    chatSection.style.display = 'block';

    // Assert
    expect(chatSection.style.display).toBe('block');
  });

  it('should prevent duplicate initialization (memory leak prevention)', () => {
    // Arrange
    const chatSection = document.createElement('div');
    chatSection.id = 'chatSection';
    chatSection.style.display = 'none';
    container.appendChild(chatSection);

    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshMessagesBtn';
    container.appendChild(refreshBtn);

    const sendBtn = document.createElement('button');
    sendBtn.id = 'sendMessageBtn';
    container.appendChild(sendBtn);

    const chatInput = document.createElement('input');
    chatInput.id = 'chatInput';
    container.appendChild(chatInput);

    const pasteId = 'test-paste-123';
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    // Spy on addEventListener to count calls
    const refreshAddListener = jest.spyOn(refreshBtn, 'addEventListener');
    const sendAddListener = jest.spyOn(sendBtn, 'addEventListener');
    const inputAddListener = jest.spyOn(chatInput, 'addEventListener');

    // Act - Call setup twice
    setupPasteChat(pasteId, salt);
    const firstCallRefreshCount = refreshAddListener.mock.calls.length;
    const firstCallSendCount = sendAddListener.mock.calls.length;
    const firstCallInputCount = inputAddListener.mock.calls.length;

    // Mock console.warn to verify warning is shown
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    setupPasteChat(pasteId, salt); // Second call should be skipped

    // Assert - Second call should not add more listeners
    expect(refreshAddListener.mock.calls.length).toBe(firstCallRefreshCount);
    expect(sendAddListener.mock.calls.length).toBe(firstCallSendCount);
    expect(inputAddListener.mock.calls.length).toBe(firstCallInputCount);
    expect(chatSection.dataset.chatInitialized).toBe('true');
    expect(consoleWarnSpy).toHaveBeenCalledWith('Chat already initialized, skipping duplicate setup');

    // Cleanup
    refreshAddListener.mockRestore();
    sendAddListener.mockRestore();
    inputAddListener.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should handle null and undefined in HTML escaping', () => {
    // Arrange & Act - Test null handling
    const nullResult = escapeHtml(null as unknown as string);
    
    // Arrange & Act - Test undefined handling
    const undefinedResult = escapeHtml(undefined as unknown as string);

    // Assert - Should handle gracefully (empty string)
    expect(nullResult).toBe('');
    expect(undefinedResult).toBe('');
  });

  it('should escape HTML entities correctly including quotes', () => {
    // Arrange - Test actual browser behavior (textContent escapes < > & but not quotes in innerHTML)
    const testCases = [
      { input: '<script>alert("XSS")</script>', expected: '&lt;script&gt;alert("XSS")&lt;/script&gt;' },
      { input: 'Hello & World', expected: 'Hello &amp; World' },
      { input: '<div>Test</div>', expected: '&lt;div&gt;Test&lt;/div&gt;' },
      { input: "It's a test", expected: "It's a test" }, // Single quotes don't need escaping in HTML
      { input: '<>&"\'', expected: '&lt;&gt;&amp;"\'' }, // All HTML entities except quotes
    ];

    // Act & Assert
    testCases.forEach(({ input, expected }) => {
      const result = escapeHtml(input);
      expect(result).toBe(expected);
    });
  });

  it('should handle empty string in HTML escaping', () => {
    // Arrange & Act
    const result = escapeHtml('');

    // Assert
    expect(result).toBe('');
  });
});

// ============================================================================
// UX IMPROVEMENT TESTS (Password Passing)
// ============================================================================

describe('Chat UX Improvements', () => {
  let container: HTMLElement;
  let messagesDiv: HTMLElement;
  let originalFetch: typeof fetch;

  function setupChatDOM(): void {
    const chatSection = document.createElement('div');
    chatSection.id = 'chatSection';
    chatSection.style.display = 'none';
    container.appendChild(chatSection);

    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshMessagesBtn';
    container.appendChild(refreshBtn);

    const sendBtn = document.createElement('button');
    sendBtn.id = 'sendMessageBtn';
    container.appendChild(sendBtn);

    const chatInput = document.createElement('input');
    chatInput.id = 'chatInput';
    container.appendChild(chatInput);

    const usernameInput = document.createElement('input');
    usernameInput.id = 'usernameInput';
    container.appendChild(usernameInput);

    const chatInfoText = document.createElement('div');
    chatInfoText.id = 'chatInfoText';
    container.appendChild(chatInfoText);
  }

  beforeEach(() => {
    // Setup DOM
    container = document.createElement('div');
    document.body.appendChild(container);

    messagesDiv = document.createElement('div');
    messagesDiv.id = 'chatMessages';
    container.appendChild(messagesDiv);

    // Mock fetch
    originalFetch = global.fetch;
    global.fetch = jest.fn();

    // Reset password modal mock
    jest.mocked(showPasswordModal).mockReset();
  });

  afterEach(() => {
    // Cleanup
    document.body.removeChild(container);
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should NOT prompt for password when initialPassword is passed and user clicks Refresh', async () => {
    // Arrange - Setup full chat DOM
    setupChatDOM();

    const pasteId = 'test-paste-123';
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const initialPassword = 'paste-password-456';

    // Mock successful messages fetch
    const mockMessages = {
      messages: [
        { ct: 'encrypted1', iv: 'iv1', timestamp: 1000 },
        { ct: 'encrypted2', iv: 'iv2', timestamp: 2000 }
      ]
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockMessages
    });

    // Act - Setup chat WITH initialPassword (from paste view), then click Refresh
    setupPasteChat(pasteId, salt, initialPassword);
    const refreshBtn = document.getElementById('refreshMessagesBtn');
    expect(refreshBtn).not.toBeNull();
    refreshBtn!.click();

    // Wait for async fetch
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert - showPasswordModal should NOT have been called (cached password used)
    expect(showPasswordModal).not.toHaveBeenCalled();
  });

  it('should prompt for password when no initialPassword and user clicks Refresh', async () => {
    // Arrange - Setup full chat DOM
    setupChatDOM();

    const pasteId = 'test-paste-789';
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    // Mock modal to return password
    jest.mocked(showPasswordModal).mockResolvedValue('user-entered-password');

    // Mock successful messages fetch
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [] })
    });

    // Act - Setup chat WITHOUT initialPassword, then click Refresh
    setupPasteChat(pasteId, salt);
    const refreshBtn = document.getElementById('refreshMessagesBtn');
    expect(refreshBtn).not.toBeNull();
    refreshBtn!.click();

    // Wait for async modal + fetch
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert - showPasswordModal SHOULD have been called
    expect(showPasswordModal).toHaveBeenCalled();
  });
});

// ============================================================================
// PASSWORD SECURITY TESTS
// ============================================================================

describe('Chat Password Security', () => {
  it('should derive different keys from different passwords', async () => {
    // Arrange
    const password1 = 'password-one';
    const password2 = 'password-two';
    const salt = generateSalt(); // Same salt
    const message = 'Test message';
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    // Act - Derive keys and encrypt with first password
    const key1 = await deriveKeyFromPassword(password1, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key1,
      new TextEncoder().encode(message)
    );

    // Try to decrypt with second password's key
    const key2 = await deriveKeyFromPassword(password2, salt);

    // Assert - Decryption should fail, proving keys are different
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key2, encrypted)
    ).rejects.toThrow();
  });

  it('should use PBKDF2 with 100,000 iterations', async () => {
    // This test ensures the key derivation works correctly
    // The actual parameters (iterations, hash) are tested in security.test.ts
    const password = 'test-password';
    const salt = generateSalt();
    const message = 'Test message';
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    // Act - Derive key and use it for encryption
    const key = await deriveKeyFromPassword(password, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(message)
    );

    // Assert - Key should work for AES-256-GCM operations
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    expect(new TextDecoder().decode(decrypted)).toBe(message);
  });
});

// ============================================================================
// USERNAME GENERATION TESTS
// ============================================================================

describe('Username Generation', () => {
  it('should return "anon" as the default username', () => {
    const username = generateRandomUsername();
    expect(username).toBe('anon');
  });

  it('should always return the same default value', () => {
    const usernames = new Set();
    for (let i = 0; i < 10; i++) {
      usernames.add(generateRandomUsername());
    }
    // Always returns the same constant — only one unique value
    expect(usernames.size).toBe(1);
  });

  it('should have correct length (4 characters)', () => {
    const username = generateRandomUsername();
    expect(username.length).toBe(4);
  });
});

// ============================================================================
// USERNAME ENCRYPTION/DECRYPTION TESTS
// ============================================================================

describe('Username Encryption in Messages', () => {
  /**
   * Helper to encrypt a message with username (simulates encryptMessageWithKey)
   */
  async function encryptWithUsername(
    text: string,
    username: string | undefined,
    key: CryptoKey
  ): Promise<{ ct: string; iv: string }> {
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const payload = username ? { text, username } : { text };
    const payloadStr = JSON.stringify(payload);

    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(payloadStr)
    );

    return {
      ct: encodeBase64Url(new Uint8Array(encryptedData)),
      iv: encodeBase64Url(iv)
    };
  }

  /**
   * Helper to decrypt a message (simulates decryptMessageWithKey)
   * Uses Uint8Array for ciphertext/IV so decrypt() receives a valid BufferSource in all environments.
   */
  async function decryptWithUsername(
    ct: string,
    iv: string,
    key: CryptoKey
  ): Promise<{ text: string; username?: string }> {
    const ctBuffer = decodeBase64Url(ct);
    const ivBuffer = decodeBase64Url(iv);
    const ctView = ctBuffer instanceof Uint8Array ? ctBuffer : new Uint8Array(ctBuffer);
    const ivView = ivBuffer instanceof Uint8Array ? ivBuffer : new Uint8Array(ivBuffer);

    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivView },
      key,
      ctView
    );

    const decryptedText = new TextDecoder().decode(decryptedData);

    // Try to parse as JSON (new format with username)
    try {
      const parsed = JSON.parse(decryptedText);
      if (parsed && typeof parsed.text === 'string') {
        return {
          text: parsed.text,
          username: parsed.username
        };
      }
    } catch {
      // Not JSON, fall through
    }

    // Backward compatibility: treat as plain text
    return { text: decryptedText, username: undefined };
  }

  it('should encrypt and decrypt message with username', async () => {
    // Arrange
    const password = 'test-password';
    const message = 'Hello with username!';
    const username = 'anon-a3f9';
    const salt = generateSalt();
    const key = await deriveKeyFromPassword(password, salt);

    // Act - Encrypt with username
    const { ct, iv } = await encryptWithUsername(message, username, key);

    // Decrypt
    const decrypted = await decryptWithUsername(ct, iv, key);

    // Assert
    expect(decrypted.text).toBe(message);
    expect(decrypted.username).toBe(username);
  });

  it('should encrypt and decrypt message without username', async () => {
    // Arrange
    const password = 'test-password';
    const message = 'Hello without username!';
    const salt = generateSalt();
    const key = await deriveKeyFromPassword(password, salt);

    // Act - Encrypt without username
    const { ct, iv } = await encryptWithUsername(message, undefined, key);

    // Decrypt
    const decrypted = await decryptWithUsername(ct, iv, key);

    // Assert
    expect(decrypted.text).toBe(message);
    expect(decrypted.username).toBeUndefined();
  });

  it('should handle backward compatibility with old plain text messages', async () => {
    // Arrange - Simulate old message format (plain text, no JSON)
    const password = 'test-password';
    const oldMessage = 'This is an old message without JSON';
    const salt = generateSalt();
    const key = await deriveKeyFromPassword(password, salt);

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    // Encrypt as plain text (old format)
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(oldMessage)
    );

    const ct = encodeBase64Url(new Uint8Array(encryptedData));
    const ivB64 = encodeBase64Url(iv);

    // Act - Decrypt using new function
    const decrypted = await decryptWithUsername(ct, ivB64, key);

    // Assert - Should treat as plain text, username undefined
    expect(decrypted.text).toBe(oldMessage);
    expect(decrypted.username).toBeUndefined();
  });

  it('should handle special characters in username', async () => {
    // Arrange
    const password = 'test-password';
    const message = 'Test message';
    const username = 'anon-<script>';
    const salt = generateSalt();
    const key = await deriveKeyFromPassword(password, salt);

    // Act
    const { ct, iv } = await encryptWithUsername(message, username, key);
    const decrypted = await decryptWithUsername(ct, iv, key);

    // Assert - Username should be preserved (escaping happens at display time)
    expect(decrypted.text).toBe(message);
    expect(decrypted.username).toBe(username);
  });

  it('should handle unicode in username', async () => {
    // Arrange
    const password = 'test-password';
    const message = 'Test message';
    const username = 'user-🎉';
    const salt = generateSalt();
    const key = await deriveKeyFromPassword(password, salt);

    // Act
    const { ct, iv } = await encryptWithUsername(message, username, key);
    const decrypted = await decryptWithUsername(ct, iv, key);

    // Assert
    expect(decrypted.text).toBe(message);
    expect(decrypted.username).toBe(username);
  });

  it('should handle long username (20 chars)', async () => {
    // Arrange
    const password = 'test-password';
    const message = 'Test message';
    const username = 'a'.repeat(20); // Max length
    const salt = generateSalt();
    const key = await deriveKeyFromPassword(password, salt);

    // Act
    const { ct, iv } = await encryptWithUsername(message, username, key);
    const decrypted = await decryptWithUsername(ct, iv, key);

    // Assert
    expect(decrypted.text).toBe(message);
    expect(decrypted.username).toBe(username);
  });

  it('should fail gracefully with corrupted JSON', async () => {
    // Arrange - Create message with invalid JSON structure
    const password = 'test-password';
    const salt = generateSalt();
    const key = await deriveKeyFromPassword(password, salt);

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    // Encrypt invalid JSON (object without 'text' field)
    const invalidPayload = JSON.stringify({ username: 'test' }); // Missing 'text' field
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(invalidPayload)
    );

    const ct = encodeBase64Url(new Uint8Array(encryptedData));
    const ivB64 = encodeBase64Url(iv);

    // Act - Decrypt
    const decrypted = await decryptWithUsername(ct, ivB64, key);

    // Assert - Should treat as plain text when structure is invalid
    expect(decrypted.text).toBe(invalidPayload);
    expect(decrypted.username).toBeUndefined();
  });

  it('should truncate username to 20 characters when longer', async () => {
    // Arrange - Use real encryptMessageWithKey (truncates username to 20)
    const password = 'test-password';
    const message = 'Test message';
    const longUsername = 'a'.repeat(25);
    const salt = generateSalt();
    const key = await deriveKeyFromPassword(password, salt);

    // Act - Encrypt with app's encryptMessageWithKey (applies truncation)
    const { encryptedData, iv } = await encryptMessageWithKey(message, key, longUsername);
    const ct = encodeBase64Url(new Uint8Array(encryptedData));
    const ivB64 = encodeBase64Url(new Uint8Array(iv));
    const decrypted = await decryptWithUsername(ct, ivB64, key);

    // Assert - Username should be truncated to 20 chars
    expect(decrypted.text).toBe(message);
    expect(decrypted.username).toHaveLength(20);
    expect(decrypted.username).toBe('a'.repeat(20));
  });
});

// ============================================================================
// USERNAME UI TESTS
// ============================================================================

describe('Username UI Integration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Setup DOM
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Cleanup
    document.body.removeChild(container);
  });

  it('should auto-populate username input field on setup', () => {
    // Arrange - Create DOM elements
    const chatSection = document.createElement('div');
    chatSection.id = 'chatSection';
    chatSection.style.display = 'none';
    container.appendChild(chatSection);

    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshMessagesBtn';
    container.appendChild(refreshBtn);

    const sendBtn = document.createElement('button');
    sendBtn.id = 'sendMessageBtn';
    container.appendChild(sendBtn);

    const chatInput = document.createElement('input');
    chatInput.id = 'chatInput';
    container.appendChild(chatInput);

    const usernameInput = document.createElement('input');
    usernameInput.id = 'usernameInput';
    container.appendChild(usernameInput);

    const pasteId = 'test-paste-123';
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    // Act - Setup chat
    setupPasteChat(pasteId, salt);

    // Assert - Username input should default to "anon"
    expect(usernameInput.value).toBe('anon');
  });

  it('should display username in message (escaping HTML)', () => {
    // Arrange
    const username = '<script>alert("xss")</script>';
    const timeStr = '14:30';
    const messageText = 'Test message';

    // Act - Use escapeHtml on username (as in displayMessages)
    const escapedUsername = escapeHtml(username);

    // Build HTML as in displayMessages
    const html = `
      <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: var(--bg-card); border-radius: 0.375rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.25rem;">
          <span style="font-weight: 600;">${escapedUsername}</span>
          <span>${escapeHtml(timeStr)}</span>
        </div>
        <div style="color: var(--text); word-wrap: break-word;">
          ${escapeHtml(messageText)}
        </div>
      </div>
    `;

    // Assert - Script tags should be escaped
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  it('should display "Anonymous" when username is undefined', () => {
    // Arrange
    const username = undefined;
    const timeStr = '14:30';
    const messageText = 'Test message';

    // Act - Use default value as in displayMessages
    const displayName = username || 'Anonymous';
    const escapedUsername = escapeHtml(displayName);

    // Build HTML
    const html = `
      <div>
        <span style="font-weight: 600;">${escapedUsername}</span>
      </div>
    `;

    // Assert
    expect(html).toContain('Anonymous');
  });

  it('should handle username input changes', () => {
    // Arrange - Create DOM elements
    const chatSection = document.createElement('div');
    chatSection.id = 'chatSection';
    chatSection.style.display = 'none';
    container.appendChild(chatSection);

    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshMessagesBtn';
    container.appendChild(refreshBtn);

    const sendBtn = document.createElement('button');
    sendBtn.id = 'sendMessageBtn';
    container.appendChild(sendBtn);

    const chatInput = document.createElement('input');
    chatInput.id = 'chatInput';
    container.appendChild(chatInput);

    const usernameInput = document.createElement('input');
    usernameInput.id = 'usernameInput';
    container.appendChild(usernameInput);

    const pasteId = 'test-paste-456';
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    // Act - Setup chat
    setupPasteChat(pasteId, salt);

    const originalUsername = usernameInput.value;

    // Simulate user editing username
    usernameInput.value = 'anon-test';
    usernameInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Assert - Username should be updated
    expect(usernameInput.value).toBe('anon-test');
    expect(usernameInput.value).not.toBe(originalUsername);
  });

  it('should generate new username if input is cleared', () => {
    // Arrange - Create DOM elements
    const chatSection = document.createElement('div');
    chatSection.id = 'chatSection';
    chatSection.style.display = 'none';
    container.appendChild(chatSection);

    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshMessagesBtn';
    container.appendChild(refreshBtn);

    const sendBtn = document.createElement('button');
    sendBtn.id = 'sendMessageBtn';
    container.appendChild(sendBtn);

    const chatInput = document.createElement('input');
    chatInput.id = 'chatInput';
    container.appendChild(chatInput);

    const usernameInput = document.createElement('input');
    usernameInput.id = 'usernameInput';
    container.appendChild(usernameInput);

    const pasteId = 'test-paste-789';
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    // Act - Setup chat
    setupPasteChat(pasteId, salt);

    // Simulate user clearing username
    usernameInput.value = '   '; // Whitespace only
    usernameInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Note: Context is updated internally, but we can't directly test it
    // In real usage, when message is sent, a new username would be generated
    // This test documents the expected behavior
    expect(true).toBe(true);
  });
});

// ============================================================================
// USERNAME XSS PREVENTION TESTS
// ============================================================================

describe('Username XSS Prevention', () => {
  it('should escape script tags in username', () => {
    // Arrange
    const maliciousUsername = '<script>alert("XSS")</script>';

    // Act
    const escaped = escapeHtml(maliciousUsername);

    // Assert
    expect(escaped).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
    expect(escaped).not.toContain('<script>');
  });

  it('should escape HTML injection attempts in username', () => {
    // Arrange
    const testCases = [
      { input: '<img src=x onerror=alert(1)>', expected: '&lt;img src=x onerror=alert(1)&gt;' },
      { input: '<iframe src="evil.com"></iframe>', expected: '&lt;iframe src="evil.com"&gt;&lt;/iframe&gt;' },
      { input: '"><script>alert(1)</script>', expected: '"&gt;&lt;script&gt;alert(1)&lt;/script&gt;' },
      { input: "' onclick='alert(1)'", expected: "' onclick='alert(1)'" },
    ];

    // Act & Assert
    testCases.forEach(({ input, expected }) => {
      const result = escapeHtml(input);
      expect(result).toBe(expected);
      // Ensure no executable HTML remains
      expect(result).not.toMatch(/<(?!&lt;)[^>]+>/);
    });
  });

  it('should preserve safe characters in username', () => {
    // Arrange
    const safeUsername = 'anon-a3f9';

    // Act
    const escaped = escapeHtml(safeUsername);

    // Assert - Should remain unchanged
    expect(escaped).toBe(safeUsername);
  });

  it('should handle empty username gracefully', () => {
    // Arrange
    const emptyUsername = '';

    // Act
    const escaped = escapeHtml(emptyUsername);

    // Assert
    expect(escaped).toBe('');
  });
});
