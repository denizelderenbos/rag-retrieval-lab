/**
 * Turns text into a vector in which meaning becomes measurable as distance.
 *
 * Contracts are abstract classes instead of interfaces: an interface no longer
 * exists after compilation, a class does. That lets the AdonisJS IoC container
 * use the contract as a key (see RagProvider).
 */
export abstract class EmbeddingProvider {
  /** Name shown in the TUI, for example "openai/text-embedding-3-small". */
  abstract readonly name: string

  /** Length of every vector. Must equal EMBEDDING_DIMENSIONS. */
  abstract readonly dimensions: number

  abstract embed(text: string): Promise<number[]>
}
