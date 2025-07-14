import { ApiClient } from '../lib/apiClient';

export interface Workspace {
  WorkspaceId: string;
  WorkspaceName: string;
  WorkspaceStatus: string;
  Description: string;
  CreatedBy: string;
  CreationTime: string;
  WorkspaceType: string;
  LastUpdatedBy: string;
  LastUpdationTime: string;
  Tags?: string[];
  Cost?: string;
  Users?: {
    Users: any[];
    Pagination: {
      Count: number;
      TotalCount: number;
      NextAvailable: boolean;
    };
  };
}

export interface WorkspaceListResponse {
  Workspaces: Workspace[];
  Pagination: {
    Count: number;
    TotalCount: number;
    NextAvailable: boolean;
  };
}

export interface CreateWorkspaceRequest {
  WorkspaceName: string;
  Description: string;
  Tags: string[];
  WorkspaceType: string;
}

export interface CreateWorkspaceResponse {
  Message: string;
  WorkspaceId: string;
}

export interface UpdateWorkspaceRequest {
  WorkspaceName: string;
  Description: string;
  Tags: string[];
  WorkspaceType: string;
}

export interface UpdateWorkspaceResponse {
  Message: string;
}

export interface DeleteWorkspaceResponse {
  Message: string;
}

export class WorkspaceService {
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

  static async getWorkspaces(params?: {
    limit?: number;
    offset?: number;
    filter?: string;
  }): Promise<WorkspaceListResponse> {
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

    const endpoint = `/workspaces${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<WorkspaceListResponse>(response);
  }

  static async createWorkspace(data: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> {
    const response = await ApiClient.post('/workspaces', data);
    return this.handleResponse<CreateWorkspaceResponse>(response);
  }

  static async getWorkspace(
    workspaceId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<Workspace> {
    const searchParams = new URLSearchParams();
    const limit = params?.limit ?? 10;
    const offset = params?.offset ?? 1;
    searchParams.append('limit', limit.toString());
    searchParams.append('offset', offset.toString());
    const endpoint = `/workspaces/${workspaceId}?${searchParams.toString()}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<Workspace>(response);
  }

  static async updateWorkspace(workspaceId: string, data: UpdateWorkspaceRequest): Promise<UpdateWorkspaceResponse> {
    const response = await ApiClient.put(`/workspaces/${workspaceId}`, data);
    return this.handleResponse<UpdateWorkspaceResponse>(response);
  }

  static async deleteWorkspace(workspaceId: string): Promise<DeleteWorkspaceResponse> {
    const response = await ApiClient.delete(`/workspaces/${workspaceId}`);
    return this.handleResponse<DeleteWorkspaceResponse>(response);
  }
}