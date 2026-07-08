'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Square, Loader2, ArrowRight, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Phase = 'idle' | 'recording' | 'transcribing' | 'done' | 'error'

export function VoiceClient() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const router = useRouter()

  async function start() {
    setError(''); setTranscript('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      }
      recorder.start()
      recorderRef.current = recorder
      setPhase('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch {
      setError('Microphone access denied. Allow mic permission and try again.')
      setPhase('error')
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current)
    recorderRef.current?.stop()
    setPhase('transcribing')
  }

  async function transcribe(blob: Blob) {
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'recording.webm')
      const res = await fetch('/api/voice/transcribe', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Transcription failed')
      setTranscript(data.text ?? data.transcript ?? '')
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed')
      setPhase('error')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center gap-5 p-10">
        <button
          onClick={phase === 'recording' ? stop : start}
          disabled={phase === 'transcribing'}
          className={`flex h-24 w-24 items-center justify-center rounded-full transition-all ${
            phase === 'recording'
              ? 'animate-pulse bg-red-500 text-white shadow-lg shadow-red-500/40'
              : 'bg-primary text-primary-foreground hover:scale-105'
          } disabled:opacity-60`}
        >
          {phase === 'transcribing' ? <Loader2 className="h-9 w-9 animate-spin" />
            : phase === 'recording' ? <Square className="h-8 w-8" />
            : <Mic className="h-9 w-9" />}
        </button>
        <p className="text-sm text-muted-foreground">
          {phase === 'recording' ? `Listening… ${seconds}s — tap to stop`
            : phase === 'transcribing' ? 'Transcribing…'
            : phase === 'done' ? 'Done — review below'
            : 'Tap to start speaking'}
        </p>
      </Card>

      {error && (
        <Card className="flex items-start gap-2 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {transcript && (
        <Card className="p-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Transcript</p>
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <Button className="mt-3 w-full" onClick={() => router.push(`/?prompt=${encodeURIComponent(transcript)}`)}>
            Send to Smart Search <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Audio is transcribed via Whisper. Without an OpenAI key the server returns a mock transcript.
      </p>
    </div>
  )
}
