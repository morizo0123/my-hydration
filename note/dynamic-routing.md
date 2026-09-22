# 動的ルート(`/users/:id` のようなパラメータ付きURL)

前ステップの `/users` 一覧に、`/users/:id` のパラメータ付き詳細ページを追加するステップ。Web アプリの定番導線「一覧 → 詳細」を作る。Next.js や Express のルーターが内部でやっているパターンマッチの仕組みを自前で実装する。

## このステップで作るもの

- URLパターン `/users/:id` に対応するルーティング
- 一覧ページの各ユーザー名をリンクにして、クリックで詳細ページへ
- 詳細ページで `id` に応じたユーザー情報を fetch して表示
- 直接URLアクセスにもSSRで対応

---

## 設計の判断ポイント

### ルートの持ち方を変える必要がある

これまで `routes` は完全一致のオブジェクトだった:

```typescript
const routes: Record<string, () => string | Promise<string>> = {
  '/': homePage.render,
  '/about': aboutPage.render,
  '/users': usersPage.render
};
```

`/users/1`, `/users/2` のように**パラメータが変わる**URLは、この形では扱えない(`routes['/users/1']` は存在しない)。

### 選択肢

**(a) パターンマッチする文字列で保持** ← 採用

```typescript
const routes = [
  { pattern: '/', render: homePage.render },
  { pattern: '/users', render: usersPage.render },
  { pattern: '/users/:id', render: userDetailPage.render }
];
```

`:id` の部分を「何が入ってもいい」として扱い、実際のURLとマッチさせる。マッチしたら `id` の値を取り出す。Next.js / Express などが採用している方式。

**(b) 正規表現で保持** — より厳密だが、書きにくい。

---

## 実装

### 1. パスとパターンをマッチさせる関数

`src/matchRoute.ts`(新規作成):

```typescript
export type MatchResult = {
  params: Record<string, string>;
};

export function matchRoute(pattern: string, path: string): MatchResult | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  // パーツの数が違えばマッチしない
  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(':')) {
      // :id のようなパラメータ部分 → 何が入ってもOK、値を保存
      const paramName = patternPart.slice(1); // ':id' → 'id'
      params[paramName] = pathPart;
    } else if (patternPart !== pathPart) {
      // 静的な部分は完全一致が必要
      return null;
    }
  }

  return { params };
}
```

やっていること:

- パターンとパスをスラッシュで分割して比較
- `:name` で始まる部分は「何が入ってもいい」、実際の値を `params` に保存
- 静的な部分は完全一致を要求
- マッチしなかったら `null`

### 動作イメージ

```typescript
matchRoute('/users/:id', '/users/5');
// → { params: { id: '5' } }

matchRoute('/users/:id', '/users');
// → null (パーツの数が違う)

matchRoute('/users/:id', '/about');
// → null (静的部分 'users' と 'about' が違う)

matchRoute('/', '/');
// → { params: {} }
```

### 2. userDetail ページ

`src/pages/userDetail.ts`(新規作成):

