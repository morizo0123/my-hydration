# shallow-equal(オブジェクトを返すselectorに対応)

前ステップのselectorは、`if (next !== prev)` の**参照比較**で判定していた。プリミティブなら期待通り動くが、オブジェクトを返すselectorだと**中身が同じでも別物扱い**されて、無駄な通知が飛んでしまう。それを解決するのがshallow-equal。React Reduxの `useSelector(selector, shallowEqual)` で見かける定番パターン。

## このステップで作るもの

- **`shallowEqual` 関数** — オブジェクトの1階層目のプロパティを比較
- `createStore` の `subscribeSelector` に **等価チェック関数を引数で受け取れる**ように拡張
- オブジェクトを返すselectorのコンポーネント(userLabel)を作って動作確認

---

## 問題を体感する

### オブジェクトを返すselector

`user` オブジェクトの `id` と `name` を両方使いたいコンポーネントがあったとする。素直に書くとこうなる:

```typescript
subscribeSelector(
  (state) => ({ id: state.user.id, name: state.user.name }), // ← 新しいオブジェクトを毎回作る
  (user) => {
    console.log('userLabel update!');
    label.textContent = `${user.name} (id: ${user.id})`;
  }
);
```

これで `incrementCount()` を呼ぶと **userLabel の update が呼ばれてしまう**。

理由: selectorが返す `{ id: 1, name: 'Alice' }` が**毎回新しいオブジェクト**だから。

```typescript
const a = { id: 1, name: 'Alice' };
const b = { id: 1, name: 'Alice' };
a !== b; // → true (別の参照)
```

中身が同じでも「別物」扱いされ、`if (next !== prev)` がtrueになって listener が呼ばれてしまう。

---

## 解決策: 中身のプロパティを比較する

「参照ではなく、**中身の各プロパティを比較**する」ようにする。

`{ id: 1, name: 'Alice' }` と `{ id: 1, name: 'Alice' }` を「同じ」と判定するには、キーごとに値を比べる必要がある。これを **shallow-equal(浅い等価)** と呼ぶ。「浅い」というのは、1階層目のプロパティだけ比較する(ネストしたオブジェクトの中まではチェックしない)、という意味。

---

## 実装

### 1. shallow-equal関数

`src/shallowEqual.ts`(新規作成):

```typescript
export function shallowEqual(a: unknown, b: unknown): boolean {
  // 参照が同じならもちろん同じ(プリミティブ含む)
  if (Object.is(a, b)) return true;

  // どちらかが null/undefined/オブジェクトでない場合は違う
  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  // キーの数が違えば違う
  if (keysA.length !== keysB.length) return false;

  // 各キーの値を比較
  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    ) {
      return false;
    }
  }

  return true;
}
```

やっていること:

1. まず参照で比較(同じなら早期リターン)
2. どちらかがオブジェクトじゃなければ違う扱い
3. キーの数を比べる
4. 各キーの値を比べる(1階層だけ)

### 2. `createStore` に等価チェック関数を渡せるように

```typescript
subscribeSelector: <S>(
  selector: (state: T) => S,
  listener: (selected: S) => void,
  isEqual: (a: S, b: S) => boolean = Object.is  // ← デフォルトはObject.is
) => {
  let prev = selector(value);
  const wrapper: Listener = () => {
    const next = selector(value);
    if (!isEqual(next, prev)) {  // ← 関数で比較
      prev = next;
      listener(next);
    }
  };
  return store.subscribe(wrapper);
},
```

型定義も更新:

```typescript
export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: Listener) => () => void;
  subscribeSelector: <S>(
    selector: (state: T) => S,
    listener: (selected: S) => void,
    isEqual?: (a: S, b: S) => boolean
  ) => () => void;
};
```

デフォルト引数 `= Object.is` で、指定しなければ従来通りの比較。**既存の呼び出しは変更不要**。

### 3. 使う側は必要に応じてshallowEqualを渡す

オブジェクトを返すselectorのときだけ、shallowEqualを渡す:

