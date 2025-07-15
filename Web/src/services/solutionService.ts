import { ApiClient } from '../lib/apiClient';

export interface Solution {
  SolutionId: string;
  SolutionName: string;
  Description: string;
  CreatedBy: string;
  CreationTime: string;
  LastUpdatedBy: string;
  LastUpdationTime: string;
  Tags?: string[];
  CftS3Path?: string;
  Resources?: {
    ResourceType: string;
    ResourceName: string;
    ResourceArn: string;
  }[];
  Datasources?: {
    DatasourceName: string;
    DatasourceId: string;
  }[];
  SolutionStatus?: string;
  Cost?: string;
  Versions?: string[];
}

export interface SolutionListResponse {
  Solutions: Solution[];
  Pagination: {
    Count: number;
    TotalCount: number;
    NextAvailable: boolean;
  };
}

export interface CreateSolutionRequest {
  SolutionName: string;
  Description: string;
  Tags: string[];
}

export interface CreateSolutionResponse {
  Message: string;
  SolutionId?: string;
}

export interface UpdateSolutionRequest {
  SolutionName: string;
  Description: string;
  Tags: string[];
  Datasources: string[];
}

export interface UpdateSolutionResponse {
  Message: string;
}

export interface DeleteSolutionResponse {
  Message: string;
}

export class SolutionService {
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

  static async getSolutions(
    workspaceId: string,
    params?: {
      limit?: number;
      offset?: number;
<<<<<<< HEAD
      filterby?: string;
=======
      filterBy?: string;
>>>>>>> 636d5e0192639348b48378599648f62a4870c1a7
    }
  ): Promise<SolutionListResponse> {
    const searchParams = new URLSearchParams();
    const limit = params?.limit ?? 10;
    const offset = params?.offset ?? 1;
    searchParams.append('limit', limit.toString());
    searchParams.append('offset', offset.toString());
<<<<<<< HEAD
    if (params?.filterby) {
      searchParams.append('filterby', params.filterby);
=======
    if (params?.filterBy) {
      searchParams.append('filterBy', params.filterBy);
>>>>>>> 636d5e0192639348b48378599648f62a4870c1a7
    }
    const endpoint = `/workspaces/${workspaceId}/solutions${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<SolutionListResponse>(response);
  }

  static async createSolution(workspaceId: string, data: CreateSolutionRequest): Promise<CreateSolutionResponse> {
    const response = await ApiClient.post(`/workspaces/${workspaceId}/solutions`, data);
    return this.handleResponse<CreateSolutionResponse>(response);
  }

  static async getSolution(workspaceId: string, solutionId: string): Promise<Solution> {
    const response = await ApiClient.get(`/workspaces/${workspaceId}/solutions/${solutionId}`);
    return this.handleResponse<Solution>(response);
  }

  static async updateSolution(
    workspaceId: string,
    solutionId: string,
    data: UpdateSolutionRequest
  ): Promise<UpdateSolutionResponse> {
    const response = await ApiClient.put(`/workspaces/${workspaceId}/solutions/${solutionId}`, data);
    return this.handleResponse<UpdateSolutionResponse>(response);
  }

  static async updateSolutionDatasources(
    workspaceId: string,
    solutionId: string,
    datasourceIds: string[]
  ): Promise<UpdateSolutionResponse> {
    const response = await ApiClient.put(
      `/workspaces/${workspaceId}/solutions/${solutionId}?action=datasource`,
      { Datasources: datasourceIds }
    );
    return this.handleResponse<UpdateSolutionResponse>(response);
  }

  static async deleteSolution(workspaceId: string, solutionId: string): Promise<DeleteSolutionResponse> {
    const response = await ApiClient.delete(`/workspaces/${workspaceId}/solutions/${solutionId}`);
    return this.handleResponse<DeleteSolutionResponse>(response);
  }
}