// 実行: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/sync.js');

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

// Supabase の Auth / REST の最低限の振る舞いをまねる
function fakeSupabase() {
  const calls = [];
  const db = { row: null };
  let clock = 1000;
  let tokenSeq = 0;
  const issue = () => ({ access_token: 'at' + ++tokenSeq, refresh_token: 'rt' + tokenSeq, expires_in: 3600, user: { id: 'u1', email: 'me@example.com' } });
  const reply = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) });
  const fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname + u.search, init });
    const h = init.headers || {};
    if (h.apikey !== 'pub') return reply(401, { message: 'no api key' });
    if (u.pathname === '/auth/v1/token') {
      const body = JSON.parse(init.body);
      if (u.searchParams.get('grant_type') === 'password') {
        return body.password === 'right' ? reply(200, issue()) : reply(400, { error_description: 'Invalid login credentials' });
      }
      return body.refresh_token === 'rt' + tokenSeq ? reply(200, issue()) : reply(400, { error_description: 'Invalid Refresh Token' });
    }
    if (u.pathname === '/auth/v1/logout') return reply(204, null);
    if (u.pathname === '/rest/v1/kakeibo_state') {
      if (h.Authorization !== 'Bearer at' + tokenSeq) return reply(401, { message: 'JWT expired' });
      if (init.method === 'GET') return reply(200, db.row ? [db.row] : []);
      const body = JSON.parse(init.body);
      db.row = { data: body.data, updated_at: 't' + ++clock };
      return reply(201, [db.row]);
    }
    return reply(404, null);
  };
  return { fetch, calls, db };
}

function setup(nowRef) {
  const fake = fakeSupabase();
  const storage = memoryStorage();
  const client = S.createClient({ url: 'https://x.supabase.co/', key: 'pub', fetch: fake.fetch, storage, now: () => nowRef.t });
  return { fake, storage, client };
}

test('ログインとセッションの保存', async () => {
  const now = { t: 0 };
  const { client, storage } = setup(now);
  await assert.rejects(client.login('me@example.com', 'wrong'), /メールアドレスかパスワードが違います/);
  const s = await client.login('me@example.com', 'right');
  assert.equal(s.userId, 'u1');
  assert.equal(JSON.parse(storage.getItem(S.SESSION_KEY)).accessToken, 'at1');
});

test('保存と読み込み、期限切れ前のトークン更新', async () => {
  const now = { t: 0 };
  const { client, fake } = setup(now);
  await client.login('me@example.com', 'right');
  assert.equal(await client.getRemote(), null);
  const updated = await client.putRemote({ transactions: [1] });
  assert.equal(updated, 't1001');
  const put = fake.calls.find((c) => c.init.method === 'POST' && c.path.startsWith('/rest'));
  assert.equal(put.path, '/rest/v1/kakeibo_state?on_conflict=user_id');
  assert.equal(JSON.parse(put.init.body).user_id, 'u1');
  assert.match(put.init.headers.Prefer, /merge-duplicates/);

  now.t = 3600 * 1000; // 期限切れ → 自動で更新してから読む
  const r = await client.getRemote();
  assert.deepEqual(r, { data: { transactions: [1] }, updatedAt: 't1001' });
  assert.ok(fake.calls.some((c) => c.path === '/auth/v1/token?grant_type=refresh_token'));
});

test('トークンを更新できなければログアウト状態になる', async () => {
  const now = { t: 0 };
  const { client, storage } = setup(now);
  await client.login('me@example.com', 'right');
  storage.setItem(S.SESSION_KEY, '{}');
  const s = client.session;
  s.refreshToken = 'old';
  now.t = 3600 * 1000;
  await assert.rejects(client.getRemote(), (e) => e.loggedOut === true);
  assert.equal(client.session, null);
  assert.equal(storage.getItem(S.SESSION_KEY), null);
});