```typescript
import { shallowEqual } from '../shallowEqual.js';

subscribeSelector(
  (state) => ({ id: state.user.id, name: state.user.name }),
  (user) => {
    label.textContent = `${user.name} (id: ${user.id})`;
  },
  shallowEqual // ← 追加
);
```

---

## 動作確認: 4パターン

| 操作                            | shallowEqualあり | shallowEqualなし |
| ------------------------------- | ---------------- | ---------------- |
| countボタン(userに関係ない変更) | 通知なし ✓       | 通知あり ✗(無駄) |
| Rename to Bob(初回)             | 通知1回 ✓        | 通知1回 ✓        |
| Rename to Bob(同じ値を再度)     | 通知なし ✓       | 通知あり ✗(無駄) |
| Bob → Alice(値が変わる)         | 通知1回 ✓        | 通知1回 ✓        |

「shallowEqualあり」列だけ見ると、常に**必要なときだけ通知**という理想の挙動になる。

「同じ値を再セットしても通知が飛ばない」も副次的なメリット。

---

## 詳細解説1: `Object.is` を使う理由

ほぼ `===` と同じだが、`NaN !== NaN` の罠を回避してくれる:

```typescript
NaN === NaN; // false ← 罠
Object.is(NaN, NaN) + // true  ← 期待通り
  0 ===
  -0; // true
Object.is(+0, -0); // false ← より厳密
```

学習用ならどっちでもいいが、shallow-equalではよく `Object.is` が使われる。

---

## 詳細解説2: デフォルト引数 `= Object.is` とは

### これは「関数のデフォルト引数」

```typescript
subscribeSelector: <S>(
  selector: (state: T) => S,
  listener: (selected: S) => void,
  isEqual: (a: S, b: S) => boolean = Object.is  // ← ここ
) => { ... }
```

「`isEqual` という引数がある。もし呼び出し側が渡さなかったら、デフォルトで `Object.is` を使う」という意味。

### 具体的にどう動くか

```typescript
// パターン1: isEqualを渡さない
subscribeSelector(selector, listener);
// → isEqual は Object.is が使われる

// パターン2: isEqualを渡す
subscribeSelector(selector, listener, shallowEqual);
// → isEqual は shallowEqual が使われる
```

### 普通の引数との違い

```typescript
// デフォルトなし
function greet(name: string) {
  console.log('Hello, ' + name);
}
greet('Alice'); // 'Hello, Alice'
greet(); // ❌ エラー: name が必須

// デフォルトあり
function greet(name: string = 'World') {
  console.log('Hello, ' + name);
}
greet('Alice'); // 'Hello, Alice'
greet(); // 'Hello, World' ← name='World' が自動で入る
```

引数を省略したときの「保険」として値を用意しておく仕組み。

### 設計の意図

前ステップで作った `appCount`、`appMessage` は `isEqual` を渡していない。もしデフォルト値がなければ、それらのコード全部を書き換えないといけない。

デフォルトを `Object.is` にしておくと:

- 既存のコードは変更不要(`Object.is` は前ステップの `!==` とほぼ同じ挙動)
- 新しくshallowEqualを使いたいところだけ、第3引数に渡す

**既存コードを壊さずに機能を追加できる**、というのがデフォルト引数の主な使い道。

### 関数を「値として」扱っている

JavaScriptでは、**関数は値**。数値や文字列と同じように、変数に入れたり、引数として渡したり、デフォルト値にしたりできる。

```typescript
const fn = Object.is; // 関数を変数に代入(できる)
fn(1, 1); // true(呼び出せる)
```

`isEqual = Object.is` は「デフォルトとして `Object.is` 関数を割り当てる」という意味。

---

## 詳細解説3: for ループの中身

```typescript
for (const key of keysA) {
  if (
    !Object.prototype.hasOwnProperty.call(b, key) ||
    !Object.is(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )
  ) {
    return false;
  }
}
```

