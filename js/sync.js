/*
 * Supabase との同期(ライブラリを使わず、Auth と REST の API を直接呼ぶ)
 * データは kakeibo_state テーブルに 1 ユーザー 1 行の JSON として保存する。
 * ブラウザでは window.KakeiboSync、Node では module.exports として使う。
 */
(function (root) {
  'use strict';

  const SESSION_KEY = 'kakeibo2:session';

  function createClient(opts) {
    const base = String(opts.url || '').replace(/\/+$/, '');
    const key = opts.key || '';
    const doFetch = opts.fetch || root.fetch.bind(root);
    const storage = opts.storage;
    const now = opts.now || (() => Date.now());

    function readSession() {
      try {
        return JSON.parse(storage.getItem(SESSION_KEY) || 'null');
      } catch (e) {
        return null;
      }
    }

    function writeSession(s) {
      try {
        if (s) storage.setItem(SESSION_KEY, JSON.stringify(s));
        else storage.removeItem(SESSION_KEY);
      } catch (e) {
        /* 保存できなくても、このページを開いているあいだは使える */
      }
    }

    let session = readSession();

    function sessionFrom(res) {
      return {
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
        expiresAt: res.expires_at ? res.expires_at * 1000 : now() + (res.expires_in || 3600) * 1000,
        userId: res.user && res.user.id,
        email: res.user && res.user.email
      };
    }

    async function request(path, init) {
      let res;
      try {
        res = await doFetch(base + path, init);
      } catch (e) {
        const err = new Error('サーバーにつながりません');
        err.offline = true;
        throw err;
      }
      const text = await res.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch (e) {
        body = text;
      }
      if (!res.ok) {
        const msg = (body && (body.error_description || body.msg || body.message || body.error)) || 'エラー ' + res.status;
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      return body;
    }

    async function auth(grant, payload) {
      const res = await request('/auth/v1/token?grant_type=' + grant, {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      session = sessionFrom(res);
      writeSession(session);
      return session;
    }

    async function login(email, password) {
      try {
        return await auth('password', { email, password });
      } catch (e) {
        if (e.status === 400) e.message = 'メールアドレスかパスワードが違います';
        throw e;
      }
    }

    // 期限が近ければ更新したトークンを返す。更新できなければログアウト状態にする
    async function token() {
      if (!session) throw Object.assign(new Error('ログインしていません'), { loggedOut: true });
      if (session.expiresAt - 60000 > now()) return session.accessToken;
      try {
        await auth('refresh_token', { refresh_token: session.refreshToken });
        return session.accessToken;
      } catch (e) {
        if (!e.offline) {
          session = null;
          writeSession(null);
          e.loggedOut = true;
          e.message = 'ログインの有効期限が切れました。もう一度ログインしてください';
        }
        throw e;
      }
    }

    async function restHeaders(extra) {
      return Object.assign({ apikey: key, Authorization: 'Bearer ' + (await token()) }, extra || {});
    }

    // サーバーの行。まだ無ければ null
    async function getRemote() {
      const rows = await request('/rest/v1/kakeibo_state?select=data,updated_at', {
        method: 'GET',
        headers: await restHeaders({ Accept: 'application/json' })
      });
      return rows && rows.length ? { data: rows[0].data, updatedAt: rows[0].updated_at } : null;
    }

    // 保存して、サーバーに記録された更新時刻を返す
    async function putRemote(data) {
      const headers = await restHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      });
      const rows = await request('/rest/v1/kakeibo_state?on_conflict=user_id', {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: session.userId, data, updated_at: new Date(now()).toISOString() })
      });
      return rows && rows[0] ? rows[0].updated_at : null;
    }

    async function logout() {
      const s = session;
      session = null;
      writeSession(null);
      if (!s) return;
      try {
        await request('/auth/v1/logout', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + s.accessToken } });
      } catch (e) {
        /* サーバー側の取り消しに失敗しても、この端末からは消えている */
      }
    }

    return {
      configured: !!(base && key),
      get session() {
        return session;
      },
      login,
      logout,
      getRemote,
      putRemote
    };
  }

  /*
   * 1 回分の同期。
   * local = { state, isEmpty }、lastSyncedAt = 前回同期したときのサーバーの更新時刻(初回は null)
   * dirty = 前回の同期のあと、この端末で変更があったか
   * resolveConflict({ first, remote }) は 'remote' / 'local' / 'cancel' を返す
   * 戻り値: { action: 'pulled' | 'pushed' | 'none' | 'cancelled', state?, lastSyncedAt }
   */
  async function syncOnce({ client, local, lastSyncedAt, dirty, resolveConflict }) {
    const remote = await client.getRemote();
    const first = lastSyncedAt == null;
    let pushLocal = !remote || dirty || first;

    if (remote && remote.updatedAt !== lastSyncedAt) {
      // サーバー側が前回の同期から変わっている
      const localChanged = (dirty || first) && !local.isEmpty;
      let choice = 'remote';
      if (localChanged) choice = await resolveConflict({ first, remote });
      if (choice === 'cancel') return { action: 'cancelled', lastSyncedAt };
      if (choice === 'remote') return { action: 'pulled', state: remote.data, lastSyncedAt: remote.updatedAt };
      pushLocal = true;
    }

    if (!pushLocal) return { action: 'none', lastSyncedAt };
    const updatedAt = await client.putRemote(local.state);
    return { action: 'pushed', lastSyncedAt: updatedAt };
  }

  const api = { createClient, syncOnce, SESSION_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KakeiboSync = api;
})(typeof self !== 'undefined' ? self : this);
