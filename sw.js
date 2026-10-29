// アプリ本体をキャッシュしてオフラインでも動くようにする。
// ファイルを更新したら CACHE のバージョンを上げること。
const CACHE = 'kakeibo2-v20';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/logic.js',
  './js/icons.js',
  './js/config.js',
  './js/sync.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先、オフライン時はキャッシュ。
// ブラウザの HTTP キャッシュ(GitHub Pages は 10 分)を使わず毎回サーバーに確認して、更新がすぐ届くようにする
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // ページ遷移のリクエストは設定を変えて作り直せないので、URL から作る
  const fresh =
    e.request.mode === 'navigate'
      ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(fresh)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
