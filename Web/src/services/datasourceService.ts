import { ApiClient } from '../lib/apiClient';

export interface Datasource {
  DatasourceId: string;
  DatasourceName: string;
  CreatedBy: string;
  DatasourceStatus: string;
  S3Path?: string;
  CreationTime: string;
  LastUpdatedBy: string;
  LastUpdationTime: string;
  Tags?: string[];
  Description?: string;
}

export interface DatasourceListResponse {
  Datasources: Datasource[];
  Pagination: {
    Count: number;
    TotalCount: number;
    NextAvailable: boolean;
  };
}

export interface CreateDatasourceRequest {
  DatasourceName: string;
  Tags: string[];
  Description: string;
}

export interface CreateDatasourceResponse {
  Message: string;
  DatasourceId: string;
}

export interface UpdateDatasourceRequest {
  DatasourceName: string;
  Tags: string[];
  Description: string;
}

export interface UpdateDatasourceResponse {
  Message: string;
}

export interface DeleteDatasourceResponse {
  Message: string;
}

export class DatasourceService {
  private static handleResponse = async <T>(response: Response): Promise<T> => {
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  };

  static async getDatasources(params?: {
    limit?: number;
    offset?: number;
    filter?: string;
  }): Promise<DatasourceListResponse> {
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

    const endpoint = `/datasources${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<DatasourceListResponse>(response);
  }

  static async createDatasource(data: CreateDatasourceRequest): Promise<CreateDatasourceResponse> {
    const response = await ApiClient.post('/datasources', data);
    return this.handleResponse<CreateDatasourceResponse>(response);
  }

  static async getDatasource(datasourceId: string): Promise<Datasource> {
    const response = await ApiClient.get(`/datasources/${datasourceId}`);
    return this.handleResponse<Datasource>(response);
  }

  static async updateDatasource(datasourceId: string, data: UpdateDatasourceRequest): Promise<UpdateDatasourceResponse> {
    const response = await ApiClient.put(`/datasources/${datasourceId}`, data);
    return this.handleResponse<UpdateDatasourceResponse>(response);
  }

  static async deleteDatasource(datasourceId: string): Promise<DeleteDatasourceResponse> {
    const response = await ApiClient.delete(`/datasources/${datasourceId}`);
    return this.handleResponse<DeleteDatasourceResponse>(response);
  }
}