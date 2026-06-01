import Config from 'react-native-config'
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type RequestOptions<TBody = any> = {
  method: HttpMethod
  url: string
  body?: TBody
  params?: Record<string, any>
  headers?: Record<string, string>
}

class HttpClient {
  private baseUrl = Config.API_URL
  private buildQuery(params?: Record<string, any>) {
    if (!params) return ''
    return `?${new URLSearchParams(params).toString()}`
  }

  async request<TResponse = any, TBody = any>({ method, url, body, params, headers }: RequestOptions<TBody>): Promise<TResponse> {
    const fullUrl = `${this.baseUrl}${url}${this.buildQuery(params)}`
    const finalHeaders: Record<string, string> = {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    }
    const res = await fetch(fullUrl, { method, headers: finalHeaders, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    return text ? JSON.parse(text) : null
  }

  get<T>(url: string, params?: Record<string, any>) {
    return this.request<T>({ method: 'GET', url, params })
  }

  post<T, B = any>(url: string, body?: B) {
    return this.request<T, B>({ method: 'POST', url, body })
  }

  put<T, B = any>(url: string, body?: B) {
    return this.request<T, B>({ method: 'PUT', url, body })
  }

  delete<T>(url: string, params?: Record<string, any>) {
    return this.request<T>({ method: 'DELETE', url, params })
  }
}

export const httpClient = new HttpClient()