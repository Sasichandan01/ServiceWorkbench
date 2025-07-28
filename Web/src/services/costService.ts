import { ApiClient } from '../lib/apiClient';

export interface CostData {
  name: string;
  value: number;
  color: string;
  hoverColor: string;
  gradient: string;
  description: string;
}

export interface CostsResponse {
  costs: CostData[];
  totalCost: number;
}

export interface WorkspaceCostResponse {
  cost: number;
  currency: string;
  period: string;
}

export interface SolutionCostResponse {
  cost: number;
  currency: string;
  period: string;
}

export class CostService {
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

  static async getCosts(groupBy: 'workspace' | 'solution' | 'user', identifier?: string): Promise<any> {
    const searchParams = new URLSearchParams();
    searchParams.append('groupby', groupBy);
    
    // Add appropriate identifier based on groupBy type
    if (identifier && groupBy === 'user') {
      searchParams.append('userid', identifier); // username for user
    } else if (identifier && groupBy === 'workspace') {
      searchParams.append('workspaceid', identifier); // workspace id
    } else if (identifier && groupBy === 'solution') {
      searchParams.append('solutionid', identifier); // solution id
    }
    
    const endpoint = `/costs?${searchParams.toString()}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<any>(response);
  }

  static async getCostByWorkspaceId(workspaceId: string): Promise<WorkspaceCostResponse> {
    const searchParams = new URLSearchParams();
    searchParams.append('workspaceid', workspaceId);
    
    const endpoint = `/costs?${searchParams.toString()}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<WorkspaceCostResponse>(response);
  }

  static async getCostBySolutionId(solutionId: string): Promise<SolutionCostResponse> {
    const searchParams = new URLSearchParams();
    searchParams.append('solutionid', solutionId);
    
    const endpoint = `/costs?${searchParams.toString()}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<SolutionCostResponse>(response);
  }
} 