import { render as renderSortButtons } from '../components/sortButtons.js';
import { render as renderUsersList } from '../components/usersList.js';

type User = {
  id: number;
  name: string;
  email: string;
  username: string;
};

export async function render(
  _params: Record<string, string> = {}
): Promise<string> {
  const res = await fetch('https://jsonplaceholder.typicode.com/users');
  const users: User[] = await res.json();

  // 表示用データを絞る(サイズ削減)
  const usersForClient = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username
  }));

  return `
    <h1>Users</h1>
    <p>JSONPlaceholderから取得したユーザー一覧です。</p>

    ${renderSortButtons({})}
    ${renderUsersList({ users: usersForClient })}

    <script>
      window.__INITIAL_STATE__ = window.__INITIAL_STATE__ || {};
      window.__INITIAL_STATE__.users = ${JSON.stringify(usersForClient)};
    </script>
  `;
}
