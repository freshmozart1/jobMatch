import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, globalIgnores } from 'eslint/config';
import { escapePath, globSync } from 'tinyglobby';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import pluginVue from 'eslint-plugin-vue';
import pluginPlaywright from 'eslint-plugin-playwright';
import pluginVitest from '@vitest/eslint-plugin';
import skipFormatting from 'eslint-config-prettier/flat';

const ignoredFiles = [
    '**/dist/**',
    '**/dist-ssr/**',
    '**/coverage/**',
    // Byte-exact upstream declarations are validated by check:wire-contract.
    'src/contracts/jobMatchServer.d.ts',
];
const vueFiles = globSync('**/*.vue', {
    cwd: import.meta.dirname,
    ignore: ['**/node_modules/**', '**/.git/**', ...ignoredFiles],
});
const hasTypedScript = (file: string) =>
    /<script\b[^>]*\blang\s*=\s*(['"])ts\1/i.test(
        readFileSync(resolve(import.meta.dirname, file), 'utf8'),
    );
const typedVueFiles = vueFiles.filter(hasTypedScript).map(escapePath);
const templateOnlyVueFiles = vueFiles
    .filter((file) => !hasTypedScript(file))
    .map(escapePath);

export default defineConfig(
    {
        name: 'app/files-to-lint',
        files: ['**/*.{vue,ts,mts,tsx}'],
    },

    globalIgnores(ignoredFiles),

    ...defineConfig(tseslint.configs.recommendedTypeChecked).map((config) => ({
        ...config,
        ...(config.files ? { files: [...config.files, '**/*.vue'] } : {}),
    })),
    ...pluginVue.configs['flat/essential'],

    {
        name: 'app/typescript-project-service',
        files: ['**/*.{ts,mts,tsx}'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                extraFileExtensions: ['.vue'],
            },
        },
    },
    {
        name: 'app/vue-typescript-parser',
        files: ['**/*.vue'],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: { js: 'espree', jsx: 'espree', ts: tseslint.parser },
                ecmaVersion: 2024,
                ecmaFeatures: { jsx: false },
                extraFileExtensions: ['.vue'],
            },
        },
        rules: {
            'vue/block-lang': [
                'error',
                { script: { lang: ['ts'], allowNoLang: false } },
            ],
        },
    },
    {
        name: 'app/skip-type-checking-for-javascript',
        files: ['**/*.{js,jsx,cjs,mjs}'],
        ...tseslint.configs.disableTypeChecked,
    },
    ...(templateOnlyVueFiles.length
        ? [
              {
                  name: 'app/skip-type-checking-for-template-only-vue',
                  files: templateOnlyVueFiles,
                  ...tseslint.configs.disableTypeChecked,
                  rules: {
                      ...tseslint.configs.disableTypeChecked.rules,
                      '@typescript-eslint/consistent-type-imports':
                          'off' as const,
                  },
              },
          ]
        : []),
    ...(typedVueFiles.length
        ? [
              {
                  name: 'app/vue-project-service',
                  files: typedVueFiles,
                  languageOptions: {
                      parserOptions: {
                          projectService: true,
                          parser: tseslint.parser,
                      },
                  },
              },
          ]
        : []),
    {
        name: 'app/vue-component-type-compatibility',
        files: ['**/*.{ts,mts,tsx,vue}'],
        // Preserve the previous Vue preset's exemptions for incomplete SFC
        // types in createApp, route components and template refs.
        rules: {
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
        },
    },

    {
        ...pluginPlaywright.configs['flat/recommended'],
        files: ['e2e/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    },

    {
        ...pluginVitest.configs.recommended,
        files: ['src/**/__tests__/*'],
        rules: {
            ...pluginVitest.configs.recommended.rules,
            'vitest/expect-expect': [
                'error',
                {
                    assertFunctionNames: [
                        'expect',
                        'expectTypeOf',
                        'expectEndpointsCalled',
                        'expectSearchStopped',
                    ],
                },
            ],
        },
    },

    skipFormatting,
);
