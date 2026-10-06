import { test } from '@japa/runner'

/**
 * The acceptance criteria for hybrid fusion as empty tests. Japa reports them
 * as "todo". Give each test an implementation (a callback) and make it pass.
 */
test.group('combineResults (hybrid fusion)', () => {
  test('a chunk found in both lists ranks above a chunk found in one list')
  test('every chunk appears only once in the result (deduplicated by chunkId)')
  test('keywordScore, keywordRank, vectorScore and vectorRank are preserved')
  test('every result has a hybridScore and the list is sorted by hybridScore descending')
  test('the k value is configurable and affects the hybridScore')
  test('equal scores get a deterministic order')
  test('works when one of the lists is empty')
  test('returns an empty list when both lists are empty')
  test('raw scores do not determine the order, only the ranks do')
})
