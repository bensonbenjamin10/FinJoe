import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, Phone, FileText } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { trackEvent } from "@/lib/analytics";

interface ContactFloatingBarProps {
  onEnquiryClick: () => void;
}

export function ContactFloatingBar({ onEnquiryClick }: ContactFloatingBarProps) {
  const { supportPhone, supportWhatsApp } = useSystemSettings();
  
  const whatsappNumber = supportWhatsApp ?? "+919585361392";
  const phoneNumber = supportPhone ?? "+919585361392";

  const handleWhatsAppClick = () => {
    trackEvent("contact_floating_bar", "whatsapp_click", "floating_bar");
    const message = encodeURIComponent("Hi! I'm interested in learning more about your NEET-PG programs.");
    window.open(`https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${message}`, "_blank");
  };

  const handleCallClick = () => {
    trackEvent("contact_floating_bar", "call_click", "floating_bar");
    window.location.href = `tel:${phoneNumber}`;
  };

  const handleEnquiryClick = () => {
    trackEvent("contact_floating_bar", "enquiry_click", "floating_bar");
    onEnquiryClick();
  };

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t shadow-lg"
      data-testid="contact-floating-bar"
    >
      <div className="container mx-auto px-2 py-2">
        <div className="flex items-center justify-between gap-2 max-w-2xl mx-auto">
          {/* WhatsApp - Primary CTA */}
          <Button
            onClick={handleWhatsAppClick}
            className="flex-1 bg-[#25D366] hover:bg-[#20BD5C] text-white gap-2"
            size="default"
            data-testid="button-floating-whatsapp"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </Button>

          {/* Call */}
          <Button
            onClick={handleCallClick}
            variant="outline"
            className="flex-1 gap-2"
            size="default"
            data-testid="button-floating-call"
          >
            <Phone className="w-4 h-4" />
            <span className="hidden sm:inline">Call</span>
          </Button>

          {/* Quick Enquiry */}
          <Button
            onClick={handleEnquiryClick}
            variant="secondary"
            className="flex-1 gap-2"
            size="default"
            data-testid="button-floating-enquiry"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Enquire</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
