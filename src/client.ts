import { hydrate as hydrateCounter } from './components/counter';

interface InitialState {
  count: number;
  componentCount: number;
}

declare global {
  interface Window {
    __INITIAL_STATE__: InitialState;
  }
}

console.log('hydrating with:', window.__INITIAL_STATE__);

// 既存のカウンター(あえてそのまま残す)
const btn = document.getElementById('counter')!;
let count = window.__INITIAL_STATE__.count;

btn.addEventListener('click', () => {
  count++;
  btn.textContent = `Count: ${count}`;
});

// コンポーネント版カウンター ← ハイドレーション関数を呼ぶだけ！
hydrateCounter(window.__INITIAL_STATE__.componentCount);
