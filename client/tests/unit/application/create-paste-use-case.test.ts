/**
 * CreatePasteUseCase tests
 *
 * Covers:
 * - Successful creation path (with and without PoW)
 * - Validation failure short-circuits before encryption
 * - PoW error handling (pow_required, pow_invalid, generic warning)
 * - API failure mapped through getSafeErrorMessage
 * - allowChat defaults and explicit values
 * - Share URL and delete URL are returned correctly
 */

import { CreatePasteUseCase } from '../../../src/application/use-cases/create-paste-use-case.js';
import { EncryptionService } from '../../../src/core/services/encryption-service.js';
import { PasteService } from '../../../src/core/services/paste-service.js';
import type { IApiClient } from '../../../src/infrastructure/api/interfaces.js';
import type { IPowSolver } from '../../../src/infrastructure/pow/interfaces.js';
import type { PowChallenge } from '../../../src/core/models/paste.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    createPaste: jest.fn().mockResolvedValue({ id: 'paste-1', deleteToken: 'del-tok' }),
    retrievePaste: jest.fn(),
    deletePaste: jest.fn(),
    getPowChallenge: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makePowSolver(overrides: Partial<IPowSolver> = {}): IPowSolver {
  return {
    solve: jest.fn().mockResolvedValue({ challenge: 'ch', nonce: 42 }),
    cancel: jest.fn(),
    ...overrides,
  };
}

function makeUseCase(clientOverrides: Partial<IApiClient> = {}, solverOverrides: Partial<IPowSolver> = {}) {
  return new CreatePasteUseCase(
    makeApiClient(clientOverrides),
    makePowSolver(solverOverrides),
    new EncryptionService(),
    new PasteService()
  );
}

const VALID_COMMAND = {
  content: 'Hello, world!',
  expirationMinutes: 60,
  password: 'test-password-123',
  allowChat: true as boolean | undefined,
};

// ─── Successful creation ──────────────────────────────────────────────────────

describe('CreatePasteUseCase – successful creation', () => {
  it('should return a shareUrl and deleteUrl on success', async () => {
    const useCase = makeUseCase();
    const result = await useCase.execute(VALID_COMMAND);

    expect(result).toMatchObject({ success: true });
    if ('value' in result) {
      expect(result.value.shareUrl).toContain('/view.html');
      expect(result.value.shareUrl).toContain('#'); // key in fragment
      expect(result.value.deleteUrl).toContain('/delete.html');
      expect(result.value.id).toBe('paste-1');
      expect(result.value.deleteToken).toBe('del-tok');
    }
  });

  it('should succeed when PoW challenge returns null (disabled)', async () => {
    const useCase = makeUseCase({ getPowChallenge: jest.fn().mockResolvedValue(null) });
    const result = await useCase.execute(VALID_COMMAND);
    expect(result).toMatchObject({ success: true });
  });

  it('should solve PoW when challenge is provided', async () => {
    const challenge: PowChallenge = { challenge: 'abc', difficulty: 4 };
    const solver = makePowSolver();
    const client = makeApiClient({
      getPowChallenge: jest.fn().mockResolvedValue(challenge),
    });
    const useCase = new CreatePasteUseCase(client, solver, new EncryptionService(), new PasteService());

    const result = await useCase.execute(VALID_COMMAND);
    expect(result).toMatchObject({ success: true });
    expect(solver.solve).toHaveBeenCalledWith(challenge);
  });

  it('should pass allowChat: true when explicitly set', async () => {
    const client = makeApiClient();
    const useCase = new CreatePasteUseCase(client, makePowSolver(), new EncryptionService(), new PasteService());
    await useCase.execute({ ...VALID_COMMAND, allowChat: true });
    const req = (client.createPaste as jest.Mock).mock.calls[0][0];
    expect(req.meta.allowChat).toBe(true);
  });

  it('should pass allowChat: false when explicitly set', async () => {
    const client = makeApiClient();
    const useCase = new CreatePasteUseCase(client, makePowSolver(), new EncryptionService(), new PasteService());
    await useCase.execute({ ...VALID_COMMAND, allowChat: false });
    const req = (client.createPaste as jest.Mock).mock.calls[0][0];
    expect(req.meta.allowChat).toBe(false);
  });

  it('should default allowChat to true when undefined', async () => {
    const client = makeApiClient();
    const useCase = new CreatePasteUseCase(client, makePowSolver(), new EncryptionService(), new PasteService());
    await useCase.execute({ ...VALID_COMMAND, allowChat: undefined });
    const req = (client.createPaste as jest.Mock).mock.calls[0][0];
    expect(req.meta.allowChat).toBe(true);
  });

  it('should include deleteAuth in the API request', async () => {
    const client = makeApiClient();
    const useCase = new CreatePasteUseCase(client, makePowSolver(), new EncryptionService(), new PasteService());
    await useCase.execute(VALID_COMMAND);
    const req = (client.createPaste as jest.Mock).mock.calls[0][0];
    expect(req.deleteAuth).toBeTruthy();
    expect(typeof req.deleteAuth).toBe('string');
  });

  it('should never include the password in the API request', async () => {
    const client = makeApiClient();
    const useCase = new CreatePasteUseCase(client, makePowSolver(), new EncryptionService(), new PasteService());
    await useCase.execute({ ...VALID_COMMAND, password: 'super-secret-pw' });
    const req = (client.createPaste as jest.Mock).mock.calls[0][0];
    const serialized = JSON.stringify(req);
    expect(serialized).not.toContain('super-secret-pw');
  });
});

