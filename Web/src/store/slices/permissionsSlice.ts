import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface PermissionsState {
  userPermissions: string[];
  loading: boolean;
  error: string | null;
}

const initialState: PermissionsState = {
  userPermissions: [],
  loading: false,
  error: null,
};

const permissionsSlice = createSlice({
  name: 'permissions',
  initialState,
  reducers: {
    setPermissions: (state, action: PayloadAction<string[]>) => {
      state.userPermissions = action.payload;
      state.loading = false;
      state.error = null;
    },
    setPermissionsLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setPermissionsError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.loading = false;
    },
    clearPermissions: (state) => {
      state.userPermissions = [];
      state.loading = false;
      state.error = null;
    },
  },
});

export const { 
  setPermissions, 
  setPermissionsLoading, 
  setPermissionsError, 
  clearPermissions 
} = permissionsSlice.actions;
export default permissionsSlice.reducer;