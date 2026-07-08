import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Toaster } from 'sonner'
import Providers from '@/components/Providers'

const geistSans = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  fallback: ['system-ui', 'sans-serif'],
})

const geistMono = localFont({
  src: '../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  fallback: ['monospace'],
})

export const metadata: Metadata = {
  title: { default: 'Smart Search — Intent Operating System', template: '%s · Smart Search' },
  description: 'One-prompt orchestration. Travel, shopping, dining, and more.',
  keywords: ['Smart Search', 'intent', 'ai', 'travel', 'shopping', 'booking'],
  openGraph: {
    title: 'Smart Search — Intent Operating System',
    description: 'One-prompt orchestration. Travel, shopping, dining, and more.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            theme="light"
            toastOptions={{
              style: {
                background: 'hsl(0 0% 100%)',
                border: '1px solid hsl(214 32% 91%)',
                color: 'hsl(222 47% 11%)',
                boxShadow: '0 8px 32px rgba(37, 99, 235, 0.08)',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
