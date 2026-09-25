# データをクライアントに引き渡す(ハイドレーションの本領)

サーバーで取得したデータを、HTMLとして表示しつつクライアント側のストアにも入れるステップ。**「hydration = 水を注ぐ」の本領**。乾いた(静的な)HTMLに、動く要素(JS+状態+データ)を注ぎ込んで生き返らせる。

Step 1 で使った `window.__INITIAL_STATE__` が、いよいよ本格的に活きる場面。

## このステップで作るもの

- サーバーで users を fetch → HTMLに埋め込む(今まで通り)
- **同じデータを `window.__INITIAL_STATE__` にも埋め込む**(新規)
- クライアント側でそれをストアに注入する(新規)
- クライアント側でストアを購読するコンポーネント(usersList)を作る
- 並び替えボタン(sortButtons)を作って、ストア経由で連携させる

---

## 全体のデータフロー

「Aliceのデータ」が旅する経路:

```
[JSONPlaceholderのサーバー]
         ↓ fetch
[自分のサーバー(users.ts の render)]
         ↓ この時点で users 配列を持っている
         ↓
   ┌─────┴──────┐
   ↓            ↓
 HTML用      JSON用
   ↓            ↓
[HTMLに埋め込む]  [<script>window.__INITIAL_STATE__.users = [...]]
   ↓            ↓
   └──────┬─────┘
          ↓ ブラウザに送信
[ブラウザが受け取る]
          ↓
   ┌──────┴──────┐
   ↓             ↓
[HTMLを表示]  [<script>実行]
                 ↓
           window.__INITIAL_STATE__.users にデータが入る
                 ↓
           [client.ts が起動]
                 ↓
           setUsers(window.__INITIAL_STATE__.users) を呼ぶ
                 ↓
           [usersStore の中身が users で満たされる]
                 ↓
           [hydrateAll(document) が動く]
                 ↓
           usersList と sortButtons が hydrate される
                 ↓
           ボタンクリック → setSortBy → ストア変化 → 再描画
```

**「サーバーで取得したデータを、HTMLとJSONの両方でブラウザに渡す。JSがそれをストアに入れて、以降はストアが真実の源になる」** というのがハイドレーションの核心。

---

## 実装

### 1. usersストア

`src/usersStore.ts`(新規作成):

```typescript
import { createStore } from './createStore.js';

export type User = {
  id: number;
  name: string;
  email: string;
  username: string;
};

type UsersState = {
  users: User[];
  sortBy: 'name' | 'email';
};

const store = createStore<UsersState>({
  users: [],
  sortBy: 'name'
});

export function getState() {
  return store.get();
}

// 初期化(サーバーから受け取ったデータをセット)
export function setUsers(users: User[]) {
  const current = store.get();
  store.set({ ...current, users });
}

// 並び替え
export function setSortBy(sortBy: 'name' | 'email') {
  const current = store.get();
  store.set({ ...current, sortBy });
}

// 並び替え後のusersを取得(派生データ)
export function getSortedUsers(): User[] {
  const { users, sortBy } = store.get();
  return [...users].sort((a, b) => a[sortBy].localeCompare(b[sortBy]));
}

export const subscribe = store.subscribe;
export const subscribeSelector = store.subscribeSelector;
```

### 2. `users.ts` ページ: HTMLとJSONの両方を埋め込む

```typescript
import { render as renderSortButtons } from '../components/sortButtons.js';
import { render as renderUsersList } from '../components/usersList.js';

export async function render(_params: Record<string, string>): Promise<string> {
  const res = await fetch('https://jsonplaceholder.typicode.com/users');
  const users: User[] = await res.json();

  const usersForClient = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username
  }));

  return `
    <h1>Users</h1>
    <p>JSONPlaceholderから取得したユーザー一覧です。</p>
    
    ${renderSortButtons({})}
    ${renderUsersList({ users: usersForClient })}
    
    <script>
      window.__INITIAL_STATE__ = window.__INITIAL_STATE__ || {};
      window.__INITIAL_STATE__.users = ${JSON.stringify(usersForClient)};
    </script>
  `;
}
```

