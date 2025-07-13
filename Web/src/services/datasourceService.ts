import { ApiClient } from '../lib/apiClient';

export interface S3File {
  FileName: string;
  S3Key: string;
  LastModified: string;
  Size: number;
}

export interface FolderStructure {
  [key: string]: {
    Files: S3File[];
  };
}

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

export interface DatasourceDetails {
  Datasource: Datasource;
  Folders: FolderStructure;
  TotalSize?: number;
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

  static async getDatasource(datasourceId: string): Promise<DatasourceDetails> {
    const response = await ApiClient.get(`/datasources/${datasourceId}`);
    return this.handleResponse<DatasourceDetails>(response);
  }

  static async uploadFile(datasourceId: string, file: File, folder?: string): Promise<{ Message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (folder) {
      formData.append('folder', folder);
    }
    
    const response = await ApiClient.postFormData(`/datasources/${datasourceId}/upload`, formData);
    return this.handleResponse<{ Message: string }>(response);
  }

  static async createFolder(datasourceId: string, folderName: string): Promise<{ Message: string }> {
    const response = await ApiClient.post(`/datasources/${datasourceId}/folders`, { folderName });
    return this.handleResponse<{ Message: string }>(response);
  }

  static async deleteFile(datasourceId: string, s3Key: string): Promise<{ Message: string }> {
    const response = await ApiClient.delete(`/datasources/${datasourceId}/files/${encodeURIComponent(s3Key)}`);
    return this.handleResponse<{ Message: string }>(response);
  }

  static async updateDatasource(datasourceId: string, data: UpdateDatasourceRequest): Promise<UpdateDatasourceResponse> {
    const response = await ApiClient.put(`/datasources/${datasourceId}`, data);
    return this.handleResponse<UpdateDatasourceResponse>(response);
  }

  static async deleteDatasource(datasourceId: string): Promise<DeleteDatasourceResponse> {
    const response = await ApiClient.delete(`/datasources/${datasourceId}`);
    return this.handleResponse<DeleteDatasourceResponse>(response);
  }

  static async getPresignedUrls(datasourceId: string, files: { FileName: string; Type: string }[]): Promise<{ PreSignedURL: { FileName: string; Url: string }[] }> {
    const response = await ApiClient.post(`/datasources/${datasourceId}`, { Files: files });
    return this.handleResponse<{ PreSignedURL: { FileName: string; Url: string }[] }>(response);
  }
}