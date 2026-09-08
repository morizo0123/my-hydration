# 状態管理(複数コンポーネント間で状態を共有する仕組み)

複数のコンポーネントが同じ状態を共有できる仕組みを、一番素朴な形から実装するステップ。ReduxやZustand、Reactの状態管理ライブラリが解決している問題の核心に触れる。

## このステップで作るもの

- **1つの共有された値**を複数のコンポーネントが見る
- どれか1つを操作すると、画面上の全コンポーネントが一斉に同じ値に変わる
- クリーンアップ機構(前ステップ)がここでも活きる

---

## 状態管理の最小構成: 3つの要素

状態管理の最小単位は、たった3つでできている:

1. **状態を保持する変数**
2. **状態が変わったら知らせる「購読」の仕組み**(listeners)
3. **状態を更新する関数**

Reduxもこれを膨らませたものにすぎない。

---

## 実装(その1): カウンター共有ストア

### `src/store.ts`(新規作成)

```typescript
type Listener = () => void;

let count = 0;
const listeners = new Set<Listener>();

export function getCount(): number {
  return count;
}

export function increment(): void {
  count++;
  // 状態が変わったので、購読者全員に通知
  listeners.forEach((listener) => listener());
}

// 購読する。戻り値は「購読を解除する関数」
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

ポイントは `subscribe` が**解除関数を返す**ところ。前ステップのクリーンアップ機構と全く同じ形。「副作用を起こしたら後始末」がここでも効いてくる。

### `src/components/counter.ts`(修正)

自分でcountを持つのをやめて、ストアを見るように:

```typescript
import type { Component } from '../types.js';
import { getCount, increment, subscribe } from '../store.js';

export type Props = { count: number };

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="counter" data-props='${JSON.stringify(props)}'>
      <button>Count: ${props.count}</button>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const btn = el.querySelector('button')!;

  // 画面を最新の状態に合わせる関数
  const update = () => {
    btn.textContent = `Count: ${getCount()}`;
  };

  // クリックでストアを更新(全員に通知が飛ぶ)
  const handleClick = () => increment();
  btn.addEventListener('click', handleClick);

  // ストアを購読。変化があったら update が呼ばれる
  const unsubscribe = subscribe(update);

  // 初回同期(SSRの値とストアの初期値がズレてる可能性に備える)
  update();

  return () => {
    btn.removeEventListener('click', handleClick);
    unsubscribe();
  };
};
```

流れ:

1. `handleClick` を登録
2. `subscribe(update)` でストアを購読
3. 誰かが `increment()` を呼ぶ → ストアが購読者全員の `update` を呼ぶ → 各カウンターが `getCount()` で最新値を読んで表示更新
4. クリーンアップで `removeEventListener` と `unsubscribe()` の両方を呼ぶ

購読しっぱなしだと、消えたコンポーネントの `update` が呼ばれ続けてリークする。ここが大事。

### 動作確認

`home.ts` に同じカウンターを複数配置:

```typescript
${renderCounter({ count: 0 })}
${renderCounter({ count: 0 })}
${renderCounter({ count: 0 })}
```

どれか1つをクリックすると、3つ全部が同時に同じ数字に変われば成功。

**注意**: `count` がモジュールのトップレベル変数なので、SPAでAboutに移動して戻ってくると値が保持されたまま。これはバグではなく、グローバルな状態管理の自然な挙動。

---

## 実装(その2): メッセージ共有ストア(練習問題)

同じパターンで別の状態を実装する練習。表示専用と操作専用の**2種類のコンポーネント**が同じストアを介して連携する。

### `src/messageStore.ts`(新規作成)

```typescript
type Listener = () => void;

let message = 'Hello';
const messages = ['Hello', 'こんにちは', 'Bonjour', '你好'];
let index = 0;

const listeners = new Set<Listener>();

export function getMessage(): string {
  return message;
}

