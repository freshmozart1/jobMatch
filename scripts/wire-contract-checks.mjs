import assert from 'node:assert/strict';
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
