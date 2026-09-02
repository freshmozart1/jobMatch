import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';

// https://vite.dev/config/
export default defineConfig({
    plugins: [vue(), vueDevTools()],
    resolve: {
        // Every entry here must have a matching `compilerOptions.paths` entry
        // in `tsconfig.app.json`. An alias declared only here bundles fine and
        // then fails `npm run type-check` with "Cannot find module" (#61).
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@pages': fileURLToPath(
                new URL('./src/pages/index.ts', import.meta.url),
            ),
        },
    },
});
