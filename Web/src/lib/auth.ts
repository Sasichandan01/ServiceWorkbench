import { CognitoIdentityProviderClient, SignUpCommand, InitiateAuthCommand, ConfirmSignUpCommand } from "@aws-sdk/client-cognito-identity-provider";

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
