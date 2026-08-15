import { Hono } from 'hono'

export const apiRouter = new Hono()

apiRouter.get('/', (c) => {
  return c.json({
    message: 'Welcome to The Literary Circle Club AI Agent Brain API',
    version: '0.1.0',
    endpoints: {
      health: '/health',
      api: '/api',
    },
  })
})
