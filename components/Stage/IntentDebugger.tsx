'use client'
import { useState } from 'react'
import type { ParsedIntent, PhaseAResult } from '@/lib/intent/types'

interface IntentDebuggerProps {
  intent: ParsedIntent | null
}

export function IntentDebugger({ intent }: IntentDebuggerProps) {
  const [open, setOpen] = useState(false)

  if (process.env.NODE_ENV !== 'development') return null
  if (!intent) return null

  const phaseA = intent._phaseA as PhaseAResult | undefined

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm font-mono text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between rounded-lg border border-white/20 bg-black/80 backdrop-blur px-3 py-2 text-white/70 hover:text-white transition-colors"
      >
        <span className="font-semibold">Intent Debug</span>
        <span className="text-white/40">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-1 rounded-lg border border-white/20 bg-black/90 backdrop-blur p-3 space-y-2 max-h-96 overflow-y-auto">
          {phaseA && (
            <div>
              <div className="text-white/40 uppercase tracking-wider mb-1">Phase A</div>
              <div className="text-green-400">Services: {phaseA.services.join(', ') || 'none'}</div>
              {phaseA.extracted?.brand && <div className="text-yellow-400">Brand: {phaseA.extracted.brand}</div>}
              {phaseA.extracted?.collaborator && <div className="text-blue-400">Collaborator: {phaseA.extracted.collaborator}</div>}
            </div>
          )}

          <div>
            <div className="text-white/40 uppercase tracking-wider mb-1">Phase B</div>
            <div>dest: <span className="text-white">{intent.destination}</span></div>
            <div>types: <span className="text-white">{intent.activityTypes.join(', ')}</span></div>
            <div>confidence: <span className="text-white">{((intent.confidence ?? 0) * 100).toFixed(0)}%</span></div>
            {intent.clarificationNeeded && (
              <div className="text-red-400">⚠ Clarification: {intent.clarificationMessage}</div>
            )}
          </div>

          <details>
            <summary className="text-white/40 cursor-pointer hover:text-white/70">Full intent JSON</summary>
            <pre className="mt-2 text-white/70 text-[10px] overflow-auto max-h-48 whitespace-pre-wrap break-all">
              {JSON.stringify(intent, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
