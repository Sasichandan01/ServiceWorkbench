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

  static async getCosts(groupBy: string, userId: string): Promise<CostsResponse> {
    const searchParams = new URLSearchParams();
    searchParams.append('groupby', groupBy);
    searchParams.append('userid', userId);
    
    const endpoint = `/costs?${searchParams.toString()}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<CostsResponse>(response);
  }
} 