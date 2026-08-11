create table if not exists public.tarjamah_order_runtime_snapshots (
  id uuid primary key,
  order_number text not null unique,
  customer_token_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tarjamah_runtime_snapshots_updated_idx
  on public.tarjamah_order_runtime_snapshots(updated_at desc);

alter table public.tarjamah_order_runtime_snapshots enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tarjamah-private',
  'tarjamah-private',
  false,
  52428800,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
