import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [ '**/__tests__/**/*test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)' ],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
    },
  },
  collectCoverageFrom: [ 'src/**/*.{js,jsx,ts,tsx}', '!src/**/*.d.ts' ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/',
    '/test/',
    '/src/index.ts', // Ignore the index file
  ],
  setupFilesAfterEnv: [ './jest.setup.ts' ],
  globalTeardown: "./jest.teardown.ts"
};

export default config;
