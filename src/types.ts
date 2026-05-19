export type Component<P> = {
  render: (props: P) => string;
  hydrate: (el: HTMLElement, props: P) => (() => void) | void;
};
