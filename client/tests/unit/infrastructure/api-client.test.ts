/**
 * Unit tests for API Client implementations
 * 
 * Tests both HttpApiClient and MockApiClient to ensure they follow
 * the IApiClient interface contract correctly.
 */

import { HttpApiClient } from '../../../src/infrastructure/api/http-client.js';
import { MockApiClient } from '../../../src/infrastructure/api/mock-client.js';
import type { CreatePasteRequest } from '../../../src/infrastructure/api/interfaces.js';

// Mock fetch for HttpApiClient tests
global.fetch = jest.fn();

describe('HttpApiClient', () => {
  let client: HttpApiClient;

  beforeEach(() => {
    client = new HttpApiClient('/api');
    jest.clearAllMocks();
  });

  describe('createPaste', () => {
    it('should create a paste successfully', async () => {
      const request: CreatePasteRequest = {
        ct: 'encrypted-content',
        iv: 'initialization-vector',
        meta: {
          expireTs: Math.floor(Date.now() / 1000) + 3600,
          mime: 'text/plain'
        }
      };

      const mockResponse = {
        id: 'abc123',
        deleteToken: 'token-xyz'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const result = await client.createPaste(request);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith('/api/pastes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
    });

    it('should handle server errors', async () => {
      const request: CreatePasteRequest = {
        ct: 'encrypted-content',
        iv: 'initialization-vector',
        meta: {
          expireTs: Math.floor(Date.now() / 1000) + 3600,
          mime: 'text/plain'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: jest.fn().mockResolvedValue({ error: 'Server error' })
      });

      await expect(client.createPaste(request)).rejects.toThrow('Server error');
    });

    it('should handle network errors', async () => {
      const request: CreatePasteRequest = {
        ct: 'encrypted-content',
        iv: 'initialization-vector',
        meta: {
          expireTs: Math.floor(Date.now() / 1000) + 3600,
          mime: 'text/plain'
        }
      };

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(client.createPaste(request)).rejects.toThrow('Network error');
    });

    it('should extract error from plain-text body when JSON parse fails', async () => {
      const request: CreatePasteRequest = {
        ct: 'ct',
        iv: 'iv',
        meta: { expireTs: Math.floor(Date.now() / 1000) + 3600, mime: 'text/plain' }
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: jest.fn().mockRejectedValue(new Error('not json')),
        text: jest.fn().mockResolvedValue('Payload too large')
      });

      await expect(client.createPaste(request)).rejects.toThrow('Payload too large');
    });

    it('should use status text when both JSON and text body are empty', async () => {
      const request: CreatePasteRequest = {
        ct: 'ct',
        iv: 'iv',
        meta: { expireTs: Math.floor(Date.now() / 1000) + 3600, mime: 'text/plain' }
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 413,
        statusText: 'Request Entity Too Large',
        json: jest.fn().mockRejectedValue(new Error('not json')),
        text: jest.fn().mockResolvedValue('')
      });

      await expect(client.createPaste(request)).rejects.toThrow('HTTP 413');
    });
  });

  describe('retrievePaste', () => {
    it('should retrieve a paste successfully', async () => {
      const mockPaste = {
        ct: 'encrypted-content',
        iv: 'initialization-vector',
        meta: {
          expireTs: Math.floor(Date.now() / 1000) + 3600,
          mime: 'text/plain'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockPaste)
      });

      const result = await client.retrievePaste('abc123');

      expect(result).toEqual(mockPaste);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/pastes/abc123',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should handle 404 errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404
      });

      await expect(client.retrievePaste('nonexistent')).rejects.toThrow('not found');
    });

    it('should handle 410 errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 410
      });

      await expect(client.retrievePaste('expired')).rejects.toThrow('expired');
    });

    it('should handle 429 rate limit', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429
      });

      await expect(client.retrievePaste('abc123')).rejects.toThrow('Too many requests');
    });

    it('should include server error detail when response body has error field', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        json: jest.fn().mockResolvedValue({ error: 'Service unavailable' })
      });

      await expect(client.retrievePaste('abc123')).rejects.toThrow('Service unavailable');
    });

    it('should use generic message when server error has no detail', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        json: jest.fn().mockRejectedValue(new Error('not json'))
      });

      await expect(client.retrievePaste('abc123')).rejects.toThrow('Server error (503)');
    });

    it('should throw AbortError message on request timeout', async () => {
      const abortError = new Error('The operation was aborted.');
      abortError.name = 'AbortError';
      (global.fetch as jest.Mock).mockRejectedValue(abortError);

      await expect(client.retrievePaste('abc123')).rejects.toThrow('timed out');
    });

    it('should rethrow non-abort network errors from retrievePaste', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('DNS failure'));

      await expect(client.retrievePaste('abc123')).rejects.toThrow('DNS failure');
    });
  });

  describe('deletePaste', () => {
    it('should delete a paste successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 204
      });

      await expect(client.deletePaste('abc123', 'token-xyz')).resolves.not.toThrow();
      
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/pastes/abc123?token=token-xyz',
        { method: 'DELETE' }
      );
    });

    it('should handle invalid token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ error: 'Invalid token' })
      });

      await expect(client.deletePaste('abc123', 'wrong-token')).rejects.toThrow();
    });
  });

  describe('deleteByPassword', () => {
    it('should resolve on HTTP 204', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 204 });

      await expect(client.deleteByPassword('abc123', 'derived-auth')).resolves.not.toThrow();
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/pastes/abc123/delete',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleteAuth: 'derived-auth' }),
        })
      );
    });

    it('should resolve on HTTP 200', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
      await expect(client.deleteByPassword('abc', 'auth')).resolves.not.toThrow();
    });

    it('should throw with specific message for invalid_auth', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        json: jest.fn().mockResolvedValue({ error: 'invalid_auth' }),
      });
      await expect(client.deleteByPassword('abc', 'bad-auth')).rejects.toThrow('Delete authorization failed');
    });

    it('should throw with server error message for other errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({ error: 'server_error' }),
      });
      await expect(client.deleteByPassword('abc', 'auth')).rejects.toThrow('server_error');
    });

    it('should throw generic message when error field is absent', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({}),
      });
      await expect(client.deleteByPassword('abc', 'auth')).rejects.toThrow('Failed to delete paste');
    });

    it('should fall back to Unknown error when json() rejects', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockRejectedValue(new Error('not json')),
      });
      await expect(client.deleteByPassword('abc', 'auth')).rejects.toThrow('Unknown error');
    });

    it('should URL-encode the paste ID', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 204 });
      await client.deleteByPassword('id/with/slashes', 'auth');
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/pastes/id%2Fwith%2Fslashes/delete',
        expect.any(Object)
      );
    });
  });

  describe('getPowChallenge', () => {
    it('should return null when PoW is disabled', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        status: 204
      });

      const result = await client.getPowChallenge();

      expect(result).toBeNull();
    });

    it('should return challenge when PoW is enabled', async () => {
      const mockChallenge = {
        challenge: 'test-challenge',
        difficulty: 5
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockChallenge)
      });

      const result = await client.getPowChallenge();

      expect(result).toEqual(mockChallenge);
    });

    it('should throw when PoW endpoint returns a non-OK error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503
      });

      await expect(client.getPowChallenge()).rejects.toThrow('Failed to fetch PoW challenge');
    });
  });

  describe('createPaste — JSON parse fallback (text body)', () => {
    it('should use text body parsed as JSON when first json() call fails but text is JSON', async () => {
      const request = {
        ct: 'ct',
        iv: 'iv',
        meta: { expireTs: Math.floor(Date.now() / 1000) + 3600, mime: 'text/plain' }
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: jest.fn().mockRejectedValue(new Error('not json')),
        text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'from JSON in text body' }))
      });

      await expect(client.createPaste(request)).rejects.toThrow('from JSON in text body');
    });

    it('uses errorData.message when errorData.error is absent (json() succeeds)', async () => {
      const request = {
        ct: 'ct', iv: 'iv',
        meta: { expireTs: Math.floor(Date.now() / 1000) + 3600, mime: 'text/plain' }
      };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: jest.fn().mockResolvedValue({ message: 'Validation failed' })
      });
      await expect(client.createPaste(request)).rejects.toThrow('Validation failed');
    });

    it('uses message field from text-body JSON when error field is absent', async () => {
      const request = {
        ct: 'ct', iv: 'iv',
        meta: { expireTs: Math.floor(Date.now() / 1000) + 3600, mime: 'text/plain' }
      };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: jest.fn().mockRejectedValue(new Error('not json')),
        text: jest.fn().mockResolvedValue(JSON.stringify({ message: 'from message field' }))
      });
      await expect(client.createPaste(request)).rejects.toThrow('from message field');
    });
  });

  describe('retrievePaste — generic 5xx with empty error field', () => {
    it('uses generic message when json() succeeds but body.error is absent', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        json: jest.fn().mockResolvedValue({ message: 'no error field here' })
      });
      await expect(client.retrievePaste('abc123')).rejects.toThrow('Server error (503). Please try again later.');
    });
  });

  describe('deletePaste — json() failure fallback', () => {
    it('throws "Unknown error" when response.json() rejects during delete', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockRejectedValue(new Error('not json'))
      });
      await expect(client.deletePaste('abc123', 'token')).rejects.toThrow('Unknown error');
    });
  });

});

