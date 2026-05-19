'use client'
import { useRef, useState } from 'react'
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function DocumentUpload() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/profile/upload', { method: 'POST', body: form })
      const json = await res.json() as { extractedFields?: number; error?: string }
      setResult(
        res.ok
          ? { ok: true, message: `Extracted ${json.extractedFields ?? 0} preference signals` }
          : { ok: false, message: json.error ?? 'Upload failed' }
      )
    } catch {
      setResult({ ok: false, message: 'Upload failed — please try again' })
    } finally {
      setIsUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="glass rounded-xl p-6 space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Upload a document</p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, Word, or text file — travel history, wishlist, preferences. Smart Search extracts signals to personalise your Stage results.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        className="hidden"
        onChange={handleUpload}
      />

      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => fileRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
          : <><Upload className="h-4 w-4" /> Choose file</>}
      </Button>

      {result && (
        <div className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-xs',
          result.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
        )}>
          {result.ok
            ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          {result.message}
        </div>
      )}
    </div>
  )
}
