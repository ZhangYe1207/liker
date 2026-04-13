# Liker — AI-Powered Personal Collection Manager

A full-stack application for managing personal collections (books, movies, music, games) with AI-powered taste analysis, smart search, and personalized recommendations.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Frontend (React)                     │
│                                                       │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ DataLayer│  │ AI Service │  │   UI Components  │  │
│  │  (CRUD)  │  │  (ai.ts)  │  │ (AIChatPanel...) │  │
│  └────┬─────┘  └─────┬─────┘  └──────────────────┘  │
│       │              │                                │
└───────┼──────────────┼────────────────────────────────┘
        │              │
        ▼              ▼
┌──────────────┐  ┌─────────────────────────────────────┐
│   Supabase   │  │        Backend (FastAPI)             │
│  (Direct)    │  │                                     │
│              │  │  ┌────────┐  ┌──────────────────┐   │
│  • Auth      │  │  │JWT Auth│  │  LLM Abstraction │   │
│  • CRUD      │  │  │Midware │  │  ┌─────────────┐ │   │
│  • RLS       │  │  └───┬────┘  │  │ Claude      │ │   │
│              │  │      │       │  │ OpenAI      │ │   │
└──────┬───────┘  │      ▼       │  │ DeepSeek    │ │   │
       │          │  ┌────────┐  │  │ Kimi        │ │   │
       │          │  │Services│  │  │ MiniMax     │ │   │
       │          │  │• RAG   │  │  └─────────────┘ │   │
       │          │  │• Search│  └──────────────────┘   │
       │          │  │• Embed │                         │
       │          │  └───┬────┘                         │
       │          │      │                              │
       │          └──────┼──────────────────────────────┘
       │                 │
       ▼                 ▼
  ┌──────────────────────────┐
  │  Supabase PostgreSQL     │
  │  + pgvector              │
  │                          │
  │  • items, categories     │
  │  • item_embeddings       │
  │  • profiles              │
  └──────────────────────────┘
```

**Two parallel data paths** sharing the same Supabase database:
- **CRUD path**: Frontend → Supabase (direct, with RLS)
- **AI path**: Frontend → FastAPI → Supabase (service role, filtered by user_id)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Python + FastAPI |
| Database | Supabase PostgreSQL + pgvector |
| Auth | Supabase Auth (JWT) |
| LLM | Multi-provider: Claude, OpenAI, DeepSeek, Kimi, MiniMax |
| Embedding | MiniMax embo-01 (1024d) |
| Styling | CSS Variables (no UI library) |

## AI Features

### RAG Taste Analysis
Conversational AI that analyzes your collection to understand your preferences. Uses vector similarity search to retrieve relevant items, then generates insights via LLM.

```
User: "我最喜欢什么类型的电影？"
  → Embed query → pgvector similarity search → top-K items
  → Assemble context with ratings/reviews → LLM generation
  → SSE streaming response
```

### Smart Search with Function Calling
Natural language search powered by LLM tool use. The LLM decides which tools to call based on the query.

```
User: "帮我找一部像星际穿越的硬科幻电影"
  → LLM + tool definitions (search_collection, search_external, get_taste_profile)
  → LLM selects tools → Backend executes → LLM synthesizes
  → SSE streaming response + structured recommendation items
```

### Multi-Provider LLM Abstraction
Custom `ChatProvider` / `EmbeddingProvider` protocol with factory pattern. Each provider wraps its official SDK. DeepSeek, Kimi, and MiniMax reuse the OpenAI adapter (compatible APIs).

**Why custom abstraction over litellm**: Demonstrates architecture design skills — protocol definition, strategy pattern, factory pattern. litellm would hide these behind a library.

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Vector DB | pgvector via Supabase | Built-in, same DB as existing data, enables JOINs, sufficient for <10K items |
| Function calling | Single-turn with tool definitions | Sufficient for search/recommendation; multi-turn agent adds complexity without proportional value |
| LLM abstraction | Custom protocols, not litellm | Demonstrates architecture skills for interviews |
| Embedding update | Real-time on save | ~200-500ms latency acceptable for <10K items; avoids Celery/Redis |
| Embedding provider | Separate from chat provider | Claude has no embedding API; embedding defaults to MiniMax embo-01 (better for Chinese-heavy content, mainland-direct) |
| Auth | JWT passthrough | Frontend sends Supabase JWT; backend validates and extracts user_id |
| SSE over WebSocket | Server-Sent Events | Simpler for one-directional streaming; native browser support |

## Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase project (with pgvector enabled)

### Frontend
```bash
npm install
npm run dev    # http://localhost:5173
```

### Database
```bash
# Apply migrations (requires Supabase CLI)
supabase db push
```

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your keys

# Run
uvicorn app.main:app --reload --port 8000
```

### Required Environment Variables
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
LLM_PROVIDER=claude          # claude|openai|deepseek|kimi|minimax
EMBEDDING_PROVIDER=minimax   # openai|minimax
MINIMAX_API_KEY=             # Required if EMBEDDING_PROVIDER=minimax
OPENAI_API_KEY=              # Required if EMBEDDING_PROVIDER=openai
CLAUDE_API_KEY=              # Required if LLM_PROVIDER=claude
```

### Running Tests
```bash
# Backend tests
cd backend
.venv/bin/python -m pytest tests/ -v
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/ai/chat` | RAG taste analysis chat (SSE) |
| POST | `/api/ai/search` | Smart search with function calling (SSE) |
| POST | `/api/embeddings/sync` | Bulk sync all item embeddings |
| POST | `/api/embeddings/item/{id}` | Update single item embedding |

## Future Directions

- **Multi-turn agent**: Currently single-turn function calling; could add agent loop for complex queries
- **Evaluation framework**: Systematic measurement of search/recommendation quality
- **Conversation persistence**: Save chat history to database
- **Multi-modal support**: Image-based collection items (album art, movie posters)
- **Auto-embedding sync**: Trigger embedding update automatically on frontend CRUD
