import { Amplify } from 'aws-amplify';

const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      region: import.meta.env.VITE_COGNITO_REGION,
      loginWith: {
        oauth: {
          domain: `${import.meta.env.VITE_COGNITO_DOMAIN}.auth.${import.meta.env.VITE_COGNITO_REGION}.amazoncognito.com`,
          scopes: ['openid', 'email', 'profile', 'aws.cognito.signin.user.admin'],
          redirectSignIn: [import.meta.env.DEV ? 'http://localhost:8080/' : `${window.location.origin}/`],
          redirectSignOut: [import.meta.env.DEV ? 'http://localhost:8080/' : `${window.location.origin}/`],
          responseType: 'code' as const
        }
      }
    }
  }
};

Amplify.configure(amplifyConfig);

export default amplifyConfig;