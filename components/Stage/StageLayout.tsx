'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChatSidebar, ChatSidebarToggle } from '@/components/layout/ChatSidebar'
import { StageShell } from '@/components/Stage/StageShell'
import type { MergedStageContext, ParsedIntent } from '@/lib/intent/types'

interface StageLayoutProps {
  stageId: string
  parsedIntent: ParsedIntent
  stageContext: MergedStageContext
  userId?: string
  pendingInvites?: { handle: string; url: string }[]
}

export function StageLayout({ stageId, parsedIntent, stageContext, userId, pendingInvites }: StageLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const router = useRouter()

  const handleLoadChat = (id: string) => {
    // Chat sessions link back to their stage
    router.push(`/stage/${id}`)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar toggle affordance when collapsed */}
      {sidebarCollapsed && (
        <ChatSidebarToggle onClick={() => setSidebarCollapsed(false)} />
      )}

      <ChatSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
        activeChatId={stageId}
        onNewChat={() => router.push('/')}
        onLoadChat={handleLoadChat}
      />

      <div className="flex-1 overflow-y-auto">
        <StageShell
          stageId={stageId}
          parsedIntent={parsedIntent}
          stageContext={stageContext}
          userId={userId}
          pendingInvites={pendingInvites}
        />
      </div>
    </div>
  )
}
