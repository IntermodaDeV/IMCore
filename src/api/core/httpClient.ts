import Config from 'react-native-config'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { refreshAccessToken } from '../auth/refreshToken'

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

  private async fetchRequest<TResponse>( fullUrl: string, options: RequestInit): Promise<TResponse> {
    const response = await fetch(fullUrl, options)
    const text = await response.text()
    if (!response.ok) {
      throw new HttpError(response.status, text)
    }

    return text ? JSON.parse(text) : null
  }

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
    const fullUrl = `${this.baseUrl}${url}${this.buildQuery(params)}`
    const token = await AsyncStorage.getItem('accessToken')

    const options: RequestInit = {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }

    try {
      return await this.fetchRequest<TResponse>(fullUrl, options)
    } catch (error: any) {
      if (error instanceof HttpError && error.status === 401) {
        const newToken = await refreshAccessToken()
        if (!newToken) {
          throw error 
        }

        const retryOptions: RequestInit = {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
          },
        }

        return await this.fetchRequest<TResponse>(fullUrl, retryOptions)
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