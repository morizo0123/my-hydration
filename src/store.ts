import { createStore } from './createStore';

const countStore = createStore(0);

export function getCount(): number {
  return countStore.get();
}

export function increment(): void {
  countStore.set(countStore.get() + 1);
}

export const subscribe = countStore.subscribe;