これは「aとbの各プロパティを1つずつ比べて、違うものがあったら false を返す」処理。ゴツく見えるが、やってることは単純。

### 素朴なバージョン

```typescript
for (const key of keysA) {
  if (a[key] !== b[key]) {
    return false; // 中身が違ったら「等しくない」
  }
}
```

「aの各キーについて、bの同じキーと値が違ったら false」。これが本質。

### 飾りの正体

実装版がゴツく見えるのは、3つの飾りが付いているから:

**飾り1: `Object.prototype.hasOwnProperty.call(b, key)`** → 詳細は次の解説で

**飾り2: `Object.is`**

`!==` の代わりに使っている。NaNやゼロの符号を正しく扱うため。

**飾り3: `(a as Record<string, unknown>)[key]` の型キャスト**

TypeScriptの都合。関数のシグネチャで `a: unknown` になっているので、`a[key]` のインデックスアクセスができない。`Record<string, unknown>`(任意の文字列キーでunknown値を持つ)にキャストして、TypeScriptを納得させている。

### 読みやすく書き直すと

```typescript
for (const key of keysA) {
  const valueInA = (a as any)[key];
  const valueInB = (b as any)[key];
  const bHasKey = key in b;

  if (!bHasKey) return false; // bにキーが無い → 違う
  if (valueInA !== valueInB) return false; // 値が違う → 違う
}
return true; // 全部同じだった
```

**本質は「1つずつ比較して違えば false」**。ゴツいコードの多くは、エッジケース対策と型システム対策の飾り。

---

## 詳細解説4: `Object.prototype.hasOwnProperty.call(b, key)` の正体

for ループの中で一番見慣れない書き方。なぜこんな書き方をするのかを完全に解きほぐす。

### そもそも `hasOwnProperty` って何?

「そのオブジェクトが**自分自身で**そのキーを持っているか?」を判定するメソッド。

```typescript
const obj = { name: 'Alice' };
obj.hasOwnProperty('name'); // true
obj.hasOwnProperty('age'); // false
```

素直な使い方はこれ。

### `in` 演算子との違い

似たものに `in` 演算子がある:

```typescript
const obj = { name: 'Alice' };
'name' in obj; // true
'age' in obj; // false
```

見た目は同じ結果だが、**プロトタイプチェーンを見るかどうか**が違う:

```typescript
const obj = { name: 'Alice' };
'toString' in obj; // true(継承したメソッドまで見る)
obj.hasOwnProperty('toString'); // false(自分自身では持ってない)
```

`toString` は `Object.prototype` から継承しているメソッド。`obj` 自身は持っていない。

- `in` は「継承してるものも含めて持ってる?」を判定
- `hasOwnProperty` は「自分で直接持ってる?」を判定

**shallow-equalの用途では**「そのオブジェクト自身が持つプロパティか」だけ知りたいので、`hasOwnProperty` の方が厳密で適切。

### 「じゃあ普通に `b.hasOwnProperty(key)` でいいじゃん」

そう。多くの場合それで動く。

```typescript
const b = { id: 1, name: 'Alice' };
b.hasOwnProperty('id'); // true ← 動く
```

**でも、壊れるケースがある**。それがゴツい書き方をする理由。

### 壊れるケース1: `hasOwnProperty` を自分で上書きしたオブジェクト

```typescript
const b = {
  id: 1,
  name: 'Alice',
  hasOwnProperty: 'これは文字列' // ← 上書きしてしまった
};

b.hasOwnProperty('id'); // ❌ エラー! hasOwnProperty is not a function
```

`hasOwnProperty` プロパティが文字列に上書きされたので、呼び出せなくなる。

### 壊れるケース2: プロトタイプが `null` のオブジェクト

```typescript
const b = Object.create(null);
b.id = 1;
b.name = 'Alice';

b.hasOwnProperty('id'); // ❌ エラー! hasOwnProperty is not a function
```

`Object.create(null)` で作ったオブジェクトは、`Object.prototype` を継承しないので `hasOwnProperty` メソッドを持たない。

