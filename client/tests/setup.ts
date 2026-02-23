// Jest setup file for DOM environment

// Import Node.js crypto for real implementations
const nodeCrypto = require('crypto');
const { webcrypto } = nodeCrypto;

// Use Node.js Web Crypto API implementation (Node 15.10.0+)
if (webcrypto && webcrypto.subtle) {
  // jest-environment-jsdom runs code in a separate V8 vm context, so TypedArrays
  // and ArrayBuffers created in tests are "cross-realm" objects. Node.js 20's native
  // webcrypto.subtle rejects cross-realm ArrayBuffers with "not instance of ArrayBuffer".
  // Fix: wrap subtle so every buffer argument is copied into a main-realm Buffer first.

  function toNativeBuffer(x: unknown): unknown {
    if (x == null || typeof x !== 'object') return x;
    if (Buffer.isBuffer(x)) return x;
    // TypedArray (Uint8Array etc.) or DataView — copy contents into a main-realm Buffer
    if (ArrayBuffer.isView(x)) {
      const v = x as ArrayBufferView;
      return Buffer.from(v.buffer as ArrayBuffer, v.byteOffset, v.byteLength);
    }
    // ArrayBuffer (possibly cross-realm: instanceof fails but byteLength/slice present)
    const obj = x as Record<string, unknown>;
    if (typeof obj.byteLength === 'number' && typeof obj.slice === 'function') {
      return Buffer.from(new Uint8Array(x as ArrayBuffer));
    }
    return x;
  }

  // Normalize buffer-valued properties inside algorithm objects (e.g. iv, salt)
  function normalizeAlg(alg: unknown): unknown {
    if (alg == null || typeof alg !== 'object' || ArrayBuffer.isView(alg)) return alg;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(alg as Record<string, unknown>)) {
      out[k] = (v != null && typeof v === 'object') ? toNativeBuffer(v) : v;
    }
    return out;
  }

  // Proxy that normalizes all buffer-like args before handing them to native webcrypto
  const wrappedSubtle = new Proxy(webcrypto.subtle as unknown as Record<string, unknown>, {
    get(target, prop: string) {
      const val = target[prop];
      if (typeof val !== 'function') return val;
      return (...args: unknown[]) =>
        (val as Function).apply(
          target,
          args.map((arg, i) =>
            // First arg is usually an algorithm object — normalize its buffer properties
            i === 0 && arg != null && typeof arg === 'object' && !ArrayBuffer.isView(arg)
              ? normalizeAlg(arg)
              : toNativeBuffer(arg)
          )
        );
    },
  });

  // Ensure crypto is available on both global and globalThis
  const cryptoImpl = {
    subtle: wrappedSubtle,
    getRandomValues: (arr: Uint8Array) => {
      return nodeCrypto.randomFillSync(arr);
    },
  };
  
  // Delete any existing crypto to ensure clean setup
  try {
    delete (global as any).crypto;
    delete (globalThis as any).crypto;
    if (typeof window !== 'undefined') {
      delete (window as any).crypto;
    }
  } catch (e) {
    // Ignore errors if crypto doesn't exist
  }
  
  // Set crypto on all possible global objects
  (global as any).crypto = cryptoImpl;
  (globalThis as any).crypto = cryptoImpl;
  
  // Also set on window if it exists (for jsdom)
  if (typeof window !== 'undefined') {
    (window as any).crypto = cryptoImpl;
  }
  
  // Ensure it's also available via Object.defineProperty for compatibility
  try {
    Object.defineProperty(global, 'crypto', {
      value: cryptoImpl,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    
    Object.defineProperty(globalThis, 'crypto', {
      value: cryptoImpl,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'crypto', {
        value: cryptoImpl,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
  } catch (e) {
    // If defineProperty fails, the direct assignment above should work
  }
} else {
  // Fallback for older Node versions
  const mockCrypto = {
    subtle: {
      generateKey: jest.fn(),
      importKey: jest.fn(),
      exportKey: jest.fn(),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      digest: jest.fn(),
      deriveKey: jest.fn(),
      deriveBits: jest.fn(),
    },
    getRandomValues: jest.fn((arr: Uint8Array) => {
      return nodeCrypto.randomFillSync(arr);
    }),
  };
  
  Object.defineProperty(global, 'crypto', {
    value: mockCrypto,
    writable: true,
    configurable: true,
  });
  
  Object.defineProperty(globalThis, 'crypto', {
    value: mockCrypto,
    writable: true,
    configurable: true,
  });
  
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'crypto', {
      value: mockCrypto,
      writable: true,
      configurable: true,
    });
  }
}

// Mock TextEncoder and TextDecoder using a different approach
const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } = require('util');
(global as any).TextEncoder = NodeTextEncoder;
(global as any).TextDecoder = NodeTextDecoder;

// Mock btoa and atob
global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');

// Ensure fetch is available (Node.js 18+ has it built-in)
// Node.js 18+ has fetch built-in, but Jest/jsdom might not expose it
if (typeof global.fetch === 'undefined') {
  // Try to use Node.js built-in fetch
  try {
    // In Node.js 18+, fetch is available as a global, but we need to import it
    // For Jest, we'll use a simple HTTP client approach
    const http = require('http');
    const https = require('https');
    const { URL } = require('url');
    
    // Simple fetch polyfill using Node.js http/https
    (global as any).fetch = async (url: string, options: any = {}) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      const method = options.method || 'GET';
      const headers = options.headers || {};
      
      return new Promise((resolve, reject) => {
        const req = client.request(url, {
          method,
          headers,
        }, (res: any) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: res.headers,
              json: async () => JSON.parse(body),
              text: async () => body,
            });
          });
        });
        
        req.on('error', reject);
        if (options.body) {
          req.write(options.body);
        }
        req.end();
      });
    };
  } catch (error) {
    console.warn('Failed to set up fetch polyfill:', error);
  }
}