import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2020',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  publicDir: false,
  onSuccess: 'chmod +x dist/index.js',
  external: ['@modelcontextprotocol/sdk', 'zod'],
});
