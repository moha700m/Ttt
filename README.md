# ترجمة — Document Translation Platform

Arabic-first document translation SaaS with layout-preserving processing, preview-before-payment, manual Saudi payment methods, and optional certification.

The repository includes an OFL-licensed Noto Sans Arabic font asset for server-side PDF overlays.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. In test mode the admin token is `test-admin-token` unless `ADMIN_SESSION_SECRET` is set.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Production adapters

Set Supabase credentials for Postgres and private Storage, one AI provider key for real translation, and a private certification stamp. Never commit `.env.local` or service keys.

## Visual protection mode

New orders enable visual protection by default. Text-based PDFs and DOCX files are translated in place while images, logos, seals, signatures, barcodes, QR codes, tables, and lines are kept as document elements. For scanned PDFs and raster images, protected mode fails closed instead of rewriting the image; uncheck the protection option only when image text translation is intentionally required.
