import { configureStore } from '@reduxjs/toolkit';
import authSlice from './slices/authSlice';
import permissionsSlice from './slices/permissionsSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    permissions: permissionsSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;