import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint({ fix: false });

const lintMessages = async (source, filePath) => {
    const [result] = await eslint.lintText(source, { filePath });
    assert.ok(result);
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    return result.messages;
};

test('TypeScript still reports type-aware promise errors', async () => {
    const messages = await lintMessages('Promise.resolve(1);', 'src/main.ts');
    assert.ok(
        messages.some(
            ({ ruleId }) =>
                ruleId === '@typescript-eslint/no-floating-promises',
        ),
    );
});

test('Vue scripts retain typed linting and templates retain Vue rules', async () => {
    const messages = await lintMessages(
        `<script setup lang="ts">Promise.resolve(1);</script>
<template><div id="first" id="second" /></template>`,
        'src/pages/match/MatchPage.vue',
    );
    assert.ok(
        messages.some(
            ({ ruleId }) =>
                ruleId === '@typescript-eslint/no-floating-promises',
        ),
    );
    assert.ok(
        messages.some(({ ruleId }) => ruleId === 'vue/no-duplicate-attributes'),
    );
});

test('Template-only Vue files parse without requiring a TypeScript project', async () => {
    assert.deepEqual(
        await lintMessages(
            '<template><div /></template>',
            'src/components/BrandBar.vue',
        ),
        [],
    );
    const messages = await lintMessages(
        '<template><div id="first" id="second" /></template>',
        'src/components/BrandBar.vue',
    );
    assert.ok(
        messages.some(({ ruleId }) => ruleId === 'vue/no-duplicate-attributes'),
    );
});
