# ترجمة — Architecture

## Core principle

The original document is immutable. Every processing step creates a new file version. PDF translation uses text-block coordinates and local overlays; DOCX translation changes only text nodes inside the OOXML package, retaining styles, tables, headers, footers, media, and relationships.

## Flow

`upload -> analyze -> quote -> translate -> validate -> preview -> manual payment -> admin verification -> final / certification`

The application runs in `ENABLE_TEST_MODE` with a private local storage adapter. Supabase Storage and Postgres are the production adapter. AI is selected through `AI_PROVIDER`; `mock` is deterministic for development and tests.

## Security boundaries

- Customer capability tokens are returned once and stored only as SHA-256 hashes.
- Files never live under `public/`.
- Admin actions require a server-side token and are logged.
- The certification stamp is read only by the server-side certification worker.
- Final downloads require verified payment and, for certified orders, an issued certification.

## Extension points

`lib/document-engine.ts` is the worker contract. A durable queue can call the same idempotent operations without changing the customer UI. The Supabase migration contains the durable schema, RLS, indexes, and private bucket definition.
