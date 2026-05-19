// Edge-safe auth config — no Node.js-only imports (no MongoDB, no bcrypt).
// Used exclusively by middleware.ts which runs in the Edge runtime.
// The full auth config (with DB lookups) lives in lib/auth.ts.
import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [], // credentials provider requires Node.js — excluded here
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? ''
        // user.handle is defined on our augmented User type; AdapterUser may omit it
        token.handle = 'handle' in user && typeof user.handle === 'string' ? user.handle : ''
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === 'string' ? token.id : ''
        session.user.handle = typeof token.handle === 'string' ? token.handle : ''
      }
      return session
    },
    authorized({ auth }) {
      // Used by middleware to check if the user is authenticated
      return !!auth?.user
    },
  },
}
