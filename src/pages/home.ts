import { render as renderCounter } from '../components/counter.js';
import { render as renderTimer } from '../components/timer.js';
import { render as renderMessageLabel } from '../components/messageLabel.js';
import { render as renderMessageButton } from '../components/messageButton.js';

export function render(): string {
  return `
    <h1>Home</h1>
    ${renderMessageLabel({ message: 'Hello' })}
    ${renderMessageButton({})}

    ${renderCounter({ count: 0 })}
    ${renderCounter({ count: 0 })}
    ${renderCounter({ count: 0 })}
    ${renderTimer({ count: 0 })}
  `;
}
