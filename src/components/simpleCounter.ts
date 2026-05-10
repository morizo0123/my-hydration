export function render(count: number): string {
  return `
    <div data-component="simpleCounter" data-props='${JSON.stringify({ count })}'>
      <button>Count: ${count}</button>
    </div>
  `;
}

export function hydrate(el: HTMLElement, props: { count: number }) {
  const btn = el.querySelector('button')!;
  let count = props.count;

  btn.addEventListener('click', () => {
    count++;
    btn.textContent = `Count: ${count}`;
  });
}
