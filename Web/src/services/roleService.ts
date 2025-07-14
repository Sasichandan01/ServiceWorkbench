import { ApiClient } from '../lib/apiClient';

export interface Role {
  RoleName: string;
  Description: string;
  Permissions: string[];
}

export interface RoleListResponse {
  Roles: Role[];
  Pagination: {
    Count: number;
    TotalCount: number;
    NextAvailable: boolean;
  };
}

export interface AssignRoleRequest {
  UserId: string;
  RoleName: string;
}

export interface RemoveRoleRequest {
  UserId: string;
  RoleName: string;
}

export class RoleService {
  private static handleResponse = async <T>(response: Response): Promise<T> => {
    if (!response.ok) {
      let errorMsg = '';
      try {
        const errorJson = await response.json();
        errorMsg = errorJson.message || errorJson.error || JSON.stringify(errorJson);
      } catch {
        errorMsg = await response.text();
      }
      throw new Error(errorMsg);
    }
    return response.json();
  };

  static async getRoles(params?: {
    limit?: number;
    offset?: number;
    filter?: string;
  }): Promise<RoleListResponse> {
    const searchParams = new URLSearchParams();
    
    if (params?.limit) {
      searchParams.append('limit', params.limit.toString());
    }
    if (params?.offset) {
      searchParams.append('offset', params.offset.toString());
    }
    if (params?.filter) {
      searchParams.append('filter', params.filter);
    }

    const endpoint = `/roles${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<RoleListResponse>(response);
  }

  static async getRole(roleName: string): Promise<Role> {
    const response = await ApiClient.get(`/roles/${roleName}`);
    return this.handleResponse<Role>(response);
  }

  static async assignRole(data: AssignRoleRequest): Promise<{ Message: string }> {
    const response = await ApiClient.post('/users/assign-role', data);
    return this.handleResponse<{ Message: string }>(response);
  }

  static async removeRole(data: RemoveRoleRequest): Promise<{ Message: string }> {
    const response = await ApiClient.post('/users/remove-role', data);
    return this.handleResponse<{ Message: string }>(response);
  }
}