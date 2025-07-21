import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const baseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL,
  prepareHeaders: (headers) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers.set('Content-Type', 'application/json');
    return headers;
  },
});

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Workspace', 'Solution', 'User', 'Role', 'Datasource', 'Execution'],
  endpoints: (builder) => ({
    // Workspace endpoints
    getWorkspaces: builder.query<any, { limit?: number; offset?: number; filterBy?: string }>({
      query: ({ limit = 10, offset = 1, filterBy } = {}) => {
        const params = new URLSearchParams();
        params.append('limit', limit.toString());
        params.append('offset', offset.toString());
        if (filterBy) params.append('filterBy', filterBy);
        return `/workspaces${params.toString() ? `?${params}` : ''}`;
      },
      providesTags: (result) =>
        result
          ? [
              ...result.Workspaces.map(({ WorkspaceId }: any) => ({ type: 'Workspace', id: WorkspaceId })),
              { type: 'Workspace', id: 'LIST' },
            ]
          : [{ type: 'Workspace', id: 'LIST' }],
    }),
    createWorkspace: builder.mutation<any, Partial<any>>({
      query: (body) => ({
        url: '/workspaces',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Workspace', id: 'LIST' }],
    }),
    getWorkspace: builder.query<any, string>({
      query: (id) => `/workspaces/${id}`,
      providesTags: (result, error, id) => [{ type: 'Workspace', id }],
    }),
    updateWorkspace: builder.mutation<any, { id: string; body: any }>({
      query: ({ id, body }) => ({
        url: `/workspaces/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Workspace', id },
        { type: 'Workspace', id: 'LIST' },
      ],
    }),
    deleteWorkspace: builder.mutation<any, string>({
      query: (id) => ({
        url: `/workspaces/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [
        { type: 'Workspace', id: 'LIST' },
      ],
    }),
    getSolutions: builder.query<any, { workspaceId: string; limit?: number; offset?: number; filterBy?: string }>({
      query: ({ workspaceId, limit = 10, offset = 1, filterBy }) => {
        const params = new URLSearchParams();
        params.append('limit', limit.toString());
        params.append('offset', offset.toString());
        if (filterBy) params.append('filterBy', filterBy);
        return `/workspaces/${workspaceId}/solutions${params.toString() ? `?${params}` : ''}`;
      },
      providesTags: (result, error, { workspaceId }) => [
        { type: 'Workspace', id: workspaceId },
      ],
    }),
    createSolution: builder.mutation<any, { workspaceId: string; body: any }>({
      query: ({ workspaceId, body }) => ({
        url: `/workspaces/${workspaceId}/solutions`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result, error, { workspaceId }) => [
        { type: 'Workspace', id: workspaceId },
        { type: 'Workspace', id: 'LIST' },
      ],
    }),
    updateSolution: builder.mutation<any, { workspaceId: string; solutionId: string; body: any }>({
      query: ({ workspaceId, solutionId, body }) => ({
        url: `/workspaces/${workspaceId}/solutions/${solutionId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (result, error, { workspaceId, solutionId }) => [
        { type: 'Workspace', id: workspaceId },
        { type: 'Workspace', id: 'LIST' },
      ],
    }),
    deleteSolution: builder.mutation<any, { workspaceId: string; solutionId: string }>({
      query: ({ workspaceId, solutionId }) => ({
        url: `/workspaces/${workspaceId}/solutions/${solutionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { workspaceId }) => [
        { type: 'Workspace', id: workspaceId },
        { type: 'Workspace', id: 'LIST' },
      ],
    }),
    getSolution: builder.query<any, { workspaceId: string; solutionId: string }>({
      query: ({ workspaceId, solutionId }) => `/workspaces/${workspaceId}/solutions/${solutionId}`,
      providesTags: (result, error, { workspaceId }) => [
        { type: 'Workspace', id: workspaceId },
      ],
    }),
  }),
});

export const {
  useGetWorkspacesQuery,
  useCreateWorkspaceMutation,
  useGetWorkspaceQuery,
  useUpdateWorkspaceMutation,
  useGetSolutionsQuery,
  useDeleteWorkspaceMutation,
  useCreateSolutionMutation,
  useUpdateSolutionMutation,
  useDeleteSolutionMutation,
  useGetSolutionQuery,
} = apiSlice;