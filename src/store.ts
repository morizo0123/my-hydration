type Listener = () => void;

let count = 0;
const listeners = new Set<Listener>();

export function getCount(): number {
  return count;
}

export function increment(): void {
  count++;
  // 状態が変わったので、購読者全員に通知
  listeners.forEach((listener) => listener());
}

// 購読する。戻り値は「購読を解除する関数」
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
