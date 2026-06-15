import type { mount } from '@vue/test-utils'

export function swipeTopCard(wrapper: ReturnType<typeof mount>) {
  const card = wrapper.find('.job-card-stack__current .job-card').element
  card.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0 }))
  card.dispatchEvent(new MouseEvent('pointermove', { clientX: 200 }))
  card.dispatchEvent(new MouseEvent('pointerup', { clientX: 200 }))
  card.dispatchEvent(new Event('transitionend'))
}
