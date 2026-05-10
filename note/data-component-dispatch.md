# `data-component` で自動ディスパッチ

クライアント側がコンポーネントごとに `hydrateXxx()` を手で書かなくても、HTMLに埋め込まれたメタ情報から自動的にハイドレーション関数を呼ぶ仕組みを作る。本物のSSRフレームワーク(Next.js、Nuxt、Astroなど)が内部でやっていることに近づくステップ。

## 解決したい問題

前回までの `client.ts`:

```typescript
hydrateSimpleCounter(window.__INITIAL_STATE__.count);
hydrateCounter(window.__INITIAL_STATE__.componentCount);
```

- コンポーネントが増えるたびに、ここに行が増える
- `__INITIAL_STATE__` のキー名と紐づけるのを手作業でやっている

## 解決のアイデア

HTMLに「これはどのコンポーネントか」「初期propsは何か」をメタ情報として埋め込んでおいて、クライアント側がそれを読んで自動的にハイドレーション関数を呼ぶ。

```html
<div data-component="counter" data-props='{"count":10}'>
  <button>Count: 10</button>
</div>
```

クライアント側は `[data-component]` を全部探して、属性に書かれた名前のコンポーネントを呼び出す。

---

## 設計の変更点

### 1. コンポーネントが自身の属性付きラッパーを返す

これまでの `render` は `<button>` だけを返していたが、ラッパー `<div data-component="...">` で包む形にする。

### 2. `hydrate` の引数が変わる

これまでは `getElementById` で固定IDの要素を探していたが、これからは「どの要素をハイドレートするか」を引数で受け取る。同じコンポーネントを複数置いても動くようにするため。

### 3. クライアントに「ディスパッチャ」を作る

`data-component` を全部探して、対応する `hydrate` を呼び出す仕組み。

---

## 実装

### 1. `src/components/counter.ts`

```typescript
export function render(count: number): string {
  return `
    <div data-component="counter" data-props='${JSON.stringify({ count })}'>
      <button>Count: ${count}</button>
    </div>
  `;
}

export function hydrate(el: HTMLElement, props: { count: number }): void {
  const btn = el.querySelector('button')!;
  let count = props.count;

  btn.addEventListener('click', () => {
    count++;
    btn.textContent = `Count: ${count}`;
  });
}
```

ポイント:

- `render` がラッパー `<div>` で包み、`data-component` と `data-props` を埋め込む
- `hydrate` の第1引数が `el: HTMLElement`(ラッパー要素)に変わる
- `el.querySelector('button')` で**ラッパー内のボタン**を探す → IDが不要になり、複数置いても衝突しない
- propsを引数オブジェクトで受け取る形に統一

### 2. `src/components/simpleCounter.ts`

同じパターン:

```typescript
export function render(count: number): string {
  return `
    <div data-component="simpleCounter" data-props='${JSON.stringify({ count })}'>
      <button>Count: ${count}</button>
    </div>
  `;
}

export function hydrate(el: HTMLElement, props: { count: number }): void {
  const btn = el.querySelector('button')!;
  let count = props.count;

  btn.addEventListener('click', () => {
    count++;
    btn.textContent = `Count: ${count}`;
  });
}
```

### 3. `src/components/timer.ts`(新規追加例)

カウンター以外のコンポーネントも、同じパターンで作れる:

```typescript
export function render(count: number) {
  return `
    <div data-component="timer" data-props='${JSON.stringify({ count })}'>
      <span>CountUpTimer: ${count}</span>
    </div>
  `;
}

export function hydrate(el: HTMLElement, props: { count: number }) {
  const spanEl = el.querySelector('span')!;
  let count = props.count;

  setInterval(() => {
    count++;
    spanEl.textContent = `CountUpTimer: ${count}`;
  }, 1000);
}
```

### 4. `src/server.ts`

`__INITIAL_STATE__` をHTMLに埋め込む処理が**不要になる**。各コンポーネントの `render` がpropsを `data-props` に埋め込んでくれるので:

```typescript
import http from 'node:http';
import fs from 'node:fs';
import { render as renderCounter } from './components/counter.js';
import { render as renderSimpleCounter } from './components/simpleCounter.js';
import { render as renderTimer } from './components/timer.js';

const server = http.createServer((req, res) => {
  console.log('request:', req.url);

  if (req.url === '/client.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(fs.readFileSync('./dist/client.js'));
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        ${renderSimpleCounter(5)}
        ${renderCounter(10)}
        ${renderTimer(0)}
        <script src="/client.js"></script>
      </body>
    </html>
  `;
  res.setHeader('Content-Type', 'text/html');
  res.end(html);
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

`window.__INITIAL_STATE__ = ...` の `<script>` が消えた。propsはコンポーネントごとにDOMに埋め込まれるので、グローバルな初期状態オブジェクトが要らなくなった。

### 5. `src/client.ts`

ここがメインの変更。ディスパッチャを作る:

```typescript
import { hydrate as hydrateCounter } from './components/counter.js';
import { hydrate as hydrateSimpleCounter } from './components/simpleCounter.js';
import { hydrate as hydrateTimer } from './components/timer.js';

// コンポーネント名 → hydrate関数 のマッピング
const components: Record<string, (el: HTMLElement, props: any) => void> = {
  counter: hydrateCounter,
  simpleCounter: hydrateSimpleCounter,
  timer: hydrateTimer
};

// data-component 属性を持つ全要素を探してハイドレート
document.querySelectorAll<HTMLElement>('[data-component]').forEach((el) => {
  const name = el.dataset.component!;
  const props = JSON.parse(el.dataset.props ?? '{}');

  const hydrate = components[name];
  if (!hydrate) {
    console.warn(`Unknown component: ${name}`);
    return;
  }

  console.log(`hydrating: ${name}`, props);
  hydrate(el, props);
});
```

