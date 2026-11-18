// Everything the library can run is run by a test, and it stays so: this run
// fails when it leaves a line or a branch out. It is apart from `yarn test`,
// which a partial run must be able to pass.
module.exports = {
  ...require('./jest.config'),
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/tests/**'],
  coverageReporters: ['text'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
