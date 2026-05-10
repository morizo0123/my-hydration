export function render(count: number) {
  return `
    <div data-component="timer" data-props='${JSON.stringify({ count })}'>
      <span>CountUpTimer: ${count}</span>
    </div>
  `;
}

export function hydrate(el: HTMLElement, props: { count: number }) {
  const spanEl = el.querySelector('span')!;
  let count = props.count;

  setInterval(() => {
    count++;
    spanEl.textContent = `CountUpTimer: ${count}`;
  }, 1000);
}
