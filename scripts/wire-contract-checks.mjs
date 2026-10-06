import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    validateDeclarations,
    validateManifest,
    verifySnapshot,
} from './wire-contract.mjs';

const source = await readFile(
    new URL('../src/contracts/jobMatchServer.d.ts', import.meta.url),
    'utf8',
);
const manifest = JSON.parse(
    await readFile(
        new URL('../src/contracts/jobMatchServer.json', import.meta.url),
        'utf8',
    ),
);

test('accepts the exact pinned declaration snapshot', () => {
    assert.doesNotThrow(() => verifySnapshot(source, manifest));
});

test('rejects a hand-edited contract even if it is valid TypeScript', () => {
    assert.throws(
        () =>
            verifySnapshot(
                source.replace('sourceJobId?:', 'sourceJobId:'),
                manifest,
            ),
        /snapshot was edited/,
    );
});

test('rejects moving revisions and a different source repository', () => {
    assert.throws(
        () => validateManifest({ ...manifest, revision: 'master' }),
        /immutable server commit/,
    );
    assert.throws(
        () =>
            validateManifest({ ...manifest, repository: 'another/repository' }),
        /provenance/,
    );
});

test('rejects an upstream contract that gains runtime code or unresolved imports', () => {
    assert.throws(
        () => validateDeclarations(`${source}\nexport const runtime = 1;`),
        /self-contained type declarations/,
    );
    assert.throws(
        () =>
            validateDeclarations(
                `import type { External } from 'uninstalled';\n${source}`,
            ),
        /self-contained type declarations/,
    );
});

test('rejects inline imports embedded in a type alias', () => {
    assert.throws(
        () =>
            validateDeclarations(
                `${source}\nexport type Imported = import('uninstalled').External;`,
            ),
        /self-contained type declarations/,
    );
});

test('rejects an upstream source without the required public wire declarations', () => {
    assert.throws(
        () => validateDeclarations('export type SomethingElse = string;'),
        /missing CompanyAddress/,
    );
});

test('rejects unresolved aliases even when the snapshot digest is refreshed', () => {
    const unresolved = source.replace(
        'TextEmbedding = number[]',
        'TextEmbedding = ServerOnlyEmbedding',
    );
    const refreshedManifest = {
        ...manifest,
        sha256: createHash('sha256').update(unresolved).digest('hex'),
    };
    assert.throws(
        () => validateDeclarations(unresolved),
        /TS2304.*ServerOnlyEmbedding/,
    );
    assert.throws(
        () => verifySnapshot(unresolved, refreshedManifest),
        /TS2304.*ServerOnlyEmbedding/,
    );
});

test('does not obtain missing types from the app DOM or installed Node environment', () => {
    for (const external of ['HTMLElement[]', 'NodeJS.Timeout']) {
        const dependent = source.replace(
            'TextEmbedding = number[]',
            `TextEmbedding = ${external}`,
        );
        assert.throws(
            () => validateDeclarations(dependent),
            /not self-contained/,
        );
    }
});

test('rejects triple-slash file, ambient package and library references', () => {
    for (const reference of [
        'path="neighboring-types.d.ts"',
        'types="node"',
        'lib="dom"',
    ]) {
        const dependent = `/// <reference ${reference} />\n${source}`;
        const refreshedManifest = {
            ...manifest,
            sha256: createHash('sha256').update(dependent).digest('hex'),
        };
        assert.throws(
            () => validateDeclarations(dependent),
            /triple-slash reference dependencies/,
        );
        assert.throws(
            () => verifySnapshot(dependent, refreshedManifest),
            /triple-slash reference dependencies/,
        );
    }
});
