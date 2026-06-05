import Config from 'react-native-config'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type RequestOptions<TBody = any> = {
  method: HttpMethod
  url: string
  body?: TBody
  params?: Record<string, any>
  headers?: Record<string, string>
}

export class HttpError extends Error {
  status: number
  response: string

  constructor(status: number, response: string) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.response = response
  }
}

export class NetworkError extends Error {
  constructor(message = 'No se pudo conectar con el servidor') {
    super(message)
    this.name = 'NetworkError'
  }
}

class HttpClient {
  private baseUrl = Config.API_URL

  private buildQuery(params?: Record<string, any>) {
    if (!params) return ''

    const query = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query.append(key, String(value))
      }
    })

    return query.toString() ? `?${query.toString()}` : ''
  }

  async request<TResponse = any, TBody = any>({
    method,
    url,
    body,
    params,
    headers,
  }: RequestOptions<TBody>): Promise<TResponse> {
    try {
      const fullUrl = `${this.baseUrl}${url}${this.buildQuery(params)}`

      const finalHeaders: Record<string, string> = {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(headers || {}),
      }

      const response = await fetch(fullUrl, {
        method,
        headers: finalHeaders,
        body: body ? JSON.stringify(body) : undefined,
      })

      const text = await response.text()

      if (!response.ok) {
        throw new HttpError(response.status, text)
      }

      return text ? JSON.parse(text) : null
    } catch (error) {
      if (error instanceof HttpError) {
        throw error
      }

      if (error instanceof TypeError) {
        throw new NetworkError()
      }

      throw error
    }
  }

  get<T>(url: string, params?: Record<string, any>) {
    return this.request<T>({
      method: 'GET',
      url,
      params,
    })
  }

  post<T, B = any>(url: string, body?: B) {
    return this.request<T, B>({
      method: 'POST',
      url,
      body,
    })
  }

  put<T, B = any>(url: string, body?: B) {
    return this.request<T, B>({
      method: 'PUT',
      url,
      body,
    })
  }

  patch<T, B = any>(url: string, body?: B) {
    return this.request<T, B>({
      method: 'PATCH',
      url,
      body,
    })
  }

  delete<T>(url: string, params?: Record<string, any>) {
    return this.request<T>({
      method: 'DELETE',
      url,
      params,
    })
  }
}

export const httpClient = new HttpClient()