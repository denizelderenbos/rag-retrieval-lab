import { test } from '@japa/runner'
import type { RetrievalCandidate } from '#domain/retrieval'
import { combineResults } from '#retrieval/hybrid_fusion'

/** Builds a candidate with only the fields a test cares about. */
function candidate(chunkId: string, fields: Partial<RetrievalCandidate> = {}): RetrievalCandidate {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    documentName: `Document ${chunkId}`,
    tenantId: 'tenant-a',
    content: `Content of ${chunkId}`,
    metadata: {},
    ...fields,
  }
}

function ids(results: RetrievalCandidate[]) {
  return results.map((result) => result.chunkId)
}

test.group('combineResults (hybrid fusion)', () => {
  test('a chunk found in both lists ranks above a chunk found in one list', ({ assert }) => {
    const keyword = [candidate('only-keyword'), candidate('both')]
    const vector = [candidate('both')]

    const fused = combineResults(keyword, vector)

    // "only-keyword" is first in its list, "both" is only second there, but
    // being found by both methods outweighs that.
    assert.deepEqual(ids(fused), ['both', 'only-keyword'])
  })

  test('every chunk appears only once in the result (deduplicated by chunkId)', ({ assert }) => {
    const keyword = [candidate('a'), candidate('b')]
    const vector = [candidate('b'), candidate('a'), candidate('c')]

    const fused = combineResults(keyword, vector)

    assert.lengthOf(fused, 3)
    assert.sameMembers(ids(fused), ['a', 'b', 'c'])
  })

  test('keywordScore, keywordRank, vectorScore and vectorRank are preserved', ({ assert }) => {
    const keyword = [candidate('sec', { keywordRank: 1, keywordScore: 0.0333 })]
    const vector = [
      candidate('incident', { vectorRank: 1, vectorScore: 0.5662 }),
      candidate('sec', { vectorRank: 2, vectorScore: 0.426 }),
    ]

    const sec = combineResults(keyword, vector).find((result) => result.chunkId === 'sec')!

    assert.equal(sec.keywordRank, 1)
    assert.equal(sec.keywordScore, 0.0333)
    assert.equal(sec.vectorRank, 2)
    assert.equal(sec.vectorScore, 0.426)
  })

  test('every result has a hybridScore and the list is sorted by hybridScore descending', ({
    assert,
  }) => {
    const keyword = [candidate('sec')]
    const vector = [candidate('incident'), candidate('sec'), candidate('invoice')]

    const fused = combineResults(keyword, vector)

    // With k = 60: sec = 1/61 + 1/62, incident = 1/61, invoice = 1/63.
    assert.deepEqual(ids(fused), ['sec', 'incident', 'invoice'])
    assert.closeTo(fused[0].hybridScore!, 1 / 61 + 1 / 62, 1e-12)
    assert.closeTo(fused[1].hybridScore!, 1 / 61, 1e-12)
    assert.closeTo(fused[2].hybridScore!, 1 / 63, 1e-12)
  })

  test('the k value is configurable and affects the hybridScore', ({ assert }) => {
    const keyword = [candidate('a')]

    const withDefault = combineResults(keyword, [])
    const withSmallK = combineResults(keyword, [], 1)

    assert.closeTo(withDefault[0].hybridScore!, 1 / 61, 1e-12)
    assert.closeTo(withSmallK[0].hybridScore!, 1 / 2, 1e-12)
  })

  test('equal scores get a deterministic order', ({ assert }) => {
    // The number 1 of the keyword list and the number 1 of the vector list get
    // exactly the same score (1/61). The order must not depend on which list
    // a chunk came from.
    const first = combineResults([candidate('a')], [candidate('b')])
    const swapped = combineResults([candidate('b')], [candidate('a')])

    assert.equal(first[0].hybridScore, first[1].hybridScore)
    assert.deepEqual(ids(first), ids(swapped))
  })

  test('works when one of the lists is empty', ({ assert }) => {
    const onlyKeyword = combineResults([candidate('a'), candidate('b')], [])
    const onlyVector = combineResults([], [candidate('c'), candidate('d')])

    assert.deepEqual(ids(onlyKeyword), ['a', 'b'])
    assert.deepEqual(ids(onlyVector), ['c', 'd'])
  })

  test('returns an empty list when both lists are empty', ({ assert }) => {
    assert.deepEqual(combineResults([], []), [])
  })

  test('raw scores do not determine the order, only the ranks do', ({ assert }) => {
    // Same ranks, wildly different raw scores: the fusion must not care.
    const smallScores = combineResults(
      [candidate('a', { keywordScore: 0.001 }), candidate('b', { keywordScore: 0.0009 })],
      [candidate('c', { vectorScore: 0.2 })]
    )
    const hugeScores = combineResults(
      [candidate('a', { keywordScore: 900 }), candidate('b', { keywordScore: 800 })],
      [candidate('c', { vectorScore: 0.99 })]
    )

    assert.deepEqual(ids(smallScores), ids(hugeScores))
    assert.deepEqual(
      smallScores.map((result) => result.hybridScore),
      hugeScores.map((result) => result.hybridScore)
    )
  })

  test('does not modify the input lists or their candidates', ({ assert }) => {
    const keyword = [candidate('a'), candidate('b')]
    const vector = [candidate('b')]
    const before = structuredClone({ keyword, vector })

    combineResults(keyword, vector)

    assert.deepEqual({ keyword, vector }, before)
  })
})
