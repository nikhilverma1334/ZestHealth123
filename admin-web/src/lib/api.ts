export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

let refreshPromise: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, { 
      method: 'POST',
      credentials: 'include' // Sends refresh_token httpOnly cookie
    });
    return res.ok;
  } catch (e) {
    console.error('Refresh failed', e);
  }
  return false;
}

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const fetchOptions: RequestInit = {
    ...options,
    credentials: 'include', // Automatically sends jwt_token httpOnly cookie
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  let response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

  if (response.status === 401) {
    if (!refreshPromise) {
      refreshPromise = refreshToken().finally(() => {
        refreshPromise = null;
      });
    }

    const success = await refreshPromise;

    if (success) {
      response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    } else {
      if (typeof window !== 'undefined') {
        await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
        window.location.href = '/login';
      }
    }
  }

  return response;
}
