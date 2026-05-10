import * as counter from './components/counter.js';
import * as simpleCounter from './components/simpleCounter.js';
import * as timer from './components/timer.js';

// コンポーネント名 → モジュール のマッピング
const components = {
  counter,
  simpleCounter,
  timer
} as const;

type ComponentName = keyof typeof components;

document.querySelectorAll<HTMLElement>('[data-component]').forEach((el) => {
  const name = el.dataset.component as ComponentName;
  const props = JSON.parse(el.dataset.props ?? '{}');

  const component = components[name];
  if (!component) {
    console.warn(`Unknown component: ${name}`);
    return;
  }

  console.log(`hydrating: ${name}`, props);
  component.hydrate(el, props);
});
