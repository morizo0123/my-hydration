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
