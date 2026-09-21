import type { Component } from '../types.js';
import { getState, subscribeSelector } from '../appStore.js';
import { shallowEqual } from '../shallowEqual.js';

export type Props = {};

export const render: Component<Props>['render'] = (props) => {
  const { user } = getState();
  return `
    <div data-component="userLabel" data-props='${JSON.stringify(props)}'>
      <p>User: ${user.name} (id: ${user.id})</p>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const p = el.querySelector('p')!;

  const update = (user: { id: number; name: string }) => {
    console.log('userLabel update!', user);
    p.textContent = `User: ${user.name} (id: ${user.id})`;
  };

  const unsubscribe = subscribeSelector(
    (state) => ({ id: state.user.id, name: state.user.name }),
    update,
    shallowEqual
  );

  return () => {
    unsubscribe();
  };
};
