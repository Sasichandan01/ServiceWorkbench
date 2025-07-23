import { ApiClient } from '../lib/apiClient';

export interface User {
  UserId: string;
  Username: string;
  Email: string;
  Roles: string[];
  ProfileImageURL?: string;
  LastLoginTime?: string;
}

export interface UserListResponse {
  Users: User[];
  Pagination: {
    Count: number;
    TotalCount: number;
    NextAvailable: boolean;
  };
}

export interface UpdateUserRequest {
  Username: string;
}

export interface UpdateUserResponse {
  Message: string;
}

export class UserService {
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

  static async getUsers(params?: {
    limit?: number;
    offset?: number;
    filter?: string;
  }): Promise<UserListResponse> {
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

    const endpoint = `/users${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<UserListResponse>(response);
  }

  static async getUser(userId: string): Promise<User> {
    const response = await ApiClient.get(`/users/${userId}`);
    return this.handleResponse<User>(response);
  }

  static async updateUser(userId: string, data: UpdateUserRequest): Promise<UpdateUserResponse> {
    const response = await ApiClient.put(`/users/${userId}`, data);
    return this.handleResponse<UpdateUserResponse>(response);
  }

  static async getProfileImageUploadUrl(userId: string, contentType: string): Promise<string> {
    const response = await ApiClient.put(`/users/${userId}?action=profile_image`, { ContentType: contentType });
    const data = await this.handleResponse<{ PreSignedURL: string }>(response);
    return data.PreSignedURL;
  }
}