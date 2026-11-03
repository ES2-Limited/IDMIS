import { Link } from '@tanstack/react-router';
import { Button, EmptyState } from '@idmis/ui';
import { Compass } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center p-4">
      <EmptyState
        icon={<Compass className="h-8 w-8 text-teal-700 animate-pulse" />}
        title="Page or Record Not Found"
        description="The requested screen or record does not exist or you may not have access under the active scheme scope."
        action={
          <Button asChild variant="default" className="w-full sm:w-auto">
            <Link to="/">Return to Workspace</Link>
          </Button>
        }
      />
    </div>
  );
}
