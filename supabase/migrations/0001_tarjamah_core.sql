create extension if not exists pgcrypto;

create type public.order_status as enum ('uploaded','analyzing','quote_ready','awaiting_translation','translating','rendering','validating','needs_review','preview_ready','awaiting_payment','awaiting_payment_verification','payment_verified','awaiting_certification','certification_review','certified','completed','failed');
create type public.service_kind as enum ('translation','certified');
create type public.file_version as enum ('original','extracted','translated_working','translated_preview','translated_final','certified_final','payment_receipt');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_token_hash text,
  source_language text not null check (source_language in ('ar','en')),
  target_language text not null check (target_language in ('ar','en')),
  service public.service_kind not null,
  document_type text not null default 'general',
  urgent boolean not null default false,
  pages integer not null default 1 check (pages > 0),
  translation_amount numeric(12,2) not null default 0,
  certification_amount numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  status public.order_status not null default 'uploaded',
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','awaiting_payment_verification','verified','rejected')),
  payment_method text,
  validation_report jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_language <> target_language)
);

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  version public.file_version not null,
  storage_bucket text not null default 'tarjamah-private',
  storage_key text not null unique,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  created_at timestamptz not null default now()
);

create table public.translation_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  attempts integer not null default 0,
  idempotency_key text not null unique,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null,
  receipt_file_id uuid references public.document_files(id) on delete set null,
  status text not null default 'awaiting_payment_verification' check (status in ('awaiting_payment_verification','verified','rejected')),
  submitted_at timestamptz not null default now(),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  rejection_reason text
);

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  document_hash text,
  certified_document_hash text,
  status text not null default 'pending' check (status in ('pending','issued','revision_requested')),
  notes text
);

create table public.validation_results (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.admin_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_type text not null,
  actor_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null,
  action text not null,
  order_id uuid references public.orders(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index orders_status_idx on public.orders(status, created_at desc);
create index orders_customer_idx on public.orders(customer_id, created_at desc);
create index files_order_version_idx on public.document_files(order_id, version);
create index payment_submissions_status_idx on public.payment_submissions(status, submitted_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.document_files enable row level security;
alter table public.translation_jobs enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.certifications enable row level security;
alter table public.validation_results enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.admin_settings enable row level security;
alter table public.order_events enable row level security;
alter table public.audit_logs enable row level security;

create policy "customers read own" on public.customers for select to authenticated using (auth_user_id = (select auth.uid()));
create policy "customers update own" on public.customers for update to authenticated using (auth_user_id = (select auth.uid())) with check (auth_user_id = (select auth.uid()));
create policy "orders read own" on public.orders for select to authenticated using (customer_id in (select id from public.customers where auth_user_id = (select auth.uid())));
create policy "files read own" on public.document_files for select to authenticated using (order_id in (select o.id from public.orders o join public.customers c on c.id = o.customer_id where c.auth_user_id = (select auth.uid())));
create policy "validation read own" on public.validation_results for select to authenticated using (order_id in (select o.id from public.orders o join public.customers c on c.id = o.customer_id where c.auth_user_id = (select auth.uid())));

revoke all on public.audit_logs from anon, authenticated;
revoke all on public.admin_settings from anon, authenticated;
revoke all on public.pricing_rules from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tarjamah-private', 'tarjamah-private', false, 26214400, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "private bucket has no public reads" on storage.objects for select to anon using (false);
create policy "private bucket server writes only" on storage.objects for insert to authenticated with check (false);
