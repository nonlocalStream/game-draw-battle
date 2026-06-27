import { useState } from 'react'
import type { DebugEntry } from '../lib/anthropic'

interface Props {
  entries: DebugEntry[]
}

export function DebugPanel({ entries }: Props) {
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState<number>(0)

  const entry = entries[selected]

  const statusColor: Record<string, string> = {
    pending: '#FFA726',
    success: '#66BB6A',
    error: '#EF5350',
    fallback: '#9E9E9E',
  }

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      width: open ? 440 : 'auto',
      background: 'rgba(20,16,40,0.97)',
      borderRadius: 12,
      border: '1px solid rgba(155,127,232,0.4)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      fontFamily: 'monospace',
      fontSize: 11,
      color: '#E0D7FF',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', cursor: 'pointer',
          background: 'rgba(155,127,232,0.15)',
          borderBottom: open ? '1px solid rgba(155,127,232,0.2)' : 'none',
        }}
      >
        <span style={{ fontWeight: 700, color: '#C4B5F4' }}>
          🔬 LLM Debug {entries.length > 0 && `(${entries.length})`}
        </span>
        <span style={{ color: '#8B7FB0' }}>{open ? '▼' : '▲'}</span>
      </div>

      {open && (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 500, overflowY: 'auto' }}>
          {entries.length === 0 ? (
            <div style={{ color: '#8B7FB0', textAlign: 'center', padding: '20px 0' }}>
              No API calls yet. Submit a drawing to see the request/response.
            </div>
          ) : (
            <>
              {/* Entry selector */}
              {entries.length > 1 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {entries.map((e, i) => (
                    <button
                      key={i}
                      onClick={() => setSelected(i)}
                      style={{
                        padding: '2px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10,
                        background: i === selected ? '#9B7FE8' : 'rgba(155,127,232,0.2)',
                        color: i === selected ? 'white' : '#C4B5F4',
                      }}
                    >
                      Call #{i + 1}
                    </button>
                  ))}
                </div>
              )}

              {entry && (
                <>
                  {/* Status row */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                      background: statusColor[entry.status] + '33',
                      color: statusColor[entry.status],
                      border: `1px solid ${statusColor[entry.status]}55`,
                    }}>
                      {entry.status.toUpperCase()}
                    </span>
                    {entry.durationMs != null && (
                      <span style={{ color: '#8B7FB0' }}>{entry.durationMs}ms</span>
                    )}
                    {entry.statusCode != null && (
                      <span style={{ color: '#8B7FB0' }}>HTTP {entry.statusCode}</span>
                    )}
                    <span style={{ color: '#8B7FB0' }}>{entry.timestamp.slice(11, 19)}</span>
                  </div>

                  {/* API key */}
                  <Row label="API Key" value={entry.apiKeyPresent ? `✓ ${entry.apiKeyPrefix}` : '✗ MISSING'} color={entry.apiKeyPresent ? '#66BB6A' : '#EF5350'} />

                  {/* Error */}
                  {entry.error && (
                    <Row label="Error" value={entry.error} color="#EF5350" mono />
                  )}

                  {/* Prompt */}
                  <Collapsible label="Prompt sent">
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#C4B5F4', margin: 0 }}>
                      {entry.requestPrompt}
                    </pre>
                  </Collapsible>

                  {/* Raw response */}
                  {entry.rawResponse && (
                    <Collapsible label="Raw response">
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#B3EFCC', margin: 0 }}>
                        {entry.rawResponse}
                      </pre>
                    </Collapsible>
                  )}

                  {/* Parsed */}
                  {entry.parsedResult && (
                    <Collapsible label="Parsed JSON" defaultOpen>
                      <pre style={{ whiteSpace: 'pre-wrap', color: '#FFE082', margin: 0 }}>
                        {JSON.stringify(entry.parsedResult, null, 2)}
                      </pre>
                    </Collapsible>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: '#8B7FB0', minWidth: 72, flexShrink: 0 }}>{label}:</span>
      <span style={{ color: color ?? '#E0D7FF', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  )
}

function Collapsible({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'rgba(155,127,232,0.1)', border: '1px solid rgba(155,127,232,0.25)',
          borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
          color: '#C4B5F4', fontSize: 10, fontWeight: 700, marginBottom: 4,
        }}
      >
        {open ? '▾' : '▸'} {label}
      </button>
      {open && (
        <div style={{
          background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 10px',
          maxHeight: 200, overflowY: 'auto',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}
