import { Box, Text } from 'ink'
import type { RetrievalCandidate } from '#domain/retrieval'

type Props = {
  candidates: RetrievalCandidate[]
  tenantNames: Map<string, string>
  showDebug: boolean
}

const PREVIEW_LENGTH = 110

export function ResultList({ candidates, tenantNames, showDebug }: Props) {
  if (candidates.length === 0) {
    return (
      <Box marginY={1}>
        <Text color="yellow">No results.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginY={1}>
      {candidates.map((candidate, index) => (
        <Box key={candidate.chunkId} flexDirection="column" marginBottom={1}>
          <Text>
            <Text bold color="cyan">
              #{index + 1}
            </Text>{' '}
            <Text bold>{candidate.documentName}</Text>
            <Text dimColor> ({tenantNames.get(candidate.tenantId) ?? candidate.tenantId})</Text>
          </Text>
          <Text>
            {'   '}
            {preview(candidate.content)}
          </Text>
          <Text>
            {'   '}
            <Score label="keyword" rank={candidate.keywordRank} score={candidate.keywordScore} />
            <Score label="vector" rank={candidate.vectorRank} score={candidate.vectorScore} />
            <Score label="hybrid" score={candidate.hybridScore} />
            <Score label="rerank" score={candidate.rerankerScore} />
          </Text>
          {showDebug && (
            <Text dimColor>
              {'   '}chunk {candidate.chunkId} document {candidate.documentId}
              {'\n   '}metadata {JSON.stringify(candidate.metadata)}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  )
}

function Score({ label, rank, score }: { label: string; rank?: number; score?: number }) {
  if (score === undefined) {
    return <Text dimColor>{`${label} -`.padEnd(22)}</Text>
  }

  const rankText = rank === undefined ? '' : ` #${rank}`
  return (
    <Text>
      <Text color="green">{label}</Text>
      {`${rankText} ${score.toFixed(4)}`.padEnd(22 - label.length)}
    </Text>
  )
}

function preview(content: string): string {
  return content.length > PREVIEW_LENGTH ? `${content.slice(0, PREVIEW_LENGTH)}...` : content
}
