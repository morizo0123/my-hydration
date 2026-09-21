import { render as renderCounter } from '../components/counter.js';
import { render as renderTimer } from '../components/timer.js';
import { render as renderMessageLabel } from '../components/messageLabel.js';
import { render as renderMessageButton } from '../components/messageButton.js';
import { render as renderAppCount } from '../components/appCount.js';
import { render as renderAppMessage } from '../components/appMessage.js';

export function render(): string {
  return `
    <h1>Home</h1>
    <div style="border: 1px solid red; padding: 8px;">
      ${renderAppCount({})}
      ${renderAppMessage({})}
    </div>

    <div style="border: 1px solid green; padding: 8px;">
      ${renderMessageLabel({ message: 'Hello' })}
      ${renderMessageButton({})}
    </div>

    ${renderCounter({ count: 0 })}
    ${renderCounter({ count: 0 })}
    ${renderCounter({ count: 0 })}
    ${renderTimer({ count: 0 })}
  `;
}
