# rag-retrieval-lab

The retrieval layer of a RAG system: keyword search, vector search, hybrid search and reranking over a multi-tenant knowledge base, with tenant isolation enforced by PostgreSQL itself through Row Level Security.

The goal is a retrieval layer that finds relevant information, combines different search methods, and guarantees that a tenant can never see another tenant's data, even when application code forgets a tenant filter.

The scope is deliberately small: no HTTP API, no browser frontend and no auth. A terminal UI (Ink) is the window onto the pipeline and shows the scores and ranks of every stage.

## Architecture

```
rag:demo (Ace command, starts the Ink TUI)
        |
        v
RetrievalService ------------------------------+
        |                    |                 |
        v                    v                 v
ChunkRepository      EmbeddingProvider      Reranker
(DbChunkRepository)  (FakeEmbedding...)     (NoopReranker)
        |
        v
TenantDatabaseSession.runAsTenant()   BEGIN; set_config('app.tenant_id', ..., true)
        |
        v
PostgreSQL (role rag_app)
   +-- full-text search   tsvector + GIN + websearch_to_tsquery + ts_rank_cd
   +-- vector search      pgvector + HNSW + cosine distance
   +-- Row Level Security policies on documents and chunks
```

Then, inside RetrievalService:

```
keyword candidates + vector candidates
        |
        v
combineResults()   hybrid fusion (Reciprocal Rank Fusion, planned)
        |
        v
Reranker.rerank()  second stage (NoopReranker for now)
        |
        v
top `limit` results
```

| Folder                      | Contents                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `app/domain/`               | Types without behaviour: `RetrievalCandidate`, `RetrievalMode`, errors                        |
| `app/contracts/`            | Abstract classes: `EmbeddingProvider`, `Reranker`, `ChunkRepository`                          |
| `app/services/`             | `RetrievalService` (orchestration), `IngestionService` (chunk, embed, store), `TenantService` |
| `app/retrieval/`            | `hybrid_fusion.ts`: hybrid fusion as a pure function                                          |
| `app/repositories/`         | Raw SQL for full-text search, pgvector and inserts                                            |
| `app/infrastructure/`       | `TenantDatabaseSession`, the fake embedding provider, the noop reranker                       |
| `app/tui/`                  | Ink components, input and rendering only                                                      |
| `providers/rag_provider.ts` | Binds every contract to an implementation. The whole object graph in one place                |
| `commands/rag_demo.ts`      | Ace command `rag:demo`                                                                        |
| `database/migrations/`      | pgvector, tables and indexes, RLS policies and grants                                         |
| `database/demo/`            | The demo corpus and the loader shared by the seeder and the tests                             |
| `tests/`                    | Japa: `unit/` without a database, `functional/` against PostgreSQL                            |

Design decisions in short:

- **Contracts are abstract classes**, not interfaces. An interface no longer exists after compilation; a class does, so the IoC container can use it as a key.
- **Explicit factories in `RagProvider`** instead of `@inject()`. You can see which implementation ends up where without decorator magic. Plugging in a real embedding provider is a one-line change.
- **Retrieval logic is framework-independent.** `RetrievalService`, `combineResults` and the contracts import nothing from AdonisJS. AdonisJS handles lifecycle, config, DI, the database connection, migrations, tests and commands.
- **No Lucid models.** All reads are raw SQL because pgvector and full-text search are clearest that way. Lucid provides the connection, transactions, the query builder and migrations.
- **Embeddings are computed before the transaction**, so a (future) external API call never holds on to a database connection.

## Installation

Requires Node.js 22+, pnpm and Docker.

```bash
pnpm install
cp .env.example .env
node ace generate:key        # writes APP_KEY to .env
pnpm db:up                   # PostgreSQL 17 + pgvector on port 54329
pnpm migration:run           # as the admin role rag_admin
pnpm db:seed                 # two demo tenants with three documents each
pnpm rag                     # starts the TUI
```

Other scripts:

| Script                 | Does                                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| `pnpm test`            | All tests (uses the `rag_lab_test` database)                                    |
| `pnpm test:unit`       | Unit tests only, no database needed                                             |
| `pnpm dev`             | Tests in watch mode                                                             |
| `pnpm typecheck`       | `tsc --noEmit` with strict TypeScript                                           |
| `pnpm db:down`         | Stops PostgreSQL (data is kept)                                                 |
| `pnpm db:reset`        | Deletes the volume and starts fresh (roles and the test database are recreated) |
| `pnpm migration:fresh` | Rebuilds all tables                                                             |

`docker/initdb/01-roles-and-databases.sql` only runs on an empty volume. If you change it, run `pnpm db:reset`.

## Demo

In the TUI: pick a tenant, type a question (tab fills in an example question), pick a mode. On the results screen, `1` to `4` switches mode instantly for the same question, and `d` shows chunk ids and metadata.

| Tenant          | Question                                                     | What you see                                                                                                                                                  |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Northwind Legal | `What is the procedure for SEC-2026-041?`                    | **keyword** puts the Security Policy first. **vector** puts a generic "procedure" chunk on top: an embedding does not find an identifier meaningful           |
| Northwind Legal | `What should we do if customer credentials may have leaked?` | **keyword** finds nothing: every word has to match and the document says "suspected compromise of client authentication credentials". **vector** does find it |
| Northwind Legal | `INV-PROC-17`                                                | An exact identifier, keyword search at its strongest                                                                                                          |
| Contoso Finance | the same questions                                           | Different documents, even for `SEC-2026-041`: both tenants happen to use the same code                                                                        |
| both            | `3` or `4`                                                   | A message that hybrid fusion is not implemented yet (see Roadmap)                                                                                             |

