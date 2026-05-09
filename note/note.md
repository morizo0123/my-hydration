# ハイドレーション学習ノート

Node.js + TypeScript + Vite で SSR / ハイドレーションの最小実装を作る学習記録。

## ハイドレーションとは

サーバーで生成した静的HTMLに、クライアント側でJavaScriptのイベントリスナーや状態を「後付け」して、インタラクティブにする仕組み。React / Next.js / Nuxt などがやっていることを、最小構成で再現できる。

---

## プロジェクト構成（A案: Viteはクライアントビルドのみ）

Viteには2つの使い方があるが、学習目的なら **クライアント側のバンドラとしてだけ使う** A案がおすすめ。

- サーバーは自前の `http` で書く
- Viteは `client.ts` をビルドして `client.js` を出力するだけ
- ハイドレーションの仕組みに集中できる

### ファイル構成

```
my-hydration/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── server.ts        # SSRサーバー（自前のhttpサーバー）
│   └── client.ts        # ハイドレーション用（Viteがビルド）
└── dist/
    └── client.js        # Viteが出力（gitignore対象）
```

### セットアップ手順

`npm create vite@latest` で Vanilla TS テンプレートを作成し、以下を追加インストール:

```bash
npm install -D tsx @types/node
```

- **`tsx`** — `server.ts` を直接実行＋ウォッチするため
- **`@types/node`** — `http`, `fs` などNode標準モジュールの型定義

`vite` と `typescript` はテンプレートに既に入っているので不要。

### 削除するファイル

Vanilla TS テンプレートのうち以下は不要:

```
src/main.ts
src/style.css
src/typescript.svg
src/counter.ts
index.html
public/
```

---

## 各ファイルの中身

### `package.json`

```json
{
  "type": "module",
  "scripts": {
    "build:client": "vite build",
    "watch:client": "vite build --watch",
    "dev:server": "tsx watch src/server.ts",
    "dev": "npm run build:client && npm run dev:server"
  }
}
```

### `vite.config.ts`

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'src/client.ts',
      output: {
        entryFileNames: 'client.js',
        format: 'iife' // ブラウザでそのまま動く形式
      }
    }
  }
});
```

### `src/server.ts`

```typescript
import http from 'node:http';
import fs from 'node:fs';

