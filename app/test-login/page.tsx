'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function TestLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    // Get all query parameters
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      params[key] = value;
    });

    setDebugInfo({
      params,
      hasAppId: !!params.app_id,
      hasRedirectUri: !!params.redirect_uri,
      currentUrl: window.location.href,
      origin: window.location.origin
    });
  }, [searchParams]);

  const testChildAppAuth = () => {
    const testUrl = `/auth/login?app_id=test_app&redirect_uri=${encodeURIComponent('https://example.com/callback')}&response_type=code&scope=read,write,profile&state=test123`;
    router.push(testUrl);
  };

  const testNormalLogin = () => {
    router.push('/auth/login');
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Login Page Test</h1>
      
      <div className="space-y-6">
        <div className="border rounded p-4">
          <h2 className="font-semibold mb-2">Debug Info:</h2>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>

        <div className="space-y-2">
          <button
            onClick={testChildAppAuth}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mr-2"
          >
            Test Child App Auth
          </button>
          <button
            onClick={testNormalLogin}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Test Normal Login
          </button>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold mb-2">Test URLs:</h2>
          <div className="space-y-2 text-sm">
            <div>
              <strong>Child App Auth:</strong>
              <code className="block bg-gray-100 p-2 rounded mt-1">
                /auth/login?app_id=test_app&redirect_uri=https://example.com/callback&response_type=code&scope=read,write,profile&state=test123
              </code>
            </div>
            <div>
              <strong>Normal Login:</strong>
              <code className="block bg-gray-100 p-2 rounded mt-1">
                /auth/login
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}