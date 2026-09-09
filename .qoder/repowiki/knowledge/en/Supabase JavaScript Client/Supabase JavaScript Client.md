---
kind: external_dependency
name: Supabase JavaScript Client
slug: supabase-js
category: external_dependency
category_hints:
    - vendor_identity
    - sdk_real_api
scope:
    - '**'
source_files:
    - src/lib/supabase.ts
    - src/services/visitasService.ts
    - package.json
---

### Supabase (Postgres + Auth + Storage backend)
- Durable usage model: environment-driven configuration via Next.js public env vars; the service layer encodes business rules on top of PostgREST queries (availability check before insert, default status fields on creation).
- Known integration caveat: the runtime URL must be the project base URL (`https://<project>.supabase.co`), not the `/rest/v1/` endpoint suffix; using the REST endpoint path causes network failures at query time.