ポイント:

- コンポーネントの `render` を import して呼ぶ(サーバー側でHTMLを生成)
- 同じデータを `<script>` タグでJSONとしても埋め込む
- `window.__INITIAL_STATE__ || {}` で既存の状態と共存

### 3. `usersList` コンポーネント: 購読して再描画

`src/components/usersList.ts`(新規作成):

```typescript
import type { Component } from '../types.js';
import { getSortedUsers, subscribe, type User } from '../usersStore.js';

export type Props = { users: User[] };

export const render: Component<Props>['render'] = (props) => {
  return `
    <ul data-component="usersList" data-props='${JSON.stringify(props)}'>
      ${props.users
        .map(
          (user) => `
        <li>
          <a href="/users/${user.id}"><strong>${user.name}</strong></a>
          (@${user.username}) - ${user.email}
        </li>
      `
        )
        .join('')}
    </ul>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const rerender = () => {
    const users = getSortedUsers();
    el.innerHTML = users
      .map(
        (user) => `
      <li>
        <a href="/users/${user.id}"><strong>${user.name}</strong></a>
        (@${user.username}) - ${user.email}
      </li>
    `
      )
      .join('');
  };

  const unsubscribe = subscribe(rerender);

  return () => {
    unsubscribe();
  };
};
```

### 4. `sortButtons` コンポーネント: イベント委譲でストアに指示

`src/components/sortButtons.ts`(新規作成):

```typescript
import type { Component } from '../types.js';
import { setSortBy } from '../usersStore.js';

export type Props = {};

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="sortButtons" data-props='${JSON.stringify(props)}'>
      <button data-sort="name">名前で並び替え</button>
      <button data-sort="email">メールで並び替え</button>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const handleClick = (e: Event) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const sort = target.dataset.sort as 'name' | 'email' | undefined;
    if (sort) {
      setSortBy(sort);
    }
  };

  el.addEventListener('click', handleClick);

  return () => {
    el.removeEventListener('click', handleClick);
  };
};
```

イベント委譲(親要素で子ボタンのクリックをまとめて受ける)を使っている。Step 7(SPA化)で `<a>` タグのクリックを親でハンドリングしたのと同じパターン。

### 5. `client.ts`: ストア初期化 → ハイドレート

```typescript
import * as usersList from './components/usersList.js';
import * as sortButtons from './components/sortButtons.js';
import { setUsers, type User } from './usersStore.js';

declare global {
  interface Window {
    __INITIAL_STATE__?: {
      users?: User[];
    };
  }
}

// ★ ハイドレートの前にストアに注入
if (window.__INITIAL_STATE__?.users) {
  console.log(
    'hydrating users store with',
    window.__INITIAL_STATE__.users.length,
    'users'
  );
  setUsers(window.__INITIAL_STATE__.users);
}

const components = {
  // ...既存のコンポーネント
  usersList,
  sortButtons
} as const;

