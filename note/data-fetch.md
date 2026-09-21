# データフェッチ(サーバー側でAPIから取得してSSR)

サーバー側で `render` するときに、APIから取得したデータをHTMLに埋め込むステップ。SSRの**主役機能**。Next.jsの `getServerSideProps` などがやっていることの核。

## このステップで作るもの

- 新しいページ `/users` を追加
- ページの `render` を `async` にする
- 中で `https://jsonplaceholder.typicode.com/users` を fetch
- 取得したユーザー一覧をHTMLに埋め込む
- ヘッダーに `/users` へのリンクを追加

---

## 実装

### 1. `src/pages/users.ts`(新規作成)

```typescript
type User = {
  id: number;
  name: string;
  email: string;
  username: string;
};

export async function render(): Promise<string> {
  const res = await fetch('https://jsonplaceholder.typicode.com/users');
  const users: User[] = await res.json();

  return `
    <h1>Users</h1>
    <p>JSONPlaceholderから取得したユーザー一覧です。</p>
    <ul>
      ${users
        .map(
          (user) => `
        <li>
          <strong>${user.name}</strong> (@${user.username}) - ${user.email}
        </li>
      `
        )
        .join('')}
    </ul>
  `;
}
```

ポイント:

- `render` が `async` になった → 戻り値の型は `Promise<string>`
- `fetch` → `res.json()` の2段階await
- `users.map(...).join('')` で配列をHTML文字列に変換
  `.join('')` を忘れると、配列がそのまま文字列化されて `,` が入って表示が壊れるので注意。

### 2. `src/server.ts`(修正)

ルートテーブルに `/users` を追加。`render` が `async` になったので、**関数の型と呼び出し方が変わる**:

```typescript
import * as usersPage from './pages/users.js';

// ルートテーブル: 関数の戻り値が Promise<string> | string の両方あり得る
const routes: Record<string, () => string | Promise<string>> = {
  '/': homePage.render,
  '/about': aboutPage.render,
  '/users': usersPage.render
};

const server = http.createServer(async (req, res) => {
  // ← async
  // ...

  // SPA用: /_page?path=...
  if (req.url?.startsWith('/_page')) {
    // ...
    res.setHeader('Content-Type', 'text/html');
    return res.end(await pageRender()); // ← await
  }

  // 通常のルーティング
  const pageRender = routes[req.url ?? '/'];
  // ...
  res.setHeader('Content-Type', 'text/html');
  res.end(layout(await pageRender())); // ← await
});
```

重要な変更点は3つ:

- `createServer(async (req, res) => {...})` — コールバック関数を `async` に
- `routes` の型を `() => string | Promise<string>` に変更 — 両方受け入れる
- `pageRender()` を呼ぶ2箇所に `await` を追加
  `homePage.render` は同期関数(`string` を返す)、`usersPage.render` は非同期(`Promise<string>`)、と混在するが、**awaitは同期関数にかけても問題なく動く**(即座に値が返るだけ)。なので全部 `await` で統一できて便利。

### 3. `src/layout.ts`(修正)

ナビゲーションに `/users` へのリンクを追加:

```typescript
<nav>
  <a href="/">Home</a> | <a href="/about">About</a> | <a href="/users">Users</a>
</nav>
```

---

## 動作確認

```bash
npm run build:client
```

ヘッダーの「Users」をクリック、または `http://localhost:3000/users` に直接アクセス。10人分のユーザー情報が一覧表示される。

---

## SSRのすごさを体感する

### 1. HTMLソースを見る

`/users` ページで右クリック → 「ページのソースを表示」。

**HTMLの中に10人のユーザー情報が既に入っている**のが見える。「JSが実行される前からデータが入っている」= SSRの証拠。

比較のために、普通のReact SPAのHTMLソースを見ると `<div id="root"></div>` だけだったりする。全然違う。

### 2. JavaScriptを無効化してリロード

DevTools → Settings → Debugger → Disable JavaScript → リロード。

**JS無効でもユーザー一覧が表示される**。SSRなのでHTML自体にデータが含まれているから。**SEOに強い理由がこれ**。

### 3. Networkタブでリクエストを見る

Networkタブを開いた状態で `/users` にアクセス。ブラウザから見えるのは:

- `users`(HTMLドキュメント)
- `client.js`
  **JSONPlaceholderへのリクエストは見えない**。それはサーバー側で起きているので。「ブラウザから見ると1リクエストで完結」という説明の実物。

### 4. SPA遷移でも動く

Home ページから「Users」リンクをクリック → 画面が白くならずに切り替わる(SPA遷移)。Networkタブに `_page?path=/users` が飛ぶ。サーバー側で fetch されて、中身が返ってくる。

サーバー側の変更(`await pageRender()`)のおかげで、SPA遷移でも fetch が実行されて、正しく users 一覧が表示される。

---

## SSRとCSRの違い(体験ベース)

### 普通のCSR(クライアントレンダリング)

```
1. ブラウザ: 空のHTMLをサーバーから取得
2. ブラウザ: JSを実行して初めて fetch('https://...')
3. ブラウザ: fetchの結果でDOMを更新
```

