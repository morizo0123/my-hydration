import http from 'node:http';
import fs from 'node:fs';
import { layout } from './layout.js';
import { matchRoute } from './matchRoute.js';
import * as homePage from './pages/home.js';
import * as aboutPage from './pages/about.js';
import * as usersPage from './pages/users.js';
import * as userDetailPage from './pages/userDetail.js';

type Route = {
  pattern: string;
  render: (params: Record<string, string>) => string | Promise<string>;
};

const routes: Route[] = [
  { pattern: '/', render: homePage.render },
  { pattern: '/about', render: aboutPage.render },
  { pattern: '/users', render: usersPage.render },
  { pattern: '/users/:id', render: userDetailPage.render }
];

// パスから該当するルートを探して、レンダリング結果を返す
async function renderPath(path: string): Promise<string | null> {
  for (const route of routes) {
    const match = matchRoute(route.pattern, path);

    if (match) {
      return await route.render(match.params);
    }
  }

  return null;
}

const server = http.createServer(async (req, res) => {
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
    const content = await renderPath(path);

    if (content === null) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end('<h1>404 Not Found</h1>');
    }

    res.setHeader('Content-Type', 'text/html');
    return res.end(content);
  }

  // 通常のルーティング(従来通り)
  const path = req.url ?? '/';
  const content = await renderPath(path);

  if (content === null) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end(layout('<h1>404 Not Found</h1>'));
  }

  res.setHeader('Content-Type', 'text/html');
  res.end(layout(content));
});

server.listen(3000, () => console.log('http://localhost:3000'));
