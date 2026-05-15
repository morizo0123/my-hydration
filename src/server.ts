import http from 'node:http';
import fs from 'node:fs';
import { layout } from './layout.js';
import * as homePage from './pages/home.js';
import * as aboutPage from './pages/about.js';

// ルートテーブル
const routes: Record<string, () => string> = {
  '/': homePage.render,
  '/about': aboutPage.render
};

const server = http.createServer((req, res) => {
  console.log('request:', req.url);

  // /client.js のリクエスト
  if (req.url === '/client.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(fs.readFileSync('./dist/client.js'));
  }

  // ノイズリクエストを無視
  if (req.url === '/favicon.ico' || req.url?.startsWith('/.well-known/')) {
    res.writeHead(204);
    return res.end();
  }

  // SPAナビゲーション用: /_page?path=/about → ページの中身だけ返す
  if (req.url?.startsWith('/_page')) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.searchParams.get('path') ?? '/';
    const pageRender = routes[path];

    if (!pageRender) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end(layout('<h1>404 Not Found</h1>'));
    }

    res.setHeader('Content-Type', 'text/html');
    return res.end(pageRender());
  }

  // 通常のルーティング(従来通り)
  const pageRender = routes[req.url ?? '/'];

  if (!pageRender) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end(layout('<h1>404 Not Found</h1>'));
  }

  res.setHeader('Content-Type', 'text/html');
  res.end(layout(pageRender()));
});

server.listen(3000, () => console.log('http://localhost:3000'));
