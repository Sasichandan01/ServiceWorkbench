import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exchangeAuthCodeForTokens, getUserInfo } from '../../lib/auth';

interface GoogleOAuthHandlerProps {
  onSuccess?: (userInfo: any) => void;
  onError?: (error: Error) => void;
}

export const GoogleOAuthHandler: React.FC<GoogleOAuthHandlerProps> = ({ 
  onSuccess, 
  onError 
}) => {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const authCode = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      // Handle OAuth errors
      if (error) {
        const errorMessage = `OAuth error: ${error}`;
        setError(errorMessage);
        onError?.(new Error(errorMessage));
        return;
      }

      // Check if we have an authorization code
      if (!authCode) {
        return; // Not an OAuth callback
      }

      setIsProcessing(true);
      setError(null);

      try {
        // Get the current redirect URI
        const redirectUri = window.location.origin + window.location.pathname;
        
        console.log('Exchanging auth code for tokens...');
        console.log('Auth code:', authCode);
        console.log('Redirect URI:', redirectUri);

        // Exchange the authorization code for tokens
        const tokenData = await exchangeAuthCodeForTokens(authCode, redirectUri);
        
        console.log('Token exchange successful:', {
          access_token: tokenData.access_token ? 'Present' : 'Missing',
          id_token: tokenData.id_token ? 'Present' : 'Missing',
          refresh_token: tokenData.refresh_token ? 'Present' : 'Missing',
        });

        // Get user information using the access token
        if (tokenData.access_token) {
          const userInfo = await getUserInfo(tokenData.access_token);
          console.log('User info retrieved:', userInfo);

          // Clear URL parameters
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);

          // Call success callback
          onSuccess?.(userInfo);

          // Redirect to appropriate page based on user role
          // You can customize this logic based on your app's requirements
          setTimeout(() => {
            navigate('/workspaces', { replace: true });
          }, 1000);
        } else {
          throw new Error('No access token received from token exchange');
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        console.error('OAuth processing error:', err);
        setError(errorMessage);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      } finally {
        setIsProcessing(false);
      }
    };

    handleOAuthCallback();
  }, [navigate, onSuccess, onError]);

  if (isProcessing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Processing Google authentication...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Authentication Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return null; // Don't render anything if not processing OAuth
}; 