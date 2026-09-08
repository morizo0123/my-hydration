import type { Component } from '../types.js';
import { nextMessage } from '../messageStore.js';

type Props = {};

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="messageButton" data-props='${JSON.stringify(props)}'>
      <button>次のメッセージへ</button>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const btn = el.querySelector('button')!;

  const handleClick = () => nextMessage();
  btn.addEventListener('click', handleClick);

  return () => {
    btn.removeEventListener('click', handleClick);
  };
};