### 現実にありえる?

普通のアプリコードだとほぼ無い。でも、こんな場面ではありえる:

- ユーザーが自由にキーを設定できるオブジェクト(フォーム入力、外部APIのレスポンス)
- `Object.create(null)` を使ったマップ的なオブジェクト(パフォーマンス最適化でたまに使う)
- 悪意ある攻撃(プロトタイプ汚染)

ライブラリは「どんなオブジェクトが渡ってきても壊れないように」書く必要があるので、防御的なコードを書く。

### そこで `Object.prototype.hasOwnProperty.call(b, key)`

これを分解すると、こう読める:

```typescript
Object.prototype.hasOwnProperty // Object の元祖の hasOwnProperty メソッド
  .call(b, key); // これを b に対して、key を引数に呼ぶ
```

### `.call` の意味

`.call` は「関数を、指定した `this` で呼び出す」メソッド。

```typescript
function greet() {
  console.log('Hello, ' + this.name);
}

const obj = { name: 'Alice' };
greet.call(obj); // 'Hello, Alice'
//    ^^^^^^^^^ objを this として greet を実行
```

普通に `greet()` すると `this` が undefined になるが、`greet.call(obj)` すると `this = obj` として実行される。

### `hasOwnProperty` に当てはめると

```typescript
b.hasOwnProperty(key);
// これは実質、以下と同じ意味
// b の hasOwnProperty を、b を this として呼ぶ
```

なので:

```typescript
Object.prototype.hasOwnProperty.call(b, key);
// 「Object 元祖の hasOwnProperty を、b を this として呼ぶ」
```

**b が自分の `hasOwnProperty` を持っていようがいまいが、`Object.prototype` から直接借りてきて実行する**、という強引な方法。

これなら:

- ケース1(上書きされてる): 元祖を使うので影響なし
- ケース2(prototype が null): 元祖を借りてくるので使える

どんなオブジェクトでも安全に判定できる。

### 図でイメージ

```
普通の呼び方:
  b.hasOwnProperty('id')
      ↓
  b の hasOwnProperty を探す
      ↓
  もし b が持ってなければ b の prototype をたどる
      ↓
  Object.prototype.hasOwnProperty が見つかる
      ↓
  実行

  → 途中で「b が hasOwnProperty を上書きしてる」と壊れる
  → 途中で「b の prototype が null」だと壊れる

安全な呼び方:
  Object.prototype.hasOwnProperty.call(b, 'id')
      ↓
  最初から Object.prototype の hasOwnProperty を直接指す
      ↓
  それを b を this として実行

  → b が何をしていても関係ない、確実に動く
```

### 3層構造の意味

```typescript
Object.prototype.hasOwnProperty.call(b, key)
    ↑                    ↑            ↑
   元祖の            そのメソッドを   b をthisにして
オブジェクトの       .callで          key を引数に
prototype に       強制的に呼ぶ       呼ぶ
あるメソッド
```

### 学習用ならもっとカジュアルでOK

- `b.hasOwnProperty(key)` — 99% 動く
- `key in b` — プロトタイプまで見るが、shallow-equal用途なら大差なし
- `Object.hasOwn(b, key)` — 現代的で安全、Node.js 16.9+ で使える

「ライブラリ級の防御的コード」だと元祖借りてくる書き方になる、と理解しておけば十分。

### 最近の書き方: `Object.hasOwn`

ES2022 で追加された新しいメソッドがあって、こっちの方が分かりやすい:

```typescript
Object.hasOwn(b, 'id'); // 上と同じ挙動、より安全で読みやすい
```

Node.js 16.9 以降ならこれが使えるので、今書くならこっちがおすすめ:

```typescript
for (const key of keysA) {
  if (!Object.hasOwn(b, key) || !Object.is(a[key], b[key])) {
    return false;
  }
}
```

**`Object.hasOwn(b, key)` = `Object.prototype.hasOwnProperty.call(b, key)` の現代版**、と覚えるとスッキリする。

