/**
 * Unit tests for API Client implementations
 * 
 * Tests both HttpApiClient and MockApiClient to ensure they follow
 * the IApiClient interface contract correctly.
 */

import { HttpApiClient } from '../../../src/infrastructure/api/http-client.js';
import { MockApiClient } from '../../../src/infrastructure/api/mock-client.js';
import type { PasteCreateRequest } from '../../../src/infrastructure/api/interfaces.js';

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
      const request: PasteCreateRequest = {
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
      const request: PasteCreateRequest = {
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
      const request: PasteCreateRequest = {
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
      const request: PasteCreateRequest = {
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
      const request: PasteCreateRequest = {
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
  });

  describe('healthCheck', () => {
    it('should return true when API is healthy', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true
      });

      const result = await client.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when API is down', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
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
      const request: PasteCreateRequest = {
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
      const request: PasteCreateRequest = {
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
      const request: PasteCreateRequest = {
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
      const request: PasteCreateRequest = {
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
      const request: PasteCreateRequest = {
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

  describe('healthCheck', () => {
    it('should always return true', async () => {
      const result = await client.healthCheck();
      expect(result).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all pastes', async () => {
      const request: PasteCreateRequest = {
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
