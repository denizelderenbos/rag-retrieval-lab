import env from '#start/env'

export type RagConfig = {
  /** Length of every embedding vector. Must match the chunks.embedding column. */
  embeddingDimensions: number

  /**
   * How many candidates each retrieval method fetches before fusion and
   * reranking reduce them to `limit`. Larger means more recall but a more
   * expensive reranker.
   */
  candidatePoolSize: number

  /** Default number of results the user sees. */
  defaultLimit: number

  /** Upper bound for `limit`, so a caller cannot drain the database. */
  maxLimit: number
}

const ragConfig: RagConfig = {
  embeddingDimensions: env.get('EMBEDDING_DIMENSIONS'),
  candidatePoolSize: 50,
  defaultLimit: 5,
  maxLimit: 50,
}

export default ragConfig
