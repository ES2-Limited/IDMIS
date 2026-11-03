import { Button, EmptyState } from '@idmis/ui';
import { AlertOctagon } from 'lucide-react';

interface ErrorBoundaryViewProps {
  error?: Error;
  resetErrorBoundary?: () => void;
}

export function ErrorBoundaryView({ error, resetErrorBoundary }: ErrorBoundaryViewProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState
        icon={<AlertOctagon className="h-8 w-8 text-rose-600" />}
        title="Application Error"
        description={
          error?.message ||
          'An unexpected error occurred while rendering this view. You can retry or reload the page.'
        }
        action={
          <div className="flex gap-2">
            {resetErrorBoundary && (
              <Button variant="default" onClick={resetErrorBoundary}>
                Try Again
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = '/';
              }}
            >
              Return Home
            </Button>
          </div>
        }
      />
    </div>
  );
}