// この後 hydrateAll(document) が呼ばれる
```

**「先にストアを満たしてから、コンポーネントをハイドレートする」** のがポイント。逆順だと余計な再描画が1回発生する。

---

## なぜ2箇所にデータを埋め込むのか

サーバーは users を:

1. HTMLに埋め込む(`<ul><li>Alice</li>...</ul>`)
2. JSONとしても埋め込む(`window.__INITIAL_STATE__.users = [...]`)

「無駄じゃない?」と感じるが、**用途が違うので両方必要**。

### ① HTML は「見せる」ため

- ブラウザに届いた瞬間、目に見える
- JSが実行される前でも表示される
- 検索エンジンも読める
- でも「Alice」というテキストがあるだけ。プログラムから見ると「文字」でしかない

### ② JSONは「操作する」ため

- ブラウザに届いても、目には見えない(`<script>`の中身なので)
- JSが実行されて初めて意味を持つ
- でも「id」「name」「email」というフィールドを持つ**構造化データ**として扱える
- 並び替え、フィルター、編集、追加、削除、といった操作ができる

### 片方だけだとどうなるか

**HTMLだけ(JSONなし)**:

- 表示は問題なし
- でも並び替えボタンを押しても、JS側に「usersのデータ」が無いので何もできない
- 「Alice の年齢を1歳増やす」みたいな操作も無理

**JSONだけ(HTMLなし)**:

- JS実行前は画面が空っぽ(SEO弱い、初期表示遅い)
- JSが実行されるまで、ユーザーは何も見えない
- 昔ながらのReact SPA(CSR)の弱点そのもの

**両方あるから**:

- 初期表示はHTMLで(速い、SEO強い)
- 以降の操作はJSONベースのデータで(動的、リッチ)

これがハイドレーションの一石二鳥。

### 比喩: 絵画と設計図

**HTMLは「絵画」、JSONは「設計図」**。

- 絵画だけ渡す → 「見せる」ことしかできない
- 設計図だけ渡す → 「見せる」までに時間がかかる
- 両方渡す → すぐ見せられて、後で改造もできる

### 業界の答え

サイズが2倍近くになるトレードオフはあるが:

- テキストデータなのでgzip圧縮で結構縮む
- 「JS実行前に何も見えない」体験を防げる
- 「JSがロードされる前に操作できない」機能遅延を防げる

Next.js も Nuxt も Remix も、みんなこれをやっている。「同じデータの重複」ではなく「**1つのデータを、用途に合った2つの表現でパッケージ**」と捉えると気持ち悪さが減る。

---

## ストアとコンポーネントの関係

### それぞれの役割

**ストアは「データを持つ人」**

- usersの配列を保管
- 並び替え基準を保管
- 「変更したい人」の指示を受け付ける(setUsers、setSortBy)
- 「変わったら教えて」という購読者に通知する

**コンポーネントは「DOMを操作する人」**

- 画面のある部分(ボタン、リスト)を担当
- ユーザーの入力(クリックなど)を受ける
- 画面を書き換える

### 依存は一方向

```
コンポーネント → ストア(依存)
コンポーネント ← ストア(依存されていない)
```

- **コンポーネントはストアを知っている**(importしている)
- **ストアはコンポーネントを知らない**(usersStore.tsの中にUIの話は一切出てこない)

これがReduxなどの状態管理ライブラリで貫かれている「**単方向データフロー**」の思想。

### なぜ一方向?

もしストアがコンポーネントを知っていたら:

```typescript
// もしストアがDOMを直接操作したら…
export function setSortBy(sortBy) {
  currentSort = sortBy;
  document.querySelector('ul').innerHTML = ...;  // ← ストアがDOMを触る
}
```

これだと:

- ストアが「usersは`<ul>`で表示される」という具体を知る必要がある
- 別の表示方法(表、カード)を追加したらストアを書き換えないといけない
- テストが難しい(DOMなしではストアが動かない)

だから**ストアは「変わったよ」と声をかけるだけ**にする。誰が声を拾って何をするかは、コンポーネント側の勝手。

### 3種類のコンポーネントの関わり方

- **入力側**(sortButtons): ストアを**変える**、変化は知らない → subscribe 不要
- **出力側**(usersList): ストアを**購読する**、変化に追従する → subscribe 必要
- **両方**(counter): 変えて、かつ購読する → 両方必要

「表示がストアに依存するコンポーネントは subscribe が必要、入力だけのコンポーネントは subscribe 不要」というルール。

### データの流れの図

```
[ユーザーがボタンをクリック]
        ↓
[sortButtons が click イベントを受ける]
        ↓
[sortButtons が setSortBy('email') をストアに指示]
        ↓
