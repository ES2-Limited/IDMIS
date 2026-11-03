import { Link } from '@tanstack/react-router';
import { Button, EmptyState } from '@idmis/ui';
import { AlertCircle } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState
        icon={<AlertCircle className="h-8 w-8 text-amber-500" />}
        title="Page Not Found"
        description="The requested screen or record could not be found. Please check your URL or return to the main workspace."
        action={
          <Button asChild variant="default">
            <Link to="/">Back to Workspace</Link>
          </Button>
        }
      />
    </div>
  );
}
