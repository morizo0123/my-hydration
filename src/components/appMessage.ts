import type { Component } from '../types.js';
import { getState, nextMessage, subscribeSelector } from '../appStore.js';

export type Props = {};

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="appMessage" data-props='${JSON.stringify(props)}'>
      <label>message: ${getState().message}</label>
      <button>次のメッセージへ</button>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const label = el.querySelector('label')!;
  const btn = el.querySelector('button')!;

  const update = (message: string) => {
    console.log('appMessage update!', message);
    label.textContent = `message: ${message}`;
  };

  const handleClick = () => nextMessage();
  btn.addEventListener('click', handleClick);

  update(getState().message);
  const unsubscribe = subscribeSelector((state) => state.message, update);

  return () => {
    btn.removeEventListener('click', handleClick);
    unsubscribe();
  };
};
