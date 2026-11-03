import { Link } from '@tanstack/react-router';
import { Button } from '@idmis/ui';
import { Compass, ArrowLeft } from 'lucide-react';

export function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 text-center">
        {/* Brand Header */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-800 text-white font-extrabold text-xl mb-3 shadow-lg ring-1 ring-teal-400/30">
            ID
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            TRIMING <span className="text-teal-400 font-bold">IDMIS 2.0</span>
          </h1>
        </div>

        {/* 404 Glassmorphic Card */}
        <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-2xl border border-slate-100 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/80 shadow-xs">
            <Compass
              className="h-9 w-9 text-amber-600 animate-spin"
              style={{ animationDuration: '10s' }}
            />
          </div>

          <span className="text-xs font-black uppercase tracking-widest text-amber-600 mb-1">
            404 Error
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Page or Record Not Found
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-xs leading-relaxed">
            The requested screen or record does not exist or you may not have access under the
            active scheme scope.
          </p>

          <div className="mt-8 w-full">
            <Button
              asChild
              variant="default"
              className="w-full h-11.5 rounded-xl font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Return to Workspace
              </Link>
            </Button>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-500 mt-6 font-medium">
          Federal Ministry of Water Resources and Sanitation • TRIMING Project
        </p>
      </div>
    </div>
  );
}
