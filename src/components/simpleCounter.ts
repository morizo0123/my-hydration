export type Props = { count: number };

export function render(props: Props): string {
  return `
    <div data-component="simpleCounter" data-props='${JSON.stringify(props)}'>
      <button>Count: ${props.count}</button>
    </div>
  `;
}

export function hydrate(el: HTMLElement, props: Props): void {
  const btn = el.querySelector('button')!;
  let count = props.count;

  btn.addEventListener('click', () => {
    count++;
    btn.textContent = `Count: ${count}`;
  });
}
