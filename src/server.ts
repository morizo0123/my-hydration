import http from 'node:http';
import fs from 'node:fs';
import { render as renderCounter } from './components/counter.js';

const server = http.createServer((req, res) => {
  console.log('request:', req.url);

  if (req.url === '/client.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(fs.readFileSync('./dist/client.js'));
  }

  const initialState = { count: 5, componentCount: 10 };
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <h1>My Hydration</h1>
        <button id="counter">Count: ${initialState.count}</button>
        ${renderCounter(initialState.componentCount)}
        <script>window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};</script>
        <script src="/client.js"></script>
      </body>
    </html>
  `;
  res.setHeader('Content-Type', 'text/html');
  res.end(html);
});

server.listen(3000, () => console.log('http://localhost:3000'));
