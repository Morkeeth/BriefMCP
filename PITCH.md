# BRIEFMCP - Project Pitch

## The Targeted Problem

Teams waste time and credits dumping 1,000-line specs into AI prompts. Different agents make inconsistent decisions because they don't share the same knowledge. Developers paste entire PRDs into ChatGPT, wasting thousands of tokens on irrelevant sections. AI assistants working on the same project make conflicting choices because they're operating with different context windows.

**Impact:**
- 2+ hours/week wasted searching for information
- 88% token waste from copy-pasting full docs into AI
- Inconsistent decisions across AI agents
- Knowledge scattered across multiple tools

## The Proposed Solution

**BRIEFMCP** gives every AI agent on your team the same, up-to-date project context—without copy-pasting massive markdown files.

We index your project's constitution and feature specifications into an optimized knowledge base, then use RAG (Retrieval Augmented Generation) to retrieve only the most relevant sections and compress them into a small, cited Brief Packet under a token budget. Instead of bloated context windows, agents get the exact constraints, requirements, and decisions they need—with citations back to the source.

**Key Features:**
- **Semantic search** across all documentation (PDFs, markdown, wikis)
- **MCP integration** - Works with Claude, Cursor, GitHub Copilot via Model Context Protocol
- **Token optimization** - 88% reduction in token usage
- **Context-first development** - AI agents check project knowledge before acting (BriefKit integration)
- **Multi-tenant architecture** - Secure, isolated workspaces per organization

**Delivery:** Zero-install setup via `npx brief-mcp` - any compatible assistant can automatically call brief tools to fetch context on demand.

## Technical Stack

**Frontend:** Next.js 16 (App Router, React 19)  
**Backend:** Supabase (PostgreSQL + pgvector + Edge Functions)  
**AI/ML:** 
- Featherless AI GLM-4.7 (query understanding, MCP backend)
- Featherless AI BAAI/bge-large-en-v1.5 (1024-dim embeddings, client-side)
- OpenAI text-embedding-3-small (1536-dim embeddings, Edge Function)
**Infrastructure:** Vercel (frontend) + Supabase (backend) + Railway (MCP backend)

**Core Technologies:**
- RAG (Retrieval Augmented Generation) for semantic search
- Vector embeddings with pgvector for similarity search
- MCP Protocol for AI assistant integration
- BriefKit for context-first development workflow

**Architecture:**
- Document ingestion: PDF.js extraction → Markdown-aware chunking (~1000 tokens/chunk) → Dual-path embedding generation → Vector storage in Supabase
- Query processing: User query → GLM-4.7 intent understanding → Vector similarity search → Contextual answer with citations
- Security: Row Level Security (RLS), role-based access control, organization-level data isolation

## Limits & Avenues for Development

### Current Limitations
- **No in-app search UI** - Search only available via MCP backend, not directly in dashboard
- **No project-level scoping** - Documents are org-scoped only, project_id not implemented
- **Limited source integrations** - Manual upload only, no Notion/Confluence/Slack connectors
- **No search analytics** - Missing usage patterns and search insights for admins
- **No AI summaries** - Results show chunks but no AI-generated summaries of top results

### Development Roadmap

**Phase 1: Core Search (Priority)**
- Build search UI component in dashboard
- Create direct search API endpoint
- Implement project-level document scoping
- Add filtering by source type and date

**Phase 2: Enhanced Features**
- AI-generated summaries of search results
- Search analytics dashboard for admins
- Share search results functionality
- Subscribe to topics for updates

**Phase 3: Integrations**
- Notion API connector
- Confluence API connector
- Slack message indexing
- GitHub repository documentation sync

**Phase 4: Advanced**
- Mobile apps (iOS/Android)
- Offline support
- Advanced filtering and faceted search
- Multi-language support

### Technical Debt
- README still default Next.js template
- No database migration files visible (may be managed elsewhere)
- Hardcoded Supabase URL in dashboard (should use env var)
- No comprehensive test coverage

---

## BRIEFMCP Elevator Pitch (200 words)

**BRIEFMCP gives every AI agent on your team the same, up-to-date project context—without copy-pasting massive markdown files.**

Today, teams waste time and credits dumping 1,000-line specs into prompts, and different agents make inconsistent decisions because they don't share the same knowledge. Developers paste entire PRDs into ChatGPT, wasting thousands of tokens on irrelevant sections. AI assistants working on the same project make conflicting choices because they're operating with different context windows.

We solve this by indexing your project's constitution and feature specifications into an optimized knowledge base, then using RAG to retrieve only the most relevant sections and compress them into a small, cited Brief Packet under a token budget. Instead of bloated context windows, agents get the exact constraints, requirements, and decisions they need—with citations back to the source.

BRIEFMCP is delivered via MCP, so any compatible assistant—Claude, Cursor, GitHub Copilot—can automatically call brief tools to fetch context on demand. The result: faster collaboration, less re-explaining specs, more grounded outputs, and lower token spend—turning context sharing into a reliable utility. Teams reduce token costs by 88% while ensuring all AI agents work from the same source of truth. No more inconsistent decisions or wasted credits—just efficient, context-aware AI collaboration.
