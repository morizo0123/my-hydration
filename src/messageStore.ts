import { createStore } from './createStore';

const messages = ['Hello', 'こんにちは', 'Bonjour', '你好'];
let index = 0;

const messageStore = createStore(messages[0]);

export function getMessage(): string {
  return messageStore.get();
}

export function nextMessage(): void {
  index++;
  messageStore.set(messages[index % messages.length]);
}

export const subscribe = messageStore.subscribe;
