import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORT_CONTACT_TOPICS, SUPPORT_COPY, SUPPORT_EMAIL_FALLBACK } from "@/lib/brand";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";

const supportFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Valid email required"),
  topic: z.enum(["general", "account", "billing", "technical", "security"]),
  message: z.string().min(10, "Please add a bit more detail (at least 10 characters)").max(8000),
  website: z.string().max(0).optional(),
});

type SupportFormData = z.infer<typeof supportFormSchema>;

function supportMailtoHref(): string {
  const addr =
    (typeof import.meta.env.VITE_SUPPORT_EMAIL === "string" && import.meta.env.VITE_SUPPORT_EMAIL.trim()) ||
    SUPPORT_EMAIL_FALLBACK;
  const subject = encodeURIComponent("FinJoe support request");
  const body = encodeURIComponent(
    "Hello FinJoe support,\n\n[Describe your question or issue]\n\nThanks"
  );
  return `mailto:${addr}?subject=${subject}&body=${body}`;
}

export function SupportContactSection() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<SupportFormData>({
    resolver: zodResolver(supportFormSchema),
    defaultValues: {
      name: "",
      email: "",
      topic: "general",
      message: "",
      website: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: SupportFormData) => {
      const res = await fetch("/api/public/support-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          topic: data.topic,
          message: data.message,
          website: data.website ?? "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (json as { error?: string }).error || "Could not send message";
        throw new Error(err);
      }
      return json;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: SUPPORT_COPY.contactSuccess });
      form.reset({ ...form.getValues(), message: "", website: "" });
    },
    onError: (e: Error) => {
      toast({
        title: "Could not send",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SupportFormData) => {
    mutation.mutate(data);
  };

  return (
    <section id="support-contact" className="py-12 md:py-16 lg:py-20" aria-labelledby="support-contact-heading">
      <div className="container mx-auto max-w-xl px-4 md:px-6">
        <div className="text-center">
          <h2
            id="support-contact-heading"
            className="font-display text-2xl font-bold text-foreground sm:text-3xl md:text-4xl"
          >
            {SUPPORT_COPY.contactTitle}
          </h2>
          <p className="mt-3 text-muted-foreground">{SUPPORT_COPY.contactSubtitle}</p>
        </div>

        {submitted ? (
          <div className="mt-10 rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            <p>{SUPPORT_COPY.contactSuccess}</p>
            <Button variant="link" className="mt-2" type="button" onClick={() => setSubmitted(false)}>
              Send another message
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-10 space-y-5">
              <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...form.register("website")} />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@company.com" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="topic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Topic</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a topic" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SUPPORT_CONTACT_TOPICS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What happened, what you tried, and your workspace context if relevant"
                        className="min-h-[140px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full min-h-[48px]" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send message
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Prefer email?{" "}
                <a href={supportMailtoHref()} className="font-medium text-primary underline-offset-4 hover:underline">
                  Open your mail app
                </a>
              </p>
            </form>
          </Form>
        )}
      </div>
    </section>
  );
}
