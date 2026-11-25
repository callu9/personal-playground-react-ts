import type { Connect, Plugin } from 'vite'
import { portfolioBody, portfolioPath, responseDelayMs, responseHeaders } from './contract.ts'

const portfolioApi: Connect.NextHandleFunction = (request, response, next) => {
  if (request.method !== 'GET' || request.url?.split('?')[0] !== portfolioPath) {
    next()
    return
  }

  const timer = setTimeout(() => {
    response.writeHead(200, { ...responseHeaders, 'X-Jonbeo-Source': 'api' })
    response.end(portfolioBody)
  }, responseDelayMs)
  response.once('close', () => clearTimeout(timer))
}

export function jonbeoMsw(): Plugin {
  return {
    name: 'jonbeo-msw-lab',
    configureServer(server) {
      server.middlewares.use(portfolioApi)
    },
    configurePreviewServer(server) {
      server.middlewares.use(portfolioApi)
    },
  }
}
