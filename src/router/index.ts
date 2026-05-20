import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'video-chat',
      component: () => import('@/pages/VideoChatPage.vue'),
    },
  ],
})

export default router
