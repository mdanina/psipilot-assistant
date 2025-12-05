import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';

export default function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-10 w-10 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground max-w-md">
            You don't have permission to access this page. Please contact your
            administrator if you believe this is an error.
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button onClick={() => navigate('/')}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
