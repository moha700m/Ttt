# Security controls

- Max upload size: 25MB; extension and MIME allow-list.
- UUID order and storage paths; normalized original filenames.
- Original, working, preview, final, certified, and receipt versions are separate.
- No final endpoint returns a file before payment verification.
- No public stamp asset and no public file bucket.
- Customer A cannot use Customer B's capability token.
- Admin verification and certification are server-side and append audit records.
- SHA-256 is stored for every file version.
- Retention is configured by `FILE_RETENTION_DAYS` for the production cleanup worker.
- Before production: rotate `ADMIN_SESSION_SECRET`, set a real authentication provider, configure rate limiting, and enable a durable queue.