const server = http.createServer((req, res) => {
  console.log('request:', req.url);

  if (req.url === '/client.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(fs.readFileSync('./dist/client.js'));
  }

  const initialState = { count: 5 };
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <button id="counter">Count: ${initialState.count}</button>
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

### `src/client.ts`

```typescript
interface InitialState {
  count: number;
}

declare global {
  interface Window {
    __INITIAL_STATE__: InitialState;
  }
}

console.log('hydrating with:', window.__INITIAL_STATE__);

const btn = document.getElementById('counter')!;
let count = window.__INITIAL_STATE__.count;

btn.addEventListener('click', () => {
  count++;
  btn.textContent = `Count: ${count}`;
});
```

---

## 実行

```bash
npm run build:client   # client.ts → dist/client.js
npm run dev:server     # http://localhost:3000
```

`client.ts` を変更したら再ビルドが必要。`npm run watch:client` を別ターミナルで起動しておくと自動再ビルドされて便利。

---

## なぜ初期状態を渡す必要があるのか（重要ポイント）

学習の最初に書いたコードは、サーバー側とクライアント側で `count = 0` を**二重管理**していた:

```javascript
// server.ts
const count = 0;

// client.ts（旧）
let count = 0;
```

これだとサーバー側を `count = 5` にしたとき、HTMLには「Count: 5」と表示されるが、クリックすると突然「Count: 1」になる。これがハイドレーションのバグの典型例。

**対処法**: サーバーが決めた初期状態をHTMLに埋め込んでクライアントが読む。

```html
<script>
  window.__INITIAL_STATE__ = { count: 5 };
</script>
```

これで **サーバーが「真実の源」** になる。Next.js などの `__NEXT_DATA__` も同じ仕組み。

---

## リクエストの流れ

ページを開くと以下のリクエストが発生する:

```
request: /
request: /client.js
request: /favicon.ico                                       ← ブラウザの自動取得
request: /client.js                                         ← DevTools関連
request: /.well-known/appspecific/com.chrome.devtools.json  ← Chrome DevToolsの設定探索
```

ハイドレーションに関係するのは最初の2つだけ。残りはブラウザ（特にChrome DevTools）の都合で発生するもの。

### 1回目: `/` へのリクエスト

- ブラウザ → サーバー: 「`/` ください」
- サーバー: HTMLを文字列で生成して返す
- ブラウザ: 受け取ったHTMLをパースして画面に描画
  - この時点で「Count: 5」のボタンが表示される（**SSR完了**）
  - HTMLの中に `<script src="/client.js">` を見つける
  - インラインの `<script>window.__INITIAL_STATE__ = ...</script>` も実行（変数がセットされる）

### 2回目: `/client.js` へのリクエスト

- ブラウザ → サーバー: 「`/client.js` もください」
- サーバー: `if (req.url === '/client.js')` の分岐に入る
- サーバー: `fs.readFileSync('./dist/client.js')` で**ファイルを読んで中身を返すだけ**
- ブラウザ: 受け取ったJavaScriptを実行
  - `getElementById('counter')` でボタンを取得
  - `addEventListener('click', ...)` でクリックハンドラを登録（**ハイドレーション完了**）

### ポイント

サーバー側の `fs.readFileSync('./dist/client.js')` は**ファイルの中身をテキストとして読み込んでいるだけ**で、Node.js側でJavaScriptを実行しているわけではない。読み込んだテキストをHTTPレスポンスのボディとしてブラウザに送り、それを受け取ったブラウザが「これはJavaScriptだ」と認識して実行する。

サーバーの仕事は「**HTMLを作って渡す**」と「**JSファイルを読んで渡す**」の2つだけ。

---

## `declare global` と `Window` の役割

`client.ts` で以下のように書いている:

```typescript
declare global {
  interface Window {
    __INITIAL_STATE__: InitialState;
  }
}
```

### `Window` はどこで使われているか

```typescript
let count = window.__INITIAL_STATE__.count;
//          ^^^^^^
//          ここ！
```

`window` はブラウザ環境のグローバルオブジェクトで、TypeScriptの型システム上では **`Window` インターフェース型** として定義されている。

### なぜ `declare global` が必要か

`Window` インターフェースはTypeScriptが標準で持っている型定義（`lib.dom.d.ts`）に書かれていて、`document`、`location`、`alert` などのお馴染みのプロパティが定義されている。

しかし `__INITIAL_STATE__` は**自分が勝手に追加したプロパティ**なので、標準の `Window` 型には存在しない。そこで:

```typescript
declare global {
  interface Window {
    __INITIAL_STATE__: InitialState;
  }
}
```

と書いて、**標準の `Window` インターフェースに後付けでプロパティを追加**している。これはTypeScriptの「インターフェースのマージ（Declaration Merging）」という機能で、同じ名前のインターフェースは自動的に合体される。

### 動作への影響

`declare global` は**TypeScriptの型チェックのためだけ**のもの。ビルド後の `dist/client.js`（実際のJavaScript）からは消えている。TypeScriptの型情報はビルド時に全部消えるため。

| 項目                                          | 役割                                             |
| --------------------------------------------- | ------------------------------------------------ |
| `window.__INITIAL_STATE__`                    | 実行時に値を取得（JavaScript）                   |
| `declare global { interface Window { ... } }` | 上の行を型エラーにしないための宣言（TypeScript） |

---

## ハマったポイント

### 1. `Cannot read properties of null (reading 'addEventListener')` エラー

`getElementById('counter')` が `null` を返したというエラー。原因は `dist/client.js` の中身が古かった（最初の `console.log` だけのバージョンのまま）。

**対処**: `npm run build:client` で再ビルド + ブラウザのハードリロード（Cmd+Shift+R / Ctrl+Shift+R）。それでも直らないときはサーバーを再起動。

### 2. `tsx watch` はサーバー側のみ監視

`tsx watch src/server.ts` は `server.ts` の変更しか検知しない。`client.ts` を変更したら別途 `vite build` する必要がある。`npm run watch:client` を別ターミナルで起動しておくのが楽。

### 3. ログをクリーンにしたい

`favicon.ico` や `.well-known/...` のリクエストノイズが気になる場合、サーバー側で早めに弾く:

```typescript
if (req.url === '/favicon.ico' || req.url?.startsWith('/.well-known/')) {
  res.writeHead(204);
  return res.end();
}
```

---

## 動作確認の体感ポイント

### SSRとハイドレーションの違いを見る

DevTools → Settings → Debugger → Disable JavaScript にチェック → リロード。
ボタンは表示されるけどクリックしても反応しない状態が見られる。「SSRはできているがハイドレーションされていない」状態。

### サーバーが真実の源になっていることを確認

`server.ts` の `count: 5` を `count: 100` に変えてリロード。「Count: 100」から始まる。クライアント側のコードは一切触っていないのに動作が変わる = サーバーが真実の源になっている証拠。

### ハイドレーションのミスマッチを起こしてみる

わざと `client.ts` の初期値だけを別の値（例: `let count = 999`）にしてみる。表示は「Count: 5」のまま、でも1回目のクリックで「Count: 1000」に飛ぶ。これがReactなどが警告を出す「hydration mismatch」の正体。

---

## 次のステップ候補

- **propsをDOMに埋め込む** — `data-props='{"count":5}'` のように要素ごとに初期値を持たせる
- **複数コンポーネント対応** — `data-component="counter"` でディスパッチする仕組み
- **仮想DOM自作** — 差分更新の最適化を体験
- **Viteの本格SSRモード（B案）** — HMRやモジュール変換をViteに任せる
