export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
};

export async function verifyAdminRequest(request: Request) {
  // Allow if valid server-to-server API Key is provided
  const apiKey = new URL(request.url).searchParams.get('api_key') || request.headers.get('X-Api-Key');
  const validKey = process.env.API_KEY || process.env.EXPO_PUBLIC_API_KEY;
  if (apiKey && validKey && apiKey === validKey) {
    return { authorized: true, method: 'api_key' };
  }

  // Or verify Firebase Auth token (Bearer token)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1];
    const fbApiKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
    if (fbApiKey) {
      try {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${fbApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken })
        });
        const data = await response.json();
        if (!data.error && data.users && data.users.length > 0) {
          return { authorized: true, method: 'firebase', user: data.users[0] };
        }
      } catch (e) {
        // Ignore error and fallthrough to false
      }
    }
  }

  return { authorized: false };
}
