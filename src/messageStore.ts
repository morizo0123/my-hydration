type Listener = () => void;

let message = 'Hello';
const messages = ['Hello', 'こんにちは', 'Bonjour', '你好'];
let index = 0;

const listeners = new Set<Listener>();

export function getMessage(): string {
  return message;
}

export function nextMessage(): void {
  // ここを埋める(indexを次に進めて、messageを更新して、listeners全員に通知)
  index++;
  message = messages[index % messages.length];
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
