/** A document as it is supplied, before it is split into chunks. */
export type DocumentInput = {
  name: string
  text: string
  metadata?: Record<string, unknown>
}

/** A chunk ready to be stored: text plus the embedding of that text. */
export type NewChunk = {
  tenantId: string
  documentId: string
  position: number
  content: string
  metadata: Record<string, unknown>
  embedding: number[]
}
