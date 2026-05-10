# コンポーネント化ステップ

ハイドレーション最小実装にコンポーネントを導入する学習記録。

## 目的

カウンターを `components/counter.ts` に切り出して、サーバー側のHTML生成で使えるようにする。コンポーネント化の第一歩。

---

## 設計の選択肢

コンポーネントは「サーバーとクライアント両方で使う」もの。どう作るかで実装が変わる。

### 選択肢A: 文字列を返す関数（シンプル・今回採用）

```typescript
export function counter(count: number): string {
  return `<button id="component-counter">Count: ${count}</button>`;
}
```

サーバー側で `${counter(5)}` のように使ってHTMLに埋め込む。クライアント側は `getElementById` でイベント付与する従来通りの形。

### 選択肢B: サーバー用とクライアント用を1ファイルにまとめる（発展）

```typescript
export function render(count: number): string { ... }
export function hydrate(el: HTMLElement, count: number): void { ... }
```

ロジックを1か所にまとめられるが、サーバー側で `hydrate` を import すると `document` が無くてエラーになるなど、注意が必要。

**まずはAから始めるのが学習的に分かりやすい。**

---

## 実装

### 1. `src/components/counter.ts`(新規作成)

```typescript
export function counter(count: number): string {
  return `<button id="component-counter">Count: ${count}</button>`;
}
```

### 2. `src/server.ts`(修正)

`counter` を import して、HTMLに埋め込む:

```typescript
import http from 'node:http';
import fs from 'node:fs';
import { counter } from './components/counter.js';
//                                              ^^^
//                              ESMでは拡張子.jsが必要(後述)

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
        <button id="counter">Count: ${initialState.count}</button>
        ${counter(initialState.componentCount)}
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

### 3. `src/client.ts`(修正)

`component-counter` 用のイベントも追加:

```typescript
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

// 既存のカウンター
const btn = document.getElementById('counter')!;
let count = window.__INITIAL_STATE__.count;
btn.addEventListener('click', () => {
  count++;
  btn.textContent = `Count: ${count}`;
});

// コンポーネント版カウンター
const componentBtn = document.getElementById('component-counter')!;
let componentCount = window.__INITIAL_STATE__.componentCount;
componentBtn.addEventListener('click', () => {
  componentCount++;
  componentBtn.textContent = `Count: ${componentCount}`;
});
```

---

## 注意ポイント: import の拡張子

`package.json` で `"type": "module"` を指定しているので、Node.jsはESM(ES Modules)として動く。ESMでは**相対パス import に拡張子が必須**。

```typescript
// ❌ NG (ESMでは動かない)
import { counter } from './components/counter';

// ✅ OK (TypeScriptでも .js と書く)
import { counter } from './components/counter.js';
```

「実際のファイルは `counter.ts` なのに `.js` と書く」のが最初は違和感あるが、TypeScriptの仕様。`tsx` がよしなに解決してくれる。

---

## 動作確認

```bash
npm run build:client   # client.ts を再ビルド
# tsx watch がサーバーを自動再起動
```

ブラウザをリロードすると、ボタンが2つ並んで表示される:

- 上のボタン: 5 から開始
- 下のボタン: 10 から開始

それぞれ独立してカウントアップすれば成功。

---

## 今のコードの「気になるところ」

`client.ts` を眺めると、**ほぼ同じコードが2回書かれている**ことに気づく。カウンターを10個置いたらどうなるか…考えるとゾッとする。

```typescript
// 既存のカウンター
const btn = document.getElementById('counter')!;
let count = window.__INITIAL_STATE__.count;
btn.addEventListener('click', () => {
  count++;
  btn.textContent = `Count: ${count}`;
});

// コンポーネント版カウンター ← ほぼ同じパターン
const componentBtn = document.getElementById('component-counter')!;
let componentCount = window.__INITIAL_STATE__.componentCount;
componentBtn.addEventListener('click', () => {
  componentCount++;
  componentBtn.textContent = `Count: ${componentCount}`;
});
```

これが次の改善ポイント。フレームワークが解決している問題そのもの。

---

## 次のステップの選択肢

### 1. ハイドレーション関数をコンポーネント側に持たせる

`counter.ts` に `render` と `hydrate` を両方定義して、コンポーネントが自分のことを知っている形にする。前に話した「選択肢B」の発展。

### 2. `data-component` 属性でディスパッチ

HTMLに `<div data-component="counter" data-props='{"count":10}'>...</div>` のように書いて、クライアント側が自動で対応するハイドレーション関数を呼ぶ仕組み。本物のフレームワークに近い。

**おすすめは 1 → 2 の順**。1 でコンポーネントが「自分のレンダリングとハイドレーションを知っている」状態を作ってから、2 で「それを自動的に呼び出す仕組み」を作ると、フレームワーク設計の考え方が腑に落ちる。
