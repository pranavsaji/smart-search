import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

// ─── Typed Error Classes ────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = 'INTERNAL_ERROR',
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string) {
    super(message, 400, 'BAD_REQUEST')
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND')
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, public readonly meta?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT')
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message = 'Too many requests', public readonly retryAfterSeconds?: number) {
    super(message, 429, 'RATE_LIMITED')
  }
}

export class OfferExpiredError extends ConflictError {
  constructor(public readonly expiredIds: string[]) {
    super('One or more offers have expired', { expiredIds })
  }
}

// ─── Response Helpers ───────────────────────────────────────────────────────

export function ok<T extends object | unknown[]>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

// ─── Centralized Error Handler ──────────────────────────────────────────────
// Maps typed errors → consistent JSON shape. One handler, all routes.

export function handleApiError(err: unknown, routeContext?: string): NextResponse {
  if (routeContext) console.error(`[${routeContext}]`, err)

  if (err instanceof OfferExpiredError) {
    return NextResponse.json(
      { error: err.message, code: err.code, expiredIds: err.expiredIds },
      { status: 409 }
    )
  }

  if (err instanceof TooManyRequestsError) {
    return NextResponse.json(
      { error: err.message, code: err.code, retryAfter: err.retryAfterSeconds },
      {
        status: 429,
        // Retry-After lets well-behaved clients back off instead of hot-looping.
        headers: err.retryAfterSeconds
          ? { 'Retry-After': String(err.retryAfterSeconds) }
          : undefined,
      }
    )
  }

  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { error: err.message, code: err.code }
    if (err instanceof ConflictError && err.meta) Object.assign(body, err.meta)
    return NextResponse.json(body, { status: err.statusCode })
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'VALIDATION_ERROR', details: err.errors },
      { status: 400 }
    )
  }

  // Preserve string-coded errors from the service layer (e.g. 'GIFT_EXPIRED')
  if (typeof err === 'string') {
    if (err.startsWith('GIFT_NOT_FOUND')) return NextResponse.json({ error: 'Gift not found', code: 'NOT_FOUND' }, { status: 404 })
    if (err.startsWith('GIFT_EXPIRED')) return NextResponse.json({ error: 'Gift has expired', code: 'GIFT_EXPIRED' }, { status: 410 })
    if (err.startsWith('GIFT_INVALID_STATUS')) return NextResponse.json({ error: 'Gift already redeemed', code: 'GIFT_INVALID_STATUS' }, { status: 409 })
    if (err.startsWith('PAYMENT_FAILED')) return NextResponse.json({ error: 'Payment failed', code: 'PAYMENT_FAILED' }, { status: 402 })
    if (err.startsWith('OFFER_EXPIRED:')) {
      const expiredIds = err.replace('OFFER_EXPIRED:', '').split(',')
      return NextResponse.json({ error: 'One or more offers have expired', code: 'OFFER_EXPIRED', expiredIds }, { status: 409 })
    }
  }

  if (err instanceof Error) {
    return NextResponse.json(
      { error: err.message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }

  return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
}

// ─── Route Wrapper ──────────────────────────────────────────────────────────
// Eliminates try/catch boilerplate from every route handler.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: NextRequest, ctx?: any) => Promise<NextResponse>

export function withApiHandler(
  handler: RouteHandler,
  routeContext?: string,
): RouteHandler {
  return async (req: NextRequest, ctx?: unknown) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      return handleApiError(err, routeContext)
    }
  }
}
