type Listener = () => void;

export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: Listener) => () => void;
  subscribeSelector: <S>(
    selector: (state: T) => S,
    listener: (selected: S) => void,
    isEqual?: (a: S, b: S) => boolean
  ) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<Listener>();

  const store: Store<T> = {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeSelector: <S>(
      selector: (state: T) => S,
      listener: (selected: S) => void,
      isEqual: (a: S, b: S) => boolean = Object.is
    ) => {
      let prev = selector(value);
      console.log('prev：', prev);
      const wrapper: Listener = () => {
        const next = selector(value);
        if (!isEqual(next, prev)) {
          prev = next;
          listener(next);
        }
      };
      return store.subscribe(wrapper);
    }
  };

  return store;
}
