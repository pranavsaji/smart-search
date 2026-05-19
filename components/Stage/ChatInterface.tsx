'use client'
import { useEffect, useRef } from 'react'
import { FriendRequestCard } from '@/components/Stage/FriendRequestCard'
import type { ResolvedMention } from '@/lib/resolver/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  component?: {
    name: 'FriendRequest' | 'Clarification'
    props: Record<string, unknown>
  }
}

interface ChatInterfaceProps {
  messages: ChatMessage[]
  isLoading?: boolean
  loadingText?: string
}

export function ChatInterface({ messages, isLoading, loadingText }: ChatInterfaceProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  if (messages.length === 0 && !isLoading) return null

  return (
    <div className="w-full max-w-3xl mx-auto space-y-3 px-4 py-4">
      {messages.map(msg => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {msg.component?.name === 'FriendRequest' ? (
            <FriendRequestCard mention={msg.component.props as unknown as ResolvedMention} />
          ) : (
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary/20 text-white rounded-br-sm'
                  : 'bg-white/5 border border-white/10 text-white/90 rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          )}
        </div>
      ))}

      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-white/50">
            <span>{loadingText ?? 'Thinking'}</span>
            <span className="inline-flex gap-0.5 ml-1">
              <span className="animate-bounce [animation-delay:-0.3s]">.</span>
              <span className="animate-bounce [animation-delay:-0.15s]">.</span>
              <span className="animate-bounce">.</span>
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
