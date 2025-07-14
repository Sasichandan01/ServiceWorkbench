const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ApiClientOptions extends RequestInit {
  headers?: Record<string, string>;
}

/**
 * Custom API client that ensures proper header formatting for our backend
 */
export class ApiClient {
  private static getAuthToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  private static createHeaders(customHeaders: Record<string, string> = {}): Headers {
    const headers = new Headers();
    
    // Set standard headers
    headers.set('Content-Type', 'application/json');
    
    // Add auth token if available
    const token = this.getAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    // Add custom headers
    Object.entries(customHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    
    return headers;
  }

  static async request(endpoint: string, options: ApiClientOptions = {}): Promise<Response> {
    const { headers: customHeaders = {}, ...restOptions } = options;
    
    const headers = this.createHeaders(customHeaders);
    const config: RequestInit = {
      ...restOptions,
      headers: Object.fromEntries(headers.entries()),
    };

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    
    console.log('API Request:', { url, method: config.method || 'GET', headers: config.headers });
    
    try {
      const response = await fetch(url, config);
      console.log('API Response:', { status: response.status, ok: response.ok });
      return response;
    } catch (error) {
      console.error('API Request Failed:', { url, error });
      throw error;
    }
  }

  static async get(endpoint: string, options: Omit<ApiClientOptions, 'method'> = {}): Promise<Response> {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  static async post(endpoint: string, data?: any, options: Omit<ApiClientOptions, 'method' | 'body'> = {}): Promise<Response> {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  static async put(endpoint: string, data?: any, options: Omit<ApiClientOptions, 'method' | 'body'> = {}): Promise<Response> {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  static async delete(endpoint: string, options: Omit<ApiClientOptions, 'method'> = {}): Promise<Response> {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  static async postFormData(endpoint: string, formData: FormData, options: Omit<ApiClientOptions, 'method' | 'body'> = {}): Promise<Response> {
    const token = this.getAuthToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Don't set Content-Type for FormData - let browser set it with boundary
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
      headers,
    });
  }
}