describe('MockApiClient', () => {
  let client: MockApiClient;

  beforeEach(() => {
    client = new MockApiClient();
  });

  describe('createPaste', () => {
    it('should create and store a paste', async () => {
      const request: CreatePasteRequest = {
        ct: 'encrypted-content',
        iv: 'initialization-vector',
        meta: {
          expireTs: Math.floor(Date.now() / 1000) + 3600,
          mime: 'text/plain'
        }
      };

      const result = await client.createPaste(request);

      expect(result.id).toBeTruthy();
      expect(result.deleteToken).toBeTruthy();
      expect(client.size()).toBe(1);
    });

    it('should generate unique IDs', async () => {
      const request: CreatePasteRequest = {
        ct: 'encrypted-content',
        iv: 'initialization-vector',
        meta: {
          expireTs: Math.floor(Date.now() / 1000) + 3600,
          mime: 'text/plain'
        }
      };

      const result1 = await client.createPaste(request);
      const result2 = await client.createPaste(request);

      expect(result1.id).not.toBe(result2.id);
      expect(client.size()).toBe(2);
    });
  });

  describe('retrievePaste', () => {
    it('should retrieve a stored paste', async () => {
      const request: CreatePasteRequest = {
        ct: 'encrypted-content',
        iv: 'initialization-vector',
        meta: {
          expireTs: Math.floor(Date.now() / 1000) + 3600,
          mime: 'text/plain'
        }
      };

      const created = await client.createPaste(request);
      const retrieved = await client.retrievePaste(created.id);

      expect(retrieved.ct).toBe(request.ct);
      expect(retrieved.iv).toBe(request.iv);
      expect(retrieved.meta).toEqual(request.meta);
    });

    it('should throw error for non-existent paste', async () => {
      await expect(client.retrievePaste('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('deletePaste', () => {
    it('should delete a paste with valid token', async () => {
      const request: CreatePasteRequest = {
        ct: 'encrypted-content',
        iv: 'initialization-vector',
        meta: {
          expireTs: Math.floor(Date.now() / 1000) + 3600,
          mime: 'text/plain'
        }
      };

      const created = await client.createPaste(request);
      
      await client.deletePaste(created.id, created.deleteToken);

      expect(client.size()).toBe(0);
      await expect(client.retrievePaste(created.id)).rejects.toThrow();
    });

    it('should throw error with invalid token', async () => {
      const request: CreatePasteRequest = {
        ct: 'encrypted-content',
        iv: 'initialization-vector',
        meta: {
          expireTs: Math.floor(Date.now() / 1000) + 3600,
          mime: 'text/plain'
        }
      };

      const created = await client.createPaste(request);

      await expect(client.deletePaste(created.id, 'wrong-token')).rejects.toThrow('Invalid token');
      expect(client.size()).toBe(1); // Should not be deleted
    });

    it('should throw error for non-existent paste', async () => {
      await expect(client.deletePaste('nonexistent', 'token')).rejects.toThrow('not found');
    });
  });

  describe('deleteByPassword', () => {
    it('should delete an existing paste regardless of auth value', async () => {
      const request: CreatePasteRequest = {
        ct: 'ct', iv: 'iv',
        meta: { expireTs: Math.floor(Date.now() / 1000) + 3600, mime: 'text/plain' },
      };
      const created = await client.createPaste(request);
      await expect(client.deleteByPassword(created.id, 'any-auth')).resolves.not.toThrow();
      expect(client.size()).toBe(0);
    });

    it('should throw when paste does not exist', async () => {
      await expect(client.deleteByPassword('nonexistent', 'auth')).rejects.toThrow('not found');
    });
  });

  describe('getPowChallenge', () => {
    it('should return null when PoW is disabled', async () => {
      client.setPowEnabled(false);
      const result = await client.getPowChallenge();
      expect(result).toBeNull();
    });

    it('should return challenge when PoW is enabled', async () => {
      client.setPowEnabled(true);
      const result = await client.getPowChallenge();
      
      expect(result).not.toBeNull();
      expect(result?.challenge).toBeTruthy();
      expect(result?.difficulty).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear all pastes', async () => {
      const request: CreatePasteRequest = {
        ct: 'encrypted-content',
        iv: 'initialization-vector',
        meta: {
          expireTs: Math.floor(Date.now() / 1000) + 3600,
          mime: 'text/plain'
        }
      };

      await client.createPaste(request);
      await client.createPaste(request);
      
      expect(client.size()).toBe(2);
      
      client.clear();
      
      expect(client.size()).toBe(0);
    });
  });
});
