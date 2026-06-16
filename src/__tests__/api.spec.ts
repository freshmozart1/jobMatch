import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBlob, getJson, postJson } from '@/lib/api'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('getJson', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a GET request with no body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

    await getJson('/test')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/test')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns parsed JSON on a 2xx response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 42 }))
    const result = await getJson('/items')
    expect(result).toEqual({ id: 42 })
  })

  it('throws with the "error" field from a non-2xx JSON response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Server down' }, { status: 502 }))
    await expect(getJson('/fail')).rejects.toThrow('Server down')
  })

  it('throws with the "message" field from a non-2xx JSON response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Bad input' }, { status: 400 }))
    await expect(getJson('/fail')).rejects.toThrow('Bad input')
  })

  it('falls back to statusText when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('not json', { status: 503, statusText: 'Service Unavailable' }),
    )
    await expect(getJson('/fail')).rejects.toThrow('Service Unavailable')
  })

  it('falls back to a status-code message when statusText is empty', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 503, statusText: '' }))
    await expect(getJson('/fail')).rejects.toThrow('Request failed with status 503')
  })

  it('returns undefined for a 2xx response with an empty body', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    const result = await getJson('/empty')
    expect(result).toBeUndefined()
  })
})

describe('getBlob', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a GET request to the correct URL', async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(['%PDF']), { status: 200 }))
    await getBlob('/application/linkedin:1001')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/application/linkedin:1001')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns a Blob on a 2xx response', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    fetchMock.mockResolvedValue(new Response(pdfBytes, { status: 200 }))
    const result = await getBlob('/application/linkedin:1001')
    expect(result.constructor.name).toBe('Blob')
    expect(result.size).toBe(4)
  })

  it('throws with the server error message on a non-2xx JSON response', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Cover letter not found' }), { status: 404 }),
    )
    await expect(getBlob('/application/missing')).rejects.toThrow('Cover letter not found')
  })

  it('throws with statusText when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('not json', { status: 500, statusText: 'Internal Server Error' }),
    )
    await expect(getBlob('/application/missing')).rejects.toThrow('Internal Server Error')
  })
})

describe('postJson', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a POST request with JSON content-type and stringified body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

    await postJson('/test', { hello: 'world' })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/test',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'world' }),
      }),
    )
  })

  it('returns parsed JSON on a 2xx response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 42 }))
    const result = await postJson('/items', {})
    expect(result).toEqual({ id: 42 })
  })

  it('throws with the "error" field from a non-2xx JSON response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Server down' }, { status: 502 }))
    await expect(postJson('/fail', {})).rejects.toThrow('Server down')
  })

  it('throws with the "message" field from a non-2xx JSON response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Bad input' }, { status: 400 }))
    await expect(postJson('/fail', {})).rejects.toThrow('Bad input')
  })

  it('falls back to statusText when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('not json', { status: 503, statusText: 'Service Unavailable' }),
    )
    await expect(postJson('/fail', {})).rejects.toThrow('Service Unavailable')
  })

  it('falls back to a status-code message when statusText is empty', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 503, statusText: '' }))
    await expect(postJson('/fail', {})).rejects.toThrow('Request failed with status 503')
  })
})
