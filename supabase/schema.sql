-- グルメレコメンド: 同期用テーブル
-- Supabase ダッシュボード → SQL Editor にこのファイルの内容を貼って Run する（1 回だけ）

create table if not exists public.sync_items (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text    not null check (kind in ('fav', 'deleted')),
  shop_id    text    not null,
  data       jsonb,                         -- 店舗情報（削除の墓標では null）
  removed    boolean not null default false, -- true = 解除／復旧された（墓標）
  updated_at bigint  not null,               -- 端末側の変更時刻（ミリ秒）。新しい方が勝つ
  primary key (user_id, kind, shop_id)
);

-- 自分の行しか読めない・書けない
alter table public.sync_items enable row level security;
drop policy if exists "own rows" on public.sync_items;
create policy "own rows" on public.sync_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 古い端末からの上書きを防ぐ: updated_at が既存より古い更新は無視する
create or replace function public.sync_items_keep_newer()
returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return old;
  end if;
  return new;
end $$;
drop trigger if exists sync_items_keep_newer on public.sync_items;
create trigger sync_items_keep_newer
  before update on public.sync_items
  for each row execute function public.sync_items_keep_newer();
