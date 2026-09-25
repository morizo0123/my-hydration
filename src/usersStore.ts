import { createStore } from './createStore.js';

export type User = {
  id: number;
  name: string;
  email: string;
  username: string;
};

type UsersState = {
  users: User[];
  sortBy: 'name' | 'email';
};

const store = createStore<UsersState>({
  users: [],
  sortBy: 'name'
});

export function getState() {
  return store.get();
}

// 初期化(サーバーから受け取ったデータをセット)
export function setUsers(users: User[]) {
  const current = store.get();
  store.set({ ...current, users });
}

// 並び替え
export function setSortBy(sortBy: 'name' | 'email') {
  const current = store.get();
  store.set({ ...current, sortBy });
}

// 並び替え後のusersを取得(派生データ)
export function getSortedUsers(): User[] {
  const { users, sortBy } = store.get();
  return [...users].sort((a, b) => a[sortBy].localeCompare(b[sortBy]));
}

export const subscribe = store.subscribe;
export const subscribeSelector = store.subscribeSelector;
