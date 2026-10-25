/* 線画アイコン(24x24、stroke で描画。色は currentColor) */
(function (root) {
  'use strict';

  // カテゴリー用
  const CATEGORY = {
    food: { label: '食事', d: '<circle cx="12.5" cy="12.5" r="4.5"/><circle cx="12.5" cy="12.5" r="2"/><path d="M3.5 4v4.5c0 1 .7 1.6 1.5 1.6s1.5-.6 1.5-1.6V4M5 4v16"/><path d="M20.5 4c-1.6 1-2.3 3.5-2.3 6.5h2.3V20"/>' },
    bottle: { label: 'ボトル', d: '<path d="M10 3h4v3h-4z"/><path d="M10 6c-2.5 1-4 3-4 5.5V19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7.5c0-2.5-1.5-4.5-4-5.5"/><path d="M12 11.5s-2.3 2.4-2.3 3.9a2.3 2.3 0 0 0 4.6 0c0-1.5-2.3-3.9-2.3-3.9z"/>' },
    shirt: { label: 'シャツ', d: '<path d="M8.5 3.5 3 6.5l2 4 2.3-1.1V20.5h9.4V9.4l2.3 1.1 2-4-5.5-3c-.6 1.5-2 2.4-3.5 2.4s-2.9-.9-3.5-2.4z"/>' },
    lipstick: { label: '口紅', d: '<path d="M10 9V5.5L14 3v6"/><path d="M9 9h6v4H9z"/><path d="M8 13h8v8H8z"/>' },
    cheers: { label: '乾杯', d: '<path d="M3.5 4.5 9 5.5 8 10.5a2.8 2.8 0 0 1-5.4-1z"/><path d="M5.6 11.3 4.7 17M2.5 17.4l4.3.5"/><path d="M20.5 4.5 15 5.5l1 5a2.8 2.8 0 0 0 5.4-1z"/><path d="M18.4 11.3l.9 5.7M21.5 17.4l-4.3.5"/><path d="M11 3l.6 1.5M13 3l-.6 1.5"/>' },
    pill: { label: '薬', d: '<rect x="2.5" y="13" width="13" height="7" rx="3.5"/><path d="M9 13v7"/><circle cx="17" cy="7.5" r="4"/><path d="M14.2 10.3l5.6-5.6"/>' },
    notebook: { label: 'ノート', d: '<path d="M4.5 3h10v18h-10z"/><path d="M7.5 3v18"/><path d="M19.2 6.3l1.7 1.7-7.6 7.6-2.6.9.9-2.6z"/>' },
    faucet: { label: '蛇口', d: '<path d="M3 6.5h9a6 6 0 0 1 6 6v1h-3v-1a3 3 0 0 0-3-3H3z"/><path d="M8 6.5V3.5M6 3.5h4"/><path d="M16.5 16s-1.9 2.2-1.9 3.4a1.9 1.9 0 0 0 3.8 0c0-1.2-1.9-3.4-1.9-3.4z"/>' },
    train: { label: '電車', d: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10h12M9.5 6h5"/><circle cx="9.3" cy="13.5" r=".7"/><circle cx="14.7" cy="13.5" r=".7"/><path d="M8.5 21l2-4M15.5 21l-2-4"/>' },
    phone: { label: 'スマホ', d: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 5h2"/><circle cx="12" cy="18.3" r=".8"/>' },
    house: { label: '家', d: '<path d="M3 11 12 4l9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M7.5 12.5h4v3.5h-4zM14 20v-7.5h3V20"/>' },
    cart: { label: 'カート', d: '<path d="M3 4h2.5l2 11h11l2-8H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>' },
    coffee: { label: 'カフェ', d: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3"/>' },
    game: { label: 'ゲーム', d: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9"/><circle cx="17.5" cy="13.8" r=".9"/>' },
    paw: { label: 'ペット', d: '<path d="M12 12.5c-3 0-5 3-5 5 0 1.5 1.2 2.5 2.5 2.5 1 0 1.6-.5 2.5-.5s1.5.5 2.5.5c1.3 0 2.5-1 2.5-2.5 0-2-2-5-5-5z"/><circle cx="6" cy="10" r="1.7"/><circle cx="9.5" cy="6" r="1.7"/><circle cx="14.5" cy="6" r="1.7"/><circle cx="18" cy="10" r="1.7"/>' },
    card: { label: 'カード', d: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M6.5 15h4"/>' },
    wallet: { label: '財布', d: '<path d="M4 7.5h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.5l11-3v3"/><path d="M20 12h-4a1.5 1.5 0 0 0 0 3h4"/>' },
    gift: { label: 'プレゼント', d: '<rect x="4" y="9" width="16" height="4"/><path d="M5.5 13v8h13v-8M12 9v12"/><path d="M12 9c-1-3-5-4-5-1.5S11 9 12 9zM12 9c1-3 5-4 5-1.5S13 9 12 9z"/>' },
    sparkle: { label: 'キラキラ', d: '<path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z"/><path d="M18.5 15.5v5M16 18h5"/>' },
    coins: { label: 'コイン', d: '<path d="M3 15.5h3.5l3 1.5h4a1.5 1.5 0 0 1 0 3H9M13.5 20l5-2.2a1.6 1.6 0 0 1 1.9 2.4L17 22H9l-3-1.5H3"/><circle cx="10" cy="5.5" r="2.5"/><circle cx="15.5" cy="6.5" r="2"/><circle cx="12" cy="11" r="2"/>' },
    box: { label: '箱', d: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>' }
  };

  // 画面の操作用
  const UI = {
    pencil: '<path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M14.5 6l3.5 3.5"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="1.5"/><path d="M3 9h18"/><path d="M7 12.5h.01M10.3 12.5h.01M13.7 12.5h.01M17 12.5h.01M7 16h.01M10.3 16h.01M13.7 16h.01M17 16h.01" stroke-width="2.2"/>',
    pie: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/><path d="M15 3.5v6h6a6.5 6.5 0 0 0-6-6z"/>',
    home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
    dots: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevL: '<path d="M15 5l-7 7 7 7"/>',
    chevR: '<path d="M9 5l7 7-7 7"/>',
    trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };

  function svg(d, opts) {
    const o = opts || {};
    const size = o.size || 24;
    const color = o.color ? ' style="color:' + o.color + '"' : '';
    return (
      '<svg class="ic ' + (o.cls || '') + '"' + color + ' width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (o.stroke || 1.6) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'
    );
  }

  root.KakeiboIcons = {
    CATEGORY,
    category(name, color, size) {
      return svg((CATEGORY[name] || CATEGORY.box).d, { color, size: size || 36, stroke: 1.5 });
    },
    ui(name, size, stroke) {
      return svg(UI[name], { size: size || 24, stroke: stroke || 1.8 });
    }
  };
})(self);
