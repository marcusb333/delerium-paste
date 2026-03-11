/**
 * DeletePasteUseCase tests
 *
 * Covers both deletion paths (token-based and password-based),
 * error responses, and network failure handling.
 */

import { DeletePasteUseCase } from '../../../src/application/use-cases/delete-paste-use-case.js';
import type { IApiClient } from '../../../src/infrastructure/api/interfaces.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    createPaste: jest.fn(),
    retrievePaste: jest.fn(),
    deletePaste: jest.fn().mockResolvedValue(undefined),
    deleteByPassword: jest.fn().mockResolvedValue(undefined),
    getPowChallenge: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ─── Token-based deletion ────────────────────────────────────────────────────

describe('DeletePasteUseCase – token method', () => {
  it('should return success when token deletion succeeds', async () => {
    const client = makeApiClient();
    const useCase = new DeletePasteUseCase(client);

    const result = await useCase.execute({
      pasteId: 'abc123',
      method: 'token',
      tokenOrPassword: 'valid-token',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(client.deletePaste).toHaveBeenCalledWith('abc123', 'valid-token');
  });

  it('should return failure when apiClient.deletePaste throws', async () => {
    const client = makeApiClient({
      deletePaste: jest.fn().mockRejectedValue(new Error('Paste not found')),
    });
    const useCase = new DeletePasteUseCase(client);

    const result = await useCase.execute({
      pasteId: 'missing',
      method: 'token',
      tokenOrPassword: 'any-token',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Paste not found');
  });

  it('should return failure when apiClient.deletePaste throws non-Error', async () => {
    const client = makeApiClient({
      deletePaste: jest.fn().mockRejectedValue('string error'),
    });
    const useCase = new DeletePasteUseCase(client);

    const result = await useCase.execute({
      pasteId: 'abc',
      method: 'token',
      tokenOrPassword: 't',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('string error');
  });
});

// ─── Password-based deletion ─────────────────────────────────────────────────

describe('DeletePasteUseCase – password method', () => {
  it('should return success when deleteByPassword resolves', async () => {
    const client = makeApiClient();
    const useCase = new DeletePasteUseCase(client);

    const result = await useCase.execute({
      pasteId: 'abc123',
      method: 'password',
      tokenOrPassword: 'derived-delete-auth',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(client.deleteByPassword).toHaveBeenCalledWith('abc123', 'derived-delete-auth');
  });

  it('should return failure when deleteByPassword throws', async () => {
    const client = makeApiClient({
      deleteByPassword: jest.fn().mockRejectedValue(
        new Error('Delete authorization failed. Please refresh the page and try again.')
      ),
    });
    const useCase = new DeletePasteUseCase(client);

    const result = await useCase.execute({
      pasteId: 'abc',
      method: 'password',
      tokenOrPassword: 'bad-auth',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Delete authorization failed');
  });

  it('should return failure with server error message when deleteByPassword throws', async () => {
    const client = makeApiClient({
      deleteByPassword: jest.fn().mockRejectedValue(new Error('server_error')),
    });
    const useCase = new DeletePasteUseCase(client);

    const result = await useCase.execute({
      pasteId: 'abc',
      method: 'password',
      tokenOrPassword: 'auth',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('server_error');
  });

  it('should return failure when deleteByPassword throws a non-Error value', async () => {
    const client = makeApiClient({
      deleteByPassword: jest.fn().mockRejectedValue('raw string error'),
    });
    const useCase = new DeletePasteUseCase(client);

    const result = await useCase.execute({
      pasteId: 'abc',
      method: 'password',
      tokenOrPassword: 'auth',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('raw string error');
  });

  it('should return failure on network error', async () => {
    const client = makeApiClient({
      deleteByPassword: jest.fn().mockRejectedValue(new Error('Network failure')),
    });
    const useCase = new DeletePasteUseCase(client);

    const result = await useCase.execute({
      pasteId: 'abc',
      method: 'password',
      tokenOrPassword: 'auth',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
  });
});
