import * as React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, X, Smartphone, ShieldCheck } from 'lucide-react';
import { Button } from '@idmis/ui';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Global registry for detecting whether any form currently has unsaved dirty state.
// Any form can register its isDirty status via registerDirtyFormCheck.
type DirtyCheckFn = () => boolean;
const dirtyFormCheckers = new Set<DirtyCheckFn>();

export function registerDirtyFormCheck(isDirty: DirtyCheckFn): () => void {
  dirtyFormCheckers.add(isDirty);
  return () => {
    dirtyFormCheckers.delete(isDirty);
  };
}

export function hasUnsavedChanges(): boolean {
  for (const check of dirtyFormCheckers) {
    if (check()) return true;
  }
  return false;
}

export function PwaManager() {
  // 1. Service Worker update registration with prompt mode
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      if (r) {
        // Periodically check for SW updates (e.g. every hour)
        setInterval(
          () => {
            r.update();
          },
          60 * 60 * 1000,
        );
      }
    },
    onRegisterError(error: unknown) {
      console.warn('PWA Service Worker registration error:', error);
    },
  });

  // 2. Install prompt event state
  const [installPromptEvent, setInstallPromptEvent] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [isInstalled, setIsInstalled] = React.useState(false);

  React.useEffect(() => {
    // Check if running in standalone PWA mode
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error navigator.standalone is iOS-specific
      window.navigator.standalone === true
    ) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      setIsInstalled(true);
      sessionStorage.setItem('idmis_pwa_installed', 'true');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPromptEvent(null);
    }
  };

  const handleRefreshClick = () => {
    if (hasUnsavedChanges()) {
      const confirmRefresh = window.confirm(
        'You have unsaved changes in a form. Updating now may discard your current input. Do you want to update anyway?',
      );
      if (!confirmRefresh) {
        return;
      }
    }
    updateServiceWorker(true);
  };

  return (
    <aside
      aria-label="PWA notifications"
      className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto sm:max-w-md z-50 flex flex-col gap-2.5 pointer-events-none"
    >
      {/* "New Version Available" Banner */}
      {needRefresh && (
        <div
          role="alert"
          className="pointer-events-auto bg-slate-900/95 border border-teal-500/40 text-white rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-300 flex items-start gap-3.5"
        >
          <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 shrink-0">
            <RefreshCw className="h-5 w-5 animate-spin text-teal-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              New Update Ready
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-teal-500/30 text-teal-200 px-1.5 py-0.5 rounded-md">
                v2.0
              </span>
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              A newer version of TRIMING IDMIS is available. Refresh when ready — your offline queue
              is safely retained.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="default"
                onClick={handleRefreshClick}
                className="bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs h-8 px-3 rounded-lg shadow-sm"
              >
                Refresh App
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNeedRefresh(false)}
                className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs h-8 px-3 rounded-lg"
              >
                Later
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="text-slate-400 hover:text-white transition-colors p-1 -mr-1"
            aria-label="Dismiss update notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Non-intrusive Install Prompt Banner */}
      {installPromptEvent && !isDismissed && !isInstalled && (
        <div
          role="region"
          aria-label="Install App"
          className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl p-4 shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-300 flex items-start gap-3.5"
        >
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 shrink-0">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold flex items-center gap-1.5">
              Install TRIMING IDMIS
              <ShieldCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Install for instant offline field data capture and rapid home-screen access.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="default"
                onClick={handleInstallClick}
                className="bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs h-8 px-3 rounded-lg shadow-sm flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Install IDMIS
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsDismissed(true)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 text-xs h-8 px-2.5 rounded-lg"
              >
                Not Now
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 -mr-1"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
}