export function nextMessage(): void {
  index++;
  message = messages[index % messages.length];
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

### `src/components/messageButton.ts`(新規作成)

操作専用。押したら `nextMessage()` を呼ぶだけ。**自分の表示は変わらないので subscribe は不要**。

```typescript
import type { Component } from '../types.js';
import { nextMessage } from '../messageStore.js';

export type Props = {};

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="messageButton" data-props='${JSON.stringify(props)}'>
      <button>次のメッセージへ</button>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const btn = el.querySelector('button')!;

  const handleClick = () => nextMessage();
  btn.addEventListener('click', handleClick);

  return () => {
    btn.removeEventListener('click', handleClick);
  };
};
```

### `src/components/messageLabel.ts`(新規作成)

表示専用。ストアが変わったら自動で書き換わる。

```typescript
import type { Component } from '../types.js';
import { getMessage, subscribe } from '../messageStore.js';

export type Props = { message: string };

export const render: Component<Props>['render'] = (props) => {
  return `
    <div data-component="messageLabel" data-props='${JSON.stringify(props)}'>
      <label>message: ${props.message}</label>
    </div>
  `;
};

export const hydrate: Component<Props>['hydrate'] = (el, _props) => {
  const label = el.querySelector('label')!;

  const update = () => {
    label.textContent = `message: ${getMessage()}`;
  };

  const unsubscribe = subscribe(update);

  update(); // 初回同期

  return () => {
    unsubscribe();
  };
};
```

`_props` で受け取っているのがポイント。SSR時のpropsは初回描画に使うが、hydrate後はストアが真実の源なので使わない、という意図の明示。

### `src/client.ts` に登録

```typescript
import * as messageButton from './components/messageButton.js';
import * as messageLabel from './components/messageLabel.js';

const components = {
  counter,
  simpleCounter,
  timer,
  messageButton,
  messageLabel
} as const;
```

**登録し忘れると `Unknown component: messageLabel` が出る**。文字列ベースの紐付けの弱点。TypeScriptでは検出できない。

### 動作確認

`home.ts` に配置:

```typescript
${renderMessageLabel({ message: 'Hello' })}
${renderMessageButton({})}
${renderMessageLabel({ message: 'Hello' })}
${renderMessageLabel({ message: 'Hello' })}
```

ボタンを押すと3つのラベルが同時に切り替われば成功。

---

## 用語の整理: listeners と actions

「listenersにはactionsを入れるもの?」という疑問への答え:

**listenersに入るのは「変化したら呼んでほしいコールバック関数」**。actionsとは別概念。

### 向きが違う

**listeners(リスナー / 購読者)**

- 「ストアからコンポーネントへの通知」の口
- 「状態が変わったときに通知を受け取りたい関数」のリスト
- 「変化を聞きたい人たち」

**actions(アクション)** ※Redux用語

- 「コンポーネントからストアへの指示」を表すオブジェクト
- Reduxだと `{ type: 'INCREMENT' }` のようなもの
- 「やってほしいこと」

### 今回のコードの位置づけ

```typescript
// listeners: 「変化を知りたい人」のリスト
const listeners = new Set<Listener>();

// subscribe: 通知を受け取る関数を登録
subscribe(update); // 「count が変わったら update を呼んでね」

// increment: 状態を変える関数(actionに近い位置)
export function increment(): void {
  count++;
  listeners.forEach((listener) => listener()); // 全員に通知
}
```

`increment()` は「状態を変える指示」なので、Reduxの世界観で言えばactionに**近い**位置。ただ厳密にはこれは「action creator から dispatch まで一気にやってる関数」で、Reduxはこれをもっと細かく分解する。

### ストアの全体像

```
[コンポーネント] → 「incrementして」 → [ストア]
                                          ↓
                                     countを更新
                                          ↓
[コンポーネント] ← 「変わったよ!」 ← [ストア]
   (listenerが呼ばれる)
```

- 行きの矢印が **action / dispatch / 更新関数** の世界
- 帰りの矢印が **listener / subscribe / 通知** の世界

「コンポーネントは2つの口でストアと通信する」と覚えると整理しやすい。**呼ぶ口**(increment) と **聞く口**(subscribe)、その2つ。

---

## なぜ listeners を貯めておく必要があるか

シンプルなアプリなら `increment` の中で直接DOM更新すればいい気もする:

```typescript
// 仮にこう書いたら
export function increment(): void {
  count++;
  document.querySelector('button')!.textContent = `Count: ${count}`;
  // ↑ ストアがDOMを直接知ってしまう
}
```

でもこれだとストアが「カウンターは `<button>` で表示される」という具体的なことを知る必要が出てくる。コンポーネントが増えたら、ストアの中身がぐちゃぐちゃに。

`listeners` パターンの利点は **「ストアは『誰かが聞いている』ことしか知らない」** ところ。各コンポーネントは「自分の表示の仕方は自分で決める」、ストアは「変わったよと声をかけるだけ」。責務がきれいに分かれる。

これは「Observerパターン」「PubSubパターン」と呼ばれる、ソフトウェア設計の超定番。

---

## Reactとの対応

Reactの `useState` も、内部ではこれとほぼ同じ。`setState` を呼ぶと「再レンダーが必要だよ」とReactに通知が飛び、Reactが対象コンポーネントを再描画する。listenersの中身が「DOM更新」じゃなくて「再レンダー指示」になっているだけ。

---

## ハマったポイント

### `data-props` はシングルクォートで囲う

```typescript
// ❌ ダブルクォートだとHTMLが壊れる
<div data-props="${JSON.stringify(props)}">

// ✅ シングルクォート
<div data-props='${JSON.stringify(props)}'>
```

`JSON.stringify(props)` の出力は `{"message":"Hello"}` のようにダブルクォートを含む文字列。ダブルクォートで囲うとHTMLパーサーが最初の内側の `"` で属性値が終わったと判断してしまい、以降が壊れる。

### コンポーネントの登録し忘れ

`Unknown component: messageLabel` が出たら、`client.ts` の `components` オブジェクトに登録し忘れている。文字列ベースの紐付けなのでTypeScriptでは検出できない。

### 「不要でも書く」の重要性

props不要なコンポーネント(messageButtonなど)も、他のコンポーネントと**構造を揃える**のが良い:

- 空のPropsを定義: `export type Props = {};`
- `data-props='${JSON.stringify(props)}'` を出力
- `render: Component<Props>['render'] = (props) => ...` の型注釈

理由:

- ディスパッチャ側の処理が全コンポーネント一律
- コードレビューで「これだけ違う?」と混乱しない
- 将来propsが必要になったとき、型を変えるだけで済む

---

## このステップで得たもの

### 1. 一方向のデータフロー

```
[messageButton] --nextMessage()--> [messageStore]
                                        |
                    subscribe通知       |
                    ↓                   ↓
              [messageLabel] × 3
```

- Button は Store のことだけ知っていて、Label のことは知らない
- Label は Store のことだけ知っていて、Button のことは知らない
- でも Store 経由で「Button の操作が Label の表示に反映される」

コンポーネント同士が直接会話しない = 疎結合。これがコンポーネントが増えても複雑さが爆発しない理由。

### 2. Observer/PubSubパターンの実装

ソフトウェア設計の超定番パターンを、フレームワーク無しで自分で組み立てた。React、Vue、Redux、RxJSなど、多くのライブラリの根底にある考え方。

### 3. クリーンアップ機構の応用

前ステップで作った「解除関数を返す」パターンが、状態管理でもそのまま活きる。subscribe → unsubscribe というライフサイクル管理が、いろんな場面で応用できることを体験。

### 4. 「呼ぶ口」と「聞く口」の分離

コンポーネントはストアに対して**2種類の関わり方**をする:

- 呼ぶだけ(messageButton) → subscribe不要
- 聞くだけ(messageLabel) → subscribe必要
- 両方(counter) → 両方必要

どの関わり方が必要かを設計時に考えるようになる。

---

## ここまでの到達点

```
Step 1: ハイドレーションの最小実装
Step 2-3: コンポーネント化
Step 4: data-component で自動ディスパッチ
Step 5: propsの型安全化
Step 6: ルーティング(MPA)
Step 7: SPA化(MPA/SPA切り替え)
Step 8: クリーンアップ機構
Step 9: 状態管理(共有ストア) ← 今ここ
```

これでフロントエンドフレームワークの主要機能が一通り揃った状態。レンダリング、ハイドレーション、ライフサイクル、ルーティング、SPA遷移、クリーンアップ、状態管理。

---

## 次のステップ候補

- **汎用ストア(`createStore<T>`)** — 今のパターンをファクトリ関数に。Redux/Zustandの最小版
- **selectorパターン** — ストアの一部だけを購読して不要な更新を減らす
- **データフェッチ** — サーバーAPIから取得してストアに入れる
- **動的ルート** — `/users/:id` のようなパラメータ付きURL
- **仮想DOM自作** — Reactの内部構造(難易度高)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
