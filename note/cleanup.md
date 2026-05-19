# クリーンアップ機構(タイマーリークの解決)

`hydrate` が「解除関数」を返すようにして、コンポーネントが自分の後始末をする仕組みを作るステップ。SPA化したことで初めて顕在化する問題への対処。これによりReactの `useEffect` のクリーンアップと同じ仕組みを自前で実装する。

## そもそもこれは何?

**「コンポーネントが消えるとき、自分が作ったリソース(タイマー、イベントリスナー、WebSocket接続など)を解除する仕組み」**のこと。

MPAでは存在すらしなかった概念。SPAになって初めて必要になる。

---

## 問題の体感: タイマーリーク

`timer.ts` に `console.log` を仕込んで確認できる:

```typescript
setInterval(() => {
  count++;
  spanEl.textContent = `CountUpTimer: ${count}`;
  console.log('timer tick:', count); // ← 追加
}, 1000);
```

1. ホームページを開く → `timer tick: 1, 2, 3...` が出る
2. About ページに遷移
3. Aboutページにはタイマーが無いのに...
4. **Consoleには `timer tick: 4, 5, 6...` が出続けている!**

これがメモリリーク(リソースリーク)の正体。

### 何が起きているか

SPA遷移の流れ:

```typescript
async function navigate(path: string) {
  const res = await fetch(`/_page?path=${path}`);
  const html = await res.text();
  main.innerHTML = html; // ← ここでDOMを書き換え
}
```

`main.innerHTML = html` で、Homeページのタイマーの `<div>` や `<span>` はDOMから消える。

でも、**`setInterval` で登録したコールバックはJavaScriptエンジンの中で生き続ける**:

```typescript
setInterval(() => {
  count++;
  spanEl.textContent = `CountUpTimer: ${count}`;
  //  ^^^^^^
  //  この spanEl は、DOMから消えたけど
  //  クロージャの中で参照され続けている
}, 1000);
```

`setInterval` の戻り値(タイマーID)をどこにも保存していないので、**止める手段が無い**まま動き続ける。これがリーク。

### なぜMPAでは問題にならなかったか

MPAではページ遷移のたびにブラウザがJavaScript実行環境ごと破棄する。タイマーも何もかも全部消える。だから後始末を気にする必要が無かった。

SPAは「JavaScript環境を維持したままDOMだけ書き換える」ので、**自分で後始末しないと残骸が積み重なる**。これがSPA特有の難しさ。

---

## 設計の定石: 「hydrate が解除関数を返す」パターン

```typescript
// 変更前
export function hydrate(el: HTMLElement, props: Props): void {
  setInterval(() => { ... }, 1000);
}

// 変更後
export function hydrate(el: HTMLElement, props: Props): () => void {
  const intervalId = setInterval(() => { ... }, 1000);

  // 「呼ばれたら後始末する関数」を返す
  return () => {
    clearInterval(intervalId);
  };
}
```

クライアント側のディスパッチャは、返ってきた解除関数を**要素ごとに保管**しておく。SPA遷移で要素が消えるときに、対応する解除関数を呼ぶ。

### Reactとの対応

これはReactの `useEffect` と完全に同じパターン:

```jsx
useEffect(() => {
  const id = setInterval(() => { ... }, 1000);
  return () => clearInterval(id);  // ← クリーンアップ関数
}, []);
```

`useEffect` の戻り値の関数が「クリーンアップ関数」。Reactはコンポーネントがアンマウントされるときにこれを呼ぶ。**今回作るのはこれと同じ仕組み**。

---

## クリーンアップが必要なものの整理

### `timer.ts`: 実害**大**

```typescript
setInterval(() => { ... }, 1000);
```

- `setInterval` はJavaScriptエンジンの中で参照を握られている
- DOM要素が消えても、コールバックは動き続ける
- **CPUとメモリを永遠に消費し続ける**

明確なリーク。

### `counter.ts` / `simpleCounter.ts`: 実害**ほぼゼロ**

```typescript
btn.addEventListener('click', () => { ... });
```

- イベントリスナーは**DOM要素に付随**している
- DOM要素が削除されると、リスナーも一緒にガベージコレクション(GC)される
- ボタンが消えれば、リスナーも一緒に消える

つまり**ブラウザが勝手に片付けてくれる**ので、実害は無い。

### でも全部クリーンアップする理由

実害が無くても、学習目的では全部やる:

1. **設計の一貫性** — 全コンポーネントが同じ型(`Component<Props>`)に従う
2. **将来の保険** — `localStorage` や `WebSocket` を追加したくなったときに困らない
3. **Reactと同じ思考** — 「副作用を起こしたら必ず後始末する」というパターンが身につく

---

## 実装(3フェーズ)

