import { SUPPORT_COPY, SUPPORT_FAQ } from "@/lib/brand";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function SupportFaqSection() {
  return (
    <section id="support-faq" className="border-b py-12 md:py-16 lg:py-20" aria-labelledby="support-faq-heading">
      <div className="container mx-auto max-w-3xl px-4 md:px-6">
        <h2
          id="support-faq-heading"
          className="font-display text-center text-2xl font-bold text-foreground sm:text-3xl md:text-4xl"
        >
          {SUPPORT_COPY.faqTitle}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground md:text-lg">
          {SUPPORT_COPY.faqSubtitle}
        </p>
        <Accordion type="single" collapsible className="mt-10 w-full">
          {SUPPORT_FAQ.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-base font-medium">{item.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
