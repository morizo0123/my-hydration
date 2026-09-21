import type { Component } from '../types.js';
import { getState, incrementCount, subscribeSelector } from '../appStore.js';

export type Props = {};

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="appCount" data-props='${JSON.stringify(props)}'>
      <button>Count: ${getState().count}</button>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const btn = el.querySelector('button')!;

  const update = (count: number) => {
    console.log('appCount update!', count);
    btn.textContent = `Count: ${count}`;
  };

  const handleClick = () => incrementCount();
  btn.addEventListener('click', handleClick);

  update(getState().count);
  const unsubscribe = subscribeSelector((state) => state.count, update);

  return () => {
    btn.removeEventListener('click', handleClick);
    unsubscribe();
  };
};
