# selectorパターン(状態の一部だけを購読する)

前ステップの汎用ストア(`createStore`)は「状態が変わったら購読者全員に通知」する仕組み。オブジェクト型の状態を持たせると、**関係ない変更でも全コンポーネントが update される**という無駄が発生する。それを解決するのがselectorパターン。React Reduxの `useSelector`、Zustandの `useStore((state) => state.count)` などの仕組みの核。

## このステップで作るもの

- **`subscribeSelector`** — 「stateのどこを見たいか」を指定して購読する仕組み
- コンポーネント側は`subscribe` → `subscribeSelector` に書き換え
- 「関係ある変更のときだけ update」が実現される

---

## 問題を体感する

### オブジェクト型の状態を持つストア

`src/appStore.ts`(新規作成):

```typescript
import { createStore } from './createStore.js';

type AppState = {
  count: number;
  message: string;
};

const store = createStore<AppState>({ count: 0, message: 'Hello' });

const messages = ['Hello', 'こんにちは', 'Bonjour', '你好'];
let index = 0;

export function getState() {
  return store.get();
}

export function incrementCount() {
  const current = store.get();
  store.set({ ...current, count: current.count + 1 });
}

export function nextMessage() {
  index++;
  const current = store.get();
  store.set({ ...current, message: messages[index % messages.length] });
}

export const subscribe = store.subscribe;
```

`{ ...current, count: ... }` はスプレッド構文で「currentのコピーを作りつつcountだけ変える」。**イミュータブル(不変)な更新**の書き方で、Reduxでは基本パターン。

### 2つのコンポーネントを作る

`appCount.ts`(countだけ見たい)と`appMessage.ts`(messageだけ見たい)を作って、両方に `console.log('xxx update!')` を仕込む。

### 問題の目撃

`appCount` のボタンを押す:

```
appCount update!
appMessage update!  ← 問題! messageは変わってないのに
```

`appMessage` のボタンを押す:

```
appCount update!    ← 問題! countは変わってないのに
appMessage update!
```

**関係ない変更でも全員がupdateされる**。これが今回解決したい問題。実害は「無駄な計算とDOM操作」で、1000個のコンポーネントがあれば1000回の無駄な update が走る。

---

## 解決策: 「間に見張り役を挟む」

これまでの `subscribe` は「stateが変わったら、登録された全員に通知」だった。単純。

```
[stateが変わった] → 全員に通知 → 各コンポーネントの update が呼ばれる
```

`subscribeSelector` は、**listenerとstoreの間に「見張り役(wrapper)」を挟む**発想。

```
[stateが変わった] → 全員に通知 → 見張り役 → (関係あるときだけ) update
```

見張り役の仕事は1つだけ:

- 「自分が見てる部分(count)、前と比べて変わった?」
- 変わった → update を呼ぶ
- 変わってない → 何もしない

---

## 実装

### `src/createStore.ts`(修正)

```typescript
type Listener = () => void;

export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: Listener) => () => void;
  subscribeSelector: <S>(
    selector: (state: T) => S,
    listener: (selected: S) => void
  ) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<Listener>();

  const store: Store<T> = {
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
    },
    subscribeSelector: <S>(
      selector: (state: T) => S,
      listener: (selected: S) => void
    ) => {
      let prev = selector(value); // ① 最初の値を覚えておく
      const wrapper: Listener = () => {
        // ② これが「見張り役」
        const next = selector(value); //    今の値を計算
        if (next !== prev) {
          //    前と違う?
          prev = next; //    今の値を「前」に更新
          listener(next); //    listenerを呼ぶ
        }
      };
      return store.subscribe(wrapper); // ③ 見張り役を通常のsubscribeに登録
    }
  };

  return store;
}
```

### `appStore.ts` に素通し追加

```typescript
export const subscribeSelector = store.subscribeSelector;
```

### `appCount.ts`(書き換え)

