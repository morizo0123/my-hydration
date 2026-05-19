import type { Component } from '../types.js';

export type Props = { count: number };

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="counter" data-props='${JSON.stringify(props)}'>
      <button>Count: ${props.count}</button>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, props) => {
  const btn = el.querySelector('button')!;
  let count = props.count;

  const handleClick = () => {
    count++;
    btn.textContent = `Count: ${count}`;
    console.log('counter click:', count);
  };

  btn.addEventListener('click', handleClick);

  return () => {
    console.log('counter cleanup!');
    btn.removeEventListener('click', handleClick);
  };
};
