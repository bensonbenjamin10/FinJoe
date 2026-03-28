import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, MessageCircle, Send, Sparkles, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatMsg = { role: "finjoe" | "user"; text: string };

type Step = "welcome" | "name" | "email" | "org" | "phone" | "done";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "finjoe",
      text: "Hi — I'm FinJoe, your finance copilot. I'll set up a full **ACME Business** demo (multi-crore sample data) so you can explore the dashboard and WhatsApp. Ready?",
    },
  ]);
  const [step, setStep] = useState<Step>("welcome");
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [phone, setPhone] = useState("");

  const { data: onboardingConfig } = useQuery<{
    demoWhatsAppDigits: string | null;
    demoWaMeMessage: string;
  }>({
    queryKey: ["/api/public/onboarding-config"],
    queryFn: async () => {
      const res = await fetch("/api/public/onboarding-config");
      if (!res.ok) throw new Error("config");
      return res.json();
    },
  });

  const waMeUrl =
    onboardingConfig?.demoWhatsAppDigits &&
    `https://wa.me/${onboardingConfig.demoWhatsAppDigits}?text=${encodeURIComponent(onboardingConfig.demoWaMeMessage || "Hello, Finjoe")}`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, step]);

  const provisionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/agent-provision", {
        adminName: name.trim(),
        adminEmail: email.trim(),
        orgName: orgName.trim(),
        phone: phone.trim(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Provisioning failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setMessages((m) => [
        ...m,
        {
          role: "finjoe",
          text: "Your demo workspace is ready — you're signed in. Open WhatsApp below, then head to the dashboard when you like.",
        },
      ]);
      setStep("done");
      toast({ title: "Welcome to FinJoe", description: "Demo data is ready." });
    },
    onError: (e: Error) => {
      setMessages((m) => [
        ...m,
        { role: "finjoe", text: `Something went wrong: ${e.message}. You can adjust your details and try again.` },
      ]);
      setStep("phone");
      toast({ title: "Could not finish setup", description: e.message, variant: "destructive" });
    },
  });

  const pushUser = (text: string) => setMessages((m) => [...m, { role: "user", text }]);
  const pushFinjoe = (text: string) => setMessages((m) => [...m, { role: "finjoe", text }]);

  const handleSend = () => {
    const v = input.trim();
    if (!v) return;

    if (step === "welcome") {
      pushUser(v);
      pushFinjoe("Great. What's your full name?");
      setInput("");
      setStep("name");
      return;
    }

    if (step === "name") {
      pushUser(v);
      setName(v);
      pushFinjoe("Thanks. What's your work email? (We'll use it for your account.)");
      setInput("");
      setStep("email");
      return;
    }

    if (step === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
        return;
      }
      pushUser(v);
      setEmail(v);
      pushFinjoe("What's your company or organization name?");
      setInput("");
      setStep("org");
      return;
    }

    if (step === "org") {
      pushUser(v);
      setOrgName(v);
      pushFinjoe("Last one — your WhatsApp number (with country code, e.g. +91…). We use it to link your demo chat.");
      setInput("");
      setStep("phone");
      return;
    }

    if (step === "phone") {
      pushUser(v);
      setPhone(v);
      setInput("");
      pushFinjoe("Generating your demo… this can take a few seconds.");
      provisionMutation.mutate();
    }
  };

  const placeholder =
    step === "welcome"
      ? 'Say "yes" to continue…'
      : step === "name"
        ? "Your full name"
        : step === "email"
          ? "you@company.com"
          : step === "org"
            ? "Company name"
            : step === "phone"
              ? "+91 98765 43210"
              : "";

  const inputDisabled = step === "done" || provisionMutation.isPending;
  const showWhatsAppCta = step === "done" && !provisionMutation.isPending;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <div className="container max-w-2xl flex-1 flex flex-col py-8 px-4">
        <Card className="shadow-lg border-primary/20 flex-1 flex flex-col min-h-[70vh]">
          <CardHeader className="border-b bg-card/80">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">FinJoe onboarding</CardTitle>
                <CardDescription>Chat with FinJoe — no long forms</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col pt-4 gap-4">
            <div className="flex-1 space-y-4 overflow-y-auto max-h-[50vh] pr-1">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 max-w-[90%] text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    {msg.text.split("**").map((part, j) =>
                      j % 2 === 1 ? (
                        <strong key={j}>{part}</strong>
                      ) : (
                        <span key={j}>{part}</span>
                      )
                    )}
                  </div>
                </div>
              ))}
              {provisionMutation.isPending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-4 py-2 bg-muted text-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Provisioning demo data…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {showWhatsAppCta && waMeUrl && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Try FinJoe on WhatsApp
                </p>
                <p className="text-xs text-muted-foreground">
                  Opens WhatsApp with a pre-filled message to our demo number. FinJoe will recognize your demo and guide you.
                </p>
                <Button className="w-full gap-2" asChild>
                  <a href={waMeUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Launch WhatsApp
                  </a>
                </Button>
              </div>
            )}
            {showWhatsAppCta && !waMeUrl && (
              <p className="text-xs text-muted-foreground text-center">
                Configure <code className="text-[10px]">FINJOE_DEMO_WHATSAPP_NUMBER</code> or Twilio WhatsApp env for the launch link.
              </p>
            )}
            {showWhatsAppCta && (
              <Button variant="outline" className="w-full" onClick={() => setLocation("/admin/dashboard")}>
                Go to dashboard
              </Button>
            )}

            <div className="flex gap-2 pt-2 border-t">
              <div className="flex-1 space-y-1">
                <Label htmlFor="chat-input" className="sr-only">
                  Message
                </Label>
                <Input
                  id="chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
                  placeholder={placeholder}
                  disabled={inputDisabled}
                  className="min-h-11"
                />
              </div>
              <Button type="button" onClick={handleSend} disabled={inputDisabled || !input.trim()} className="shrink-0">
                {provisionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary font-medium hover:underline">
                Log in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
