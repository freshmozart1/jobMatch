import { createRouter, createWebHistory } from 'vue-router'
import { MatchPage } from '@pages'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [{
    path: '/',
    name: 'match',
    component: MatchPage,
  }],
})

export default router
