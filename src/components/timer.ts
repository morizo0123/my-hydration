import type { Component } from '../types.js';

export type Props = { count: number };

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="timer" data-props='${JSON.stringify(props)}'>
      <span>CountUpTimer: ${props.count}</span>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, props) => {
  const spanEl = el.querySelector('span')!;
  let count = props.count;

  const intervalId = setInterval(() => {
    count++;
    spanEl.textContent = `CountUpTimer: ${count}`;
    console.log('timer tick:', count);
  }, 1000);

  return () => {
    console.log('timer cleanup!');
    clearInterval(intervalId);
  };
};
