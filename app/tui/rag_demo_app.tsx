import { Box, Text, render, useApp, useInput } from 'ink'
import { useState } from 'react'
import { RETRIEVAL_MODES, type RetrievalMode, type SearchResponse } from '#domain/retrieval'
import type { Tenant } from '#domain/tenant'
import type { RetrievalService } from '#services/retrieval_service'
import { ResultList } from '#tui/result_list'

type Step = 'tenant' | 'query' | 'mode' | 'results'

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; mode: RetrievalMode }
  | { status: 'done'; response: SearchResponse; durationMs: number }
  | { status: 'error'; mode: RetrievalMode; message: string }

type Props = {
  retrieval: RetrievalService
  tenants: Tenant[]
}

const EXAMPLE_QUERIES = [
  'What is the procedure for SEC-2026-041?',
  'What should we do if customer credentials may have leaked?',
  'INV-PROC-17',
]

/**
 * The TUI is only a window onto RetrievalService. It contains no retrieval
 * logic; everything here is input and rendering.
 */
export function RagDemoApp({ retrieval, tenants }: Props) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>('tenant')
  const [tenantIndex, setTenantIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [modeIndex, setModeIndex] = useState(0)
  const [search, setSearch] = useState<SearchState>({ status: 'idle' })
  const [showDebug, setShowDebug] = useState(false)

  const tenant = tenants[tenantIndex]

  async function runSearch(mode: RetrievalMode) {
    setModeIndex(RETRIEVAL_MODES.indexOf(mode))
    setStep('results')
    setSearch({ status: 'loading', mode })

    const start = performance.now()
    try {
      const response = await retrieval.search({ tenantId: tenant.id, query, mode })
      setSearch({ status: 'done', response, durationMs: performance.now() - start })
    } catch (error) {
      setSearch({ status: 'error', mode, message: (error as Error).message })
    }
  }

  useInput((input, key) => {
    if (key.escape) return exit()

    if (step === 'tenant') {
      if (key.upArrow) setTenantIndex((i) => (i - 1 + tenants.length) % tenants.length)
      if (key.downArrow) setTenantIndex((i) => (i + 1) % tenants.length)
      if (key.return) setStep('query')
      return
    }

    if (step === 'query') {
      if (key.return && query.trim()) return setStep('mode')
      if (key.tab) return setQuery(nextExample(query))
      if (key.backspace || key.delete) return setQuery((q) => q.slice(0, -1))
      if (input && !key.ctrl && !key.meta) setQuery((q) => q + input)
      return
    }

    if (step === 'mode') {
      if (key.upArrow)
        setModeIndex((i) => (i - 1 + RETRIEVAL_MODES.length) % RETRIEVAL_MODES.length)
      if (key.downArrow) setModeIndex((i) => (i + 1) % RETRIEVAL_MODES.length)
      if (key.return) void runSearch(RETRIEVAL_MODES[modeIndex])
      const picked = modeFromKey(input)
      if (picked) void runSearch(picked)
      return
    }

    // step === 'results'
    if (search.status === 'loading') return
    const picked = modeFromKey(input)
    if (picked) return void runSearch(picked)
    if (input === 'd') return setShowDebug((value) => !value)
    if (input === 'n') return setStep('query')
    if (input === 't') return setStep('tenant')
    if (input === 'q') return exit()
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header retrieval={retrieval} tenant={tenant} query={step === 'tenant' ? '' : query} />

      {step === 'tenant' && (
        <Picker
          title="Choose a tenant"
          items={tenants.map((t) => t.name)}
          selectedIndex={tenantIndex}
          hint="arrows to choose, enter to confirm, esc to quit"
        />
      )}

      {step === 'query' && (
        <Box flexDirection="column">
          <Text bold>Ask a question</Text>
          <Text>
            <Text color="cyan">&gt; </Text>
            {query}
            <Text inverse> </Text>
          </Text>
          <Text dimColor>enter to confirm, tab for an example question, esc to quit</Text>
        </Box>
      )}

      {step === 'mode' && (
        <Picker
          title="Choose a retrieval mode"
          items={RETRIEVAL_MODES.map((mode, i) => `${i + 1}  ${mode}`)}
          selectedIndex={modeIndex}
          hint="arrows or 1-4, enter to confirm"
        />
      )}

      {step === 'results' && (
        <Box flexDirection="column">
          <SearchView state={search} tenants={tenants} showDebug={showDebug} />
          <Text dimColor>
            {`1 keyword  2 vector  3 hybrid  4 hybrid-rerank   d debug ${showDebug ? 'off' : 'on'}   n new question   t tenant   q quit`}
          </Text>
        </Box>
      )}
    </Box>
  )
}

function Header({
  retrieval,
  tenant,
  query,
}: {
  retrieval: RetrievalService
  tenant: Tenant
  query: string
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text bold color="magenta">
          rag-retrieval-lab
        </Text>
        <Text dimColor>
          {`   embeddings: ${retrieval.embeddingProviderName}   reranker: ${retrieval.rerankerName}`}
        </Text>
      </Text>
      <Text>
        Tenant: <Text bold>{tenant.name}</Text>
        {query && (
          <>
            {'   '}Question: <Text bold>"{query}"</Text>
          </>
        )}
      </Text>
    </Box>
  )
}

function Picker({
  title,
  items,
  selectedIndex,
  hint,
}: {
  title: string
  items: string[]
  selectedIndex: number
  hint: string
}) {
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      {items.map((item, index) => (
        <Text key={item} color={index === selectedIndex ? 'cyan' : undefined}>
          {index === selectedIndex ? '> ' : '  '}
          {item}
        </Text>
      ))}
      <Text dimColor>{hint}</Text>
    </Box>
  )
}

function SearchView({
  state,
  tenants,
  showDebug,
}: {
  state: SearchState
  tenants: Tenant[]
  showDebug: boolean
}) {
  if (state.status === 'idle') return null

  if (state.status === 'loading') {
    return <Text>Searching in {state.mode} mode...</Text>
  }

  if (state.status === 'error') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Mode: <Text bold>{state.mode}</Text>
        </Text>
        <Text color="red">{state.message}</Text>
      </Box>
    )
  }

  const { response, durationMs } = state
  const tenantNames = new Map(tenants.map((t) => [t.id, t.name]))
  const timings = Object.entries(response.timings)
    .map(([stage, ms]) => `${stage} ${ms} ms`)
    .join(', ')

  return (
    <Box flexDirection="column">
      <Text>
        Mode: <Text bold>{response.mode}</Text>
        <Text dimColor>
          {'   '}
          {resultCount(response.candidates.length)} in {Math.round(durationMs)} ms ({timings})
        </Text>
      </Text>
      <ResultList
        candidates={response.candidates}
        tenantNames={tenantNames}
        showDebug={showDebug}
      />
    </Box>
  )
}

function resultCount(count: number): string {
  return `${count} ${count === 1 ? 'result' : 'results'}`
}

function modeFromKey(input: string): RetrievalMode | undefined {
  const index = Number(input) - 1
  return Number.isInteger(index) ? RETRIEVAL_MODES[index] : undefined
}

function nextExample(current: string): string {
  const index = EXAMPLE_QUERIES.indexOf(current)
  return EXAMPLE_QUERIES[(index + 1) % EXAMPLE_QUERIES.length]
}

export async function renderRagDemo(props: Props): Promise<void> {
  const instance = render(<RagDemoApp {...props} />)
  await instance.waitUntilExit()
}
