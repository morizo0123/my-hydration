import { defineConfig } from 'vite';

/*
IIFE とは Immediately Invoked Function Expression の略で、関数を定義して即時実行することを指す。
この設定では、client.ts をビルドして client.js を出力する際に、関数を即時実行するようにしている。
つまり、ブラウザでそのまま動く形式で出力するようにしている。
 */

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
