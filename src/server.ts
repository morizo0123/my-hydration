import http from 'node:http';
import fs from 'node:fs';
import { render as renderSimpleCounter } from './components/simpleCounter.js';
import { render as renderCounter } from './components/counter.js';
import { render as renderTimer } from './components/timer.js';

const server = http.createServer((req, res) => {
  console.log('request:', req.url);

  if (req.url === '/client.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(fs.readFileSync('./dist/client.js'));
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <h1>My Hydration</h1>
        ${renderSimpleCounter(5)}
        ${renderCounter(10)}
        ${renderCounter(100)}
        ${renderTimer(1)}
        <script src="/client.js"></script>
      </body>
    </html>
  `;
  res.setHeader('Content-Type', 'text/html');
  res.end(html);
});

server.listen(3000, () => console.log('http://localhost:3000'));
