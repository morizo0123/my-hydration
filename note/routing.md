# ルーティング(複数ページ + リンク遷移)

複数ページに対応してリンク遷移できるようにするステップ。SSRフレームワークが「サイト」として機能するために必須の仕組み。

## このステップで作るもの

- **2ページ**: `/`(ホーム) と `/about`
- **共通レイアウト**: ヘッダー(ナビゲーション)とフッター
- **リンク遷移**: `<a href="/about">` でページ間を移動できる

リンク遷移は、最初は**普通の `<a>` タグでサーバーから新しいページを取得**する形(MPA: マルチページアプリケーション)。SPAライクな滑らかな遷移は次のステップで実装する。

---

## 設計の選択肢と方針

ルーティングの設計には複数の選択肢がある:

- **A. server.ts に if文でルーティング** — シンプルだが肥大化する
- **B. ルートテーブルを作る** — ページ単位でファイル分割しやすい ← **今回採用**
- **C. ファイルベースルーティング** — Next.js / Nuxt / Astro 方式。本格的

B案を採用する理由:

- A案は学習にならない(if文を並べるだけ)
- C案は「ファイルを自動で読み込む仕組み」が必要で、ハイドレーションとは別の話に脱線しがち
- B案は「ページもコンポーネントと同じ構造」と捉えられて、設計の一貫性が出る

---

## 実装

### 1. レイアウト関数を作る

**`src/layout.ts`**(新規作成):

```typescript
export function layout(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <title>My Hydration App</title>
      </head>
      <body>
        <header>
          <nav>
            <a href="/">Home</a> | <a href="/about">About</a>
          </nav>
        </header>
        <main>
          ${content}
        </main>
        <footer>
          <small>&copy; 2026 My Hydration App</small>
        </footer>
        <script src="/client.js"></script>
      </body>
    </html>
  `;
}
```

ポイント:

- `content` 引数にページの中身を受け取る
- ヘッダー(ナビ)とフッターを固定で挿入
- `<script src="/client.js">` もここに集約 → 全ページでハイドレーションが効く

### 2. ページコンポーネントを作る

ページもコンポーネントと同じ構造(`render` 関数を持つ)にする。

**`src/pages/home.ts`**(新規作成):

```typescript
import { render as renderCounter } from '../components/counter.js';
import { render as renderTimer } from '../components/timer.js';

export function render(): string {
  return `
    <h1>Home</h1>
    <p>ハイドレーションのデモページです。</p>
    ${renderCounter({ count: 10 })}
    ${renderTimer({ count: 0 })}
  `;
}
```

**`src/pages/about.ts`**(新規作成):

```typescript
import { render as renderSimpleCounter } from '../components/simpleCounter.js';

export function render(): string {
  return `
    <h1>About</h1>
    <p>このサイトは、Node.js + TypeScript + Vite でハイドレーションを学ぶ目的で作りました。</p>
    <p>このページにもコンポーネントを置けます:</p>
    ${renderSimpleCounter({ count: 100 })}
  `;
}
```

ページごとに使うコンポーネントが違うのがポイント。同じハイドレーションの仕組みで、ページごとに自由にコンポーネントを配置できる。

### 3. `src/server.ts` をルーター化

```typescript
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

  // ルーティング
  const pageRender = routes[req.url ?? '/'];

  if (!pageRender) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end(layout('<h1>404 Not Found</h1>'));
  }

  res.setHeader('Content-Type', 'text/html');
  res.end(layout(pageRender()));
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

ポイント:

- `routes` オブジェクトで「URL → ページのrender関数」をマッピング
- 該当するページがあれば `layout()` で包んで返す
- 無ければ404を返す(これも `layout()` で包む → ヘッダー/フッター付きの404になる)

### 4. `src/client.ts` は変更不要

クライアント側はそのままでOK。`data-component` 属性で自動ディスパッチする仕組みのおかげで、ページが変わってもコンポーネントが正しくハイドレートされる。これが前ステップまでに作った仕組みの威力。

---

## 動作確認

```bash
npm run build:client
```

以下を試す:

1. `http://localhost:3000/` → Homeページが表示される
2. ヘッダーの「About」をクリック → `/about` に遷移
3. About ページのカウンター(初期値100)が動く
4. ヘッダーの「Home」をクリック → 戻る
5. `http://localhost:3000/foo` → 404ページが表示される(でもヘッダー/フッターは付いている)

---

## MPAの動作を観察する

