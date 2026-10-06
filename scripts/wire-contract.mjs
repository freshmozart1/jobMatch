import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
    if (
        file.referencedFiles.length ||
        file.typeReferenceDirectives.length ||
        file.libReferenceDirectives.length ||
        file.hasNoDefaultLib
    ) {
        throw new Error(
            'The server contract must not contain triple-slash reference dependencies.',
        );
    }
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
    validateDeclarationSemantics(source);
}

function validateDeclarationSemantics(source) {
    // Check the declaration itself even when the consuming app skips library
    // checking. Only the snapshot and TypeScript's built-in ES5 types can load;
    // installed ambient packages, DOM types and neighboring files cannot hide
    // dependencies that are absent from the source snapshot.
    const options = {
        noEmit: true,
        strict: true,
        skipLibCheck: false,
        noResolve: true,
        types: [],
        lib: ['lib.es5.d.ts'],
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
    };
    const contractPath = fileURLToPath(snapshotUrl);
    const libraryDirectory = dirname(ts.getDefaultLibFilePath(options));
    const baseHost = ts.createCompilerHost(options, true);
    function isStandardLibrary(path) {
        return (
            dirname(resolve(path)) === libraryDirectory &&
            /^lib(?:\.[\w.]+)?\.d\.ts$/.test(basename(path))
        );
    }
    const host = {
        ...baseHost,
        getSourceFile(path, version, onError, shouldCreate) {
            if (resolve(path) === contractPath) {
                return ts.createSourceFile(contractPath, source, version, true);
            }
            return isStandardLibrary(path)
                ? baseHost.getSourceFile(path, version, onError, shouldCreate)
                : undefined;
        },
        readFile(path) {
            if (resolve(path) === contractPath) return source;
            return isStandardLibrary(path)
                ? baseHost.readFile(path)
                : undefined;
        },
        fileExists(path) {
            return (
                resolve(path) === contractPath ||
                (isStandardLibrary(path) && baseHost.fileExists(path))
            );
        },
        getDirectories() {
            return [];
        },
    };
    const program = ts.createProgram([contractPath], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) {
        const messages = diagnostics.map(
            (diagnostic) =>
                `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
        );
        throw new Error(
            `The server contract is not self-contained: ${messages.join('; ')}`,
        );
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
