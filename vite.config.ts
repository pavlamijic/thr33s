import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    minify: 'esbuild',
  },
  esbuild: {
    // Avoid eval usage in generated code
    supported: {
      'dynamic-import': true,
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
