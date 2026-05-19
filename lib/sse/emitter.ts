import { EventEmitter } from 'events'
import type { SSEEvent } from './broadcast'

// Module-level singleton — shared across all SSE connections in this Node.js process.
// Eliminates Redis polling: live events are fan-out via this emitter, Redis is write-only
// for Last-Event-ID replay on reconnect.
const stageEmitter = new EventEmitter()
// High limit — each open SSE connection registers one listener per stageId
stageEmitter.setMaxListeners(1000)

export function emitStageEvent(stageId: string, event: SSEEvent): void {
  stageEmitter.emit(`stage:${stageId}`, event)
}

// Returns an unsubscribe function — callers must call it on cleanup to prevent leaks.
export function onStageEvent(
  stageId: string,
  handler: (event: SSEEvent) => void
): () => void {
  const channel = `stage:${stageId}`
  stageEmitter.on(channel, handler)
  return () => stageEmitter.off(channel, handler)
}
