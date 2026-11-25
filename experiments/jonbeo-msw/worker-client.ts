import { delay, passthrough } from 'msw'
import { http, HttpResponse } from 'msw/http'
import { setupWorker } from 'msw/browser'
import { portfolioBody, portfolioPath, responseDelayMs, responseHeaders, workerScope, type RequestPath } from './contract'

import { mark } from './metrics'

export async function startWorker(mode: Exclude<RequestPath, 'off'>) {
  const worker = setupWorker(http.get(portfolioPath, async () => {
    mark('resolverStart')
    if (mode === 'passthrough') return passthrough()
    await delay(responseDelayMs)
    mark('mockResponse')
    return new HttpResponse(portfolioBody, {
      headers: { ...responseHeaders, 'X-Jonbeo-Source': 'mock' },
    })
  }))

  await worker.start({
    quiet: true,
    onUnhandledFrame: 'bypass',
    serviceWorker: {
      url: workerScope + 'mockServiceWorker.js',
      options: { scope: workerScope },
    },
  })
}
