export class InvalidSearchRequestError extends Error {
  name = 'InvalidSearchRequestError'
}

export class InvalidTenantIdError extends Error {
  name = 'InvalidTenantIdError'

  constructor(tenantId: string) {
    super(`"${tenantId}" is not a valid tenant id (expected a UUID)`)
  }
}

export class EmbeddingDimensionError extends Error {
  name = 'EmbeddingDimensionError'

  constructor(actual: number, expected: number) {
    super(
      `Embedding has ${actual} dimensions, the database expects ${expected}. ` +
        'Change EMBEDDING_DIMENSIONS and migrate again, or use a different model.'
    )
  }
}

/** Marks a part of the pipeline that has not been built yet. */
export class NotImplementedError extends Error {
  name = 'NotImplementedError'

  constructor(what: string) {
    super(`${what} is not implemented yet.`)
  }
}
