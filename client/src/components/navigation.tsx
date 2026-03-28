import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { Menu, X, LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import logoImage from "@assets/finjoe-logo.png";

export function Navigation() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, logout, isLoggingOut, hasExpenseAccess } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/#features", label: "Features" },
    { href: "/#how-it-works", label: "How it works" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        isScrolled
          ? "bg-background/95 backdrop-blur-md border-b shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link 
            href="/"
            className="flex items-center hover-elevate active-elevate-2 rounded-md px-2 py-1 -ml-2" 
            data-testid="link-home"
          >
            <img 
              src={logoImage} 
              alt="FinJoe" 
              className="h-10 w-auto sm:h-12"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link 
                key={link.href} 
                href={link.href}
                data-testid={`link-nav-${link.label.toLowerCase()}`}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors hover-elevate active-elevate-2 ${
                  link.href === "/" && location === "/"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/80"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                {hasExpenseAccess && (
                  <LinkButton
                    href="/admin/expenses"
                    variant="outline"
                    size="default"
                    data-testid="button-expenses-nav"
                  >
                    Expenses
                  </LinkButton>
                )}
                {user?.role === "admin" && (
                  <LinkButton
                    href="/admin/finjoe"
                    variant="outline"
                    size="default"
                    data-testid="button-finjoe-nav"
                  >
                    FinJoe
                  </LinkButton>
                )}
                <LinkButton
                  href={user?.role === "admin" ? "/admin" : "/student-dashboard"}
                  variant="outline"
                  size="default"
                  data-testid="button-dashboard-nav"
                >
                  <User className="w-4 h-4 mr-2" />
                  Dashboard
                </LinkButton>
                <Button
                  variant="ghost"
                  size="default"
                  onClick={() => logout()}
                  disabled={isLoggingOut}
                  data-testid="button-logout-nav"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </Button>
              </>
            ) : (
              <>
                <LinkButton
                  href="/login"
                  variant="ghost"
                  size="default"
                  data-testid="button-login-nav"
                >
                  Login
                </LinkButton>
                <LinkButton
                  href="/signup"
                  variant="outline"
                  size="default"
                  data-testid="button-register-nav"
                >
                  Sign up
                </LinkButton>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            data-testid="button-mobile-menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link 
                  key={link.href} 
                  href={link.href}
                  data-testid={`link-mobile-${link.label.toLowerCase()}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-4 py-3 rounded-md text-sm font-medium hover-elevate active-elevate-2 ${
                    link.href === "/" && location === "/"
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground/80"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {isAuthenticated ? (
                <>
                  {hasExpenseAccess && (
                    <LinkButton
                      href="/admin/expenses"
                      className="w-full mt-2"
                      onClick={() => setIsMobileMenuOpen(false)}
                      data-testid="button-expenses-mobile"
                    >
                      Expenses
                    </LinkButton>
                  )}
                  {user?.role === "admin" && (
                    <LinkButton
                      href="/admin/finjoe"
                      className="w-full"
                      onClick={() => setIsMobileMenuOpen(false)}
                      data-testid="button-finjoe-mobile"
                    >
                      FinJoe
                    </LinkButton>
                  )}
                  <LinkButton
                    href={user?.role === "admin" ? "/admin" : "/student-dashboard"}
                    className="w-full mt-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid="button-dashboard-mobile"
                  >
                    <User className="w-4 h-4 mr-2" />
                    Dashboard
                  </LinkButton>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      logout();
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={isLoggingOut}
                    data-testid="button-logout-mobile"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {isLoggingOut ? "Logging out..." : "Logout"}
                  </Button>
                </>
              ) : (
                <>
                  <LinkButton
                    href="/login"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid="button-login-mobile"
                  >
                    Login
                  </LinkButton>
                  <LinkButton
                    href="/signup"
                    className="w-full"
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid="button-register-mobile"
                  >
                    Sign up
                  </LinkButton>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
