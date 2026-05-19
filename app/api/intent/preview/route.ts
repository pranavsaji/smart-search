import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getPhaseAPrompt } from '@/lib/intent/phaseA'
import { parsePhaseAResponse } from '@/lib/intent/phaseA'
import { groqPhaseA } from '@/lib/intent/providers/groq'
import { claudePhaseA } from '@/lib/intent/providers/claude'
import { env } from '@/lib/config/env'
import { format, addDays } from 'date-fns'

const schema = z.object({ prompt: z.string().min(1).max(500) })

const REQUIRED_FIELDS: Record<string, string[]> = {
  flights: ['origin', 'destination', 'dates'],
  stays:   ['destination', 'dates'],
  cars:    ['origin', 'destination', 'dates'],
  experiences: ['destination', 'dates'],
  restaurants: ['destination'],
  appointments: ['specialty'],
  home_services: ['location', 'serviceType'],
  health_services: ['location', 'specialty'],
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = schema.parse(await req.json())
    const today = format(new Date(), 'yyyy-MM-dd')
    const defaultStart = format(addDays(new Date(), 7), 'yyyy-MM-dd')

    const llmMessages = [{
      role: 'user' as const,
      content: `Today is ${today}.\n\n${prompt}`,
    }]

    const phaseAPrompt = getPhaseAPrompt()
    let raw: string
    try {
      raw = env.AI_PROVIDER() === 'claude'
        ? await claudePhaseA(phaseAPrompt, llmMessages)
        : await groqPhaseA(phaseAPrompt, llmMessages)
    } catch {
      raw = await claudePhaseA(phaseAPrompt, llmMessages)
    }

    const phaseA = parsePhaseAResponse(raw)

    // Determine which fields are missing/need clarification
    const missingFields: string[] = []
    const { extracted, services } = phaseA

    const needsDates = services.some(s => ['flights','stays','cars','experiences'].includes(s))
    const needsDestination = services.some(s => ['flights','stays','cars','experiences','restaurants','maps'].includes(s))
    const needsOrigin = services.some(s => ['flights','cars'].includes(s))

    if (needsDestination && !extracted.destination) missingFields.push('destination')
    if (needsOrigin && !extracted.originCity) missingFields.push('origin')
    if (needsDates && !extracted.departureDate) missingFields.push('dates')

    return NextResponse.json({
      services: phaseA.services,
      summary: phaseA.summary,
      extracted: {
        destination: extracted.destination,
        origin: extracted.originCity,
        departureDate: extracted.departureDate ?? defaultStart,
        collaborator: extracted.collaborator,
      },
      missingFields,
    })
  } catch (err) {
    console.error('[preview]', err)
    return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
  }
}
