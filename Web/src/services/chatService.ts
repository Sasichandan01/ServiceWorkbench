import { ApiClient } from '../lib/apiClient';

export interface ChatMessage {
  ChatId: string;
  TimeStamp: string;
  Message: string;
  MessageId: string;
  Sender: string;
  Trace: string[];
  S3Key?: string; // Add S3Key to the interface
  Code?: CodePayload; // Add Code field to the interface
}

export interface ChatHistoryResponse {
  ChatHistory: ChatMessage[];
  Pagination?: {
    Count: number;
    TotalCount: number;
    NextAvailable: boolean;
  };
}

export interface CodePayload {
  [filename: string]: string;
  Metadata: {
    IsCode: boolean;
  };
}

export class ChatService {
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

  static async getChatHistory(
    workspaceId: string,
    solutionId: string,
    params?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<ChatHistoryResponse> {
    const searchParams = new URLSearchParams();
    
    if (params?.limit) {
      searchParams.append('limit', params.limit.toString());
    }
    if (params?.offset) {
      searchParams.append('offset', params.offset.toString());
    }

    const endpoint = `/workspaces/${workspaceId}/solutions/${solutionId}/chat${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<ChatHistoryResponse>(response);
  }

  static async clearChatHistory(
    workspaceId: string,
    solutionId: string
  ): Promise<void> {
    const endpoint = `/workspaces/${workspaceId}/solutions/${solutionId}/chat`;
    const response = await ApiClient.delete(endpoint);
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
  }

  static async getChatMessageDetails(
    workspaceId: string,
    solutionId: string,
    messageId: string
  ): Promise<ChatMessage> {
    const endpoint = `/workspaces/${workspaceId}/solutions/${solutionId}/chat/${messageId}`;
    const response = await ApiClient.get(endpoint);
    return this.handleResponse<ChatMessage>(response);
  }

  // New method to fetch code from S3
  static async fetchCodeFromS3(
    workspaceId: string,
    solutionId: string,
    s3Key: string
  ): Promise<CodePayload> {
    const endpoint = `/workspaces/${workspaceId}/solutions/${solutionId}/s3-code`;
    const response = await ApiClient.post(endpoint, { s3Key });
    return this.handleResponse<CodePayload>(response);
  }
} 