/**
 * Ensures `window.localStorage` / `window.sessionStorage` are usable in the
 * jsdom test environment.
 *
 * Vitest's jsdom environment only forwards a jsdom window property to the
 * test global if that key isn't already present on Node's own `global`
 * object. Node 22.4+ ships optional `localStorage` / `sessionStorage`
 * globals that exist but throw/return `undefined` unless the process is
 * started with `--localstorage-file`. When running under such a Node
 * version, Vitest sees the (non-functional) Node global already present and
 * skips wiring up jsdom's real, working implementation — so
 * `window.localStorage` silently resolves to `undefined` instead of a
 * working Storage object.
 *
 * This is a Node/Vitest version-compatibility gap, not something fixable
 * via app code, and not safe to patch with a Node CLI flag (older Node
 * versions in this project's supported range don't recognize
 * `--no-experimental-webstorage` at all and would fail to start). Instead,
 * detect the broken/missing case here and fall back to a minimal in-memory
 * Storage implementation, leaving working environments untouched.
 */
function isUsableStorage(storage: unknown): storage is Storage {
    return (
        !!storage &&
        typeof (storage as Storage).getItem === 'function' &&
        typeof (storage as Storage).setItem === 'function'
    );
}

function createMemoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
        getItem: (key) => (data.has(key) ? (data.get(key) ?? null) : null),
        setItem: (key, value) => {
            data.set(key, String(value));
        },
        removeItem: (key) => {
            data.delete(key);
        },
        clear: () => {
            data.clear();
        },
        key: (index) => Array.from(data.keys())[index] ?? null,
        get length() {
            return data.size;
        },
    };
}

function ensureUsableStorage(propertyName: 'localStorage' | 'sessionStorage') {
    if (!isUsableStorage(window[propertyName])) {
        Object.defineProperty(window, propertyName, {
            value: createMemoryStorage(),
            configurable: true,
            writable: true,
        });
    }
}

ensureUsableStorage('localStorage');
ensureUsableStorage('sessionStorage');