- 3ステップかかる
- JS実行前はコンテンツが空
- SEOも弱い

### 今回作ったSSR

```
1. ブラウザ: サーバーにHTMLを要求
2. サーバー: 内部で fetch → HTMLに埋め込む → 返す
3. ブラウザ: 既にコンテンツ入りのHTMLを受け取る
```

- **ブラウザから見ると1回のリクエストで完結**
- ネットワークのラウンドトリップが減る
- 検索エンジンも中身が読める
  これがSSRの本領。

---

## 学びのポイント

### 1. `render` が `async` になる連鎖

`render` を async にすると、それを呼ぶ側(server.ts)も async にする必要が出てくる。「**async は伝染する**」と呼ばれる現象。関数のシグネチャの変更は上流に波及する。

TypeScript/JavaScriptで非同期処理を扱うときの重要な感覚。「ここを非同期にすると、呼び出し元も全部非同期になっていく」。

### 2. サーバーがネットワークの主体になる

これまで「サーバーはHTMLを組み立てて返すだけ」だったのが、「サーバーが他のAPIを呼び出す」役割を持つように。**これがバックエンド開発の入り口**。

### 3. `string | Promise<string>` のユニオン型

```typescript
const routes: Record<string, () => string | Promise<string>> = { ... };
```

同期関数と非同期関数が混在するとき、戻り値をユニオン型にすることで両方受け入れる。`await` は両方に使えるので、呼び出し側は統一的に書ける。

### 4. データがまだ「ストア」に入っていない

今回のusersは**ページのrender時だけ存在**していて、クライアントには「HTMLとして」しか届いていない。データ構造としては保持されていない。

これはこれで正しい設計(ただ表示するだけならこれで十分)。もし「クライアント側でusersを操作したい(ソート、フィルター)」となると、データ構造を`__INITIAL_STATE__`のような形で埋め込む必要が出てくる。これが**「hydration の本来の意味」**でもある。

Step 1で学んだ `__INITIAL_STATE__` の話が、ここで再び意味を持つ。

---

## Node.js の `fetch`

Node.js 18以降なら、標準で `fetch` が使える。TypeScriptでも型定義がついているのでそのまま呼べる。

古いNodeを使っているなら `undici` などが必要だが、今どき18未満は稀。

---

## Next.jsとの対応

今回の実装は、Next.jsの `getServerSideProps` に近い:

```typescript
// Next.js
export async function getServerSideProps() {
  const res = await fetch('...');
  const data = await res.json();
  return { props: { data } };
}
```

```typescript
// 今回の実装
export async function render(): Promise<string> {
  const res = await fetch('...');
  const users: User[] = await res.json();
  return `<ul>...</ul>`;
}
```

違いは:

- Next.jsは「データを取ってpropsに渡す」→ Reactコンポーネントが描画
- 今回は「データを取ってそのままHTML文字列を作る」
  でも**「サーバー側でrender時にデータを取得する」という核心の考え方は同じ**。

---

## このステップで得たもの

### 1. SSRの主役機能

「サーバーがデータを取得してHTMLに埋め込む」というSSRの本質を体験。JS実行前からコンテンツが存在するHTMLが返される。

### 2. `async` の伝染

関数を非同期にすると、呼び出し元も非同期にする必要がある。この波及効果を体験。

### 3. サーバーの新しい役割

「HTMLを返すだけ」から「他のAPIを叩いて、その結果を加工してHTMLを返す」という役割へ拡張。バックエンド寄りの発想。

### 4. SEO/初期表示に強い理由

HTMLを見れば「なぜSSRがSEOに強いのか」が体感できる。データが最初からHTMLに入っている。

---

## ハマりそうなポイント

- **`.join('')` 忘れ** — 配列がそのまま文字列化されて `,` が入る
- **`await` 忘れ** — `Promise<string>` がそのままHTMLに埋め込まれて `[object Promise]` になる
- **Node.jsバージョン** — 18未満だと `fetch` が使えない

---

## ここまでの到達点

```
Step 1: ハイドレーションの最小実装
Step 2-3: コンポーネント化
Step 4: data-component で自動ディスパッチ
Step 5: propsの型安全化
Step 6: ルーティング(MPA)
Step 7: SPA化
Step 8: クリーンアップ機構
Step 9: 状態管理(共有ストア)
Step 10: 汎用ストア(createStore)
Step 11: selectorパターン
Step 12: データフェッチ ← 今ここ
```

これでSSRフレームワークの主要機能が一通り揃った状態。**「サーバーが何でも作れる」**という感覚が身についた。

---

## 次のステップ候補

- **shallow-equal** — オブジェクト型のselector対応。参照の等価性の落とし穴を解決
- **動的ルート** — `/users/:id` のようなパラメータ付きURL(今回作ったusersと相性抜群)
- **データをクライアントに引き渡す** — サーバーで取得したデータをストアに入れて、ハイドレーション後もクライアントで操作できるように
- **仮想DOM自作** — 差分更新の仕組み(難易度高)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
