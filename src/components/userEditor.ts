import type { Component } from '../types.js';
import { updateUserName } from '../appStore.js';

export type Props = {};

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="userEditor" data-props='${JSON.stringify(props)}'>
      <button>Rename to Bob</button>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const btn = el.querySelector('button')!;
  const handleClick = () => updateUserName('Bob');
  btn.addEventListener('click', handleClick);
  return () => btn.removeEventListener('click', handleClick);
};