The strongest RLS argument is the credentials question: across all tenants, the best semantic match is a chunk owned by **Contoso**. Northwind never gets to see it. Semantic similarity is not authorization. The test `semantic similarity is not authorization` in `tests/functional/tenant_isolation.spec.ts` proves it.

## Row Level Security

Tenant isolation does not depend on `WHERE tenant_id = ?` in application code. In fact, no query in `DbChunkRepository` filters on tenant at all. The database does it.

1. **Two roles.** `rag_admin` is a superuser and owns the schema: used only for migrations and creating tenants. `rag_app` is the runtime role: not a superuser, no `BYPASSRLS`, not an owner. Superusers and `BYPASSRLS` roles always ignore RLS, which is why the pipeline never runs as `rag_admin`.
2. **Tenant context per transaction.** `TenantDatabaseSession.runAsTenant(tenantId, callback)` opens a transaction and runs `SELECT set_config('app.tenant_id', $1, true)`. That is the function form of `SET LOCAL`, with the advantage that the value is a bind parameter. The tenant id is validated as a UUID first.
3. **Policies.** On `documents` and `chunks`: `USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())`. `USING` filters what you read, update and delete; `WITH CHECK` rejects writes for another tenant. `FORCE ROW LEVEL SECURITY` makes the table owner subject to the policy as well.
4. **Fail closed.** `app_current_tenant_id()` is `NULLIF(current_setting('app.tenant_id', true), '')::uuid`. Without a context it returns `NULL`, and `tenant_id = NULL` is never true: zero rows instead of all rows. The `NULLIF` is needed because a previous `SET LOCAL` leaves an empty string behind on the connection.
5. **No leaks through the pool.** Transaction-local settings disappear on commit and rollback, so a connection goes back into the pool clean. The tests run with a single pooled connection to prove this deterministically.
6. **In the types too.** Repository methods require a `TenantTransaction`. You can only get that type from `runAsTenant`, so a tenant-scoped query outside a tenant context does not compile.
7. **Integrity.** A composite foreign key `(document_id, tenant_id)` guarantees that a chunk can never point to another tenant's document.

What the tests in `tests/functional/tenant_isolation.spec.ts` prove: A sees only A, B sees only B, a query without a tenant filter (and even one filtering on the other tenant) returns only your own rows, without a context you see nothing, the context does not linger after commit or rollback, writing to another tenant fails, and the admin role does see everything.

A deliberate choice: the `tenants` table has no RLS. The TUI has to show the names before a tenant is chosen. In a real system you would only show the tenants the signed-in user belongs to.

## Retrieval pipeline

`RetrievalService.search({ tenantId, query, mode, limit })` validates the request and runs, per mode:

| Mode            | Steps                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `keyword`       | full-text search, `limit` results                                                                |
| `vector`        | embed the question, nearest neighbours, `limit` results                                          |
| `hybrid`        | both, each with `candidatePoolSize` (50) candidates, then `combineResults`, then the top `limit` |
| `hybrid-rerank` | as hybrid, then `Reranker.rerank` over at most 50 candidates, then the top `limit`               |

**Keyword.** `search_vector` is a generated column `to_tsvector('english', content)` with a GIN index. `websearch_to_tsquery` turns the question into an AND query and `SEC-2026-041` into an exact phrase. `ts_rank_cd` scores on how close together the terms are. High precision, low recall for long questions. No BM25: PostgreSQL does not have it built in.

**Vector.** `embedding vector(1536)` with an HNSW index on cosine distance (`<=>`). The score is `1 - distance`. Vector search always returns `limit` results, even when nothing is relevant. The dimension comes from `EMBEDDING_DIMENSIONS`; changing it means migrating again and re-embedding everything.

**Fake embeddings.** `FakeEmbeddingProvider` is deterministic and needs no API key. It hashes words into positions in the vector and knows a small hand-written list of synonyms ("leaked", "compromise" and "breach" become the same concept). Enough to demonstrate the difference with keyword search, nothing more. Clearly marked as not for production.

**Scores and ranks.** Every `RetrievalCandidate` keeps `keywordScore`, `keywordRank`, `vectorScore`, `vectorRank`, `hybridScore` and `rerankerScore` separately, so the TUI can show why something ends up where it does. A `ts_rank_cd` of 0.03 and a cosine similarity of 0.64 live on different scales; adding them up means nothing. That is why fusion works on ranks.

## Roadmap

- [ ] Hybrid fusion with Reciprocal Rank Fusion in `app/retrieval/hybrid_fusion.ts` (currently throws `NotImplementedError`)
- [ ] Retrieval evaluation: a labelled question set and metrics (recall@k, MRR) per mode
- [ ] A real embedding provider (for example Azure OpenAI) next to the fake one
- [ ] A real reranker (cross-encoder) to replace `NoopReranker`
- [ ] Answer generation with source citations

## License

MIT