```typescript
type User = {
  id: number;
  name: string;
  email: string;
  username: string;
  phone: string;
  website: string;
  company: { name: string };
  address: { city: string; street: string };
};

export async function render(params: Record<string, string>): Promise<string> {
  const res = await fetch(
    `https://jsonplaceholder.typicode.com/users/${params.id}`
  );

  if (!res.ok) {
    return `<h1>User not found</h1><p>id: ${params.id}</p>`;
  }

  const user: User = await res.json();

  return `
    <h1>${user.name}</h1>
    <p><a href="/users">← Users一覧に戻る</a></p>
    <ul>
      <li><strong>Username:</strong> @${user.username}</li>
      <li><strong>Email:</strong> ${user.email}</li>
      <li><strong>Phone:</strong> ${user.phone}</li>
      <li><strong>Website:</strong> ${user.website}</li>
      <li><strong>Company:</strong> ${user.company.name}</li>
      <li><strong>City:</strong> ${user.address.city}</li>
    </ul>
  `;
}
```

ポイント:

- `params.id` を受け取って fetch URL に埋め込む
- 存在しない id には 404 相当のメッセージ
- 一覧に戻るリンクを付ける
- **引数の型は `Record<string, string>`**(Routeとの整合性のため、詳細は後述)

### 3. `users.ts` を修正: 各ユーザー名をリンクに

```typescript
${users.map((user) => `
  <li>
    <a href="/users/${user.id}"><strong>${user.name}</strong></a>
    (@${user.username}) - ${user.email}
  </li>
`).join('')}
```

### 4. `server.ts` をルーター化

これが今回の一番大きな変更。オブジェクト形式から**配列 + パターンマッチ**に:

```typescript
import { matchRoute } from './matchRoute.js';
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
```

主な変更点:

- `routes` が **配列** に変更(パターンマッチが必要なので、順序が意味を持つ)
- `renderPath(path)` 関数を新設 — パスからマッチするルートを探して render を呼ぶ
- ルートの `render` は `params` を引数に取る形に統一

### 5. 既存ページも型を合わせる

`render` が `params` を受け取る形になったので、既存のページも型を合わせる:

```typescript
// home.ts / about.ts / users.ts
export function render(_params: Record<string, string>): string {
  // ...既存のまま
}
```

引数を使わなくても、`_` プレフィックスで「使わない」を明示。

---

## 動作確認

```bash
npm run build:client
```

1. `/users` で一覧、ユーザー名がリンクになっている
2. クリックで詳細ページに遷移(SPA遷移で滑らか)
3. 詳細ページに、そのユーザーの情報が表示される
4. 「← Users一覧に戻る」で戻れる
5. `/users/999` に直接アクセス → 「User not found」
6. `/users/1` を直接URLに入れてリロード → SSRで正しく表示 ← **SSRの真骨頂**

---

## 詳細解説1: `pathPart` は何でも取れる

「なんで数字が取れるの?」と気になったが、実は**何でも取れる**というのが正解。

```typescript
matchRoute('/users/:id', '/users/5'); // params.id = '5'
matchRoute('/users/:id', '/users/alice'); // params.id = 'alice'
matchRoute('/users/:id', '/users/abc-123'); // params.id = 'abc-123'
```

`:id` は「その位置に何が来てもいい」というワイルドカード。数字だけを許容しているわけではない。

`/users/hello` にアクセスすると:

- `matchRoute` は成功して `params.id = 'hello'`
- `fetch(...users/hello)` を実行
- JSONPlaceholder側で 404 → 「User not found」表示
  **matchRoute自体は成功している**。数字じゃなくても動く。

### 「マッチする」と「意味がある」は別

- `matchRoute` → URLの形をチェック
- `userDetail` → 実際に fetch して存在確認、無ければ404を返す
  責務が分かれているのが分かる。フレームワーク設計として綺麗な形。

---

## 詳細解説2: `split('/')` の性質

`/users/7` をスラッシュで分割すると:

```typescript
'/users/7'.split('/');
// → ['', 'users', '7']
```

先頭のスラッシュより前が空文字列 `''` になる。

```typescript
''.split('/'); // ['']
'/'.split('/'); // ['', '']
'/users'.split('/'); // ['', 'users']
'/users/'.split('/'); // ['', 'users', '']
'/users/7'.split('/'); // ['', 'users', '7']
'users/7'.split('/'); // ['users', '7']  ← 先頭に / が無ければ空文字列も無い
```

**セパレータが先頭にあれば、先頭に空文字列が入る**。末尾も同じ。

この性質のおかげで、URLをスラッシュで区切ると常に先頭が空文字列になる。だから今回の `matchRoute` では、パターンとパスの**先頭も比較対象**として扱われるが、両方が `''` なのでスルーされる。

---

## 詳細解説3: ループでのペア比較

```typescript
patternParts = ['', 'users', ':id'];
pathParts = ['', 'users', '7'];
```

`for (let i = 0; ...)` で同じインデックスで両方を取り出して比較:

```
インデックス:   0     1        2
patternParts: ['', 'users', ':id']
                              ↓ 同じ位置を見る
pathParts:    ['', 'users', '7'  ]
                              ↑ ここが取れる
