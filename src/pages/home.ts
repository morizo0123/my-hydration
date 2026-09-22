import { render as renderCounter } from '../components/counter.js';
import { render as renderTimer } from '../components/timer.js';
import { render as renderMessageLabel } from '../components/messageLabel.js';
import { render as renderMessageButton } from '../components/messageButton.js';
import { render as renderAppCount } from '../components/appCount.js';
import { render as renderAppMessage } from '../components/appMessage.js';
import { render as renderUserLabel } from '../components/userLabel.js';
import { render as renderUserEditor } from '../components/userEditor.js';

export function render(_params: Record<string, string> = {}): string {
  return `
    <h1>Home</h1>
    <div style="border: 1px solid orange; padding: 8px;">
      ${renderUserLabel({})}
      <div style="border: 1px solid orange; padding: 8px;">
        ${renderUserEditor({})}
      </div>
    </div>

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
