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
  tagTypes: ['Workspace'],
  endpoints: (builder) => ({
    getWorkspaces: builder.query<any, void>({
      query: () => '/workspaces',
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
  }),
});

export const {
  useGetWorkspacesQuery,
  useCreateWorkspaceMutation,
  useGetWorkspaceQuery,
  useUpdateWorkspaceMutation,
  useGetSolutionsQuery,
} = apiSlice; 