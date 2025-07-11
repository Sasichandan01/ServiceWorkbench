import { ApiClient } from '../lib/apiClient';

export interface Execution {
  ExecutionId: string;
  ExecutedBy: string;
  Duration: string;
  StartTime: string;
  ExecutionStatus: string;
  Message: string;
  LogsStatus?: string;
  LogsS3Path?: string;
}

export interface ExecutionListResponse {
  ExecutionHistory: Execution[];
  Pagination: {
    Count: number;
    TotalCount: number;
    NextAvailable: boolean;
  };
}

export interface CreateExecutionRequest {
  [key: string]: any; // Dynamic input parameters
}

export interface CreateExecutionResponse {
  Message: string;
  ExecutionId: string;
}

export class ExecutionService {
  private static handleResponse = async <T>(response: Response): Promise<T> => {
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  };

  static async getExecutions(
    workspaceId: string,
    solutionId: string,
    params?: {
      limit?: number;
      offset?: number;
      filter?: string;
    }
  ): Promise<ExecutionListResponse> {
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

    const endpoint = `/workspaces/${workspaceId}/solutions/${solutionId}/executions${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<ExecutionListResponse>(response);
  }

  static async createExecution(
    workspaceId: string,
    solutionId: string,
    data: CreateExecutionRequest
  ): Promise<CreateExecutionResponse> {
    const response = await ApiClient.post(`/workspaces/${workspaceId}/solutions/${solutionId}/executions`, data);
    return this.handleResponse<CreateExecutionResponse>(response);
  }

  static async getExecution(
    workspaceId: string,
    solutionId: string,
    executionId: string
  ): Promise<Execution> {
    const response = await ApiClient.get(`/workspaces/${workspaceId}/solutions/${solutionId}/executions/${executionId}`);
    return this.handleResponse<Execution>(response);
  }
}