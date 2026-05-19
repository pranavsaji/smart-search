import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getLocaleForCurrency } from '@/lib/geo/currency'

export { getCurrencyForDestination } from '@/lib/geo/currency'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amountMinor: number, currency = 'USD'): string {
  return new Intl.NumberFormat(getLocaleForCurrency(currency), {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amountMinor / 100)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date))
}

export function timeUntil(date: Date): string {
  const diff = new Date(date).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

export function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}
