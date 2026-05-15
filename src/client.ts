import * as counter from './components/counter.js';
import * as simpleCounter from './components/simpleCounter.js';
import * as timer from './components/timer.js';
import { MODE } from './config.js';

// コンポーネント名 → モジュール のマッピング
const components = {
  counter,
  simpleCounter,
  timer
} as const;

type ComponentName = keyof typeof components;

// 指定した要素配下のコンポーネントを全部ハイドレート
function hydrateAll(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-component]').forEach((el) => {
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
}

// SPAナビゲーション: ページの中身だけ差し替えてハイドレート
async function navigate(path: string): Promise<void> {
  console.log(`navigating to: ${path}`);

  const res = await fetch(`/_page?path=${encodeURIComponent(path)}`);
  const html = await res.text();

  const main = document.querySelector('main')!;
  main.innerHTML = html;

  // URLを更新(リロードせずに見た目だけ変える)
  history.pushState({}, '', path);

  // 新しく挿入したコンポーネントをハイドレート
  hydrateAll(main);
}

// <a> クリックを横取りする
function setupClientSideNavigation() {
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const link = target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || !href.startsWith('/')) return; // 外部リンクは横取りしない

    e.preventDefault();
    navigate(href);
  });

  // ブラウザの戻る/進むボタンに対応
  window.addEventListener('popstate', () => {
    navigate(location.pathname);
  });
}

// --- 初期化 ---

console.log(`mode: ${MODE}`);

// 初回ロード時のハイドレーション(SSRされたDOMに対して)
hydrateAll(document);

// SPAモードならクリック横取りを有効化
if (MODE === 'SPA') {
  setupClientSideNavigation();
}
