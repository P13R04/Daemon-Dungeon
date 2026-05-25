/**
 * AuthService - Authentication and user management
 */

import { ApiClient } from './ApiClient';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  username: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
}

export class AuthService {
  private apiClient: ApiClient;
  private accessToken?: string;
  private refreshToken?: string;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
    this.loadTokensFromStorage();
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await this.apiClient.post<AuthResponse>('/auth/login', credentials);
      this.setTokens(response.accessToken, response.refreshToken);
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const response = await this.apiClient.post<AuthResponse>('/auth/register', data);
      this.setTokens(response.accessToken, response.refreshToken);
      return response;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.apiClient.post('/auth/logout', {});
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      this.clearTokens();
    }
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await this.apiClient.post<{ accessToken: string }>('/auth/refresh', {
        refreshToken: this.refreshToken,
      });
      this.accessToken = response.accessToken;
      this.apiClient.setToken(response.accessToken);
      localStorage.setItem('accessToken', response.accessToken);
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearTokens();
      throw error;
    }
  }

  private setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.apiClient.setToken(accessToken);
    
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  private clearTokens(): void {
    this.accessToken = undefined;
    this.refreshToken = undefined;
    this.apiClient.clearToken();
    
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  private loadTokensFromStorage(): void {
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (accessToken && refreshToken) {
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.apiClient.setToken(accessToken);
    }
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }
}
