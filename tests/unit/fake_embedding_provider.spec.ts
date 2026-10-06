import { test } from '@japa/runner'
import { FakeEmbeddingProvider } from '#infrastructure/embeddings/fake_embedding_provider'

function cosine(a: number[], b: number[]) {
  return a.reduce((sum, value, i) => sum + value * b[i], 0)
}

test.group('FakeEmbeddingProvider', () => {
  const provider = new FakeEmbeddingProvider(256)

  test('always returns the same vector for the same text', async ({ assert }) => {
    const first = await provider.embed('Suspected compromise of credentials')
    const second = await provider.embed('Suspected compromise of credentials')

    assert.deepEqual(first, second)
  })

  test('returns unit vectors with the configured number of dimensions', async ({ assert }) => {
    const vector = await provider.embed('Invoice procedure')

    assert.lengthOf(vector, 256)
    assert.closeTo(Math.hypot(...vector), 1, 1e-9)
  })

  test('returns a usable vector for empty text', async ({ assert }) => {
    const vector = await provider.embed('')

    assert.closeTo(Math.hypot(...vector), 1, 1e-9)
  })

  test('places synonyms closer together than an unrelated topic', async ({ assert }) => {
    const question = await provider.embed('customer credentials may have leaked')
    const sameMeaning = await provider.embed('suspected compromise of client passwords')
    const otherTopic = await provider.embed('quarterly revenue report')

    assert.isAbove(cosine(question, sameMeaning), cosine(question, otherTopic))
  })
})
