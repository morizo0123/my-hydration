type User = {
  id: number;
  name: string;
  email: string;
  username: string;
};

export async function render(): Promise<string> {
  const res = await fetch('https://jsonplaceholder.typicode.com/users');
  const users: User[] = await res.json();

  return `
    <h1>Users</h1>
    <p>JSONPlaceholderから取得したユーザー一覧です。</p>
    <ul>
      ${users
        .map(
          (user) => `
        <li>
          <strong>${user.name}</strong> (@${user.username}) - ${user.email}
        </li>
      `
        )
        .join('')}
    </ul>
  `;
}
