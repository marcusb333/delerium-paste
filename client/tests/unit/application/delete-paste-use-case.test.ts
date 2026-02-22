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
    getPowChallenge: jest.fn().mockResolvedValue(null),
    healthCheck: jest.fn().mockResolvedValue(true),
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
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('should return success on HTTP 204', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 204,
      json: jest.fn(),
    } as unknown as Response);

    const useCase = new DeletePasteUseCase(makeApiClient());
    const result = await useCase.execute({
      pasteId: 'abc123',
      method: 'password',
      tokenOrPassword: 'derived-delete-auth',
    });

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/pastes/abc123/delete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ deleteAuth: 'derived-delete-auth' }),
      })
    );
  });

  it('should return success on HTTP 200', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn(),
    } as unknown as Response);

    const useCase = new DeletePasteUseCase(makeApiClient());
    const result = await useCase.execute({
      pasteId: 'xyz',
      method: 'password',
      tokenOrPassword: 'auth',
    });

    expect(result.success).toBe(true);
  });

  it('should return specific message for invalid_auth error', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
      json: jest.fn().mockResolvedValue({ error: 'invalid_auth' }),
    } as unknown as Response);

    const useCase = new DeletePasteUseCase(makeApiClient());
    const result = await useCase.execute({
      pasteId: 'abc',
      method: 'password',
      tokenOrPassword: 'bad-auth',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Delete authorization failed');
  });

  it('should return server error message for other errors', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ error: 'server_error' }),
    } as unknown as Response);

    const useCase = new DeletePasteUseCase(makeApiClient());
    const result = await useCase.execute({
      pasteId: 'abc',
      method: 'password',
      tokenOrPassword: 'auth',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('server_error');
  });

  it('should fall back to generic message when error field is absent', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({}),
    } as unknown as Response);

    const useCase = new DeletePasteUseCase(makeApiClient());
    const result = await useCase.execute({
      pasteId: 'abc',
      method: 'password',
      tokenOrPassword: 'auth',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to delete paste');
  });

  it('should handle JSON parse failure gracefully', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockRejectedValue(new Error('invalid json')),
    } as unknown as Response);

    const useCase = new DeletePasteUseCase(makeApiClient());
    const result = await useCase.execute({
      pasteId: 'abc',
      method: 'password',
      tokenOrPassword: 'auth',
    });

    expect(result.success).toBe(false);
    // Falls back to catch-all "Unknown error"
    expect(result.error).toBeTruthy();
  });

  it('should return failure when fetch throws (network error)', async () => {
    fetchSpy.mockRejectedValue(new Error('Network failure'));

    const useCase = new DeletePasteUseCase(makeApiClient());
    const result = await useCase.execute({
      pasteId: 'abc',
      method: 'password',
      tokenOrPassword: 'auth',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
  });

  it('should URL-encode the paste ID in the request path', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 204,
      json: jest.fn(),
    } as unknown as Response);

    const useCase = new DeletePasteUseCase(makeApiClient());
    await useCase.execute({
      pasteId: 'id/with/slashes',
      method: 'password',
      tokenOrPassword: 'auth',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/pastes/id%2Fwith%2Fslashes/delete',
      expect.any(Object)
    );
  });
});
