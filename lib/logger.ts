type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

function write(level: LogLevel, msg: string, ctx?: LogContext): void {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  })
  if (level === 'error' || level === 'warn') {
    console.error(entry)
  } else {
    console.log(entry)
  }
}

export const logger = {
  debug(msg: string, ctx?: LogContext): void {
    if (process.env.NODE_ENV === 'development') write('debug', msg, ctx)
  },
  info(msg: string, ctx?: LogContext): void {
    write('info', msg, ctx)
  },
  warn(msg: string, ctx?: LogContext): void {
    write('warn', msg, ctx)
  },
  error(msg: string, err?: unknown, ctx?: LogContext): void {
    const errFields =
      err instanceof Error
        ? { error: err.message, stack: err.stack }
        : err !== undefined
        ? { error: String(err) }
        : {}
    write('error', msg, { ...errFields, ...ctx })
  },
}
