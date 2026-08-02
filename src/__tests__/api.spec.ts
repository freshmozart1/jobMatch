import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlob, getJson, postJson, postJsonEventStream } from '@/lib/api';
import { createSseResponse } from './testUtils';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        ...init,
    });
}

async function collect<T>(generator: AsyncGenerator<T>): Promise<T[]> {
    const items: T[] = [];
    for await (const item of generator) {
        items.push(item);
    }
    return items;
}

describe('getJson', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends a GET request with no body', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

        await getJson('/test');

        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            'http://localhost:3000/test',
        );
    });

    it('returns parsed JSON on a 2xx response', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 42 }));
        const result = await getJson('/items');
        // fallow-ignore-next-line code-duplication
        expect(result).toEqual({ id: 42 });
    });

    it('throws with the "error" field from a non-2xx JSON response', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ error: 'Server down' }, { status: 502 }),
        );
        await expect(getJson('/fail')).rejects.toThrow('Server down');
    });

    it('throws with the "message" field from a non-2xx JSON response', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ message: 'Bad input' }, { status: 400 }),
        );
        await expect(getJson('/fail')).rejects.toThrow('Bad input');
    });

    it('falls back to statusText when the error body is not JSON', async () => {
        fetchMock.mockResolvedValue(
            new Response('not json', {
                status: 503,
                statusText: 'Service Unavailable',
            }),
        );
        await expect(getJson('/fail')).rejects.toThrow('Service Unavailable');
    });

    it('falls back to a status-code message when statusText is empty', async () => {
        fetchMock.mockResolvedValue(
            new Response('not json', { status: 503, statusText: '' }),
        );
        await expect(getJson('/fail')).rejects.toThrow(
            'Request failed with status 503',
        );
    });

    it('returns undefined for a 2xx response with an empty body', async () => {
        fetchMock.mockResolvedValue(new Response('', { status: 200 }));
        const result = await getJson('/empty');
        expect(result).toBeUndefined();
    });
});

describe('getBlob', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends a GET request to the correct URL', async () => {
        fetchMock.mockResolvedValue(
            new Response(new Blob(['%PDF']), { status: 200 }),
        );
        await getBlob('/application/linkedin:1001');
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            'http://localhost:3000/application/linkedin:1001',
        );
    });

    it('returns a Blob on a 2xx response', async () => {
        const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
        fetchMock.mockResolvedValue(new Response(pdfBytes, { status: 200 }));
        const result = await getBlob('/application/linkedin:1001');
        expect(result.constructor.name).toBe('Blob');
        expect(result.size).toBe(4);
    });

    it('throws with the server error message on a non-2xx JSON response', async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ error: 'Cover letter not found' }), {
                status: 404,
            }),
        );
        await expect(getBlob('/application/missing')).rejects.toThrow(
            'Cover letter not found',
        );
    });

    it('throws with statusText when the error body is not JSON', async () => {
        fetchMock.mockResolvedValue(
            new Response('not json', {
                status: 500,
                statusText: 'Internal Server Error',
            }),
        );
        await expect(getBlob('/application/missing')).rejects.toThrow(
            'Internal Server Error',
        );
    });

    it('forwards the AbortSignal to fetch when provided', async () => {
        fetchMock.mockResolvedValue(
            new Response(new Blob(['%PDF']), { status: 200 }),
        );
        const controller = new AbortController();
        await getBlob('/application/linkedin:1001', controller.signal);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3000/application/linkedin:1001',
            expect.objectContaining({ signal: controller.signal }),
        );
    });
});

describe('postJson', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends a POST request with JSON content-type and stringified body', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

        await postJson('/test', { hello: 'world' });

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3000/test',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hello: 'world' }),
            }),
        );
    });

    it('returns parsed JSON on a 2xx response', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 42 }));
        const result = await postJson('/items', {});
        // fallow-ignore-next-line code-duplication
        expect(result).toEqual({ id: 42 });
    });

    it('throws with the "error" field from a non-2xx JSON response', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ error: 'Server down' }, { status: 502 }),
        );
        await expect(postJson('/fail', {})).rejects.toThrow('Server down');
    });

    it('throws with the "message" field from a non-2xx JSON response', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ message: 'Bad input' }, { status: 400 }),
        );
        await expect(postJson('/fail', {})).rejects.toThrow('Bad input');
    });

    it('falls back to statusText when the error body is not JSON', async () => {
        fetchMock.mockResolvedValue(
            new Response('not json', {
                status: 503,
                statusText: 'Service Unavailable',
            }),
        );
        await expect(postJson('/fail', {})).rejects.toThrow(
            'Service Unavailable',
        );
    });

    it('falls back to a status-code message when statusText is empty', async () => {
        fetchMock.mockResolvedValue(
            new Response('not json', { status: 503, statusText: '' }),
        );
        await expect(postJson('/fail', {})).rejects.toThrow(
            'Request failed with status 503',
        );
    });
});

describe('postJsonEventStream', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends a POST request with JSON content-type and stringified body', async () => {
        fetchMock.mockResolvedValue(createSseResponse([{ id: 1 }]));

        await collect(
            postJsonEventStream('/scrape/linkedin', { hello: 'world' }),
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3000/scrape/linkedin',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hello: 'world' }),
            }),
        );
    });

    it('yields each parsed "data:" frame in order', async () => {
        fetchMock.mockResolvedValue(
            createSseResponse([{ id: 1 }, { id: 2 }, { id: 3 }]),
        );

        const events = await collect(
            postJsonEventStream('/scrape/linkedin', {}),
        );

        expect(events).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it('ignores non-"data:" frames such as the bare ping keepalive', async () => {
        fetchMock.mockResolvedValue(createSseResponse([{ id: 1 }]));

        const events = await collect(
            postJsonEventStream('/scrape/linkedin', {}),
        );

        expect(events).toEqual([{ id: 1 }]);
    });

    it('yields nothing when the stream closes without any events', async () => {
        fetchMock.mockResolvedValue(createSseResponse([]));

        const events = await collect(
            postJsonEventStream('/scrape/linkedin', {}),
        );

        expect(events).toEqual([]);
    });

    it('throws with the server error message on a non-2xx initial response', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ error: 'Invalid request body' }, { status: 400 }),
        );

        await expect(
            collect(postJsonEventStream('/scrape/linkedin', {})),
        ).rejects.toThrow('Invalid request body');
    });

    it('forwards the AbortSignal to fetch when provided', async () => {
        fetchMock.mockResolvedValue(createSseResponse([]));
        const controller = new AbortController();

        await collect(
            postJsonEventStream('/scrape/linkedin', {}, controller.signal),
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3000/scrape/linkedin',
            expect.objectContaining({ signal: controller.signal }),
        );
    });
});
