import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const repository = 'freshmozart1/jobMatchServer';
const sourcePath = 'src/types.ts';
const snapshotUrl = new URL(
    '../src/contracts/jobMatchServer.d.ts',
    import.meta.url,
);
const manifestUrl = new URL(
    '../src/contracts/jobMatchServer.json',
    import.meta.url,
);

export function validateManifest(manifest) {
    if (
        manifest.repository !== repository ||
        manifest.sourcePath !== sourcePath ||
        !/^[a-f0-9]{40}$/.test(manifest.revision) ||
        !/^[a-f0-9]{64}$/.test(manifest.sha256)
    ) {
        throw new Error(
            'Invalid wire contract provenance; use an immutable server commit.',
        );
    }
}

export function validateDeclarations(source) {
    const file = ts.createSourceFile(
        sourcePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const exports = new Set();
    function checkSelfContained(node) {
        if (ts.isImportTypeNode(node)) {
            throw new Error(
                'The server contract must remain self-contained type declarations.',
            );
        }
        ts.forEachChild(node, checkSelfContained);
    }
    checkSelfContained(file);
    if (file.parseDiagnostics.length)
        throw new Error('The server type source contains syntax errors.');
    for (const statement of file.statements) {
        if (
            !ts.isTypeAliasDeclaration(statement) &&
            !ts.isInterfaceDeclaration(statement)
        ) {
            throw new Error(
                'The server contract must remain self-contained type declarations.',
            );
        }
        if (
            statement.modifiers?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
            )
        ) {
            exports.add(statement.name.text);
        }
    }
    for (const name of ['CompanyAddress', 'ScrapedJob', 'ScrapeStreamFrame']) {
        if (!exports.has(name))
            throw new Error(`The server contract is missing ${name}.`);
    }
}

export function verifySnapshot(source, manifest) {
    validateManifest(manifest);
    if (createHash('sha256').update(source).digest('hex') !== manifest.sha256) {
        throw new Error(
            'Wire contract snapshot was edited. Restore it or run npm run sync:wire-contract -- <server-commit>.',
        );
    }
    validateDeclarations(source);
}

function fetchSource(revision) {
    if (!/^[a-f0-9]{40}$/.test(revision ?? '')) {
        throw new Error(
            'Provide the full immutable 40-character server commit SHA.',
        );
    }
    const response = JSON.parse(
        execFileSync(
            'gh',
            [
                'api',
                `repos/${repository}/contents/${sourcePath}?ref=${revision}`,
            ],
            { encoding: 'utf8', maxBuffer: 1024 * 1024 },
        ),
    );
    if (
        response.encoding !== 'base64' ||
        typeof response.content !== 'string'
    ) {
        throw new Error('GitHub did not return the server type source.');
    }
    return Buffer.from(response.content, 'base64').toString('utf8');
}

async function main(args) {
    const [command, revision, ...extra] = args;
    if (
        extra.length ||
        !['--check', '--check-upstream', '--update'].includes(command) ||
        (command !== '--update' && revision !== undefined)
    ) {
        throw new Error(
            'Usage: wire-contract.mjs --check | --check-upstream | --update <server-commit>',
        );
    }
    if (command === '--update') {
        const source = fetchSource(revision);
        validateDeclarations(source);
        const manifest = {
            repository,
            revision,
            sourcePath,
            sha256: createHash('sha256').update(source).digest('hex'),
        };
        await writeFile(snapshotUrl, source);
        await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 4)}\n`);
        console.log(`Synced the wire contract from ${repository}@${revision}.`);
        return;
    }
    const source = await readFile(snapshotUrl, 'utf8');
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    verifySnapshot(source, manifest);
    if (
        command === '--check-upstream' &&
        fetchSource(manifest.revision) !== source
    ) {
        throw new Error(
            'The wire snapshot differs from its pinned upstream source.',
        );
    }
    console.log(
        `Wire contract verified${command === '--check' ? ' offline' : ' against upstream'} at ${manifest.revision}.`,
    );
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
