import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // E2E sobe um servidor real e conecta sockets — dá folga no timeout.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    pool: 'forks',
  },
  // NestJS depende de metadados de decorator (design:paramtypes) para a DI.
  // O esbuild do Vitest não os emite; o SWC sim.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
