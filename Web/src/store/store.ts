import { configureStore } from '@reduxjs/toolkit';
import authSlice from './slices/authSlice';
import permissionsSlice from './slices/permissionsSlice';
import { setupListeners } from '@reduxjs/toolkit/query';
import { apiSlice } from '../services/apiSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    permissions: permissionsSlice,
    [apiSlice.reducerPath]: apiSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(apiSlice.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;