import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = z.object({ email: z.string().email(), password: z.string().min(6) }).safeParse(credentials)
        if (!parsed.success) return null

        const db = await getDb()
        const user = await db.collection(COLLECTIONS.users).findOne({ email: parsed.data.email })
        if (!user) return null

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) return null

        return { id: user._id.toString(), email: user.email, name: user.displayName, image: user.avatarUrl, handle: user.handle }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? ''
        token.handle = user.handle
      }
      return token
    },
    session({ session, token }) {
      // token fields are unknown until narrowed — JWT augmentation doesn't flow through
      // DefaultJWT's Record<string,unknown> index signature in all NextAuth v5 versions.
      session.user.id = typeof token.id === 'string' ? token.id : ''
      session.user.handle = typeof token.handle === 'string' ? token.handle : ''
      return session
    },
  },
})
