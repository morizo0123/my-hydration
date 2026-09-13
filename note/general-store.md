# 汎用ストア(`createStore<T>`)

前ステップで作った状態管理ストアは、`store.ts` と `messageStore.ts` でほぼ同じコードを2回書いていた。その共通部分を**ファクトリ関数**として抽出し、Redux/Zustandの最小版と言える構造にするステップ。

## このステップで作るもの

- **`createStore<T>(initial: T)`** — 新しいストアを作るファクトリ関数
- 既存の `store.ts` と `messageStore.ts` を書き換えて、この汎用ストアを使う形に
- コンポーネント側は**一切変更不要**

---

## 何を抽象化するか

前ステップの2つのストアを見比べると、構造が完全に同じ:

```typescript
// store.ts
let count = 0;                           // 状態
const listeners = new Set<Listener>();   // ← 全く同じ
export function getCount() { return count; }
export function increment() { ... }      // 状態を変える(専用)
export function subscribe(l) { ... }     // ← 全く同じ
```

```typescript
// messageStore.ts
let message = 'Hello';                   // 状態
const listeners = new Set<Listener>();   // ← 全く同じ
export function getMessage() { ... }
export function nextMessage() { ... }    // 状態を変える(専用)
export function subscribe(l) { ... }     // ← 全く同じ
```

共通しているのは **「状態を持つ」「変わったら通知する」「購読できる」** の3つ。違うのは **「状態の型」「どんな更新関数を用意するか」**。

汎用部分は「値の保管 + subscribe + 汎用の setter」だけ切り出して、専用の更新関数は使う側で書く、という設計にする。

---

## `createStore` の設計

戻り値のインターフェースを先に決めておく:

```typescript
const store = createStore(0);
store.get(); // 0
store.set(5); // 5にする + 通知
store.subscribe(fn); // 購読
```

シンプルだが、これだけあれば前ステップの2つのストアが両方作れる。

---

## 実装

### `src/createStore.ts`(新規作成)

```typescript
type Listener = () => void;

export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: Listener) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<Listener>();

  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
```

これだけ。`Store<T>` 型を export しておくと、使う側で型がきれいに扱える。

### `src/store.ts`(書き換え)

```typescript
import { createStore } from './createStore.js';

const countStore = createStore(0);

export function getCount(): number {
  return countStore.get();
}

export function increment(): void {
  countStore.set(countStore.get() + 1);
}

export const subscribe = countStore.subscribe;
```

`increment` は「今の値を取得して +1 して set する」という**このストア専用のロジック**として残す。汎用の `set` に任せられない部分。

`subscribe` はそのまま素通しで再export。

### `src/messageStore.ts`(書き換え)

```typescript
import { createStore } from './createStore.js';

const messages = ['Hello', 'こんにちは', 'Bonjour', '你好'];
let index = 0;

const messageStore = createStore(messages[0]);

export function getMessage(): string {
  return messageStore.get();
}

export function nextMessage(): void {
  index++;
  messageStore.set(messages[index % messages.length]);
}

export const subscribe = messageStore.subscribe;
```

`nextMessage` の「配列を循環する」ロジックは専用のものなので、そのまま残す。

---

## 動作確認

コンポーネント側は**一切変更不要**。`getCount`, `increment`, `subscribe` などのインターフェースは前と全く同じで、中身が変わっただけ。

```bash
npm run build:client
```

前と全く同じ動きになる:

- カウンター3つが同時に増える
- メッセージラベル3つが同時に切り替わる
- SPA遷移でクリーンアップも効く

**動作が変わらないことが正解**、というリファクタリングのパターン(Phase 2の型整備でも出てきたやつ)。

---

## ファクトリ関数とは

**「新しいオブジェクトを作って返す関数」** のこと。「工場(factory)」という比喩で、呼ぶたびに新しい「製品」(オブジェクト)を作り出す関数。

今回の `createStore` がまさにファクトリ関数:

```typescript
const countStore = createStore(0); // ストア1個作った
const messageStore = createStore('Hello'); // 別のストアもう1個作った
const tasksStore = createStore<string[]>([]); // また別のを作った
```

呼ぶたびに、独立した新しいストア(製品)が生まれる。

### 普通の関数との違い

**普通の関数**: 何かを計算して値を返す

```typescript
function add(a: number, b: number): number {
  return a + b;
}
add(1, 2); // 3(単なる計算結果)
```

**ファクトリ関数**: 内部で状態や関数を組み立てた**オブジェクト**を返す

```typescript
function createCounter() {
  let count = 0;
  return {
    increment: () => count++,
    get: () => count
  };
}
const counter = createCounter(); // 新しい「カウンター」を作った
```

### クラスとの違い

やっていることはほぼ同じだが、書き方が違う:

| クラス                                | ファクトリ関数               |
| ------------------------------------- | ---------------------------- |
| `new` キーワードが必要                | 普通に呼ぶだけ               |
| `this` を使う                         | クロージャで内部状態を管理   |
| インスタンスメソッドが `prototype` に | 各インスタンスに直接メソッド |

JavaScript/TypeScriptの世界では、**クラスよりファクトリ関数を好む**流派も多い:

1. `this` の扱いに悩まなくて済む
2. `new` を書き忘れる問題が無い
3. インターフェースを型で自然に表現できる
4. private な状態はクロージャで自然に隠せる

