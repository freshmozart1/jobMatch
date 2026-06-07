import { describe, it, expect } from 'vitest'

import { mount, flushPromises } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'

describe('App', () => {
  it('renders the match page through the router', async () => {
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    })
    await flushPromises()

    expect(wrapper.find('.match-page').exists()).toBe(true)
  })
})
