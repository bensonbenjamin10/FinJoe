import { Link } from "wouter";
import { GraduationCap, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Linkedin } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";

export function Footer() {
  const { supportPhone, isLoading } = useSystemSettings();
  const phoneNumber = supportPhone ?? "+919585361392";
  
  return (
    <footer className="bg-card border-t mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">
                Med<span className="text-primary">PG</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              India's gold standard for NEET-PG and INI-CET exam coaching. Expert faculty, proven results, and comprehensive support.
            </p>
            <div className="flex gap-3">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover-elevate active-elevate-2 p-2 rounded-md"
                data-testid="link-facebook"
              >
                <Facebook className="h-5 w-5 text-muted-foreground" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover-elevate active-elevate-2 p-2 rounded-md"
                data-testid="link-twitter"
              >
                <Twitter className="h-5 w-5 text-muted-foreground" />
              </a>
              <a
                href="https://www.instagram.com/medpgbasics/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover-elevate active-elevate-2 p-2 rounded-md"
                data-testid="link-instagram"
              >
                <Instagram className="h-5 w-5 text-muted-foreground" />
              </a>
              <a
                href="https://in.linkedin.com/company/medpg"
                target="_blank"
                rel="noopener noreferrer"
                className="hover-elevate active-elevate-2 p-2 rounded-md"
                data-testid="link-linkedin"
              >
                <Linkedin className="h-5 w-5 text-muted-foreground" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-home">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/programs" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-programs">
                  Programs
                </Link>
              </li>
              <li>
                <Link href="/campus" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-campus">
                  Campus
                </Link>
              </li>
              <li>
                <Link href="/results" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-results">
                  Results
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div>
            <h3 className="font-semibold mb-4">Legal & Compliance</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/legal/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-terms">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-privacy">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/refund-policy" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-refund">
                  Refund & Cancellation
                </Link>
              </li>
              <li>
                <Link href="/legal/shipping" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-shipping">
                  Shipping & Delivery
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4">Contact Us</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span className="text-sm text-muted-foreground">
                  Sl, V Enclave, Urban Greens, Maruthi Layout, Thindlu Main Road, Kodigehalli, Bangalore - 560092
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <a
                  href={`tel:${phoneNumber}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-phone"
                >
                  {phoneNumber.replace(/(\+\d{2})(\d{4})(\d{3})(\d{3})/, '$1 $2 $3 $4')}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <a
                  href="mailto:support@medpg.org"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-email"
                >
                  support@medpg.org
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} MedPG. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
