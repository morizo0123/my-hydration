export type Props = { count: number };

export function render(props: Props): string {
  return `
    <div data-component="timer" data-props='${JSON.stringify(props)}'>
      <span>CountUpTimer: ${props.count}</span>
    </div>
  `;
}

export function hydrate(el: HTMLElement, props: Props): void {
  const spanEl = el.querySelector('span')!;
  let count = props.count;

  setInterval(() => {
    count++;
    spanEl.textContent = `CountUpTimer: ${count}`;
  }, 1000);
}
