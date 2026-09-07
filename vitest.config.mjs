import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // tests/node/*.test.mjs are node:test proofs run separately via
    // `pnpm test:kernel` (which builds dist/ first). Vitest's default
    // include glob would otherwise pick them up too and fail because
    // dist/ hasn't been built in a plain `pnpm test` run.
    include: ['tests/fixtures/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
});
