import { hydrate as hydrateSimpleCounter } from './components/simpleCounter.js';
import { hydrate as hydrateCounter } from './components/counter.js';
import { hydrate as hydrateTimer } from './components/timer.js';

// コンポーネント名 → hydrate関数 のマッピング
const components: Record<string, (el: HTMLElement, props: any) => void> = {
  counter: hydrateCounter,
  simpleCounter: hydrateSimpleCounter,
  timer: hydrateTimer
};

// data-component 属性を持つ全要素を探してハイドレート
document.querySelectorAll<HTMLElement>('[data-component]').forEach((el) => {
  const name = el.dataset.component!;
  const props = JSON.parse(el.dataset.props ?? '{}');

  const hydrate = components[name];
  if (!hydrate) {
    console.warn(`Unknown component: ${name}`);
    return;
  }

  console.log(`hydrating: ${name}`, props);
  hydrate(el, props);
});
