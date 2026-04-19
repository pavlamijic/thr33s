import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    minify: 'esbuild',
    // Inline `data:` URIs fail CSP inside the dot.li sandbox. Match
    // ignite's Triangle preset and force every asset to be emitted as a
    // separate file.
    assetsInlineLimit: 0,
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
