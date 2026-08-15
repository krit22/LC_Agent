import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { secureHeaders } from 'hono/secure-headers'
import { apiRouter } from './routes/api.js'
import { healthRouter } from './routes/health.js'

export function createApp() {
  const app = new Hono()

  // Middlewares
  app.use('*', logger())
  app.use('*', secureHeaders())
  app.use('*', prettyJSON())
  app.use(
    '*',
    cors({
      origin: (origin) => {
        // Allow localhost and configured origins
        if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          return origin || '*'
        }
        return null
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['Content-Length'],
      maxAge: 600,
      credentials: true,
    })
  )

  // Routes
  app.get('/', (c) => {
    return c.json({
      name: 'LC_Agent Backend',
      status: 'active',
      docs: '/api',
    })
  })

  app.route('/health', healthRouter)
  app.route('/api', apiRouter)

  // 404 Handler
  app.notFound((c) => {
    return c.json(
      {
        error: 'Not Found',
        message: `Route not found: ${c.req.method} ${c.req.path}`,
      },
      404
    )
  })

  // Global Error Handler
  app.onError((err, c) => {
    console.error(`[Error] ${err.message}`, err.stack)
    return c.json(
      {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred.',
      },
      500
    )
  })

  return app
}
