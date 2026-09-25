import type { Component } from '../types.js';
import { setSortBy } from '../usersStore.js';

export type Props = {};

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="sortButtons" data-props='${JSON.stringify(props)}'>
      <button data-sort="name">名前で並び替え</button>
      <button data-sort="email">メールで並び替え</button>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const handleClick = (e: Event) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const sort = target.dataset.sort as 'name' | 'email' | undefined;
    if (sort) {
      setSortBy(sort);
    }
  };

  el.addEventListener('click', handleClick);

  return () => {
    el.removeEventListener('click', handleClick);
  };
};
