/**
 * Unit tests for core/models/paste.ts
 * 
 * Tests domain models and type definitions:
 * - EncryptedData interface
 * - PowChallenge interface
 * - PowSolution interface
 * - PasteMetadata interface
 * - API request/response types
 */

import type {
  EncryptedData,
  PowChallenge,
  PowSolution,
  PasteMetadata,
  CreatePasteRequest,
  CreatePasteResponse,
  GetPasteResponse
} from '../../../src/core/models/paste.js';

// ============================================================================
// TYPE VALIDATION TESTS
// ============================================================================

describe('EncryptedData', () => {
  it('should have correct structure', () => {
    const encrypted: EncryptedData = {
      keyB64: 'test-key',
      ivB64: 'test-iv',
      ctB64: 'test-ciphertext'
    };

    expect(encrypted.keyB64).toBe('test-key');
    expect(encrypted.ivB64).toBe('test-iv');
    expect(encrypted.ctB64).toBe('test-ciphertext');
  });

  it('should accept base64url-encoded strings', () => {
    const encrypted: EncryptedData = {
      keyB64: 'YWJjZGVmZ2hpams',
      ivB64: 'MTIzNDU2Nzg5MGFi',
      ctB64: 'dGVzdC1jaXBoZXJ0ZXh0'
    };

    expect(encrypted.keyB64).toBeTruthy();
    expect(encrypted.ivB64).toBeTruthy();
    expect(encrypted.ctB64).toBeTruthy();
  });
});

describe('PowChallenge', () => {
  it('should have correct structure', () => {
    const challenge: PowChallenge = {
      challenge: 'test-challenge',
      difficulty: 5
    };

    expect(challenge.challenge).toBe('test-challenge');
    expect(challenge.difficulty).toBe(5);
  });

  it('should accept valid difficulty values', () => {
    const challenges: PowChallenge[] = [
      { challenge: 'test1', difficulty: 1 },
      { challenge: 'test2', difficulty: 10 },
      { challenge: 'test3', difficulty: 20 }
    ];

    challenges.forEach(ch => {
      expect(ch.challenge).toBeTruthy();
      expect(ch.difficulty).toBeGreaterThan(0);
    });
  });
});

describe('PowSolution', () => {
  it('should have correct structure', () => {
    const solution: PowSolution = {
      challenge: 'test-challenge',
      nonce: 12345
    };

    expect(solution.challenge).toBe('test-challenge');
    expect(solution.nonce).toBe(12345);
  });

  it('should accept large nonce values', () => {
    const solution: PowSolution = {
      challenge: 'test-challenge',
      nonce: 4294967295 // Max 32-bit unsigned int
    };

    expect(solution.nonce).toBeGreaterThan(0);
  });
});

describe('PasteMetadata', () => {
  it('should have correct structure', () => {
    const now = Math.floor(Date.now() / 1000);
    const metadata: PasteMetadata = {
      expireTs: now + 3600,
      mime: 'text/plain'
    };

    expect(metadata.expireTs).toBeGreaterThan(now);
    expect(metadata.mime).toBe('text/plain');
  });

  it('should accept different MIME types', () => {
    const mimeTypes = ['text/plain', 'text/html', 'application/json', 'text/markdown'];
    
    mimeTypes.forEach(mime => {
      const metadata: PasteMetadata = {
        expireTs: Math.floor(Date.now() / 1000) + 3600,
        mime
      };
      expect(metadata.mime).toBe(mime);
    });
  });

  it('should handle future expiration times', () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
    const metadata: PasteMetadata = {
      expireTs: futureExpiry,
      mime: 'text/plain'
    };

    expect(metadata.expireTs).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

describe('CreatePasteRequest', () => {
  it('should have correct structure', () => {
    const request: CreatePasteRequest = {
      ct: 'ciphertext',
      iv: 'initialization-vector',
      meta: {
        expireTs: Math.floor(Date.now() / 1000) + 3600,
        mime: 'text/plain'
      },
      pow: null
    };

    expect(request.ct).toBeTruthy();
    expect(request.iv).toBeTruthy();
    expect(request.meta).toBeTruthy();
    expect(request.pow).toBeNull();
  });

  it('should accept PowSolution', () => {
    const request: CreatePasteRequest = {
      ct: 'ciphertext',
      iv: 'initialization-vector',
      meta: {
        expireTs: Math.floor(Date.now() / 1000) + 3600,
        mime: 'text/plain'
      },
      pow: {
        challenge: 'test-challenge',
        nonce: 12345
      }
    };

    expect(request.pow).toBeTruthy();
    expect(request.pow?.challenge).toBe('test-challenge');
    expect(request.pow?.nonce).toBe(12345);
  });

  it('should allow optional pow field', () => {
    const request: CreatePasteRequest = {
      ct: 'ciphertext',
      iv: 'initialization-vector',
      meta: {
        expireTs: Math.floor(Date.now() / 1000) + 3600,
        mime: 'text/plain'
      }
    };

    expect(request.pow).toBeUndefined();
  });
});

describe('CreatePasteResponse', () => {
  it('should have correct structure', () => {
    const response: CreatePasteResponse = {
      id: 'abc123',
      deleteToken: 'token-xyz'
    };

    expect(response.id).toBeTruthy();
    expect(response.deleteToken).toBeTruthy();
  });

  it('should accept various ID formats', () => {
    const responses: CreatePasteResponse[] = [
      { id: 'short', deleteToken: 'token' },
      { id: 'a'.repeat(32), deleteToken: 'token' },
      { id: 'mixed-123-ABC', deleteToken: 'token' }
    ];

    responses.forEach(res => {
      expect(res.id).toBeTruthy();
      expect(res.deleteToken).toBeTruthy();
    });
  });
});

describe('GetPasteResponse', () => {
  it('should have correct structure', () => {
    const response: GetPasteResponse = {
      ct: 'ciphertext',
      iv: 'initialization-vector',
      meta: {
        expireTs: Math.floor(Date.now() / 1000) + 3600,
        mime: 'text/plain'
      }
    };

    expect(response.ct).toBeTruthy();
    expect(response.iv).toBeTruthy();
    expect(response.meta).toBeTruthy();
  });
});

// ============================================================================
// TYPE COMPATIBILITY TESTS
// ============================================================================

describe('Type Compatibility', () => {
  it('should allow PowChallenge to be used with PowSolution', () => {
    const challenge: PowChallenge = {
      challenge: 'test-challenge',
      difficulty: 5
    };

    const solution: PowSolution = {
      challenge: challenge.challenge,
      nonce: 12345
    };

    expect(solution.challenge).toBe(challenge.challenge);
  });

  it('should allow PasteMetadata in CreatePasteRequest and GetPasteResponse', () => {
    const meta: PasteMetadata = {
      expireTs: Math.floor(Date.now() / 1000) + 3600,
      mime: 'text/plain'
    };

    const request: CreatePasteRequest = {
      ct: 'ciphertext',
      iv: 'iv',
      meta
    };

    const response: GetPasteResponse = {
      ct: 'ciphertext',
      iv: 'iv',
      meta
    };

    expect(request.meta).toEqual(meta);
    expect(response.meta).toEqual(meta);
  });
});
