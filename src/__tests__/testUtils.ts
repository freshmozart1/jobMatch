import type { mount } from '@vue/test-utils'

export function swipeTopCard(wrapper: ReturnType<typeof mount>) {
  const card = wrapper.find('.job-card-stack__current .job-card').element
  card.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0 }))
  card.dispatchEvent(new MouseEvent('pointermove', { clientX: 200 }))
  card.dispatchEvent(new MouseEvent('pointerup', { clientX: 200 }))
  card.dispatchEvent(new Event('transitionend'))
}

export function createSseResponse(events: unknown[], init: ResponseInit = {}) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('ping\n\n'))
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    ...init,
  })
}
