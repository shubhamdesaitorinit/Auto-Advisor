# Auto Advisor

AI-powered vehicle sales chatbot with intelligent negotiation capabilities. Built for the Canadian automotive market with real inventory data, deterministic pricing, and multi-agent architecture.

## What it does

- **Vehicle Search** — Browse 20 real Canadian market vehicles with specs, pricing, and hybrid (structured + semantic) search via pgvector
- **Negotiation Engine** — Deterministic pricing with multi-lever offers (warranty, accessories, winter tires before price cuts). The LLM never decides a price — code computes all pricing.
- **Test Drive Booking** — Google Calendar integration for scheduling, with SendGrid confirmation emails
- **Lead Capture** — Automatic lead scoring (12 signals, points-based) with contact extraction from natural conversation
- **Input Guardrails** — Prompt injection detection, PII masking, off-topic filtering
- **Output Validators** — Spec verification against DB, price floor enforcement, dealer cost leak detection, tone checking

## Architecture

```
User  -->  Input Guardrails  -->  Orchestrator  -->  Agent  -->  Output Validators  -->  User
                                      |
                         ┌────────────┼────────────────┐
                         |            |                 |
                   Vehicle Search  Negotiation     Booking/Lead
                   (DB + pgvector) (Constraint      (Calendar +
                                    Solver)          Email)
```

**Key design principle:** The LLM reads buyer signals and communicates. Deterministic TypeScript code computes all pricing. This prevents hallucinated prices and makes the system auditable.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| UI | shadcn/ui + Tailwind CSS |
| Chat | Vercel AI SDK v6 (`useChat` + `streamText`) |
| LLM | Anthropic Claude (via `@ai-sdk/anthropic`) |
| Database | PostgreSQL (Neon) + Drizzle ORM + pgvector |
| Embeddings | Google Gemini (`gemini-embedding-001`, 3072d) |
| Session | Upstash Redis (REST) |
| Calendar | Google Calendar API |
| Email | SendGrid |
| Logging | Pino (structured JSON) |

## Project Structure

```
auto-advisor/
├── app/
│   ├── page.tsx                     # Chat UI
│   ├── api/chat/route.ts            # Main API endpoint
│   └── api/sessions/route.ts        # Session history API
├── agents/
│   ├── orchestrator.ts              # Intent detection + routing
│   ├── vehicle-search.ts            # Search agent (4 tools)
│   ├── negotiation.ts               # Negotiation agent (5 tools)
│   ├── booking.ts                   # Test drive booking agent
│   └── lead-capture.ts              # Lead capture agent
├── engine/
│   ├── budget-tracker.ts            # Buyer signal extraction
│   ├── constraint-solver.ts         # Feasibility math
│   ├── offer-generator.ts           # Multi-lever offer creation
│   ├── approval-gate.ts             # Auto/manager approval routing
│   ├── financing.ts                 # EMI calculator
│   └── lead-scorer.ts               # Deterministic lead scoring
├── guardrails/
│   ├── input-sanitizer.ts           # Input pipeline
│   ├── prompt-injection.ts          # Injection detection
│   ├── pii-detector.ts              # PII masking
│   ├── topic-guard.ts               # Off-topic filtering
│   ├── output-validator.ts          # Output pipeline
│   └── validators/                  # Spec, price, leak, tone, consistency
├── tools/
│   ├── vehicle-db.ts                # Vehicle search queries
│   ├── negotiation-db.ts            # Pricing + offer persistence
│   ├── booking-db.ts                # Booking persistence
│   └── lead-db.ts                   # Lead persistence
├── lib/
│   ├── llm.ts                       # LLM client (provider-agnostic)
│   ├── db.ts                        # Neon/Drizzle connection
│   ├── schema.ts                    # Database schema
│   ├── redis.ts                     # Upstash Redis client
│   ├── session.ts                   # Session CRUD
│   ├── google-calendar.ts           # Calendar integration
│   ├── email.ts                     # SendGrid integration
│   ├── embeddings.ts                # Google Gemini embeddings
│   ├── rate-limiter.ts              # Sliding window rate limiter
│   └── logger.ts                    # Pino structured logging
├── components/chat/                 # Chat UI components
├── prompts/                         # System prompts per agent
├── seed/                            # DB seed scripts
└── types/index.ts                   # Shared TypeScript types
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon recommended)
- Anthropic API key

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your keys (see below)

# Push database schema
npm run db:push

# Seed vehicle data (20 Canadian vehicles)
npm run db:seed

# Generate vector embeddings
npm run db:seed-embeddings

# Start development server
npm run dev
```

### Environment Variables

**Required:**
```
LLM_API_KEY=              # Anthropic API key
LLM_MODEL=                # claude-sonnet-4-20250514
DATABASE_URL=              # PostgreSQL connection string
GOOGLE_GENERATIVE_AI_API_KEY=  # Google AI (free, for embeddings)
```

**Recommended:**
```
UPSTASH_REDIS_REST_URL=    # Session storage (falls back to in-memory)
UPSTASH_REDIS_REST_TOKEN=
```

**Optional (graceful fallback when missing):**
```
GOOGLE_CALENDAR_ID=        # Test drive booking calendar
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
SENDGRID_API_KEY=          # Confirmation emails
SENDGRID_FROM_EMAIL=
```

## How the Negotiation Engine Works

The negotiation engine uses a **multi-lever strategy** — high-efficiency levers first, direct price cuts last:

| Lever | Dealer Cost | Customer Value | Efficiency |
|-------|-----------|---------------|------------|
| Manufacturer cashback | $0 | Face value | Infinite |
| Extended warranty | ~$800 | ~$2,500 | 3.1x |
| Accessories bundle | ~$400 | ~$1,200 | 3.0x |
| Winter tire package | ~$600 | ~$1,500 | 2.5x |
| Free first service | ~$200 | ~$500 | 2.5x |
| Direct price cut | $1 | $1 | 1.0x |

**Approval flow:**
- Discount ≤5% → auto-approved
- Discount >5% → needs manager approval (simulated 3s delay in demo)
- Below margin floor → rejected, alternatives suggested

## Seed Data

20 real Canadian market vehicles with accurate 2024-2025 specs:
- 7 compact SUVs (RAV4, CR-V, Tucson, Sportage, CX-50, Forester, Escape)
- 3 mid-size SUVs (Highlander, Palisade, Telluride)
- 3 trucks (F-150, Tacoma, RAM 1500)
- 3 sedans (Civic, Camry, Sonata)
- 3 EVs (Model Y, IONIQ 5, Equinox EV)
- 1 hybrid (RAV4 Hybrid)

All prices in CAD with realistic dealer cost, margins, destination fees, and promotions.

## Scripts

```bash
npm run dev              # Start development server
npm run build            # Production build
npm run db:push          # Push schema to database
npm run db:seed          # Seed 20 vehicles + pricing
npm run db:seed-embeddings  # Generate vector embeddings
npm run db:studio        # Open Drizzle Studio
```

## Deployment

Deployed on Vercel. Set all environment variables in the Vercel dashboard. No special build configuration needed — standard Next.js deployment.
