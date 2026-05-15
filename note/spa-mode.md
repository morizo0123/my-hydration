# SPA化(MPA/SPA切り替え対応)

クライアントサイドナビゲーションを実装して、滑らかなページ遷移を実現するステップ。`config.ts` でMPA/SPAを切り替えられるようにして、両方の違いをコードレベルで比較できる。

## このステップで作るもの

- **`config.ts`** でMPA/SPAを切り替え
- **サーバーに `/_page` エンドポイント追加** — ページの中身だけを返す
- **クライアントで `<a>` クリックを横取り** — `fetch` でページ取得 → DOM部分更新
- **`<main>` の中身だけ書き換え** — ヘッダー/フッターは維持

---

## 設計の方向性

### 方向性1: クライアント側のリンク挙動だけ切り替える ← **今回採用**

サーバーは今のままMPAとして動作。クライアント側で:

- **MPAモード**: 何もしない → `<a>` タグはブラウザ標準の遷移
- **SPAモード**: `<a>` クリックを横取りして `fetch` でページ取得 → DOM部分更新

### 方向性2: サーバーがHTMLとJSONの両方を返せるようにする(本格的・発展)

- 通常リクエスト: HTML全体を返す
- SPAナビゲーション時: 中身だけJSONで返す

学習の流れとして方向性1から始めるのがスムーズ。

---

## 実装

### 1. `src/config.ts`(新規作成)

```typescript
export const MODE: 'MPA' | 'SPA' = 'SPA';
```

たったこれだけ。ここを `'MPA'` に変えれば従来通りの動作に戻る。

Viteがビルド時にこの値を `client.js` に焼き込むので、ランタイムでの判定オーバーヘッドゼロ。

### 2. `src/server.ts`(修正)

`/_page` エンドポイントを追加:

```typescript
import http from 'node:http';
import fs from 'node:fs';
import { layout } from './layout.js';
import * as homePage from './pages/home.js';
import * as aboutPage from './pages/about.js';

const routes: Record<string, () => string> = {
  '/': homePage.render,
  '/about': aboutPage.render
};

const server = http.createServer((req, res) => {
  console.log('request:', req.url);

  if (req.url === '/client.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(fs.readFileSync('./dist/client.js'));
  }

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
      return res.end('<h1>404 Not Found</h1>');
    }

    res.setHeader('Content-Type', 'text/html');
    return res.end(pageRender()); // ← layout で包まない。中身だけ
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
```

ポイント:

- `/_page?path=/about` のようなリクエストには **`<main>` の中身だけ** を返す(`layout()` で包まない)
- 通常のリクエスト(`/`, `/about`)は今まで通りフルHTMLを返す → 初回アクセスやリロード時はSSRが効く

### 3. `src/client.ts`(大幅修正)

```typescript
import * as counter from './components/counter.js';
import * as simpleCounter from './components/simpleCounter.js';
import * as timer from './components/timer.js';
import { MODE } from './config.js';

const components = {
  counter,
  simpleCounter,
  timer
} as const;

type ComponentName = keyof typeof components;

// 指定した要素配下のコンポーネントを全部ハイドレート
function hydrateAll(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-component]').forEach((el) => {
    const name = el.dataset.component as ComponentName;
    const props = JSON.parse(el.dataset.props ?? '{}');

    const component = components[name];
    if (!component) {
      console.warn(`Unknown component: ${name}`);
      return;
    }

    console.log(`hydrating: ${name}`, props);
    component.hydrate(el, props);
  });
}

// SPAナビゲーション: ページの中身だけ差し替えてハイドレート
async function navigate(path: string): Promise<void> {
  console.log(`navigating to: ${path}`);

  const res = await fetch(`/_page?path=${encodeURIComponent(path)}`);
  const html = await res.text();

  const main = document.querySelector('main')!;
  main.innerHTML = html;

  history.pushState({}, '', path);
  hydrateAll(main);
}

// <a> クリックを横取りする
function setupClientSideNavigation(): void {
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const link = target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || !href.startsWith('/')) return; // 外部リンクは横取りしない

    e.preventDefault();
    navigate(href);
  });

  // ブラウザの戻る/進むボタンに対応
  window.addEventListener('popstate', () => {
    navigate(location.pathname);
  });
}

// --- 初期化 ---
console.log(`mode: ${MODE}`);

hydrateAll(document);

if (MODE === 'SPA') {
  setupClientSideNavigation();
}
```

ポイント:

- `hydrateAll(root)` を関数化 → 初回ロード時(`document` 全体)とSPA遷移時(`main` 配下)の両方で再利用
- `navigate(path)` で「fetch → DOM差し替え → URL更新 → 再ハイドレート」の流れ
- `popstate` イベントで戻る/進むボタンにも対応

---

## SPAモードの動きの内訳

```
1. <a href="/about">About</a> をクリック
   ↓
2. クライアントの click ハンドラが e.preventDefault()
   → ブラウザのデフォルト遷移を止める
   ↓
3. fetch('/_page?path=/about')
   → サーバーが <main> の中身だけを返す
   ↓
4. main.innerHTML = html
   → DOMの一部だけ書き換え(ヘッダー/フッターは無事)
   ↓
5. history.pushState({}, '', '/about')
   → URLバーの表示だけ変える(リロードは発生しない)
   ↓
6. hydrateAll(main)
   → 新しく挿入されたコンポーネントにイベントを付ける
```

---

## 動作確認

```bash
npm run build:client
```

### SPAモード(`MODE = 'SPA'`)

1. リンクをクリック → Networkに `_page?path=/about` のリクエストが飛ぶ
2. **画面が白くならずヘッダー/フッターは残ったまま**、`<main>` だけ切り替わる
3. URLは `/about` に変わっている
4. ブラウザの戻るボタンで Home に戻れる、しかも滑らか
5. Consoleに `navigating to: /about` と出る