```

- `i=0`: `''` vs `''` → 一致、スルー
- `i=1`: `'users'` vs `'users'` → 一致、スルー
- `i=2`: `':id'` は `:` で始まる → パラメータとして `params.id = '7'`
  「位置ごとにペアで見る」というシンプルな仕組み。

### `patternPart !== pathPart` の比較箇所

```typescript
if (patternPart.startsWith(':')) {
  // パラメータ
} else if (patternPart !== pathPart) {
  return null;
}
```

「違うなら弾く」というガード節。等しければ何もせずループの次の回へ(素通し)。これは **Step 7(SPA化)** でも出てきた「異常なケースで早めに終わらせる」パターンと同じ。

---

## 詳細解説4: TypeScriptの型エラー「定義しかしてないのになぜエラー?」

`Route` 型と `userDetail.render` の型が合わないとエラーになった:

```typescript
{ pattern: '/users/:id', render: userDetailPage.render }
// エラー: 型 '(params: Params) => Promise<string>' を型
//        '(params: Record<string, string>) => string | Promise<string>' に割り当てることはできません
```

「まだ呼んでないのに、なぜ?」という疑問が湧く。

### 「代入=約束」

TypeScriptから見ると、この行は:

**「このオブジェクトは `Route` 型のルールを守ります」という約束**

をしている。

### 「約束を守れるか」を先回りチェック

server.ts の別の場所で `route.render(match.params)` が呼ばれる。このとき:

- 呼ぶ側: `Record<string, string>` を渡す気(matchRouteが返す型)
- 受け取る側(userDetail): `{ id: string }` に限定した型を要求
  もし呼ぶ側が `{ postId: 'x' }` みたいなオブジェクトを渡したら、`params.id` は undefined になって壊れる。TypeScriptは **将来問題が起きる可能性のある代入を、事前に**弾いている。

### JavaScriptとの違い

- **JavaScript**: 実際に `params.id` を参照して `undefined` だった時点で初めてバグに気付く(ランタイムエラー)
- **TypeScript**: そもそも「そういう代入が可能な状況」を作らせない(コンパイル時にエラー)

### 修正方法

`userDetail.ts` の型を `Route` に合わせる:

```typescript
export async function render(params: Record<string, string>): Promise<string> {
  const id = params.id;
  // ...
}
```

「呼ぶ人が渡すつもりのものを、受け取る人はちゃんと処理できるか?」と考えれば直感的に分かる。

### 変性(variance)という概念

- **戻り値**は「狭い型に置き換え可能」— `string` を返す関数は、`string | number` を返す型に代入できる
- **引数**は「広い型に置き換え可能」— `Record<string, string>` を受け取る関数は、`{ id: string }` を受け取る型には代入できない
  今回のは後者。「呼ぶ側が広く渡す気なのに、受け取る側が狭く限定している」から代入NG。

---

## 学びのポイント

### 1. ルートテーブルは順序が意味を持つ

パターンマッチは配列を上から順に見ていくので、**具体的なパターンを先に置く**のが定石。例えば `/users/new` を追加したい場合、`/users/:id` より先に書かないと、`/users/new` が `id = 'new'` としてマッチしてしまう。

### 2. URLパラメータは常に文字列

`/users/5` の `5` は、URLの文字列としては `'5'`。JavaScriptで数値として使いたければ `Number(params.id)` で明示的に変換。HTTPプロトコルに「型」の概念が無いため。

### 3. SSRのシェアURL対応

`/users/1` を直接URLに入れてリロードしても、サーバー側で fetch → HTML 返す、が動く。**シェアされたURLがそのまま開ける**というのがSSRの強み。CSR-onlyだと、リンクを直接開いたときに空のHTMLが返ってブラウザが JS で fetch する、というワンテンポ遅い動きになる。

### 4. ページは params を受け取る形に統一

Next.jsの `getServerSideProps({ params })` と同じ発想。ページ関数は「URLからparamsを受け取って、HTMLを返す関数」という形に統一された。

### 5. 「制約はどの層で持つか」の設計判断

- URLレベル(matchRoute): 形の制約
- ページレベル(userDetail): データの存在確認
- APIレベル(JSONPlaceholder): 実際のデータ
  複数の層で少しずつバリデーションが積み重なっている。Webアプリでよくある構造。

---

## Next.js/Expressとの対応

| 今回の実装       | Next.js                          | Express                 |
| ---------------- | -------------------------------- | ----------------------- |
| `/users/:id`     | `/users/[id]`                    | `/users/:id`            |
| `matchRoute`     | ファイルベースで自動             | 内部のルーター          |
| `render(params)` | `getServerSideProps({ params })` | ハンドラの `req.params` |

書き方は違っても、**「URLからパラメータを取り出して、それを使ってページを組み立てる」**という考え方は同じ。

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
Step 12: データフェッチ
Step 13: shallow-equal
Step 14: 動的ルート ← 今ここ
```

これで「一覧 → 詳細」というWebアプリの定番導線が作れるようになった。**小さなNext.js**と言えるレベル。

---

## 次のステップ候補

- **データをクライアントに引き渡す**(次予定) — サーバーで取得したデータをストアに入れる。ハイドレーションの本領
- **フォーム/バリデーション** — ユーザー入力を扱う仕組み
- **仮想DOM自作** — Reactの内部構造(難易度高)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
- **クエリパラメータ対応** — `/users?sort=name` のような検索・フィルター
