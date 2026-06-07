import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './constants/colors.css'
import './constants/layout.css'
import './constants/typography.css'

const app = createApp(App)

app.use(router)

app.mount('#app')
