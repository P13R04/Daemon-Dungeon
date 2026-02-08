/**
 * ApiClient - HTTP client for backend communication
 */

export class ApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = undefined;
  }

  private async request<T>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, 'GET');
  }

  async post<T>(endpoint: string, body: any): Promise<T> {
    return this.request<T>(endpoint, 'POST', body);
  }

  async put<T>(endpoint: string, body: any): Promise<T> {
    return this.request<T>(endpoint, 'PUT', body);
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, 'DELETE');
  }
}
