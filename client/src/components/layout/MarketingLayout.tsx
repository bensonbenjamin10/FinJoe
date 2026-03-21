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
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  // Placeholders for future pages
  // { href: "/pricing", label: "Pricing" },
  // { href: "/about", label: "About" },
  // { href: "/contact", label: "Contact" },
];

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 md:h-16 items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 font-display font-semibold text-foreground hover:text-primary transition-colors">
            <span className="text-xl md:text-2xl">FinJoe</span>
          </Link>

          {isMobile ? (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="Open menu">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                <SheetHeader>
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                </SheetHeader>
                <nav className="mt-8 flex flex-col gap-4">
                  {NAV_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setSheetOpen(false)}
                      className="text-lg font-medium text-foreground hover:text-primary transition-colors py-2"
                    >
                      {link.label}
                    </Link>
                  ))}
                  <Link href="/signup" onClick={() => setSheetOpen(false)} className="mt-4">
                    <Button className="w-full min-h-[44px]" size="lg">
                      Sign Up
                    </Button>
                  </Link>
                  <Link href="/login" onClick={() => setSheetOpen(false)}>
                    <Button variant="outline" className="w-full min-h-[44px]" size="lg">
                      <LogIn className="h-4 w-4 mr-2" />
                      Log in
                    </Button>
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          ) : (
            <nav className="flex items-center gap-6">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <Link href="/signup">
                <Button size="sm">
                  Sign Up
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="sm">
                  <LogIn className="h-4 w-4 mr-2" />
                  Log in
                </Button>
              </Link>
            </nav>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-muted/30">
        <div className="container mx-auto px-4 py-12 md:py-16 md:px-6">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <Link href="/" className="font-display text-lg font-semibold text-foreground hover:text-primary transition-colors">
                FinJoe
              </Link>
              <p className="text-sm text-muted-foreground max-w-xs">
                WhatsApp AI for expense and income management. Finance Joe knows everything about finance.
              </p>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:gap-8">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <Link href="/signup" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Sign Up
              </Link>
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Log in
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} FinJoe. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
