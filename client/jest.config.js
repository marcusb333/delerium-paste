// Build testPathIgnorePatterns array conditionally
const testPathIgnorePatterns = [
  '/node_modules/',
  '/tests/integration/',
  '/tests/e2e/'
];

// Skip load tests by default (unless explicitly enabled)
if (process.env.SKIP_LOAD_TESTS !== 'false') {
  testPathIgnorePatterns.push('/tests/load/');
}

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  testPathIgnorePatterns,
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        moduleResolution: 'node',
        esModuleInterop: true,
      }
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    // Entry points: direct DOM wiring, covered by E2E tests
    '!src/app.ts',
    '!src/delete.ts',
    // UI layer: requires E2E testing
    '!src/ui/**',
    // Feature wrappers: thin orchestration, covered by E2E tests
    '!src/features/**',
    // Crypto primitives: type-only interfaces and index re-exports
    '!src/core/crypto/interfaces.ts',
    '!src/core/crypto/index.ts',
    '!src/core/models/**', // Type-only module, no runtime code to test
    // Infrastructure index re-exports (no logic)
    '!src/infrastructure/api/index.ts',
    '!src/infrastructure/pow/index.ts',
    // Application index re-exports (no logic)
    '!src/application/index.ts',
    '!src/application/use-cases/index.ts',
    '!src/application/dtos/paste-dtos.ts',
    // Presentation index re-exports (no logic)
    '!src/presentation/index.ts',
    '!src/presentation/components/index.ts',
    // Passive-events: browser API monkey-patch, not testable in Jest
    '!src/utils/passive-events.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    // Global threshold covers the full included set — presentation components
    // (chat-view, paste-viewer-view, etc.) are primarily E2E-tested which
    // naturally limits branch coverage in unit tests.
    global: {
      branches: 45,
      functions: 70,
      lines: 65,
      statements: 65
    },
    // Security-critical files: high coverage required
    './src/security.ts': {
      branches: 85,
      functions: 100,
      lines: 95,
      statements: 95
    },
    './src/core/validators/index.ts': {
      branches: 90,
      functions: 100,
      lines: 95,
      statements: 95
    },
    './src/core/utils/sanitize.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    // Newly covered modules
    './src/core/services/encryption-service.ts': {
      branches: 80,
      functions: 100,
      lines: 90,
      statements: 90
    },
    './src/core/services/paste-service.ts': {
      branches: 80,
      functions: 100,
      lines: 90,
      statements: 90
    },
    // storage.ts branch coverage is capped at ~60% in jsdom: the
    // `typeof window === 'undefined'` server-side guard branches are
    // unreachable in a browser-like test environment.
    './src/utils/storage.ts': {
      branches: 55,
      functions: 100,
      lines: 95,
      statements: 95
    }
  },
  setupFiles: ['<rootDir>/tests/setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