test('通信できないときは offline のエラー', async () => {
  const client = S.createClient({ url: 'https://x', key: 'pub', fetch: async () => { throw new TypeError('Failed to fetch'); }, storage: memoryStorage() });
  await assert.rejects(client.login('a', 'b'), (e) => e.offline === true);
});

// syncOnce 用の簡易クライアント
function stubClient(remote) {
  const state = { remote, puts: [] };
  return {
    state,
    getRemote: async () => state.remote,
    putRemote: async (data) => {
      state.puts.push(data);
      state.remote = { data, updatedAt: 'r' + state.puts.length };
      return state.remote.updatedAt;
    }
  };
}
const never = async () => assert.fail('確認は出ないはず');

test('初回ログイン:サーバーが空なら端末のデータを送る', async () => {
  const c = stubClient(null);
  const r = await S.syncOnce({ client: c, local: { state: { a: 1 }, isEmpty: false }, lastSyncedAt: null, dirty: false, resolveConflict: never });
  assert.equal(r.action, 'pushed');
  assert.equal(r.lastSyncedAt, 'r1');
});

test('初回ログイン:端末が空ならサーバーのデータを使う(新しいiPhoneなど)', async () => {
  const c = stubClient({ data: { a: 'server' }, updatedAt: 's1' });
  const r = await S.syncOnce({ client: c, local: { state: {}, isEmpty: true }, lastSyncedAt: null, dirty: false, resolveConflict: never });
  assert.equal(r.action, 'pulled');
  assert.deepEqual(r.state, { a: 'server' });
  assert.equal(c.state.puts.length, 0);
});

test('初回ログイン:両方にデータがあれば確認する', async () => {
  let asked;
  const c = stubClient({ data: { a: 'server' }, updatedAt: 's1' });
  const ask = async (q) => ((asked = q), 'local');
  const r = await S.syncOnce({ client: c, local: { state: { a: 'phone' }, isEmpty: false }, lastSyncedAt: null, dirty: false, resolveConflict: ask });
  assert.equal(asked.first, true);
  assert.equal(r.action, 'pushed');
  assert.deepEqual(c.state.remote.data, { a: 'phone' });
});

test('いつもの同期:端末だけ変わっていれば送る、変化がなければ何もしない', async () => {
  const c = stubClient({ data: { a: 1 }, updatedAt: 's1' });
  const pushed = await S.syncOnce({ client: c, local: { state: { a: 2 }, isEmpty: false }, lastSyncedAt: 's1', dirty: true, resolveConflict: never });
  assert.equal(pushed.action, 'pushed');
  const none = await S.syncOnce({ client: c, local: { state: { a: 2 }, isEmpty: false }, lastSyncedAt: 'r1', dirty: false, resolveConflict: never });
  assert.equal(none.action, 'none');
});

test('いつもの同期:サーバーだけ変わっていれば取り込む', async () => {
  const c = stubClient({ data: { a: 'new' }, updatedAt: 's2' });
  const r = await S.syncOnce({ client: c, local: { state: { a: 'old' }, isEmpty: false }, lastSyncedAt: 's1', dirty: false, resolveConflict: never });
  assert.equal(r.action, 'pulled');
  assert.equal(r.lastSyncedAt, 's2');
});

test('両方変わっていたら確認し、キャンセルなら何もしない', async () => {
  const c = stubClient({ data: { a: 'server' }, updatedAt: 's2' });
  const r = await S.syncOnce({ client: c, local: { state: { a: 'phone' }, isEmpty: false }, lastSyncedAt: 's1', dirty: true, resolveConflict: async () => 'cancel' });
  assert.equal(r.action, 'cancelled');
  assert.equal(c.state.puts.length, 0);
  const r2 = await S.syncOnce({ client: c, local: { state: { a: 'phone' }, isEmpty: false }, lastSyncedAt: 's1', dirty: true, resolveConflict: async () => 'remote' });
  assert.equal(r2.action, 'pulled');
});
