import { Link } from '@tanstack/react-router';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@idmis/ui';
import { ShieldAlert } from 'lucide-react';

export function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-lg border-slate-200 text-center py-6">
          <CardHeader className="flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <CardTitle className="text-xl text-slate-900">Access Restricted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              You do not have the required permissions or assigned scheme scope to access this
              section.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Link to="/">
                <Button className="w-full">Return to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
