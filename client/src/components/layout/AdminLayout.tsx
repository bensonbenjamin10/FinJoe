import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  /** Optional custom title; defaults to FinJoe Admin */
  title?: string;
}

export function AdminLayout({ children, headerActions, title = "FinJoe Admin" }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleLogout = () => {
    setSheetOpen(false);
    logout();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 md:h-16 items-center justify-between gap-4 px-4 py-3 md:px-6">
          {isMobile ? (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="Open menu">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] sm:w-[320px]">
                <SheetHeader>
                  <SheetTitle className="sr-only">Admin navigation</SheetTitle>
                </SheetHeader>
                <div className="mt-8 flex flex-col gap-4">
                  <Link href="/admin/finjoe" onClick={() => setSheetOpen(false)}>
                    <span className="font-display text-lg font-semibold text-foreground hover:text-primary">
                      FinJoe
                    </span>
                  </Link>
                  {headerActions && (
                    <div className="flex flex-col gap-2" onClick={() => setSheetOpen(false)}>
                      {headerActions}
                    </div>
                  )}
                  {user && (
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  )}
                  <Button variant="outline" onClick={handleLogout} className="w-full min-h-[44px]">
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          ) : (
            <Link href="/admin/finjoe" className="font-display text-xl font-semibold text-foreground hover:text-primary transition-colors shrink-0">
              FinJoe
            </Link>
          )}

          <div className="flex flex-1 items-center justify-end gap-4 flex-wrap min-w-0">
            {!isMobile && headerActions}
            {user && (
              <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                {user.email}
              </span>
            )}
            {!isMobile && (
              <Button variant="outline" size="sm" onClick={() => logout()}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            )}
          </div>
        </div>
        {isMobile && title && (
          <div className="px-4 pb-2 md:hidden">
            <h1 className="font-display text-lg font-semibold text-foreground truncate">
              {title}
            </h1>
          </div>
        )}
      </header>

      <div className="container mx-auto max-w-6xl px-4 py-6 md:px-6">
        {children}
      </div>
    </div>
  );
}