```typescript
export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const btn = el.querySelector('button')!;

  const update = (count: number) => {
    console.log('appCount update!', count);
    btn.textContent = `Count: ${count}`;
  };

  const handleClick = () => incrementCount();
  btn.addEventListener('click', handleClick);

  // count だけ購読
  const unsubscribe = subscribeSelector((state) => state.count, update);

  return () => {
    btn.removeEventListener('click', handleClick);
    unsubscribe();
  };
};
```

変わったのは:

- `subscribe(update)` → `subscribeSelector((state) => state.count, update)`
- `update` が `count` を引数で直接受け取れるように(便利)
  `appMessage.ts` も同じパターンで、`state.message` を購読するように書き換える。

---

## 動作の追い方(appMessage視点)

`appCount` と `appMessage` は、**それぞれ別の wrapper を持っている**。

```
store
  ├─ listeners (Set)
  │    ├─ wrapper_A ← appCountの見張り役 (selector: state.count)
  │    │             prev: 0
  │    │
  │    └─ wrapper_B ← appMessageの見張り役 (selector: state.message)
  │                  prev: 'Hello'
```

### countが 0 → 1 になったとき

```
store.set() → listeners全員に通知 → wrapper_A, wrapper_B が呼ばれる

wrapper_A (appCount):
  next = state.count = 1
  1 !== 0 → true → appCountのupdate呼ぶ ✓

wrapper_B (appMessage):
  next = state.message = 'Hello'
  'Hello' !== 'Hello' → false → 何もしない ✗
```

### messageが 'Hello' → 'こんにちは' になったとき

```
store.set() → listeners全員に通知 → wrapper_A, wrapper_B が呼ばれる

wrapper_A (appCount):
  next = state.count = 1
  1 !== 1 → false → 何もしない ✗

wrapper_B (appMessage):
  next = state.message = 'こんにちは'
  'こんにちは' !== 'Hello' → true → appMessageのupdate呼ぶ ✓
```

**「store の通知は全員に飛ぶ」ことは今も変わっていない**。ただ、各wrapperが自分の担当部分だけ見て、変わってないなら黙るようになった。だから外から見ると「関係ある変更だけ通知される」ように見える。これが selector パターンの心臓部。

---

## 動作確認

```bash
npm run build:client
```

1. `appCount` のボタンを押す → **`appCount update!` だけ出る**(appMessageは黙ってる!)
2. `appMessage` のボタンを押す → **`appMessage update!` だけ出る**
   「関係ない変更では通知が来ない」が実現できた。

---

## selector とは何か

selector は **「stateから見たい部分を取り出す関数」**:

```typescript
(state: AppState) => state.count;
//                    ^^^^^^^^^^^
//                    見たい部分
```

「stateを受け取って、その中の一部を返す関数」。

- `(state) => state.count` → countだけ取り出す
- `(state) => state.message` → messageだけ取り出す
- `(state) => state.tasks.length` → 計算も可能
  「取り出す指針(セレクター、選ぶ人)」というイメージ。

---

## ハマったポイント

### `Store<T>` 型の `subscribe` が void を返す型になっていた

```typescript
// ❌ NG: 実装はクリーンアップ関数を返しているのに、型が void
subscribe: (listener: Listener) => void;

// ✅ OK: 「呼ぶと void を返す関数」を返す
subscribe: (listener: Listener) => () => void;
```

この型定義のミスがあると、使う側で `const unsubscribe = subscribe(update)` の `unsubscribe` の型が void になり、`unsubscribe()` が呼び出せなくてエラー。

**Viteはビルド時に型チェックしない**(esbuildを使っている)ので、型エラーがあってもランタイムでは動いてしまう。エディタが出しているエラーを見逃さないのが重要。

### 型注釈は「契約」

関数の戻り値の型を書いておくと、実装とのズレを検出できる:

```typescript
subscribe: (listener): () => void => {  // ← 戻り値型を明示
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
},
```

---

## 学んだTypeScriptテクニック

