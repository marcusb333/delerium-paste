/**
 * ChatUseCase tests
 *
 * Covers:
 * - refreshMessages: success (messages present), empty list, 404, generic error,
 *   and per-message decryption failure fallback
 * - sendMessage: success, message-too-long validation, 404/429/generic server
 *   errors, network failure
 */

import { ChatUseCase } from '../../../src/application/use-cases/chat-use-case.js';
import { EncryptionService } from '../../../src/core/services/encryption-service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSalt(): Uint8Array {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  return s;
}

function makeMockEncryptionService(overrides: Partial<EncryptionService> = {}): EncryptionService {
  return {
    deriveKeyFromPassword: jest.fn().mockResolvedValue({} as CryptoKey),
    decryptChatMessage:    jest.fn().mockResolvedValue({ text: 'hello', username: 'alice' }),
    encryptChatMessage:    jest.fn().mockResolvedValue({
      encryptedData: new ArrayBuffer(32),
      iv:            new ArrayBuffer(12),
    }),
    encryptPaste:          jest.fn(),
    decryptPaste:          jest.fn(),
    deriveDeleteAuth:      jest.fn(),
    ...overrides,
  } as unknown as EncryptionService;
}

const PASTE_ID = 'test-paste';
const PASSWORD = 'secret';

// ─── refreshMessages ─────────────────────────────────────────────────────────

describe('ChatUseCase – refreshMessages', () => {
  let fetchMock: jest.Mock;
  let svc: EncryptionService;
  let useCase: ChatUseCase;
  const salt = makeSalt();

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    svc = makeMockEncryptionService();
    useCase = new ChatUseCase(svc);
  });

  it('should return empty list when no messages', async () => {
    fetchMock.mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ messages: [] }),
    });

    const result = await useCase.refreshMessages(PASTE_ID, PASSWORD, salt);
    expect(result.messages).toEqual([]);
  });

  it('should decrypt and return messages on success', async () => {
    fetchMock.mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({
        messages: [
          { ct: 'ct1', iv: 'iv1', timestamp: 1000 },
          { ct: 'ct2', iv: 'iv2', timestamp: 2000 },
        ],
      }),
    });

    (svc.decryptChatMessage as jest.Mock)
      .mockResolvedValueOnce({ text: 'msg1', username: 'alice' })
      .mockResolvedValueOnce({ text: 'msg2', username: 'bob' });

    const result = await useCase.refreshMessages(PASTE_ID, PASSWORD, salt);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({ text: 'msg1', username: 'alice', timestamp: 1000 });
    expect(result.messages[1]).toMatchObject({ text: 'msg2', username: 'bob',   timestamp: 2000 });
  });

  it('should push placeholder text when a message fails to decrypt', async () => {
    fetchMock.mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({
        messages: [{ ct: 'bad', iv: 'bad', timestamp: 999 }],
      }),
    });
    (svc.decryptChatMessage as jest.Mock).mockRejectedValue(new Error('bad key'));

    const result = await useCase.refreshMessages(PASTE_ID, PASSWORD, salt);

    expect(result.messages[0].text).toContain('Decryption failed');
    expect(result.messages[0].timestamp).toBe(999);
  });

  it('should throw on 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await expect(useCase.refreshMessages(PASTE_ID, PASSWORD, salt))
      .rejects.toThrow('Paste not found or expired');
  });

  it('should throw on generic non-OK response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(useCase.refreshMessages(PASTE_ID, PASSWORD, salt))
      .rejects.toThrow('Failed to fetch messages');
  });
});

// ─── sendMessage ─────────────────────────────────────────────────────────────

describe('ChatUseCase – sendMessage', () => {
  let fetchMock: jest.Mock;
  let svc: EncryptionService;
  let useCase: ChatUseCase;
  const salt = makeSalt();

  const baseCommand = {
    pasteId:  PASTE_ID,
    password: PASSWORD,
    message:  'Hello!',
    username: 'alice',
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    svc = makeMockEncryptionService();
    useCase = new ChatUseCase(svc);
  });

  it('should return success when server returns ok', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    const result = await useCase.sendMessage(baseCommand, salt);
    expect(result).toEqual({ success: true });
    expect(svc.encryptChatMessage).toHaveBeenCalled();
  });

  it('should fail validation when message exceeds 1000 characters', async () => {
    const result = await useCase.sendMessage(
      { ...baseCommand, message: 'x'.repeat(1001) },
      salt,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too long/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should return failure on 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const result = await useCase.sendMessage(baseCommand, salt);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('should return failure on 429 rate limit', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });

    const result = await useCase.sendMessage(baseCommand, salt);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rate limited/i);
  });

  it('should return failure on generic server error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const result = await useCase.sendMessage(baseCommand, salt);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed to send/i);
  });

  it('should return failure on network error', async () => {
    fetchMock.mockRejectedValue(new Error('network failure'));

    const result = await useCase.sendMessage(baseCommand, salt);
    expect(result.success).toBe(false);
    expect(result.error).toContain('network failure');
  });

  it('should send message without username when not provided', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await useCase.sendMessage({ ...baseCommand, username: undefined }, salt);
    expect(svc.encryptChatMessage).toHaveBeenCalledWith(
      baseCommand.message,
      expect.anything(),
      undefined,
    );
  });
});
