# コンポーネントにハイドレーション関数を持たせる

コンポーネントが「自分のレンダリングとハイドレーションの両方を知っている」状態を作るステップ。

## 目的

責務を整理して、カウンターに関することは全部 `counter.ts` に書く。サーバーとクライアントで同じファイルを共有する「Universal / Isomorphic」な構造の第一歩。

```
counter.ts
├── render(count)       ← サーバーが呼ぶ：HTML文字列を返す
└── hydrate(count)      ← クライアントが呼ぶ：イベントを付ける
```

---

## 注意点: サーバーで `document` を触ってはいけない

`hydrate` は `document.getElementById` などブラウザAPIを使う。一方サーバー(Node.js)には `document` が存在しない。なので **`counter.ts` をサーバー側で import するときに `hydrate` 関数の中身が実行されないように**気をつける必要がある。

関数として定義するだけなら、import しても中身は実行されないので問題なし。**トップレベルで `document` を触らない**のがポイント。

---

## 実装

### 1. `src/components/counter.ts`

```typescript
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
```

ポイント:

- `render` と `hydrate` を両方 export
- `hydrate` は関数として定義しているだけなので、import しても呼ばない限り `document` は触られない
- カウンターに関するロジックがこのファイルに集約された

### 2. `src/components/simpleCounter.ts`(新規作成)

べた書き版もコンポーネント化して、過渡的な状態を整理:

```typescript
export function render(count: number): string {
  return `<button id="counter">Count: ${count}</button>`;
}

export function hydrate(count: number): void {
  const btn = document.getElementById('counter')!;
  let currentCount = count;

  btn.addEventListener('click', () => {
    currentCount++;
    btn.textContent = `Count: ${currentCount}`;
  });
}
```

### 3. `src/server.ts`

`render` を別名で import して呼び出す。`hydrate` はサーバーでは使わない(ブラウザAPIが無いので呼んだら壊れる):

```typescript
import http from 'node:http';
import fs from 'node:fs';
import { render as renderCounter } from './components/counter.js';
import { render as renderSimpleCounter } from './components/simpleCounter.js';

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
        ${renderSimpleCounter(initialState.count)}
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
```

`import { render as renderCounter }` は「`render` という名前を `renderCounter` という別名で受け取る」記法。コンポーネントが増えたとき、それぞれ `render` という名前だと衝突するので、最初から別名にしておくのが安全。

### 4. `src/client.ts`

`hydrate` を呼び出すだけ:

```typescript
import { hydrate as hydrateCounter } from './components/counter.js';
import { hydrate as hydrateSimpleCounter } from './components/simpleCounter.js';

interface InitialState {
  count: number;
  componentCount: number;
}

declare global {
  interface Window {
    __INITIAL_STATE__: InitialState;
  }
}

console.log('hydrating with:', window.__INITIAL_STATE__);

hydrateSimpleCounter(window.__INITIAL_STATE__.count);
hydrateCounter(window.__INITIAL_STATE__.componentCount);
```

`client.ts` がスッキリした。コンポーネントごとに **1行で済んでいる**のがポイント。

---

## 動作確認

```bash
npm run build:client
```

ブラウザをリロードして、両方のボタンが独立してカウントアップすれば成功。

---

## 何が良くなったか

### 1. 責務が明確になった

`counter.ts` を見れば、カウンターに関することは全部わかる。「描画はどうなってる？イベントは？」と複数のファイルを行き来する必要が無い。

### 2. 追加が簡単になった

例えば `timer.ts` という新しいコンポーネントを作りたくなったら:

```typescript
// src/components/timer.ts
export function render(seconds: number): string { ... }
export function hydrate(seconds: number): void { ... }
```

これだけで、サーバー側は `renderTimer()` を呼ぶ、クライアント側は `hydrateTimer()` を呼ぶ、というパターンで増やせる。

### 3. サーバーとクライアントで同じソースを共有している

`counter.ts` というひとつのファイルが、サーバーでもクライアントでも使われている。これが「Universal / Isomorphic」と呼ばれる、SSRフレームワークの基本概念。

---

## ここまでの到達点

```
Step 1: ハイドレーションの最小実装
  → サーバーでHTML生成 + クライアントでイベント付与

Step 2: コンポーネントを別ファイルに切り出す(選択肢A)
  → render関数だけを分離

Step 3: hydrateもコンポーネントに持たせる(選択肢B) ← 今ここ
  → コンポーネントが自己完結
```

これは本物のSSRフレームワークの**核となる設計パターン**そのもの。Next.jsの内部でも、コンポーネントは「サーバーで描画する関数」と「クライアントでハイドレートする関数」の組み合わせとして扱われている(細部は仮想DOMなどで複雑になっているが、考え方は同じ)。

---

## 残された課題(次のステップへの伏線)

`client.ts` を見ると:

```typescript
hydrateSimpleCounter(window.__INITIAL_STATE__.count);
hydrateCounter(window.__INITIAL_STATE__.componentCount);
```

**「クライアント側がコンポーネントごとに `hydrateXxx()` を手で書かないといけない」** という問題が残っている。コンポーネントが10個あったら10行書くことになる。

これを解決するのが次のステップ「`data-component` 属性でディスパッチ」。HTMLにメタ情報を埋め込んでおいて、クライアント側が自動でハイドレーション関数を見つけて呼ぶ仕組み。
