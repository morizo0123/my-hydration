export function render(count: number): string {
  return `<button id="component-counter">Count: ${count}</button>`;
}

export function hydrate(count: number): void {
  const btn = document.getElementById('component-counter')!;
  let currentCount = count;

  btn.addEventListener('click', () => {
    currentCount++;
    btn.textContent = `Count: ${currentCount}`;
  });
}
