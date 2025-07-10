
export interface UserInfo {
  name?: string;
  email?: string;
  sub?: string;
  role?: string;
}

export const decodeIdToken = (idToken: string): UserInfo | null => {
  try {
    // Split the JWT token into parts
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }

    // Decode the payload (second part)
    const payload = parts[1];
    const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsedPayload = JSON.parse(decodedPayload);

    return {
      name: parsedPayload.name,
      email: parsedPayload.email,
      sub: parsedPayload.sub,
      role: parsedPayload['custom:Role'] || parsedPayload['custom:role'] || 'Default'
    };
  } catch (error) {
    console.error('Error decoding ID token:', error);
    return null;
  }
};

export const getUserInfo = (): UserInfo | null => {
  const idToken = localStorage.getItem('idToken');
  if (!idToken) {
    return null;
  }
  
  return decodeIdToken(idToken);
};

export const getInitials = (name: string): string => {
  if (!name) return 'U';
  
  const nameParts = name.trim().split(' ');
  if (nameParts.length >= 2) {
    return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
  }
  return nameParts[0][0].toUpperCase();
};