---

## 学んだテクニック

### 1. デフォルト引数

引数の後ろに `= 値` を書くことで、省略時のデフォルトを設定できる。既存コードを壊さず新機能を追加する定番パターン。

### 2. 関数を値として扱う(高階関数)

`isEqual: (a: S, b: S) => boolean` は「等価チェックの関数」を受け取る型。関数を引数として渡す発想は、JavaScript/TypeScriptで頻出。

### 3. `Object.is` と `===` の違い

ほぼ同じだが、NaNやゼロの符号を正しく扱えるのが `Object.is`。React内部でも使われている。

### 4. `unknown` と型キャスト

型が分からない引数は `unknown` で受けるのが安全(`any` より厳格)。使うときは `as` で具体的な型に主張する。

### 5. `hasOwnProperty` の安全な呼び方

`Object.prototype.hasOwnProperty.call(obj, key)` という独特の書き方。防御的なライブラリコードで頻出。現代的な代替は `Object.hasOwn(obj, key)`。

### 6. `.call` によるthis指定

`関数.call(thisArg, ...args)` で、任意のオブジェクトを `this` として関数を実行できる。他のオブジェクトのメソッドを「借りてくる」ときによく使う。

---

## Reactとの対応

| 今回の実装                                | React Redux / React                   |
| ----------------------------------------- | ------------------------------------- |
| `subscribeSelector(sel, l, shallowEqual)` | `useSelector(sel, shallowEqual)`      |
| `Object.is` がデフォルト                  | React も `Object.is` がデフォルト     |
| `shallowEqual` を第3引数で選択的に        | `React.memo(Component, shallowEqual)` |

まさに同じことをReactもやっている。

---

## deep-equalは深追いしない

「shallowで足りないケースは?」と気になるかもしれないが、実務ではdeep-equalが必要になる場面はそう多くない。パフォーマンスコストが大きいので、むしろ**イミュータブル更新を徹底して参照比較で済むように設計する**のがモダンな流儀。

Redux/Immer/Zustandなどはこの流儀。「新しいオブジェクトを作るときは、変更があった部分だけ新しく、変わってない部分は同じ参照を再利用」という書き方をすれば、shallow-equalで大部分が事足りる。

---

## このステップで得たもの

### 1. 参照の等価 vs 値の等価

JavaScriptの `===` は参照比較。オブジェクトは中身が同じでも別物扱い。これはJSの基本の挙動で、shallow/deep equalが必要になる根本の理由。

### 2. デフォルト引数の実用

既存コードを壊さずに機能拡張する定番パターン。「オプショナルな引数」を扱うときに便利。

### 3. shallow-equal の設計思想

「1階層だけ比較する」割り切りが、パフォーマンスと実用性のバランスとしてちょうどいい。Reactが採用しているのもこの理由。

### 4. 「値が実質変わってないなら通知しない」副次効果

shallow-equalは無駄な更新を防ぐだけでなく、「同じ値を再セットしても通知が飛ばない」という性質も持つ。冪等性のあるUIが作りやすくなる。

### 5. ライブラリ級の防御的コードを読む力

`Object.prototype.hasOwnProperty.call(...)` のようなゴツい書き方の意図を理解できるように。「壊れるケースを想定して先回りする」という発想が身につくと、他のライブラリの実装も読めるようになる。

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
Step 13: shallow-equal ← 今ここ
```

これで状態管理まわりが実務レベルに到達。React Redux や Zustand を読み解くための土台が完全に揃った状態。

---

## 次のステップ候補

- **動的ルート** — `/users/:id` のようなパラメータ付きURL(データフェッチと相性抜群)
- **データをクライアントに引き渡す** — サーバーで取得したデータをストアに入れる。ハイドレーションの本領
- **仮想DOM自作** — Reactの内部構造(難易度高)
- **Viteの本格SSRモード(B案)** — HMRで開発体験を改善
- **フォーム/バリデーション** — ユーザー入力を扱う仕組み
