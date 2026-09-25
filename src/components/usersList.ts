import type { Component } from '../types';
import { getSortedUsers, subscribe, type User } from '../usersStore';

export type Props = { users: User[] };

export const render: Component<Props>['render'] = (props) => {
  // renderは server 側で使われる。propsで受け取ったusersを表示
  return `
    <ul data-component="usersList" data-props='${JSON.stringify(props)}'>
      ${props.users
        .map(
          (user) => `
        <li>
          <a href="/users/${user.id}"><strong>${user.name}</strong></a>
          (@${user.username}) - ${user.email}
        </li>
      `
        )
        .join('')}
    </ul>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const rerender = () => {
    const users = getSortedUsers();
    el.innerHTML = users
      .map(
        (user) => `
      <li>
        <a href="/users/${user.id}"><strong>${user.name}</strong></a>
        (@${user.username}) - ${user.email}
      </li>
    `
      )
      .join('');
  };

  const unsubscribe = subscribe(rerender);

  return () => {
    unsubscribe();
  };
};
