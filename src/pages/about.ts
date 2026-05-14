import { render as renderSimpleCounter } from '../components/simpleCounter.js';

export function render(): string {
  return `
    <h1>About</h1>
    <p>このサイトは、Node.js + TypeScript + Vite でハイドレーションを学ぶ目的で作りました。</p>
    <p>このページにもコンポーネントを置けます:</p>
    ${renderSimpleCounter({ count: 100 })}
  `;
}
