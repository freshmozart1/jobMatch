const API_BASE_URL =
  import.meta.env.VITE_JOB_MATCH_SERVER_URL ?? `http://${window.location.hostname}:3000`

export async function getJson<ResponseBody>(path: string): Promise<ResponseBody> {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response))
  }
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as ResponseBody
}

export async function postFormData<ResponseBody>(path: string, formData: FormData): Promise<ResponseBody> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response))
  }
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as ResponseBody
}

export async function postJson<ResponseBody>(path: string, body: unknown): Promise<ResponseBody> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response))
  }

  return response.json() as Promise<ResponseBody>
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
