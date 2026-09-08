function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (envUrl && envUrl.trim() !== '') return envUrl;
    const host = window.location.hostname || 'localhost';
    return `http://${host}:4000/api`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
}

function getWsBase(): string {
  if (typeof window !== 'undefined') {
    const envUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (envUrl && envUrl.trim() !== '') return envUrl;
    const host = window.location.hostname || 'localhost';
    return `ws://${host}:4000/ws`;
  }
  return process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';
}

export const API_BASE = getApiBase();
export const WS_BASE = getWsBase();

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
  private static authPromise: Promise<string | null> | null = null;

  public static getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('voxshield_token');
    }
    return null;
  }

  public static async ensureAuth(): Promise<string | null> {
    const existing = this.getToken();
    if (existing) return existing;

    if (this.authPromise) return this.authPromise;

    this.authPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'analyst@voxshield.security',
            password: 'VoxShield@2026!',
          }),
        });
        const json = await res.json();
        console.info('[AUTH-DEBUG] ensureAuth response:', res.status, json);
        if (json.success && json.data?.token) {
          this.setAuth(json.data.token, json.data.user);
          return json.data.token;
        }
      } catch (err) {
        console.warn('Auto-authentication failed:', err);
      } finally {
        this.authPromise = null;
      }
      return null;
    })();

    return this.authPromise;
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
    let token = this.getToken();
    if (!token && typeof window !== 'undefined' && !endpoint.includes('/auth/login')) {
      token = await this.ensureAuth();
    }

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

      // Handle 401 Unauthorized by re-authenticating once (except for login itself)
      if (res.status === 401 && typeof window !== 'undefined' && !endpoint.includes('/auth/login')) {
        this.clearAuth();
        const newToken = await this.ensureAuth();
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
          const retryRes = await fetch(url, { ...options, headers });
          return await retryRes.json();
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

