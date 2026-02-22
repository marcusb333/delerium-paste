/**
 * ViewPasteUseCase tests
 *
 * Covers:
 * - Successful decrypt on first attempt
 * - Password retry logic up to MAX_PASSWORD_ATTEMPTS (5)
 * - User cancellation (onPasswordPrompt returns null)
 * - Both sync and async onPasswordPrompt callbacks
 * - API retrieval failure (outer try/catch)
 * - Boundary at the last allowed attempt (attempt 4) vs exceeded (attempt 5)
 */

import { ViewPasteUseCase } from '../../../src/application/use-cases/view-paste-use-case.js';
import { EncryptionService } from '../../../src/core/services/encryption-service.js';
import type { IApiClient } from '../../../src/infrastructure/api/interfaces.js';
import { encryptWithPassword } from '../../../src/security.js';
import { encodeBase64Url } from '../../../src/core/crypto/encoding.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PASSWORD = 'correct-password';
const CONTENT  = 'Hello, encrypted world!';

async function makeEncryptedPaste(content: string, password: string) {
  const { encryptedData, salt, iv } = await encryptWithPassword(content, password);
  return {
    ct:   encodeBase64Url(encryptedData),
    salt: encodeBase64Url(salt),
    iv:   encodeBase64Url(iv),
  };
}

function makeApiClient(ct: string, iv: string, overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    createPaste:   jest.fn(),
    deletePaste:   jest.fn(),
    getPowChallenge: jest.fn().mockResolvedValue(null),
    healthCheck:   jest.fn().mockResolvedValue(true),
    retrievePaste: jest.fn().mockResolvedValue({
      ct,
      iv,
      meta: { expireTs: Date.now() / 1000 + 3600, mime: 'text/plain', allowChat: true },
    }),
    ...overrides,
  };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('ViewPasteUseCase – successful decryption', () => {
  it('should decrypt and return content on first attempt', async () => {
    const { ct, salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const useCase = new ViewPasteUseCase(makeApiClient(ct, iv), new EncryptionService());

    const result = await useCase.execute(
      { pasteId: 'p1', salt, iv, password: '' },
      () => PASSWORD
    );

    expect(result).toMatchObject({ success: true });
    if ('value' in result) {
      expect(result.value.content).toBe(CONTENT);
      expect(result.value.deleteAuth).toBeTruthy();
    }
  });

  it('should accept an async onPasswordPrompt', async () => {
    const { ct, salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const useCase = new ViewPasteUseCase(makeApiClient(ct, iv), new EncryptionService());

    const result = await useCase.execute(
      { pasteId: 'p1', salt, iv, password: '' },
      async () => PASSWORD  // async variant
    );

    expect(result).toMatchObject({ success: true });
  });

  it('should use the server IV when the command IV is the same', async () => {
    const { ct, salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const useCase = new ViewPasteUseCase(makeApiClient(ct, iv), new EncryptionService());

    // Pass undefined iv in the command — the use case falls back to the server IV
    const result = await useCase.execute(
      { pasteId: 'p1', salt, iv: undefined as unknown as string, password: '' },
      () => PASSWORD
    );

    expect(result).toMatchObject({ success: true });
  });
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

describe('ViewPasteUseCase – user cancellation', () => {
  it('should return failure when onPasswordPrompt returns null', async () => {
    const { ct, salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const useCase = new ViewPasteUseCase(makeApiClient(ct, iv), new EncryptionService());

    const result = await useCase.execute(
      { pasteId: 'p1', salt, iv, password: '' },
      () => null
    );

    expect(result).toMatchObject({ success: false });
    if ('error' in result) {
      expect(result.error).toContain('password');
    }
  });

  it('should return failure when async onPasswordPrompt resolves to null', async () => {
    const { ct, salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const useCase = new ViewPasteUseCase(makeApiClient(ct, iv), new EncryptionService());

    const result = await useCase.execute(
      { pasteId: 'p1', salt, iv, password: '' },
      async () => null
    );

    expect(result).toMatchObject({ success: false });
  });
});

// ─── Retry logic ──────────────────────────────────────────────────────────────

describe('ViewPasteUseCase – retry logic', () => {
  it('should succeed on second attempt after one wrong password', async () => {
    const { ct, salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const useCase = new ViewPasteUseCase(makeApiClient(ct, iv), new EncryptionService());

    let call = 0;
    const result = await useCase.execute(
      { pasteId: 'p1', salt, iv, password: '' },
      () => (call++ === 0 ? 'wrong' : PASSWORD)
    );

    expect(result).toMatchObject({ success: true });
  });

  it('should fail after MAX_PASSWORD_ATTEMPTS (5) wrong passwords', async () => {
    const { ct, salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const useCase = new ViewPasteUseCase(makeApiClient(ct, iv), new EncryptionService());

    const result = await useCase.execute(
      { pasteId: 'p1', salt, iv, password: '' },
      () => 'always-wrong'
    );

    expect(result).toMatchObject({ success: false });
    if ('error' in result) {
      expect(result.error).toMatch(/maximum|attempts/i);
    }
  });

  it('should succeed on attempt 5 (the last allowed attempt)', async () => {
    const { ct, salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const useCase = new ViewPasteUseCase(makeApiClient(ct, iv), new EncryptionService());

    // Wrong 4 times, correct on 5th
    let call = 0;
    const result = await useCase.execute(
      { pasteId: 'p1', salt, iv, password: '' },
      () => (++call < 5 ? 'wrong' : PASSWORD)
    );

    expect(result).toMatchObject({ success: true });
  });

  it('should invoke onPasswordPrompt with increasing attempt count', async () => {
    const { ct, salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const useCase = new ViewPasteUseCase(makeApiClient(ct, iv), new EncryptionService());

    const attemptNumbers: number[] = [];
    let call = 0;

    await useCase.execute(
      { pasteId: 'p1', salt, iv, password: '' },
      (attempt) => {
        attemptNumbers.push(attempt);
        return ++call < 3 ? 'wrong' : PASSWORD;
      }
    );

    // First call: attempt=0, second call: attempt=1, third call: attempt=2
    expect(attemptNumbers).toEqual([0, 1, 2]);
  });
});

// ─── API failure ──────────────────────────────────────────────────────────────

describe('ViewPasteUseCase – API failure', () => {
  it('should return failure when retrievePaste throws', async () => {
    const { salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const client = makeApiClient('', iv, {
      retrievePaste: jest.fn().mockRejectedValue(new Error('Content not found or has expired')),
    });
    const useCase = new ViewPasteUseCase(client, new EncryptionService());

    const result = await useCase.execute(
      { pasteId: 'missing', salt, iv, password: '' },
      () => PASSWORD
    );

    expect(result).toMatchObject({ success: false });
    if ('error' in result) {
      expect(result.error).toContain('not found');
    }
  });

  it('should return failure for non-Error throws', async () => {
    const { salt, iv } = await makeEncryptedPaste(CONTENT, PASSWORD);
    const client = makeApiClient('', iv, {
      retrievePaste: jest.fn().mockRejectedValue('string error'),
    });
    const useCase = new ViewPasteUseCase(client, new EncryptionService());

    const result = await useCase.execute(
      { pasteId: 'x', salt, iv, password: '' },
      () => PASSWORD
    );

    expect(result).toMatchObject({ success: false });
  });
});