### MPAモード(`MODE = 'MPA'` に変更してビルド)

1. リンクをクリック → Networkに `about` の `document` リクエスト
2. 画面が一瞬白くなって全体が再描画される

---

## 学んだこと

### `new URL()` でクエリパラメータを取り出す

```typescript
const url = new URL(req.url, 'http://localhost');
const path = url.searchParams.get('path') ?? '/';
```

- `req.url` はパス部分しかない文字列(例: `/_page?path=/about`)
- `URL` クラスは完全なURLを期待するので、第2引数にダミーのベースURL `'http://localhost'` を渡す
- `searchParams.get('path')` でクエリパラメータの値を取得
- `?? '/'` で取れなかったときのデフォルト値を指定(Null合体演算子)

手動で文字列パースするより堅牢で読みやすい。

### `fetch` のレスポンスから中身を取り出す `text()`

```typescript
const res = await fetch('/_page?path=/about');
const html = await res.text();
```

`fetch` の戻り値は「箱」(Responseオブジェクト)で、中身は形式に応じたメソッドで取り出す:

| メソッド            | 用途                               |
| ------------------- | ---------------------------------- |
| `res.text()`        | テキスト/HTML                      |
| `res.json()`        | JSON(パース済みオブジェクトで返る) |
| `res.blob()`        | 画像、ファイルなど                 |
| `res.arrayBuffer()` | バイナリ                           |

今回はサーバーがHTML文字列を返すので `text()`。`await` が2回必要なのは、ヘッダー取得とボディ取得が別タイミングの非同期処理だから。

### `closest('a')` で祖先要素を探す

```typescript
const link = target.closest('a');
```

クリックされた要素から**自分自身を含めて祖先方向に登って、最初に見つかった `<a>` を返す**。

なぜ必要か:

```html
<a href="/about">
  <span>About</span>  ← ここをクリックすると e.target は <span>
</a>
```

`e.target` は必ずしも `<a>` ではない。`<span>` や `<img>` がクリックされることもある。`closest('a')` を使えば、`<a>` の中のどこをクリックしても確実にリンク要素を取得できる。

将来HTMLが複雑になっても壊れない**堅牢な書き方**。

### `instanceof` による型ガード

```typescript
if (!(target instanceof HTMLElement)) return;
```

これは1行で2つの役割を果たしている:

1. **実行時の安全チェック**: `target` がHTML要素でなければ後続処理をスキップ
2. **TypeScriptの型ガード**: この行を通過したら、TypeScriptは `target` を `HTMLElement` として扱う

#### なぜ必要か

`e.target` の型は **`EventTarget | null`**。`EventTarget` には:

- `HTMLElement`(普通のHTML要素)
- `Document`、`Window`、`XMLHttpRequest`、`WebSocket` など

が含まれる。`closest()` メソッドは `Element` にしか存在しないので、`target` が `Document` や `Window` だと型エラーになる。

`instanceof HTMLElement` でチェックすると、それを通過した後はTypeScriptが自動的に型を絞り込んでくれる。

#### ガード節パターン

```typescript
if (!(target instanceof HTMLElement)) return;
// この行以降では target は HTMLElement として扱える
target.closest('a'); // ✅ エラーにならない
```

「異常ケース(HTMLElementじゃない)で早めに終わらせる」というガード節の書き方。ネストが深くならず、残りのコードは「正常な状態」だけ考えればよくなる。

実用上 `document.addEventListener('click', ...)` の `e.target` はほぼ必ずHTML要素だが、TypeScriptを満足させるための**お作法**として身につけておく。

---

## 何が学べたか

### 1. SSRとCSRの両立

- 初回アクセス時: サーバーがフルHTMLを返す(SSR) → SEO/速度に有利
- 以降の遷移: クライアント側でDOM部分更新(CSR) → 体験が滑らか

これが「ハイブリッドSSR」と呼ばれるNext.js等の動作モデル。

### 2. ハイドレーション関数の再利用

`hydrateAll()` を初回ロードでもSPA遷移後でも呼べるようにしたのが肝。「DOMが挿入されたらハイドレートする」という抽象が一段上がった。

### 3. `history.pushState` の存在

URLを変えるのに `location.href = ...` を使うとリロードが走ってしまう。SPAでは `pushState` で **URLだけ変える** のがミソ。

---

## 残された課題(発展)

- **scroll位置のリセット** — SPA遷移後、前ページのスクロール位置が残る → 必要なら `window.scrollTo(0, 0)` を入れる
- **タイマーのリーク** — `setInterval` がページ遷移後も生き続ける(timer.tsを置いたページから別ページに移ると、不可視のままタイマーが動き続ける可能性)
- **エラーハンドリング** — `fetch` 失敗時の処理が無い
- **JSON応答化** — 現状はHTMLを返しているが、Next.jsはJSONで返している。さらに最適化できる

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

Step 6: ルーティング(MPA)
  → 複数ページ + 共通レイアウト + リンク遷移。

Step 7: SPA化(MPA/SPA切り替え) ← 今ここ
  → クライアントサイドナビゲーション。
    config.tsで切り替え可能に。
    fetch + history.pushState + 部分ハイドレート。
```

---

## 次のステップ候補

- **タイマーリークの解決(クリーンアップ機構)** — `hydrate` が「解除関数」を返すようにする
- **動的ルート** — `/users/:id` のようなパラメータ付きルート
- **データフェッチ** — ページのrender時にDBやAPIから取得して埋め込む
- **仮想DOM自作** — 差分更新の仕組みを体験(難易度高め)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
