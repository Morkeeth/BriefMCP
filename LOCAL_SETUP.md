# BRIEFMCP – Local Setup & Project Analysis

**Internal reference.** Consolidates everything needed to run the project locally, why auth fails, build requirements, and missing pieces.

---

## 1. Project Overview

### What This Is

**BRIEFMCP** is an AI-powered knowledge base built for the Paris Innov Hackathon. It gives AI agents shared, up-to-date project context via RAG (Retrieval Augmented Generation) instead of copying large documents into prompts.

**Flow:**
1. Upload docs (PDF/markdown) → chunk & embed (OpenAI text-embedding-3-small) → store in Supabase pgvector
2. Query → embed question → vector search → LLM generates cited answer (Featherless or OpenAI)
3. MCP tools expose search/add/list/delete for Claude, Cursor, Copilot

**Architecture:**
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind
- **Backend:** Supabase (PostgreSQL + pgvector + Edge Functions)
- **Auth:** Supabase Auth (email/password + Google, GitHub, Notion OAuth)
- **Docs:** `context_documents`, `document_chunks` (embeddings), `organizations`, `users`, `organization_members`

---

## 2. Why Auth Fails

Auth typically fails for these reasons:

| Cause | Fix |
|-------|-----|
| Missing/invalid Supabase URL or anon key | Use real values from Supabase project settings |
| **Redirect URLs not configured in Supabase** | Add `http://localhost:3000/auth/callback` and `http://localhost:3000` in Auth → URL Configuration |
| OAuth providers not enabled | Auth → Providers → enable Google/GitHub; add client ID/secret |
| Notion OAuth | Requires separate Notion integration; optional |
| Base schema/migrations not applied | Run migrations or apply base schema |
| `get_user_organizations` RPC missing | Run `supabase/migrations/*.sql` in order |

---

## 3. Local Setup Checklist

### 3.1 Prerequisites

- Node.js 18+
- npm
- Supabase account
- OpenAI API key (required for embeddings)
- (Optional) Featherless API key for LLMs
- (Optional) Google/GitHub OAuth apps for social login

### 3.2 Environment Variables

Create `.env.local` from this template:

```env
# === REQUIRED (app won't boot without these) ===
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# === REQUIRED for Edge Functions (ingest, search) ===
# Set via: supabase secrets set OPENAI_API_KEY=sk-...
OPENAI_API_KEY=sk-...

# === Optional - server-side admin ops, Stripe, etc. ===
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# === Optional - alternative LLMs (Mistral, Qwen, etc.) ===
FEATHERLESS_API_KEY=...

# === Optional - billing ===
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# === Optional - Notion connector ===
NEXT_PUBLIC_NOTION_CLIENT_ID=...
NEXT_PUBLIC_NOTION_REDIRECT_URI=http://localhost:3000/auth/callback
```

**Note:** `.env.example` does not list `OPENAI_API_KEY`, but it is required for document ingestion and search.

### 3.3 Supabase Project Setup

1. **Create project** at [supabase.com/dashboard](https://supabase.com/dashboard)
2. **Auth → URL Configuration:**
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/auth/callback`
3. **Auth → Providers:**
   - Email: enable
   - Google/GitHub: add Client ID + Secret from OAuth apps
4. **API settings:** copy Project URL and anon/public key into `.env.local`

### 3.4 Database Schema

Migrations in `supabase/migrations/` assume existing base tables. If starting from scratch, you need:

- **Supabase Auth:** `auth.users` (built-in)
- **Base tables:** `users`, `organizations`, `context_documents`, `document_chunks`
- **pgvector:** `vector` column on `document_chunks` (1536 dimensions for `text-embedding-3-small`)
- **RPC:** `match_documents(query_embedding, match_threshold, match_count, filter_org_id)`
- **RPC:** `get_user_organizations(p_user_id)`

The repo migrations extend this schema (multi-org, RLS, Stripe, etc.). There is no initial schema migration in this repo—likely created manually or in another project.

**Initial schema (run first if tables don't exist):**

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- users: extends auth.users, synced via trigger or callback
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  org_id UUID,
  role TEXT,
  mcp_token VARCHAR(64) UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  ref VARCHAR(50) UNIQUE,
  invite_code VARCHAR(6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- context_documents
CREATE TABLE IF NOT EXISTS context_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT,
  source_type TEXT DEFAULT 'upload',
  content TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- document_chunks with pgvector (1536 = OpenAI text-embedding-3-small)
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES context_documents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_index INT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- match_documents RPC (pgvector cosine similarity)
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 5,
  filter_org_id UUID DEFAULT NULL
)
RETURNS TABLE (id UUID, document_id UUID, content TEXT, similarity FLOAT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE (filter_org_id IS NULL OR dc.org_id = filter_org_id)
    AND (1 - (dc.embedding <=> query_embedding)) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

Then apply migrations in `supabase/migrations/` in date order (20260124 → 20260130).

**Apply migrations:**

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Or run SQL files manually in Supabase SQL Editor in the correct order (date prefix order).

### 3.5 Edge Function Secrets

For local Supabase:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set FEATHERLESS_API_KEY=...   # optional
```

For hosted Supabase: set in Dashboard → Project Settings → Edge Functions → Secrets.

### 3.6 Run Locally

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

---

## 4. Build Mode

```bash
npm run build
```

**Expected:**
- Next.js 16 build with Turbopack
- SSR/static generation for pages
- May fail or warn on:
  - Missing `NEXT_PUBLIC_SUPABASE_*` (Supabase client creation)
  - Missing `STRIPE_*` if billing code runs at build time
  - Type/lint issues

**Production:**

```bash
npm run build
npm run start
```

Needs `NEXT_PUBLIC_APP_URL` set to the deployed URL for OAuth redirects.

---

## 5. What’s Missing / Incomplete

| Item | Status |
|------|--------|
| Base schema migration | Not in repo; `users`, `organizations`, `context_documents`, `document_chunks`, `match_documents` must exist before project migrations |
| `.env.example` | Missing `OPENAI_API_KEY` |
| `match_documents` RPC definition | Not in migrations; must return `id`, `document_id`, `content`, `similarity` and filter by `filter_org_id` |
| Supabase `config.toml` | Not present (optional for local Supabase) |
| Email confirmation | Depends on Supabase Auth config (email confirmation on/off) |
| Terms/Privacy pages | Linked from login (`/terms`, `/privacy`) but may not exist |

---

## 6. Auth Flow Summary

1. **Login/Signup** → Supabase Auth (`signInWithPassword`, `signUp`, `signInWithOAuth`)
2. **OAuth** → redirect to provider → redirect to `/auth/callback?code=...`
3. **Callback** → `exchangeCodeForSession(code)` → check `users` table → create row if new → redirect to `/organizations` or `/onboarding`
4. **Middleware** → `updateSession()` on each request to refresh session

If Supabase URL/key are wrong or redirect URLs aren’t configured, auth will fail at steps 2–3.

---

## 7. File Reference

| Path | Purpose |
|------|---------|
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server Supabase client (cookies) |
| `src/lib/supabase/middleware.ts` | Session refresh in middleware |
| `src/middleware.ts` | Runs `updateSession` on matched routes |
| `src/app/auth/callback/route.ts` | OAuth callback handler |
| `supabase/functions/ingest-context/` | Document ingestion + embeddings |
| `supabase/functions/search-context/` | RAG search + LLM response |
| `supabase/migrations/` | Schema changes (assume base schema) |

---

**Last updated:** Internal doc. Keep in sync with setup changes.
