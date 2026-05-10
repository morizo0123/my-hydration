# propsの型安全化

各コンポーネントが自分のpropsの型を持つようにして、サーバー側・クライアント側の両方で型チェックを効かせるステップ。動作は変わらないが、コードベースが大きくなったときに効いてくる地味で大事な改善。

## 解決したい問題

前回までの `client.ts`:

```typescript
const components: Record<string, (el: HTMLElement, props: any) => void> = {
  counter: hydrateCounter,
  simpleCounter: hydrateSimpleCounter,
  timer: hydrateTimer
};
```

`props: any` なので、こんなバグが見過ごされる:

```typescript
// counter は { count: number } を期待しているのに...
hydrateCounter(el, { seconds: 100 }); // ← any なのでエラーにならない
```

実行してみるまで気づけない。これを**コンパイル時にエラーにしたい**。

---

## ゴール

各コンポーネントが**自分のpropsの型を export** するようにして、サーバー側もクライアント側もその型を使う:

```typescript
// counter.ts
export type Props = { count: number };

export function render(props: Props): string { ... }
export function hydrate(el: HTMLElement, props: Props): void { ... }
```

---

## 実装

### 1. 各コンポーネントに `Props` 型を export

**`src/components/counter.ts`**:

```typescript
export type Props = { count: number };

export function render(props: Props): string {
  return `
    <div data-component="counter" data-props='${JSON.stringify(props)}'>
      <button>Count: ${props.count}</button>
    </div>
  `;
}

export function hydrate(el: HTMLElement, props: Props): void {
  const btn = el.querySelector('button')!;
  let count = props.count;

  btn.addEventListener('click', () => {
    count++;
    btn.textContent = `Count: ${count}`;
  });
}
```

ポイント:

- `Props` 型を export
- `render` の引数も `Props` 型に統一(これまで `count: number` だったところ)
- `JSON.stringify(props)` でオブジェクト全体をシリアライズ

`simpleCounter.ts`、`timer.ts` も同じパターンで `Props` 型を export する。

### 2. `src/server.ts` の呼び出しを修正

引数がオブジェクトになるので、`renderCounter(10)` → `renderCounter({ count: 10 })` に変える:

```typescript
const html = `
  <!DOCTYPE html>
  <html>
    <body>
      ${renderSimpleCounter({ count: 5 })}
      ${renderCounter({ count: 10 })}
      ${renderTimer({ count: 0 })}
      <script src="/client.js"></script>
    </body>
  </html>
`;
```

これで、もし `renderCounter({ seconds: 10 })` のような間違いを書くと:

```
Object literal may only specify known properties,
and 'seconds' does not exist in type 'Props'.
```

とTypeScriptが教えてくれる。**サーバー側に型安全が手に入った**。

### 3. `src/client.ts` の型を厳密化

ここがメイン。コンポーネント名と型が紐づくようにする:

```typescript
import * as counter from './components/counter.js';
import * as simpleCounter from './components/simpleCounter.js';
import * as timer from './components/timer.js';

// コンポーネント名 → モジュール のマッピング
const components = {
  counter,
  simpleCounter,
  timer
} as const;

type ComponentName = keyof typeof components;

document.querySelectorAll<HTMLElement>('[data-component]').forEach((el) => {
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
```

ポイント:

- `import * as counter` で「モジュール全体」を import → `counter.hydrate`、`counter.Props` のように使える
- `as const` でオブジェクトを「リテラル型」として扱う(`ComponentName` を `"counter" | "simpleCounter" | "timer"` という具体的な型にするため)
- `keyof typeof components` で「`components` のキーの型」を取り出す

これで `name` の型が `"counter" | "simpleCounter" | "timer"` になる。typoしたら型エラー。

---

## 型安全さを試す実験

実装が動いたら、わざとバグを書いて型エラーが出るか試すと理解が深まる。

### 実験1: server.tsで間違ったprops

```typescript
${renderCounter({ seconds: 10 })}  // ← count じゃなくて seconds を渡す
```

→ TypeScript(エディタ)がエラーを表示:

```
Object literal may only specify known properties...
```

### 実験2: server.tsで型違い

```typescript
${renderCounter({ count: "10" })}  // ← 数値じゃなくて文字列
```

→ エラー:

```
Type 'string' is not assignable to type 'number'.
```

### 実験3: client.tsでtypo

```typescript
const components = {
  conter: counter, // ← typo
  simpleCounter,
  timer
} as const;
```

→ HTML側に `data-component="counter"` と書いてあるので、`name` が `"conter" | ...` の型に合わず実行時に弾かれる(さらに編集中にエディタで気づきやすくなる)

---

## 学んだTypeScriptテクニック

### `import * as モジュール名`

```typescript
import * as counter from './components/counter.js';
```

「モジュール全体をひとつのオブジェクトとして取り込む」記法。`counter.render`、`counter.hydrate`、`counter.Props` のように、ドット記法で全部使える。コンポーネントを「モノ」として扱いたいときに便利。

### `as const`

```typescript
const components = { counter, simpleCounter, timer } as const;
```

オブジェクトを**リテラル型**として固定する。これがないと:

```typescript
// as const なし
const components = { counter, simpleCounter, timer };
// 型は { counter: ..., simpleCounter: ..., timer: ... }
// keyof は string になる(キーの値が変わる可能性があるとTSが判断)
```

`as const` を付けると:

```typescript
// as const あり
// 型は { readonly counter: ..., readonly simpleCounter: ..., ... }
// keyof は "counter" | "simpleCounter" | "timer"
```

キーが具体的な文字列リテラル型として扱われるので、typoが検出できる。

### `keyof typeof`

```typescript
type ComponentName = keyof typeof components;
```

- `typeof components` → 値からその型を取り出す
- `keyof T` → 型 T のキーをユニオン型として取り出す

組み合わせると「`components` のキー名のユニオン型」が手に入る。`"counter" | "simpleCounter" | "timer"` のように。

---

## 残された課題(発展)

実は **`props` の中身はまだ `any`**:

```typescript
const props = JSON.parse(el.dataset.props ?? '{}');
//    ^^^^^ any
component.hydrate(el, props);
//                    ^^^^^ any として渡される
```

これは「DOM属性から取り出したJSONなので、実行時までどんな形か分からない」という根本的な問題。本格的に型を効かせるには、**実行時のバリデーション**(zod、valibotなど)が必要。学習用なら今はここまでで十分。

---

## このステップで得たもの

- 各コンポーネントが自分のpropsの型を持つ
- サーバー側で `renderXxx({ ... })` を呼ぶときに型チェックが効く
- クライアント側のディスパッチ辞書に typo があるとエディタが教えてくれる
- `import * as` パターンで「モジュール全体」を扱う書き方を学んだ
- `as const` と `keyof typeof` でリテラル型を活用する練習になった

派手な変化は無いが、**コードベースが大きくなったときに効いてくる**改善。

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

Step 5: propsの型安全化 ← 今ここ
  → サーバー・クライアント両方で型チェックが効くように。
    TypeScriptの import * as / as const / keyof typeof を活用。
```

---

## 次のステップ候補

- **イベント時の状態をサーバーに送る** — クリックで状態が変わったらサーバーに保存(本格的なSSR体験)
- **仮想DOM自作** — 差分更新の仕組みを体験(難易度高め)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
- **ルーティング** — 複数ページに対応
