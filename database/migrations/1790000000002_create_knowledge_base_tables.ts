import app from '@adonisjs/core/services/app'
import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Raw SQL instead of the schema builder: vector(n), a generated tsvector
 * column and an HNSW index are PostgreSQL specific and read exactly as they
 * exist in the database this way.
 */
export default class extends BaseSchema {
  async up() {
    const dimensions = app.config.get<number>('rag.embeddingDimensions')

    this.schema.raw(`
      CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    this.schema.raw(`
      CREATE TABLE documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
        name text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        -- Target of the composite FK on chunks: a chunk can only point to a
        -- document of the same tenant.
        UNIQUE (id, tenant_id)
      )
    `)
    this.schema.raw('CREATE INDEX documents_tenant_id_idx ON documents (tenant_id)')

    this.schema.raw(`
      CREATE TABLE chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
        document_id uuid NOT NULL,
        position integer NOT NULL,
        content text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}',
        embedding vector(${dimensions}) NOT NULL,
        -- Derived from content, so it can never drift from the text.
        search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (document_id, tenant_id) REFERENCES documents (id, tenant_id) ON DELETE CASCADE,
        UNIQUE (document_id, position)
      )
    `)
    this.schema.raw('CREATE INDEX chunks_tenant_id_idx ON chunks (tenant_id)')
    this.schema.raw('CREATE INDEX chunks_document_id_idx ON chunks (document_id)')
    this.schema.raw('CREATE INDEX chunks_search_vector_idx ON chunks USING gin (search_vector)')

    // HNSW: approximate nearest neighbour. With a few thousand chunks the
    // planner often still picks a sequential scan; the index only matters at
    // larger volumes. See DbChunkRepository.searchByVector for HNSW and RLS.
    this.schema.raw(
      'CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops)'
    )
  }

  async down() {
    this.schema.raw('DROP TABLE IF EXISTS chunks')
    this.schema.raw('DROP TABLE IF EXISTS documents')
    this.schema.raw('DROP TABLE IF EXISTS tenants')
  }
}