[ストアが状態を更新: sortBy = 'email']
        ↓
[ストアが subscribers 全員に「変わったよ」と通知]
        ↓
[usersList の rerender が呼ばれる]
        ↓
[usersList が getSortedUsers() で最新データを取得]
        ↓
[usersList が innerHTML で画面を書き換え]
```

**一方向にぐるっと回っている**。ユーザー入力 → 指示 → ストア → 通知 → 再描画。逆流しない。

---

## なぜ subscribe を使うのか

「直接使う」パターンだとこう:

```typescript
// もし subscribe が無かったら
export const hydrate = (el, _props) => {
  const users = getSortedUsers();
  el.innerHTML = users.map((u) => `<li>${u.name}</li>`).join('');
};
```

これだと**1回描画したら終わり**。ボタンを押してストアが変わっても、`usersList` は気づけない。

`subscribe` を使うと:

```typescript
export const hydrate = (el, _props) => {
  const rerender = () => {
    const users = getSortedUsers();
    el.innerHTML = users.map((u) => `<li>${u.name}</li>`).join('');
  };

  subscribe(rerender); // ← ストアに「変わったら rerender 呼んでね」と登録
};
```

**「変わったら教えて」を予約しておく仕組み**。それが subscribe。

### 郵便局と定期購読の例え

- **直接取得**: 手紙が届いたか、自分で郵便局に行って確認する
- **subscribe**: 「新聞が届いたら家に届けて」と登録しておく

`getSortedUsers` だけ呼ぶのは「取りに行く」パターン。1回取ったらそれっきり。
`subscribe(rerender)` は「定期購読」。ストアが変わったら勝手に `rerender` を呼んでくれる。

### `getXxx` と `subscribe` は両方必要

役割が違う:

- **`getSortedUsers`(値を取得する)** — 「今どうなってるか」を知る
- **`subscribe`(変化を購読する)** — 「変わったら教えて」を予約する

`rerender` の**中で** `getSortedUsers()` を呼ぶのがポイント:

```typescript
const rerender = () => {
  const users = getSortedUsers();  // ← 呼ばれた「その時」の最新値
  el.innerHTML = ...;
};

