import { EmbeddingProvider } from '#contracts/embedding_provider'

/**
 * NOT FOR PRODUCTION. A deterministic fake embedding for tests and demos.
 *
 * A real embedding model has learned "meaning" from huge amounts of text. This
 * fake pretends to with a hand-written list of synonyms: words in CONCEPTS
 * count as their concept, so "leaked" and "compromise" land on the same
 * position in the vector. All other words count weakly, based on spelling.
 *
 * As a result, semantic search only works within this tiny vocabulary. Just
 * enough to show the difference with keyword search, never enough to answer
 * real questions. Replace it with a real provider.
 */
export class FakeEmbeddingProvider extends EmbeddingProvider {
  readonly name = 'fake (concept hash, not for production)'

  constructor(readonly dimensions: number) {
    super()
  }

  async embed(text: string): Promise<number[]> {
    const vector = new Array<number>(this.dimensions).fill(0)

    for (const token of tokenize(text)) {
      const feature = featureFor(token)
      if (!feature) continue

      const hash = fnv1a(feature.key)
      const sign = hash & 1 ? 1 : -1
      vector[hash % this.dimensions] += sign * feature.weight
    }

    return normalize(vector)
  }
}

/** Word to concept. Kept small and tuned to the demo documents. */
const CONCEPTS: Record<string, string> = {}

defineConcept('credential', [
  'credential',
  'credentials',
  'password',
  'passwords',
  'login',
  'logins',
  'authentication',
  'sign-in',
  'mfa',
  'account',
  'accounts',
])
defineConcept('compromise', [
  'compromise',
  'compromised',
  'leak',
  'leaked',
  'leaks',
  'breach',
  'breached',
  'exposed',
  'stolen',
  'hacked',
  'suspected',
  'unauthorised',
  'unauthorized',
])
defineConcept('customer', ['customer', 'customers', 'client', 'clients'])
defineConcept('response', [
  'revoke',
  'reset',
  'lock',
  'locked',
  'freeze',
  'frozen',
  'block',
  'disable',
  'immediately',
])
defineConcept('incident', [
  'incident',
  'incidents',
  'emergency',
  'attack',
  'outage',
  'escalate',
  'escalated',
])
defineConcept('procedure', [
  'procedure',
  'procedures',
  'process',
  'steps',
  'checklist',
  'do',
  'handle',
  'handling',
])
defineConcept('invoice', ['invoice', 'invoices', 'billing', 'bill', 'payable', 'unpaid', 'credit'])
defineConcept('expense', ['expense', 'expenses', 'receipt', 'receipts', 'reimbursement', 'card'])
defineConcept('report', [
  'report',
  'reports',
  'reporting',
  'quarterly',
  'quarter',
  'revenue',
  'ledger',
])
defineConcept('identity', ['identity', 'verify', 'verifying', 'verification', 'onboarding', 'kyc'])
defineConcept('security', ['security', 'confidential', 'encrypted', 'encryption', 'classified'])
defineConcept('notify', ['notify', 'inform', 'informed', 'contact', 'contacted', 'tell', 'call'])

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'by',
  'for',
  'from',
  'has',
  'have',
  'if',
  'in',
  'is',
  'it',
  'its',
  's',
  'may',
  'must',
  'of',
  'on',
  'or',
  'our',
  'should',
  'that',
  'the',
  'their',
  'then',
  'this',
  'to',
  'was',
  'we',
  'were',
  'what',
  'when',
  'which',
  'who',
  'will',
  'with',
  'you',
  'your',
])

type Feature = { key: string; weight: number }

function defineConcept(concept: string, words: string[]) {
  for (const word of words) CONCEPTS[word] = concept
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:-[a-z]+)*/g) ?? []
}

function featureFor(token: string): Feature | undefined {
  if (STOP_WORDS.has(token)) return undefined

  const concept = CONCEPTS[token]
  if (concept) return { key: `concept:${concept}`, weight: 1 }

  // Codes like SEC-2026-041 fall apart into meaningless pieces. Real embedding
  // models do little with such identifiers either, so tokens containing
  // digits barely count here.
  if (/\d/.test(token)) return { key: `word:${token}`, weight: 0.1 }

  return { key: `word:${token}`, weight: 0.3 }
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Length 1, so cosine similarity equals the dot product. A zero vector has no
 * direction (pgvector returns NaN for it), so text without usable words gets a
 * fixed direction.
 */
function normalize(vector: number[]): number[] {
  const length = Math.hypot(...vector)
  if (length === 0) {
    vector[0] = 1
    return vector
  }
  return vector.map((value) => value / length)
}
