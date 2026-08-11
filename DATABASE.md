# Database and storage

The migration in `supabase/migrations/0001_tarjamah_core.sql` creates customers, orders, document versions, jobs, payments, certifications, validation results, pricing, events, and append-only audit logs.

In production, apply the migration through Supabase's migration workflow, set the bucket to private, and keep all file reads/writes behind the server adapter. Guest orders are isolated at the application boundary with capability tokens; authenticated customers additionally receive RLS ownership policies.

The local adapter exists only to keep the complete product flow runnable before the user supplies Supabase credentials. It is not a multi-instance production database.
