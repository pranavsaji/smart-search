import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { verifyOTP, normalizeEmail } from '@/lib/auth/otp'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/ratelimit'

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    // Email + OTP (GAP_ANALYSIS 1.1) — the primary path for new accounts.
    Credentials({
      id: 'otp',
      name: 'Email code',
      credentials: {
        email: { label: 'Email', type: 'email' },
        code: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        const parsed = z.object({
          email: z.string().email(),
          code: z.string().regex(/^\d{6}$/),
        }).safeParse(credentials)
        if (!parsed.success) return null

        const email = normalizeEmail(parsed.data.email)

        // The lockout in verifyOTP counts wrong guesses per address; this caps
        // total verify traffic so the bcrypt compare cannot be used to grind CPU.
        try {
          await enforceRateLimit(RATE_LIMITS.otpVerify, `e:${email}`)
        } catch {
          return null
        }

        const result = await verifyOTP(email, parsed.data.code)
        if (!result.ok) return null

        const db = await getDb()
        const user = await db.collection(COLLECTIONS.users).findOne({ email })
        // A valid code for a since-deleted account must not mint a session.
        if (!user) return null

        // First successful code doubles as proof of address ownership.
        if (!user.emailVerifiedAt) {
          await db.collection(COLLECTIONS.users).updateOne(
            { _id: user._id },
            { $set: { emailVerifiedAt: new Date() } },
          )
        }

        return { id: user._id.toString(), email: user.email, name: user.displayName, image: user.avatarUrl, handle: user.handle }
      },
    }),

    // Password login, kept for accounts created before OTP existed. New accounts
    // get no passwordHash, so this provider simply never matches for them.
    Credentials({
      id: 'credentials',
      name: 'Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = z.object({ email: z.string().email(), password: z.string().min(6) }).safeParse(credentials)
        if (!parsed.success) return null

        const db = await getDb()
        const user = await db.collection(COLLECTIONS.users).findOne({ email: normalizeEmail(parsed.data.email) })
        if (!user) return null
        // Passwordless accounts must not be loggable via an empty/absent hash.
        if (typeof user.passwordHash !== 'string' || user.passwordHash.length === 0) return null

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
