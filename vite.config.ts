import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'src/client.ts',
      output: {
        entryFileNames: 'client.js',
        format: 'iife' // ブラウザでそのまま動く形式
      }
    }
  }
});
