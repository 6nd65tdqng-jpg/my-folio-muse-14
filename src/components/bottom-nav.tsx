import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Wallet,
  LineChart,
  Sparkles,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AssistantChat } from "@/components/assistant-chat";

const NAV = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Holdings", url: "/holdings", icon: Wallet },
  { title: "Analytics", url: "/analytics", icon: LineChart },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
] as const;

export function BottomNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [chatOpen, setChatOpen] = useState(false);
  const isActive = (u: string) => (u === "/" ? path === "/" : path.startsWith(u));

  return (
    <>
      {/* Floating assistant button (mobile only) */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        aria-label="Open Assistant"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 md:hidden"
      >
        <Sparkles className="h-6 w-6" />
      </button>

      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent
          side="bottom"
          className="h-[100dvh] w-full max-w-full p-0 sm:max-w-full"
        >
          <AssistantChat />
        </SheetContent>
      </Sheet>

      {/* Bottom navigation (mobile only) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch justify-around border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Primary"
      >
        {NAV.map((item) => {
          const active = isActive(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              onClick={() => setChatOpen(false)}
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-2 text-[10px] font-medium transition",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className={cn("h-5 w-5", active && "scale-110")} />
              <span>{item.title}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-2 text-[10px] font-medium text-muted-foreground"
        >
          <Sparkles className="h-5 w-5" />
          <span>Assistant</span>
        </button>
      </nav>
    </>
  );
}