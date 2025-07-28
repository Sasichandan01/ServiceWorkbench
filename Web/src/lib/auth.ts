
import { CognitoIdentityProviderClient, SignUpCommand, InitiateAuthCommand, ConfirmSignUpCommand, ResendConfirmationCodeCommand, GlobalSignOutCommand, UpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import { signInWithRedirect, getCurrentUser, signOut as amplifySignOut } from 'aws-amplify/auth';

// AWS Cognito configuration from environment variables
const COGNITO_CONFIG = {
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID, 
  region: import.meta.env.VITE_COGNITO_REGION
};

const cognitoClient = new CognitoIdentityProviderClient({
  region: COGNITO_CONFIG.region,
});

export interface SignUpData {
  username: string;
  fullName: string;
  email: string;
  password: string;
}

export interface SignInData {
  emailOrUsername: string;
  password: string;
}

export const signUp = async (data: SignUpData) => {
  const command = new SignUpCommand({
    ClientId: COGNITO_CONFIG.clientId,
    Username: data.username,
    Password: data.password,
    UserAttributes: [
      {
        Name: "email",
        Value: data.email,
      },
      {
        Name: "name",
        Value: data.fullName,
      },
    ],
  });

  try {
    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error("Sign up error:", error);
    throw error;
  }
};

export const signIn = async (data: SignInData) => {
  const command = new InitiateAuthCommand({
    ClientId: COGNITO_CONFIG.clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: data.emailOrUsername,
      PASSWORD: data.password,
    },
  });

  try {
    const response = await cognitoClient.send(command);
    
    // Store tokens in localStorage if authentication is successful
    if (response.AuthenticationResult) {
      const { AccessToken, RefreshToken, IdToken } = response.AuthenticationResult;
      
      if (AccessToken) {
        localStorage.setItem('accessToken', AccessToken);
      }
      if (RefreshToken) {
        localStorage.setItem('refreshToken', RefreshToken);
      }
      if (IdToken) {
        localStorage.setItem('idToken', IdToken);
      }
      
      console.log("Tokens stored successfully");
    }
    
    return response;
  } catch (error) {
    console.error("Sign in error:", error);
    throw error;
  }
};

export const confirmSignUp = async (username: string, confirmationCode: string) => {
  const command = new ConfirmSignUpCommand({
    ClientId: COGNITO_CONFIG.clientId,
    Username: username,
    ConfirmationCode: confirmationCode,
  });

  try {
    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error("Confirm sign up error:", error);
    throw error;
  }
};

export const resendConfirmationCode = async (username: string) => {
  const command = new ResendConfirmationCodeCommand({
    ClientId: COGNITO_CONFIG.clientId,
    Username: username,
  });

  try {
    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error("Resend confirmation code error:", error);
    throw error;
  }
};

export const signOut = async (accessToken: string) => {
  const command = new GlobalSignOutCommand({
    AccessToken: accessToken,
  });

  try {
    const response = await cognitoClient.send(command);
    
    // Clear all auth-related data from localStorage
    clearAllAuthData();
    
    return response;
  } catch (error) {
    console.error("Sign out error:", error);
    
    // Even if the API call fails, clear all local storage
    clearAllAuthData();
    
    throw error;
  }
};

export const clearAllAuthData = () => {
  // Clear tokens
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('idToken');
  
  // Clear any other auth-related data
  localStorage.removeItem('userInfo');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userPermissions');
  
  // Clear session storage as well
  sessionStorage.clear();
  
  console.log("All auth data cleared from browser");
};

export const updateUserAttributes = async (userAttributes: { Name: string; Value: string }[]) => {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) throw new Error('No access token available');

  const command = new UpdateUserAttributesCommand({
    AccessToken: accessToken,
    UserAttributes: userAttributes,
  });

  try {
    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error('Update user attributes error:', error);
    throw error;
  }
};

export const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token available');

  const command = new InitiateAuthCommand({
    ClientId: COGNITO_CONFIG.clientId,
    AuthFlow: "REFRESH_TOKEN_AUTH",
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  });

  try {
    const response = await cognitoClient.send(command);
    if (response.AuthenticationResult) {
      const { AccessToken, IdToken } = response.AuthenticationResult;
      if (AccessToken) {
        localStorage.setItem('accessToken', AccessToken);
      }
      if (IdToken) {
        localStorage.setItem('idToken', IdToken);
      }
      return response.AuthenticationResult;
    } else {
      throw new Error('No AuthenticationResult in refresh response');
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
};

export const signInWithGoogle = async () => {
  try {
    // Proceed directly with Google sign-in
    // The authentication check will be handled by the AuthProvider after redirect
    await signInWithRedirect({
      provider: 'Google'
    });
  } catch (error) {
    console.error('Google sign in error:', error);
    throw error;
  }
};

export const checkAuthState = async () => {
  try {
    const user = await getCurrentUser();
    return user;
  } catch (error) {
    console.error('Error checking auth state:', error);
    return null;
  }
};

/**
 * Manual OAuth token exchange function
 * Use this if you need to handle the OAuth flow manually instead of using Amplify
 */
export const exchangeAuthCodeForTokens = async (authCode: string, redirectUri: string) => {
  const domain = `${import.meta.env.VITE_COGNITO_DOMAIN}.auth.${import.meta.env.VITE_COGNITO_REGION}.amazoncognito.com`;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_COGNITO_CLIENT_SECRET; // Optional, only if your app client has a secret
  
  const tokenUrl = `https://${domain}/oauth2/token`;
  
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    redirect_uri: redirectUri,
  });
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  
  // Add Authorization header if client secret exists
  if (clientSecret) {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    headers['Authorization'] = `Basic ${credentials}`;
  }
  
  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }
    
    const tokenData = await response.json();
    
    // Store tokens in localStorage
    if (tokenData.access_token) {
      localStorage.setItem('accessToken', tokenData.access_token);
    }
    if (tokenData.id_token) {
      localStorage.setItem('idToken', tokenData.id_token);
    }
    if (tokenData.refresh_token) {
      localStorage.setItem('refreshToken', tokenData.refresh_token);
    }
    
    return tokenData;
  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
};

/**
 * Get user information using the access token
 * This requires the aws.cognito.signin.user.admin scope
 */
export const getUserInfo = async (accessToken: string) => {
  const domain = `${import.meta.env.VITE_COGNITO_DOMAIN}.auth.${import.meta.env.VITE_COGNITO_REGION}.amazoncognito.com`;
  const userInfoUrl = `https://${domain}/oauth2/userInfo`;
  
  try {
    const response = await fetch(userInfoUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`GetUser failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('GetUser error:', error);
    throw error;
  }
};
