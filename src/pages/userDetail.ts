type User = {
  id: number;
  name: string;
  email: string;
  username: string;
  phone: string;
  website: string;
  company: { name: string };
  address: { city: string; street: string };
};

export async function render(params: Record<string, string>): Promise<string> {
  const id = params.id;
  const res = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`);

  if (!res.ok) {
    return `<h1>User not found</h1><p>id: ${params.id}</p>`;
  }

  const user: User = await res.json();

  return `
    <h1>${user.name}</h1>
    <p><a href="/users">← Users一覧に戻る</a></p>
    <ul>
      <li><strong>Username:</strong> @${user.username}</li>
      <li><strong>Email:</strong> ${user.email}</li>
      <li><strong>Phone:</strong> ${user.phone}</li>
      <li><strong>Website:</strong> ${user.website}</li>
      <li><strong>Company:</strong> ${user.company.name}</li>
      <li><strong>City:</strong> ${user.address.city}</li>
    </ul>
  `;
}
