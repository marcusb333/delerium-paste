import { encodeBase64Url as b64u, decodeBase64Url as ub64u } from '../../../../src/core/crypto/encoding';

const genIV = (): Uint8Array => {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  return iv;
};

/**
 * Utility Functions Test Suite
 * 
 * Tests the core utility functions used throughout the zkpaste application:
 * - b64u: Converts ArrayBuffer to URL-safe base64 encoding (no padding, +/ replaced with -_)
 * - ub64u: Converts URL-safe base64 string back to ArrayBuffer
 * - genIV: Generates cryptographically secure 12-byte random IVs for AES encryption
 * 
 * These functions are critical for:
 * 1. Secure data encoding/decoding for URL transmission
 * 2. Cryptographic operations requiring random IVs
 * 3. Data integrity in the zero-knowledge paste system
 */
describe('Utility Functions', () => {
  describe('b64u', () => {
    /**
     * Tests base64 URL-safe encoding functionality
     * 
     * This function converts binary data (ArrayBuffer) to a URL-safe base64 string
     * by replacing '+' with '-' and '/' with '_', and removing padding '=' characters.
     * This is essential for embedding encrypted data in URLs without encoding issues.
     */
    it('should encode ArrayBuffer to base64url string', () => {
      const testData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = b64u(testData.buffer);
      
      expect(result).toBe('SGVsbG8');
      expect(result).not.toContain('+');
      expect(result).not.toContain('/');
      expect(result).not.toContain('=');
    });

    /**
     * Edge case: Empty buffer should return empty string
     * This ensures the function handles boundary conditions gracefully
     */

    it('should handle empty ArrayBuffer', () => {
      const emptyBuffer = new ArrayBuffer(0);
      const result = b64u(emptyBuffer);
      
      expect(result).toBe('');
    });

    /**
     * Edge case: Single byte encoding
     * Tests the minimum data size scenario for base64 encoding
     */
    it('should handle single byte', () => {
      const singleByte = new Uint8Array([65]); // 'A'
      const result = b64u(singleByte.buffer);
      
      expect(result).toBe('QQ');
    });
  });

  describe('ub64u', () => {
    it('should decode base64url string to ArrayBuffer', () => {
      const encoded = 'SGVsbG8';
      const result = ub64u(encoded);
      const decoded = new Uint8Array(result);
      
      expect(decoded).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('should handle empty string', () => {
      const result = ub64u('');
      expect(result.byteLength).toBe(0);
    });

    it('should round-trip correctly', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const encoded = b64u(original.buffer);
      const decoded = ub64u(encoded);
      const result = new Uint8Array(decoded);
      
      expect(result).toEqual(original);
    });

    it('should handle padding correctly', () => {
      const testData = new Uint8Array([1, 2, 3]); // 3 bytes, needs padding
      const encoded = b64u(testData.buffer);
      const decoded = ub64u(encoded);
      const result = new Uint8Array(decoded);
      
      expect(result).toEqual(testData);
    });
  });

  describe('genIV', () => {
    it('should generate 12-byte IV', () => {
      const iv = genIV();
      
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(12);
    });

    it('should generate different IVs on subsequent calls', () => {
      const iv1 = genIV();
      const iv2 = genIV();
      
      // While it's theoretically possible they could be the same,
      // it's extremely unlikely with 12 random bytes
      expect(iv1).not.toEqual(iv2);
    });

    it('should call crypto.getRandomValues', () => {
      const mockGetRandomValues = jest.fn();
      (global.crypto as any).getRandomValues = mockGetRandomValues;
      
      genIV();
      
      expect(mockGetRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
    });
  });
});