今回の `createStore` も、`value` 変数がクロージャに閉じ込められているので、外から直接触れない。カプセル化が自然にできる。

### ファクトリ関数が価値を発揮するとき

「値だけ入ったオブジェクトを返す関数」もファクトリ関数と呼べるが、それだと関数化する意味が薄い(オブジェクトリテラルで十分)。

真価を発揮するのはこんな場面:

1. **内部にプライベートな状態を持たせたい** — クロージャで隠せる
2. **メソッド(振る舞い)を持ったオブジェクトを返したい** — `get`, `set`, `subscribe` など
3. **引数から複雑な組み立てが必要** — バリデーションや加工が入る場合

`createStore` は3つとも当てはまるので「まさにファクトリ関数」と呼べる。

### 他のファクトリ関数の例

「create〜」「make〜」「build〜」で始まる関数は、大抵ファクトリ関数:

```typescript
const [count, setCount] = useState(0); // Reactの useState
const store = createStore(reducer); // Reduxの createStore
const state = reactive({ count: 0 }); // Vueの reactive
const server = http.createServer(handler); // Node.jsの http.createServer
```

---

## 何が良くなったか

### 1. コードの重複が消えた

`listeners` の管理、`subscribe` の実装、これらが `createStore` の中に1回だけ書かれるように。3つ目のストアを作りたくなったら、これを呼ぶだけ。

### 2. 「ストア」という概念が型で表現された

```typescript
export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: Listener) => () => void;
};
```

`Component<Props>` を作ったときと同じ発想。「ストアとはこういうもの」という契約が型として存在するようになった。

### 3. ジェネリクスの実用例が増えた

`createStore<T>` は `T` に何を入れても動く。`number` でも `string` でも、オブジェクトでもOK:

```typescript
const countStore = createStore(0);
countStore.set('hello'); // ❌ Type 'string' is not assignable to type 'number'
```

初期値の型からTypeScriptが `T` を推論してくれる。

---

## 発展例: タスクリストストア

このパターンで簡単に別のストアが作れる:

```typescript
const tasksStore = createStore<string[]>([]);

export function getTasks() {
  return tasksStore.get();
}

export function addTask(task: string) {
  tasksStore.set([...tasksStore.get(), task]);
}

export function removeTask(index: number) {
  tasksStore.set(tasksStore.get().filter((_, i) => i !== index));
}

export const subscribe = tasksStore.subscribe;
```

構造は同じで、扱う型と操作を変えるだけ。**これがRedux(の思想)の一番シンプルな姿**。

---

## Reduxとの対応

| 今回の実装             | Redux                               |
| ---------------------- | ----------------------------------- |
| `createStore(initial)` | `createStore(reducer)`              |
| `store.get()`          | `store.getState()`                  |
| `store.set(next)`      | `store.dispatch({ type, payload })` |
| `store.subscribe(fn)`  | `store.subscribe(fn)`               |

一番の違いは、Reduxが「状態の更新方法を reducer に閉じ込める」ことを強制しているところ。今回の実装だと `set(next)` で好き放題変えられるが、Reduxは `dispatch(action) → reducer(state, action) → new state` という道筋を通させる。「更新ロジックを1か所に集約すると保守しやすい」という設計思想。

でも「まず状態を共有する」だけなら、今回の `createStore` で十分すぎるくらい機能する。実際 Zustand や Jotai は Redux ほど厳格じゃなく、今回の方式に近い。

---

## このステップで得たもの

### 1. ファクトリ関数のパターン

「状態を持ってメソッドで振る舞う小さな部品」を作るときの定石。クロージャによる自然なカプセル化。

### 2. ジェネリクスの実用理解

`createStore<T>` で `T` を使うことで、型安全性を保ったまま「何でも入れられる」汎用関数が書ける。

### 3. リファクタリングの型

「動作を変えずに構造だけ変える」というリファクタリングを実践。**動作が変わらないことが正解**。

### 4. 「create〇〇」パターンの読み方

Redux/Zustand/Vueのreactive/Node.jsのhttp.createServerなど、多くのライブラリで見かける `create〇〇` の意味と価値が分かるように。

---

## ここまでの到達点

```
Step 1: ハイドレーションの最小実装
Step 2: コンポーネントを別ファイルに切り出す(選択肢A)
Step 3: hydrateもコンポーネントに持たせる(選択肢B)
Step 4: data-component で自動ディスパッチ
Step 5: propsの型安全化
Step 6: ルーティング(MPA)
Step 7: SPA化(MPA/SPA切り替え)
Step 8: クリーンアップ機構
Step 9: 状態管理(共有ストア)
Step 10: 汎用ストア(createStore) ← 今ここ
```

10ステップの積み上げ。もはや小さなフレームワークと言えるレベル。

---

## 次のステップ候補

- **selectorパターン** — オブジェクト型の状態のうち一部だけを購読して不要な更新を減らす。React Reduxの `useSelector` の考え方
- **データフェッチ** — サーバーAPIから取得してストアに入れる。SSRらしさが出る
- **動的ルート** — `/users/:id` のようなパラメータ付きURL
- **仮想DOM自作** — Reactの内部構造(難易度高)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