// ─── Validation failure ───────────────────────────────────────────────────────

describe('CreatePasteUseCase – validation failure', () => {
  it('should return failure for empty content', async () => {
    const useCase = makeUseCase();
    const result = await useCase.execute({ ...VALID_COMMAND, content: '' });
    expect(result).toMatchObject({ success: false });
  });

  it('should not call the API when validation fails', async () => {
    const client = makeApiClient();
    const useCase = new CreatePasteUseCase(client, makePowSolver(), new EncryptionService(), new PasteService());
    await useCase.execute({ ...VALID_COMMAND, content: '' });
    expect(client.createPaste).not.toHaveBeenCalled();
  });
});

// ─── PoW error handling ───────────────────────────────────────────────────────

describe('CreatePasteUseCase – PoW error handling', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return failure when PoW throws pow_required', async () => {
    const client = makeApiClient({
      getPowChallenge: jest.fn().mockRejectedValue(new Error('pow_required')),
    });
    const useCase = new CreatePasteUseCase(client, makePowSolver(), new EncryptionService(), new PasteService());
    const result = await useCase.execute(VALID_COMMAND);
    expect(result).toMatchObject({ success: false });
    if ('error' in result) {
      expect(result.error).toContain('Proof of work');
    }
  });

  it('should return failure when PoW throws pow_invalid', async () => {
    const client = makeApiClient({
      getPowChallenge: jest.fn().mockRejectedValue(new Error('pow_invalid')),
    });
    const useCase = new CreatePasteUseCase(client, makePowSolver(), new EncryptionService(), new PasteService());
    const result = await useCase.execute(VALID_COMMAND);
    expect(result).toMatchObject({ success: false });
    if ('error' in result) {
      expect(result.error).toContain('Proof of work');
    }
  });

  it('should continue (with console.warn) for unrelated PoW errors', async () => {
    // An unrelated error should not abort the creation — PoW is optional
    const client = makeApiClient({
      getPowChallenge: jest.fn().mockRejectedValue(new Error('timeout')),
    });
    const useCase = new CreatePasteUseCase(client, makePowSolver(), new EncryptionService(), new PasteService());
    const result = await useCase.execute(VALID_COMMAND);
    // Should still succeed (PoW is optional)
    expect(result).toMatchObject({ success: true });
    expect(console.warn).toHaveBeenCalled();
  });
});

// ─── API failure ──────────────────────────────────────────────────────────────

describe('CreatePasteUseCase – API failure', () => {
  it('should return failure when createPaste throws', async () => {
    const useCase = makeUseCase({
      createPaste: jest.fn().mockRejectedValue(new Error('network error')),
    });
    const result = await useCase.execute(VALID_COMMAND);
    expect(result).toMatchObject({ success: false });
    if ('error' in result) {
      expect(result.error).toBeTruthy();
    }
  });

  it('should map network errors through getSafeErrorMessage', async () => {
    const useCase = makeUseCase({
      createPaste: jest.fn().mockRejectedValue(new Error('fetch failed')),
    });
    const result = await useCase.execute(VALID_COMMAND);
    expect(result).toMatchObject({ success: false });
    if ('error' in result) {
      expect(result.error).toContain('Network');
    }
  });
});
