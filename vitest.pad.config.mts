import { defineConfig } from 'vitest/config';
import path from 'node:path';
/** Pad checks never load .env or the unrelated executor's live warmup. */
export default defineConfig({
  test: { environment: 'node', include: ['src/pad/**/*.test.ts'], exclude: ['**/node_modules/**'] },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
});
