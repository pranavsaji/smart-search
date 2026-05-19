'use client'
import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AskProfileInputProps {
  ownerHandle: string
  ownerName: string
}

export function AskProfileInput({ ownerHandle, ownerName }: AskProfileInputProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [isAsking, setIsAsking] = useState(false)

  const handleAsk = async () => {
    if (!question.trim() || isAsking) return
    setIsAsking(true)
    setAnswer('')
    try {
      const res = await fetch('/api/profile/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, ownerHandle }),
      })
      if (!res.ok || !res.body) {
        setAnswer('Could not get an answer.')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let out = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        out += decoder.decode(value, { stream: true })
        setAnswer(out)
      }
    } finally {
      setIsAsking(false)
    }
  }

  const exampleQuestions = [
    `What hotels does ${ownerName} prefer?`,
    `Where has ${ownerName} travelled recently?`,
    `What's ${ownerName}'s travel style?`,
  ]

  return (
    <div className="glass rounded-xl p-6 space-y-4">
      <p className="text-sm font-semibold text-foreground">
        Ask about {ownerName}&apos;s preferences
      </p>

      {/* Example chips */}
      {!answer && !isAsking && (
        <div className="flex flex-wrap gap-2">
          {exampleQuestions.map(q => (
            <button
              key={q}
              onClick={() => setQuestion(q)}
              className="rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAsk()}
          placeholder={`e.g. "What does ${ownerName} prefer for hotels?"`}
          className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button size="sm" onClick={handleAsk} disabled={isAsking || !question.trim()}>
          {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {(answer || isAsking) && (
        <div className={cn(
          'rounded-lg bg-secondary/30 p-4 text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed',
          isAsking && !answer && 'animate-pulse'
        )}>
          {answer || 'Thinking…'}
        </div>
      )}
    </div>
  )
}
