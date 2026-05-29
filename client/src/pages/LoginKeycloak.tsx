import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/KeycloakAuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { APP_LOGO, APP_TITLE } from '@/const';

export default function LoginKeycloak() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Initializing authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            {APP_LOGO && (
              <img src={APP_LOGO} alt={APP_TITLE} className="h-16 w-auto" />
            )}
          </div>
          <div className="space-y-2 text-center">
            <CardTitle className="text-2xl font-bold">Welcome to {APP_TITLE}</CardTitle>
            <CardDescription>
              Sign in to access your farmer data collection dashboard
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={login}
            className="w-full"
            size="lg"
          >
            Sign In with Keycloak
          </Button>
          
          <div className="text-center text-sm text-muted-foreground">
            <p>Secure authentication powered by Keycloak</p>
            <p className="mt-2">
              Features: SSO, MFA, Social Login
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
