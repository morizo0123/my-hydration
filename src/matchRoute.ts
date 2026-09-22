export type MatchResult = {
  params: Record<string, string>;
};

export function matchRoute(pattern: string, path: string): MatchResult | null {
  // パターンをスラッシュで分割
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

  return {
    params
  };
}