DevToolsの Network タブを開いた状態でリンクをクリックすると、ページ遷移のたびにサーバーにリクエストが飛んでいるのが見える。

### Networkタブで見えるもの

「About」リンクをクリックしたとき:

```
about           document    ← HTMLを取得(ページ遷移のリクエスト)
client.js       script      ← HTMLに含まれる <script src="/client.js"> で取得
favicon.ico     ...
```

最初の `about` がポイント。Typeが `document` になっていて、これは「ブラウザが新しいページ全体を取りに行った」という意味。

### サーバー側のログでも確認できる

ターミナルのサーバーログを見ると、リンクをクリックするたびにこういうログが流れる:

```
request: /about       ← HTMLの取得
request: /client.js   ← HTMLの中の <script> が読み込まれた
```

### MPA(マルチページアプリ)の特徴

この動きは古き良きWebサイトと同じ:

1. ユーザーがリンクをクリック
2. ブラウザがサーバーに新しいHTMLを要求
3. サーバーがHTMLを返す
4. ブラウザは現在のページを**完全に破棄**して、新しいHTMLを描画
5. HTMLに含まれる `<script src="/client.js">` を読み込んで実行
6. ハイドレーションが再び発生

ポイントは **4**。ページ全体が破棄されるので、画面が一瞬白くなったり、ヘッダーの位置までスクロールが戻ったりする。

### SPAとの違い

一方、Next.js などで普段感じる「滑らかなページ遷移」は **SPA(シングルページアプリ)** の挙動:

1. ユーザーがリンクをクリック
2. JavaScriptが**ブラウザのデフォルト動作を止める**(`event.preventDefault()`)
3. `fetch` で新しいページのコンテンツだけを取得
4. **現在のページを破棄せず**、`<main>` の中身だけを書き換える
5. URLは `history.pushState` で見た目だけ変える

これだと画面が白くならず、ヘッダーやフッターも維持されたまま中身だけが切り替わる。

### 実験

**実験1: Homeでカウンターを増やしてからリンク遷移**

1. Home ページでカウンターを「Count: 15」まで増やす
2. About をクリック
3. Home に戻る
4. カウンターが **「Count: 10」にリセットされている** ← ページが完全に破棄された証拠

**実験2: Network タブで「Doc」フィルタ**

Network タブの上部に「All / Doc / JS / ...」のフィルタがある。「Doc」を選ぶとHTMLのリクエストだけ見えるので、ページ遷移の動きが分かりやすい。

---

## 何が良くなったか

### 1. ページもコンポーネントと同じ構造

```typescript
// コンポーネント
export function render(props): string { ... }

// ページ
export function render(): string { ... }
```

ページも「`render` 関数を持つモジュール」として扱える。一貫した設計。

### 2. ルートの追加が簡単

新しいページ `/contact` を追加したいときの作業:

1. `src/pages/contact.ts` を作る(`render` 関数を export)
2. `server.ts` の `routes` に1行追加

これだけ。

### 3. レイアウトの変更が一箇所で済む

ヘッダーやフッターを変えたいときは `layout.ts` を編集するだけ。全ページに反映される。

---

## ここまでの到達点

```
Step 1: ハイドレーションの最小実装
  → サーバーでHTML生成 + クライアントでイベント付与

Step 2: コンポーネントを別ファイルに切り出す(選択肢A)
  → render関数だけを分離

Step 3: hydrateもコンポーネントに持たせる(選択肢B)
  → コンポーネントが自己完結

Step 4: data-component で自動ディスパッチ
  → __INITIAL_STATE__が不要に。同じコンポーネントを複数置けるように。

Step 5: propsの型安全化
  → サーバー・クライアント両方で型チェックが効くように。

Step 6: ルーティング(MPA) ← 今ここ
  → 複数ページ + 共通レイアウト + リンク遷移。
    ページもコンポーネントと同じ構造(render関数)で統一。
```

---

## 次のステップ候補

- **クライアントサイドナビゲーション(SPA化)** — `<a>` クリックを横取りして `fetch` でページを取得 → DOMを部分更新。滑らかな遷移体験。
- **動的ルート** — `/users/:id` のようなパラメータ付きルート
- **データフェッチ** — ページのrender時にDBやAPIから取得して埋め込む
- **イベント時の状態をサーバーに送る** — クリックで状態が変わったらサーバーに保存
- **仮想DOM自作** — 差分更新の仕組みを体験(難易度高め)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
