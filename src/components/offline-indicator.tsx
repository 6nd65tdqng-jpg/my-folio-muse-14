import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

export function OfflineIndicator() {
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline((prev) => {
        if (prev) {
          setShowReconnected(true);
          setTimeout(() => setShowReconnected(false), 3000);
        }
        return false;
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!mounted) return null;

  if (showReconnected) {
    return (
      <div className="pointer-events-none fixed bottom-4 left-4 z-50 max-w-xs animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-start gap-3 rounded-lg border border-[var(--success)]/30 bg-background/95 p-3 shadow-lg backdrop-blur">
          <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />
          <div className="leading-tight">
            <div className="text-sm font-medium text-foreground">
              Back online
            </div>
            <p className="text-xs text-muted-foreground">
              Prices will update automatically
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="pointer-events-none fixed bottom-4 left-4 z-50 max-w-xs animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-background/95 p-3 shadow-lg backdrop-blur">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
          <div className="leading-tight">
            <div className="text-sm font-medium text-foreground">
              You're offline
            </div>
            <p className="text-xs text-muted-foreground">
              Prices may be stale
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}