ポイント:

- `components` オブジェクトに「コンポーネント名 → hydrate関数」のマッピング
- `querySelectorAll('[data-component]')` で対象要素を全部探す
- `el.dataset.component` で名前を取得(これは `data-component` 属性の値)
- `el.dataset.props` をJSON.parseしてpropsを取得
- 対応する `hydrate` を呼ぶ

---

## 動作確認

```bash
npm run build:client
```

ブラウザをリロード。Consoleに以下が出るはず:

```
hydrating: simpleCounter {count: 5}
hydrating: counter {count: 10}
hydrating: timer {count: 0}
```

「ページのソースを表示」で `<div data-component="..." data-props='...'>` が埋め込まれていることも確認できる。

---

## 何が革命的に変わったか

### 1. 新しいコンポーネントを追加するときの作業

**Before(前回まで)**:

1. `src/components/timer.ts` を作る
2. `server.ts` に import 追加 + `renderTimer()` を呼ぶ
3. `client.ts` に import 追加 + `hydrateTimer()` を呼ぶ
4. `__INITIAL_STATE__` の型に `timerSeconds` を追加
5. `__INITIAL_STATE__` にキーを追加してJSONに含める

**After(今回)**:

1. `src/components/timer.ts` を作る
2. `server.ts` に import + `renderTimer()` を呼ぶ
3. `client.ts` の `components` オブジェクトに1行追加

`__INITIAL_STATE__` の管理が完全に消えた。propsは各コンポーネントが自分で持つようになった。

### 2. 同じコンポーネントを複数置けるようになった

これまでは固定IDを使っていたので、ページに `<button id="counter">` を2つ置けなかった。今は `querySelector` で要素ごとに探しているので、何個置いてもOK:

```typescript
${renderCounter(10)}
${renderCounter(20)}
${renderCounter(100)}
```

それぞれ独立して動く。

### 3. これがフレームワークの中身

Next.js、Nuxt、Astroなども、本質的にはこの「`data-` 属性でメタ情報を埋め込んで、クライアント側でディスパッチする」パターンを使っている。もちろんVDOMやSuspenseなど更なる仕組みはあるが、**ハイドレーションの根本原理は完全に同じ**。

---

## ハマったポイント

### `data-component` のtypoでバグった

`timer.ts` を作るときに、`counter.ts` をコピペして `data-component` の値を `"counter"` のまま放置してしまった:

```typescript
// 間違い: timer.ts なのに data-component="counter"
<div data-component="counter" data-props='...'>
  <span>CountUpTimer: ${count}</span>
</div>
```

エラー: `Cannot read properties of null (reading 'addEventListener')`

理由:

1. ブラウザは `data-component="counter"` を見て、`components` オブジェクトから `counter` の `hydrate` を呼ぶ
2. `counter` の `hydrate` は `el.querySelector('button')` を実行
3. でも実際の要素には `<span>` しかない → `null`
4. `null.addEventListener(...)` でエラー

このミスは、**コンポーネント名を文字列で書いている**ことに起因する。TypeScriptの型チェックが効かない部分なので、コピペで作ると気づきにくい。本格的なフレームワークだと、この紐づけをコンパイル時にチェックする仕組み(マクロ、コード生成、ファイル名規約など)を持っている。

### デバッグのコツ

`client.ts` のディスパッチャに `console.log` を仕込んでおいたおかげで、Consoleに出る `hydrating: counter` などのログを見れば「timerなのにcounterで動こうとしてる」とすぐ気づける。

---

## 注意したいセキュリティの話

`data-props='${JSON.stringify({ count })}'` の部分で、もし `count` の代わりにユーザー入力の文字列を埋め込むと、シングルクォートやエスケープ文字でHTMLが壊れたりXSSの原因になる。

例えば propsに `"He said 'hi'"` のような値があると、`data-props` のクォートと衝突する。

本格的なフレームワークだと、これをエスケープする処理が入っている。学習用なので今は気にしなくていいが、「本番ではここをちゃんとやる必要がある」と覚えておく。

---

## ここまでの到達点

```
Step 1: ハイドレーションの最小実装
  → サーバーでHTML生成 + クライアントでイベント付与

Step 2: コンポーネントを別ファイルに切り出す(選択肢A)
  → render関数だけを分離

Step 3: hydrateもコンポーネントに持たせる(選択肢B)
  → コンポーネントが自己完結

Step 4: data-component で自動ディスパッチ ← 今ここ
  → __INITIAL_STATE__が不要に。同じコンポーネントを複数置けるように。
    本物のフレームワークの根本原理に到達。
```

---

## 次のステップ候補

- **propsの型安全化** — 現状 `props: any` になっているところをコンポーネントごとに型を効かせる
- **イベント時の状態をサーバーに送る** — クリックで状態が変わったらサーバーに保存(本格的なSSR体験)
- **仮想DOM自作** — 差分更新の仕組みを体験(難易度高め)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
