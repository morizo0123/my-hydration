import { createStore } from './createStore.js';

type AppState = {
  count: number;
  message: string;
  user: { id: number; name: string };
};

const messages = ['Hello', 'こんにちは', 'Bonjour', '你好'];
let index = 0;

const store = createStore<AppState>({
  count: 0,
  message: 'Hello',
  user: { id: 1, name: 'Alice' }
});

export function getState() {
  return store.get();
}

export function incrementCount() {
  const current = store.get();
  store.set({ ...current, count: current.count + 1 });
}

export function setMessage(message: string) {
  const current = store.get();
  store.set({ ...current, message });
}

export function updateUserName(name: string) {
  const current = store.get();
  store.set({ ...current, user: { ...current.user, name } });
}

export function nextMessage() {
  index++;
  const current = store.get();
  store.set({ ...current, message: messages[index % messages.length] });
}

export const subscribe = store.subscribe;
export const subscribeSelector = store.subscribeSelector;
