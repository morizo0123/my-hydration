interface InitialState {
  count: number;
}

declare global {
  interface Window {
    __INITIAL_STATE__: InitialState;
  }
}

console.log('hydrating with:', window.__INITIAL_STATE__);

const btn = document.getElementById('counter')!;
let count = window.__INITIAL_STATE__.count;

btn.addEventListener('click', () => {
  count++;
  btn.textContent = `Count: ${count}`;
});
