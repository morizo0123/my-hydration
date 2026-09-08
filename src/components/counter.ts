import type { Component } from '../types.js';
import { getCount, increment, subscribe } from '../store.js';

export type Props = { count: number };

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="counter" data-props='${JSON.stringify(props)}'>
      <button>Count: ${props.count}</button>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const btn = el.querySelector('button')!;

  // 画面を最新の状態に合わせる関数
  const update = () => {
    btn.textContent = `Count: ${getCount()}`;
  };

  // クリックでストアを更新(全員に通知が飛ぶ)
  const handleClick = () => increment();
  btn.addEventListener('click', handleClick);

  // ストアを購読。変化があったら update が呼ばれる
  const unsubscribe = subscribe(update);

  // 初回同期(SSRの値とストアの初期値がズレてる可能性に備える)
  update();

  return () => {
    btn.removeEventListener('click', handleClick);
    unsubscribe();
  };
};
