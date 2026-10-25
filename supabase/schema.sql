-- 家計簿のデータ(1人1行)。何度実行しても安全(表やデータは消さない)

create table if not exists public.kakeibo_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 本人だけが読み書きできるように鍵をかける(あれば入れ直す)
alter table public.kakeibo_state enable row level security;

drop policy if exists "own row: select" on public.kakeibo_state;
drop policy if exists "own row: insert" on public.kakeibo_state;
drop policy if exists "own row: update" on public.kakeibo_state;

create policy "own row: select" on public.kakeibo_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own row: insert" on public.kakeibo_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own row: update" on public.kakeibo_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ログインしていない人には一切触らせず、ログインした人にだけ必要な操作を許可する
revoke all on public.kakeibo_state from anon;
grant select, insert, update on public.kakeibo_state to authenticated;

-- Supabase(PostgREST)に表の一覧を読み直してもらう
notify pgrst, 'reload schema';