### Phase 1: `timer` だけクリーンアップを実装

#### `src/components/timer.ts`(修正)

```typescript
export type Props = { count: number };

export function render(props: Props): string {
  return `
    <div data-component="timer" data-props='${JSON.stringify(props)}'>
      <span>CountUpTimer: ${props.count}</span>
    </div>
  `;
}

export function hydrate(el: HTMLElement, props: Props): () => void {
  const spanEl = el.querySelector('span')!;
  let count = props.count;

  const intervalId = setInterval(() => {
    count++;
    spanEl.textContent = `CountUpTimer: ${count}`;
    console.log('timer tick:', count);
  }, 1000);

  return () => {
    console.log('timer cleanup!');
    clearInterval(intervalId);
  };
}
```

変更点:

- 戻り値の型が `void` → `() => void`
- `setInterval` の戻り値(タイマーID)を `intervalId` に保存
- 「呼ばれたら `clearInterval` する関数」を返す

#### `src/client.ts`(修正)

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

// 要素ごとのクリーンアップ関数を保管
const cleanups = new WeakMap<HTMLElement, () => void>();

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
    const cleanup = component.hydrate(el, props);

    if (typeof cleanup === 'function') {
      cleanups.set(el, cleanup);
    }
  });
}

// 指定要素配下のコンポーネントを全部クリーンアップ
function cleanupAll(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-component]').forEach((el) => {
    const cleanup = cleanups.get(el);
    if (cleanup) {
      cleanup();
      cleanups.delete(el);
    }
  });
}

async function navigate(path: string): Promise<void> {
  console.log(`navigating to: ${path}`);

  const res = await fetch(`/_page?path=${encodeURIComponent(path)}`);
  const html = await res.text();

  const main = document.querySelector('main')!;

  // ★ DOMを書き換える前に、消えるコンポーネントをクリーンアップ
  cleanupAll(main);

  main.innerHTML = html;
  history.pushState({}, '', path);
  hydrateAll(main);
}
```

ポイント:

- `WeakMap<HTMLElement, () => void>` で要素ごとのクリーンアップ関数を保管
- `cleanupAll` 関数で指定要素配下のコンポーネントを全部クリーンアップ
- `navigate` で **DOM書き換えの前に** `cleanupAll(main)` を呼ぶ

### Phase 2: 共通の型 `Component<Props>` を定義

#### `src/types.ts`(新規作成)

```typescript
export type Component<P> = {
  render: (props: P) => string;
  hydrate: (el: HTMLElement, props: P) => (() => void) | void;
};
```

これがフレームワークが定義する「コンポーネント契約」。

#### コンポーネントを型に従わせる

```typescript
import type { Component } from '../types.js';

export type Props = { count: number };

export const render: Component<Props>['render'] = (props) => {
  return `...`;
};

export const hydrate: Component<Props>['hydrate'] = (el, props) => {
  // ...
};
```

`Component<Props>['render']` という記法は「`Component<Props>` 型から `render` プロパティの型だけ取り出す」という意味。

### Phase 3: `counter` と `simpleCounter` もクリーンアップ対応

#### `src/components/counter.ts`(修正)

```typescript
export const hydrate: Component<Props>['hydrate'] = (el, props) => {
  const btn = el.querySelector('button')!;
  let count = props.count;

  const handleClick = () => {
    count++;
    btn.textContent = `Count: ${count}`;
  };

  btn.addEventListener('click', handleClick);

  return () => {
    console.log('counter cleanup!');
    btn.removeEventListener('click', handleClick);
  };
};
```

`simpleCounter.ts` も同じパターンで対応。

---

## なぜハンドラに名前を付ける必要があるのか

`addEventListener` と `removeEventListener` は、**同じ関数参照**を渡さないと解除できない。

**間違った例**:

```typescript
// ❌ これは動かない
btn.addEventListener('click', () => {
  count++;
});

return () => {
  btn.removeEventListener('click', () => {
    count++;
  });
  // ↑ 別の関数オブジェクト!
};
```

`() => { count++; }` は呼ばれるたびに**新しい関数オブジェクト**を作る。addで登録したものとremoveで渡したものは「別人」扱いになる。

**正しい例**:

```typescript
// ✅ 動く
const handleClick = () => {
  count++;
};
btn.addEventListener('click', handleClick);

