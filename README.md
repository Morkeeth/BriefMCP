# BRIEFMCP

## TLDR

Give a team's AI assistants a shared knowledge base through MCP.<br>
For developers who need project context without repeatedly pasting whole specifications.<br>
This repository is the frontend of the hackathon project; the linked repositories supply the other components.

[📋 Devpost – Full hackathon pitch, solution context & screenshots](https://devpost.com/software/briefmcp)

## The problem and approach

Developers paste whole PRDs into prompts, and different assistants on one project make conflicting decisions because each works from a different context.
It indexes your project's constitution and specs into a Supabase pgvector knowledge base and serves cited, token-budgeted excerpts through MCP tools (`search-context`, `add-knowledge`, `list-knowledge`, `delete-knowledge`) to Claude, Cursor or Copilot.
Built at the Paris Innovation Hackathon 2026 as a three-repo project; this repo is the frontend. Full pitch on Devpost: https://devpost.com/software/briefmcp

## Review and pick up the work

[LOCAL_SETUP.md](LOCAL_SETUP.md) · [Agent guide](AGENTS.md)

Start with the linked source, setup and evidence. Recorded demos and sample data keep their original scope; use the repository instructions for a fresh run.

> **AI-powered knowledge base that gives every AI agent on your team the same, up-to-date project context; without copy-pasting massive markdown files.**

**[📋 Devpost – Full hackathon pitch, solution context & screenshots](https://devpost.com/software/briefmcp)**

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com)
[![MCP](https://img.shields.io/badge/MCP-Protocol-orange)](https://modelcontextprotocol.io)

## 🏗️ Project Ecosystem

BRIEFMCP consists of **three integrated repositories**:

### 1. **Brief Main Frontend** (This Repo)
**Repository:** [martinbon39/parisinnovhack](https://github.com/martinbon39/parisinnovhack)

The main knowledge base platform with:
- Document management dashboard
- PDF upload and text extraction
- Multi-tenant architecture
- Token savings analytics
- Beautiful, responsive UI

### 2. **BriefKit** - Context-First Development Toolkit
**Repository:** [marlowetal653/BriefKit](https://github.com/marlowetal653/BriefKit)

Constitution-driven and spec-driven development framework:
- `/brief.context` - Check project knowledge before any action
- `/brief.constitution` - Create project principles and governance
- `/brief.specify` - Define what to build with context awareness
- `/brief.plan` - Create technical plans using existing patterns
- Enforces John Lam's constitution-driven development methodology

### 3. **parisinnov-mcp** - MCP Server Package
**Repository:** [martinbon39/parisinnov-mcp](https://github.com/martinbon39/parisinnov-mcp)

Published npm package providing MCP tools:
- `search-context` - AI-powered semantic search (GLM-4.7)
- `add-knowledge` - Document ingestion
- `list-knowledge` - Knowledge base management
- `delete-knowledge` - Document removal
- Zero-install via `npx parisinnov-mcp`

## 🎯 The Problem

Teams repeatedly search for project information and paste large documents into prompts. Different AI agents can make inconsistent decisions when they work from different project context. This repository does not include a controlled measurement of time saved or token reduction.

## 💡 The Solution

BRIEFMCP indexes your project's constitution and specifications into an optimized knowledge base, then uses **RAG (Retrieval Augmented Generation)** to retrieve only the most relevant sections. AI agents get exact constraints, requirements, and decisions; with citations; under a token budget.

**Key Benefits:**
- **Budgeted retrieval** - Return selected excerpts rather than an entire document; the reduction depends on the query and document.
- **Search latency** - Measure response time in the configured environment; no current latency benchmark is established here.
- 🔒 **Multi-tenant** - Secure, isolated workspaces per organization
- 🔌 **Zero-install** - Works with Claude, Cursor, GitHub Copilot via MCP

## ✨ Features

- **Semantic Search** - Find answers by meaning, not keywords
- **PDF Upload** - Automatic text extraction and indexing
- **MCP Integration** - Works with any MCP-compatible AI assistant
- **Token Savings Tracking** - Analytics dashboard showing cost savings
- **Real-time Ingestion** - Documents searchable within seconds
- **Context-First Development** - BriefKit integration for AI agents

## 🛠️ Tech Stack

**Frontend:**
- Next.js 16 (App Router)
- React 19
- Tailwind CSS
- Framer Motion

**Backend:**
- Supabase (PostgreSQL + pgvector)
- Edge Functions (Deno)
- Row Level Security (RLS)

**AI/ML:**
- Featherless AI GLM-4.7 (query understanding)
- Featherless AI BAAI/bge-large-en-v1.5 (embeddings)
- OpenAI text-embedding-3-small (embeddings)

**Infrastructure:**
- Vercel (frontend)
- Supabase (backend)
- Railway (MCP backend)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- OpenAI API key (for embeddings)
- Featherless AI API key (optional, for client-side embeddings)

### Installation

```bash
# Clone the repository
git clone https://github.com/Morkeeth/BriefMCP.git
cd BriefMCP

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
FEATHERLESS_API_KEY=your_featherless_key  # Optional
```

### Using the MCP Server

The MCP server is published as an npm package:

```bash
npx parisinnov-mcp --access-token YOUR_TOKEN
```

Configure it in your AI assistant (Claude, Cursor, etc.) to enable automatic context retrieval.

## 📁 Project Structure

```
parisinnovhack/
├── src/
│   ├── app/              # Next.js pages and routes
│   │   ├── dashboard/    # Main dashboard
│   │   ├── savings/      # Token savings analytics
│   │   └── auth/         # Authentication
│   ├── services/         # Business logic
│   │   ├── ingestion/    # Document ingestion pipeline
│   │   └── savings/      # Token savings calculations
│   └── lib/              # Utilities and helpers
├── supabase/
│   └── functions/        # Edge Functions
│       └── ingest-context/ # Document ingestion endpoint
└── scripts/              # Test data and utilities
```

## 🏗️ Architecture

**Document Ingestion Flow:**
1. PDF/Markdown upload → PDF.js extraction
2. Markdown-aware chunking (~1000 tokens/chunk)
3. Dual-path embedding generation (Featherless/OpenAI)
4. Vector storage in Supabase pgvector

**Query Processing:**
1. User query → MCP backend
2. GLM-4.7 understands intent
3. Vector similarity search
4. Contextual answer with citations

## 📊 Current Status

✅ **MVP Complete**
- Core document management
- PDF upload and processing
- Vector embeddings and semantic search
- MCP server published (`parisinnov-mcp` v1.1.0)
- Multi-tenant architecture
- Token savings tracking

🚧 **In Progress**
- In-app search UI
- Project-level document scoping
- Source integrations (Notion, Confluence)

## 🤝 Contributing

This project was built for the Paris Innov Hackathon. Contributions welcome!

## 📄 License

The earlier README named MIT, but this checkout does not include a root LICENSE file. Confirm the applicable terms before reuse.

## 🔗 Links

### Hackathon Submission
- **[BRIEF MCP on Devpost](https://devpost.com/software/briefmcp)** – Full context, problem/solution narrative, technical stack, limits & roadmap, live demo link

### Repositories
- **Brief Main Frontend:** [martinbon39/parisinnovhack](https://github.com/martinbon39/parisinnovhack) (This repo)
- **BriefKit:** [marlowetal653/BriefKit](https://github.com/marlowetal653/BriefKit)
- **MCP Server:** [martinbon39/parisinnov-mcp](https://github.com/martinbon39/parisinnov-mcp)

### Documentation
- **Local Setup & Project Analysis:** [LOCAL_SETUP.md](./LOCAL_SETUP.md) – internal: auth troubleshooting, env vars, base schema, build mode, what's missing
- **MCP Package:** [npm - parisinnov-mcp](https://www.npmjs.com/package/parisinnov-mcp)
- **Pitch Document:** [PITCH.md](./PITCH.md)
- **MCP Usage Guide:** MCP_USAGE_GUIDE.md (not included in this checkout)
- **Constitution & Spec-Driven Design:** CONSTITUTION_SPEC_DRIVEN_DESIGN.md (not included in this checkout)
- **Core Value Proposition:** CORE_VALUE_PROPOSITION.md (not included in this checkout)

---

**Built with ❤️ for the Paris Innov Hackathon**

## License and data boundaries

This checkout has no root license file establishing general reuse rights. Data, provider responses, media, fonts and other third-party assets may have separate terms. Repository access alone does not grant rights to those materials. 