### 別のジェネリクス `<S>`

```typescript
subscribeSelector: <S>(
  selector: (state: T) => S,
  listener: (selected: S) => void
) => () => void;
```

`<S>` は「selectorが返す値の型」を表す型変数。`T`(state全体の型)とは別物。

- `(state) => state.count` を渡すと、TypeScriptが「`S = number`」と自動推論
- `(state) => state.message` を渡すと、`S = string`
- listener の引数 `selected: S` も、それに応じて型が決まる
  **関数から型を推論してもらう**という強力なパターン。

### クロージャで前回値を覚える

```typescript
subscribeSelector: <S>(selector, listener) => {
  let prev = selector(value);           // ← ここで作った prev を
  const wrapper: Listener = () => {
    const next = selector(value);
    if (next !== prev) {
      prev = next;                       // ← wrapper の中で読み書きできる
      listener(next);
    }
  };
  return store.subscribe(wrapper);
},
```

`wrapper` は外側の `prev` を握り続けられる(クロージャ)。だから「前回値との比較」が可能。これがなぜ動くかというと、JavaScriptの関数は「作られた場所の変数」を覚えていられるから。

---

## 触れておきたい落とし穴: 参照の等価性

`if (next !== prev)` はJavaScriptの「同じかどうか」の判定。プリミティブ(number/string/boolean)なら期待通り動く:

```typescript
1 !== 1; // false → 同じ扱い
'a' !== 'a'; // false → 同じ扱い
```

でも**オブジェクトや配列**を返す selector を書くと注意が必要:

```typescript
subscribeSelector(
  (state) => ({ count: state.count, message: state.message }), // ← 毎回新しいオブジェクト
  update
);
```

`{count:0, message:'Hello'}` と `{count:0, message:'Hello'}` は**別物**として扱われて、毎回 listener が呼ばれてしまう(JavaScriptは参照で比較するので)。

これを解決するのが「shallow equal」「deep equal」「memoization」といった発展テクニック。Reactの `useMemo` や Reselect の `createSelector` はこれを解決するために存在している。

**今回のレベルでは「プリミティブを返す selector に留める」のが安全**、と覚えておけばOK。

---

## このステップで得たもの

### 1. selectorパターンの本質

「storeは全員に通知するだけ。でも各listenerが賢いラッパーになっていて、関係あるときだけ通知を通す」という構造。**内部はシンプルなまま、外から見ると賢く見える**という設計。

### 2. 「ラッパーで挙動を賢くする」パターン

ソフトウェア設計でよく出てくる。既存の仕組みを直接いじらずに、間に何かを挟むことで機能を追加する。デコレーターパターン、ミドルウェア、プロキシパターンなどの源流にある発想。

### 3. React Reduxとの対応

| 今回の実装                              | React Redux                         |
| --------------------------------------- | ----------------------------------- |
| `subscribeSelector(selector, listener)` | `useSelector(selector)`             |
| 内部で前回値と比較                      | 内部で前回値と比較                  |
| プリミティブ推奨                        | `shallowEqual` などのオプションあり |

「useSelectorが何を最適化しているのか」がこれで腑に落ちる。

### 4. ジェネリクス2つ使うパターン

`Store<T>` の中の `subscribeSelector<S>` のように、外側の型引数と内側の型引数を組み合わせる書き方。関数型の設計で頻出。

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
Step 11: selectorパターン ← 今ここ
```

これで状態管理の主要な最適化パターンにも触れた。React ReduxやZustandの中身が「何を解決しているか」が見えるようになった状態。

---

## 次のステップ候補

- **shallow-equal** — オブジェクト型のselector対応。参照の等価性の落とし穴を解決
- **データフェッチ** — サーバーAPIから取得してストアに入れる。SSRらしさが出る
- **動的ルート** — `/users/:id` のようなパラメータ付きURL
- **仮想DOM自作** — 差分更新の仕組み(難易度高)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
