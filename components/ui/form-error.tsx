import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Inline form/fetch error message — icon + text so the state isn't conveyed
// by colour alone, with role="alert" so screen readers announce it.
export function FormError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null
  return (
    <p role="alert" className={cn('flex items-start gap-1.5 text-sm text-destructive', className)}>
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  )
}
