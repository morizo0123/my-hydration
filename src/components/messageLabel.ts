import type { Component } from '../types';
import { getMessage, subscribe } from '../messageStore.js';

export type Props = { message: string };

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="messageLabel" data-props='${JSON.stringify(props)}'>
      <label>message: ${props.message}</label>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const label = el.querySelector('label')!;

  const update = () => {
    label.textContent = `message: ${getMessage()}`;
  };

  const unsubscribe = subscribe(update);

  update();

  return () => {
    unsubscribe();
  };
};
