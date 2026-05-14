import { render as renderCounter } from '../components/counter.js';
import { render as renderTimer } from '../components/timer.js';

export function render(): string {
  return `
    <h1>Home</h1>
    ${renderCounter({ count: 10 })}
    ${renderTimer({ count: 0 })}
  `;
}
