const API_BASE_URL =
  import.meta.env.VITE_JOB_MATCH_SERVER_URL ?? `http://${window.location.hostname}:3000`

async function fetchWithErrorCheck(path: string, init?: RequestInit): Promise<Response> {
  const response =
    init !== undefined
      ? await fetch(`${API_BASE_URL}${path}`, init)
      : await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response))
  }
  return response
}

export async function getJson<ResponseBody>(path: string): Promise<ResponseBody> {
  const response = await fetchWithErrorCheck(path)
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as ResponseBody
}

export async function postFormData<ResponseBody>(
  path: string,
  formData: FormData,
): Promise<ResponseBody> {
  const response = await fetchWithErrorCheck(path, { method: 'POST', body: formData })
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as ResponseBody
}

export async function getBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  return (await fetchWithErrorCheck(path, signal !== undefined ? { signal } : undefined)).blob()
}

export async function postJson<ResponseBody>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ResponseBody> {
  const response = await fetchWithErrorCheck(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
  return response.json() as Promise<ResponseBody>
}

export async function* postJsonEventStream<EventBody>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<EventBody> {
  const response = await fetchWithErrorCheck(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let frameEnd = buffer.indexOf('\n\n')
      while (frameEnd !== -1) {
        const frame = buffer.slice(0, frameEnd)
        buffer = buffer.slice(frameEnd + 2)
        if (frame.startsWith('data: ')) {
          yield JSON.parse(frame.slice('data: '.length)) as EventBody
        }
        frameEnd = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function getResponseErrorMessage(response: Response): Promise<string> {
  try {
    const errorBody = (await response.json()) as { error?: unknown; message?: unknown }
    const serverMessage = errorBody.message ?? errorBody.error

    if (typeof serverMessage === 'string' && serverMessage.length > 0) {
      return serverMessage
    }
  } catch {
    // Fall back to the status text below when the server did not return JSON.
  }

  return response.statusText || `Request failed with status ${response.status}`
}
