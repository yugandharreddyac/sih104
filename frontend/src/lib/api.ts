export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
export const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';

export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: any;
  count?: number;
  status?: string;
  components?: any;
  [key: string]: any;
}


export class ApiClient {
  public static getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('voxshield_token');
    }
    return null;
  }

  public static setAuth(token: string, user: any): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('voxshield_token', token);
      localStorage.setItem('voxshield_user', JSON.stringify(user));
    }
  }

  public static clearAuth(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('voxshield_token');
      localStorage.removeItem('voxshield_user');
    }
  }

  public static getUser(): any | null {
    if (typeof window !== 'undefined') {
      const u = localStorage.getItem('voxshield_user');
      if (u) {
        try {
          return JSON.parse(u);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  public static async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
      const res = await fetch(url, {
        ...options,
        headers,
      });

      // Handle 401 Unauthorized globally
      if (res.status === 401 && typeof window !== 'undefined') {
        // If not already on login page, clear token and notify
        if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
          this.clearAuth();
          window.location.href = '/';
        }
      }

      const json = await res.json();
      return json;
    } catch (err: any) {
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: err.message || 'Failed to connect to VOXSHIELD backend API',
      };
    }
  }

  public static get<T = any>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  public static post<T = any>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }

  public static patch<T = any>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  }

  public static delete<T = any>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