subscribe(rerender);  // ← 変わるたびに rerender が呼ばれる
```

**subscribeが呼び出しの「タイミング」を教えてくれて、getSortedUsersが「そのタイミングの値」を返す**。この組み合わせで、常に最新の値で画面を書き換えられる。

---

## `client.ts` の役割: 司令塔

`client.ts` は **「ブラウザ起動時にまずストアを満たして、そのあとページ内の全コンポーネントをハイドレートする司令塔」**。

### 実行順が重要

```
1. import 群(準備)
2. setUsers(...) でストア初期化 ← ここでデータが揃う
3. hydrateAll(document) でコンポーネント起動 ← ハイドレート時にストアが既に満たされている
```

もし逆順にすると:

```
1. hydrateAll(document) を先に呼ぶ ← usersList が subscribe するが、ストアは空
2. setUsers(...) でデータ注入 ← 通知が飛ぶ、usersList が再描画
```

これでも動くが、**「空 → データあり」で1回余計な再描画が発生**。今の順番なら余計な再描画が要らない。

「先にストアを準備してから、コンポーネントを起動する」というのは初期化の基本パターン。

### `window.__INITIAL_STATE__` の型宣言

```typescript
declare global {
  interface Window {
    __INITIAL_STATE__?: {
      users?: User[];
    };
  }
}
```

`?` が2箇所 = 「無いかもしれない」を型で表現。サーバーがこのプロパティを埋め込むかどうかはページによる。

### オプショナルチェイニング `?.`

```typescript
if (window.__INITIAL_STATE__?.users) { ... }
```

「`window.__INITIAL_STATE__` が存在すれば、その `users` を見る」。存在しなくてもエラーにならず、全体が undefined を返す。

`?.` を使わないと冗長:

```typescript
if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.users) { ... }
```

---

## 学びのポイント

### 1. HTMLとJSONの二重描画

同じデータを2回サーバーから送る。Next.js の `__NEXT_DATA__` もこれと同じ仕組み。

### 2. 初回SSRとその後の再描画

- 最初はSSRで表示(サーバー側で `usersList.render` の結果がHTMLに埋め込まれている)
- 並び替えボタンを押すと、クライアント側で `el.innerHTML` を書き換えて再描画
- **JSが実行される前でも一覧は見える**(SSR済み)
- JS実行後は動的に並び替えできる

これが「ハイブリッドSSR + CSR」の力。

### 3. `innerHTML` での再描画は雑

今回は `el.innerHTML = ...` で全体を書き換えている。動くが、これは**乱暴なやり方**:

- 描画のたびにDOM全体を作り直す
- ユーザーの操作(スクロール、テキスト選択など)が消える
- パフォーマンスが悪い

これを解決するのが **仮想DOM**(次の候補ステップ)。Reactが解決している問題そのもの。

### 4. データ層とUI層の分離

- `usersStore.ts`: データを持つ、更新する、購読させる
- `usersList.ts` / `sortButtons.ts`: DOMを操作する、ユーザー入力を受ける

ストアがUIを知らない、UIがストアを購読する、という一方向の依存関係。Reduxの思想と同じ。

### 5. 派生データ(computed)

`getSortedUsers()` は「usersとsortByから計算される派生データ」。毎回計算するのがシンプルだが、大きなデータだと重い。React Redux の `reselect` などが解決するのはこの問題。

### 6. subscribe と getXxx はセットで使う

- `getXxx` = 今の値を取る(スナップショット)
- `subscribe` = 変わったら呼ばれる関数を登録

「タイミング」と「値の取得」を分離するのがモダンな状態管理の基本パターン。

### 7. 「先にストアを満たしてから、コンポーネントをハイドレート」

初期化の順序が重要。データが揃った状態でコンポーネントを起動することで、余計な再描画を防げる。

---

## ハマったポイント

### renderSortButtons が空になる

最初、自作のヘルパー関数として書いてしまい、中身が空のdivだけ返っていた:

```typescript
// ❌ NG
function renderSortButtons(): string {
  return `<div data-component="sortButtons" data-props='{}'></div>`;
}
```

正しくはコンポーネントの `render` を使う:

```typescript
// ✅ OK
import { render as renderSortButtons } from '../components/sortButtons.js';
```

**コンポーネントはサーバーとクライアントで render を共有する**、というのがStep 3で作った設計。

---

## Reactとの対応

| 今回の実装                    | React (Next.js)                     |
| ----------------------------- | ----------------------------------- |
| `window.__INITIAL_STATE__`    | `__NEXT_DATA__`                     |
| `setUsers()` で初期化         | `getServerSideProps` の props       |
| `subscribe` で購読            | `useSelector`(裏で自動 subscribe)   |
| `getSortedUsers()`            | `useSelector((state) => ...)`       |
| `el.innerHTML = ...` で再描画 | 仮想DOMで差分更新(次のステップ候補) |

自前で作ったからこそ、Reactが何を隠しているかが見える状態。

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
Step 14: 動的ルート
Step 15: データをクライアントに引き渡す ← 今ここ
```

これで**ハイドレーションの本領を完全に体験した状態**。Next.jsやNuxtが内部でやっている「サーバーで取得したデータをクライアント側の状態管理に引き渡す」という核心機能を、自分の手で組み立てた。

---

## 次のステップ候補

- **仮想DOM自作** — `el.innerHTML = ...` の乱暴さを解決。Reactの内部構造(難易度高)
- **フォーム/バリデーション** — ユーザー入力を扱う仕組み
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
- **クエリパラメータ対応** — `/users?sort=name` で URL に状態を反映
- **ここで一区切り** — 積み上げてきたものを振り返る