return () => {
  btn.removeEventListener('click', handleClick);
  // ↑ 同じ関数オブジェクトを参照
};
```

`handleClick` という変数で**同じ関数を参照**しているので、解除できる。JavaScriptの初心者ハマりポイントとして有名。

---

## なぜ `WeakMap` を使うのか

普通の `Map` でも動く。`delete` を律儀に呼んでいれば、`Map` でも `WeakMap` でも動作は同じ。

ではなぜ `WeakMap` を使うか:

### `WeakMap` の特性

**キー(今回は要素)がガベージコレクションされると、エントリも自動的に消える**

```typescript
const map = new WeakMap();
map.set(el, cleanup);
// elがDOMから削除&他の参照も無くなれば、エントリは自動で消える
```

### `WeakMap` を選ぶ理由

1. **慣習・定石** — DOM要素をキーにする場合は `WeakMap` というのが定着している
2. **将来の保険** — `delete` を呼び忘れたとき、リークしない
3. **意図の表明** — 「このマップは要素のライフサイクルに紐づく」というメッセージ

### `WeakMap` の制約

- キーはオブジェクトのみ(文字列や数値は不可)
- イテレートできない(`for...of`, `.size`, `.forEach` などが無い)
- キーの列挙ができない

「全部のエントリに何かしたい」「現在の保管数を知りたい」みたいなことができない。今回の用途には合っているが、汎用的なマップとしては不便。

---

## 動作確認

### 期待される動き(全フェーズ完了後)

1. ホームページ表示

   ```
   mode: SPA
   hydrating: counter {count: 10}
   hydrating: timer {count: 0}
   timer tick: 1
   ```

2. About に遷移

   ```
   navigating to: /about
   counter cleanup!
   timer cleanup!
   hydrating: simpleCounter {count: 100}
   ```

3. **About ページに移動した後、もうtickログが出ない!** ← リーク解消

4. Home に戻る
   ```
   navigating to: /
   simpleCounter cleanup!
   hydrating: counter {count: 10}
   hydrating: timer {count: 0}
   timer tick: 1
   ```

「`xxx cleanup!` が**全コンポーネントぶん**出る」「リンククリックでも戻るボタンでもクリーンアップが効く」がポイント。

---

## クリーンアップが本当に効いているか確認する方法(オプション)

### Chrome DevTools の `getEventListeners`

クリーンアップを意図的に無効化(`removeEventListener` をコメントアウト)してから:

```javascript
// ホームで実行
const btn = document.querySelector('[data-component="counter"] button');
window.savedBtn = btn;
getEventListeners(btn);
// → {click: Array(1)}
```

About に遷移してから:

```javascript
getEventListeners(window.savedBtn);
// クリーンアップ無効版: {click: Array(1)} ← まだリスナーが残っている
// クリーンアップ有効版: {} ← 解除されている
```

### Memoryタブで Detached要素を確認

Memory タブ → Heap snapshot → 「Filter by class」に `Detached` と入力。

リーク状態だと `Detached HTMLButtonElement` のような項目が見える(ただし最近のChromeは賢く最適化するので見えないこともある)。

---

## このステップで得たもの

### 1. 全コンポーネントが統一されたライフサイクル

```
[マウント] → hydrate(el, props) を呼ぶ → 解除関数を保管
[アンマウント] → 解除関数を呼ぶ → コンポーネント消滅
```

このパターンは**Reactのコンポーネント**と全く同じ。`useEffect` の戻り値、`componentWillUnmount`、Vue の `onUnmounted` などはすべて「アンマウント時のクリーンアップ」を扱う。

### 2. 「副作用を起こしたら後始末する」原則

これは関数型プログラミング、リソース管理、システム設計の**普遍的な原則**:

- ファイルを開いたら閉じる
- 接続を張ったら切る
- イベントを登録したら解除する
- タイマーを始めたら止める

「自分が起こした副作用は自分が片付ける」という考え方が身につく。

### 3. `addEventListener` / `removeEventListener` のペアの理解

「関数参照を保持しないと解除できない」という、JavaScriptの定番の落とし穴を体験できた。

### 4. `WeakMap` の実用

DOM要素をキーにしたマップで、ライフサイクル管理の定番パターンを学んだ。

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

Step 7: SPA化(MPA/SPA切り替え)
  → クライアントサイドナビゲーション。
    config.tsで切り替え可能に。

Step 8: クリーンアップ機構 ← 今ここ
  → コンポーネントのライフサイクル管理。
    hydrate が解除関数を返すパターン。
    WeakMapで要素ごとに保管。
    Reactの useEffect と同じ仕組みを自前で実装。
```

ここまで来ると、これはもう**「最小限の動くフロントエンドフレームワーク」**。Reactを使わずに、Reactの主要な機能を自分で組み立ててきた。

---

## 次のステップ候補

- **状態管理** — 複数のコンポーネント間で状態を共有する仕組み
- **データフェッチ** — ページのrender時にAPIから取得する
- **動的ルート** — `/users/:id` のようなパラメータ付きURL
- **仮想DOM自作** — 差分更新の仕組み(難易度高)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
