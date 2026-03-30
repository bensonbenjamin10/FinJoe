import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KbMockScreen } from "@/components/knowledge-base/KbMockScreen";
import {
  KB_ARTICLES,
  KB_CATEGORY_LABELS,
  getKbArticle,
  groupArticlesByCategory,
} from "@/lib/knowledge-base/articles";
import type { KbArticle } from "@/lib/knowledge-base/types";
import { ArrowLeft, BookOpen } from "lucide-react";

function ArticleView({ article }: { article: KbArticle }) {
  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" className="gap-2 pl-0" asChild>
          <Link href="/admin/help">
            <ArrowLeft className="h-4 w-4" />
            Back to Knowledge Base
          </Link>
        </Button>
      </div>
      <PageHeader title={article.title} description={article.summary} />
      <ol className="mt-8 space-y-10">
        {article.steps.map((step, i) => (
          <li key={i} className="border-b border-border pb-10 last:border-0 last:pb-0">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
              <div className="min-w-0 flex-1">
                <div className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    {step.title && (
                      <h3 className="font-display text-lg font-semibold text-foreground">{step.title}</h3>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                  </div>
                </div>
              </div>
              {step.mockScreen && (
                <div className="min-w-0 shrink-0 lg:max-w-[min(100%,420px)] lg:pt-1">
                  <KbMockScreen spec={step.mockScreen} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HubView() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return KB_ARTICLES;
    return KB_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(s) ||
        a.summary.toLowerCase().includes(s) ||
        KB_CATEGORY_LABELS[a.category].toLowerCase().includes(s)
    );
  }, [q]);

  const grouped = useMemo(() => groupArticlesByCategory(filtered), [filtered]);
  const categoryOrder: KbArticle["category"][] = [
    "getting-started",
    "whatsapp",
    "people",
    "integrations",
    "finance",
  ];

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        description="Step-by-step guides for your team. Wireframes show where to click in FinJoe admin—they’re illustrative, not live data."
      />
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Input
            placeholder="Filter by title or topic…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Filter articles"
          />
        </div>
        <p className="text-sm text-muted-foreground">{filtered.length} guide(s)</p>
      </div>

      <div className="mt-10 space-y-12">
        {categoryOrder.map((cat) => {
          const list = grouped.get(cat);
          if (!list?.length) return null;
          return (
            <section key={cat} aria-labelledby={`kb-cat-${cat}`}>
              <h2 id={`kb-cat-${cat}`} className="font-display text-xl font-semibold text-foreground">
                {KB_CATEGORY_LABELS[cat]}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((article) => (
                  <Link key={article.slug} href={`/admin/help/${article.slug}`}>
                    <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/20">
                      <CardHeader>
                        <div className="flex items-start gap-2">
                          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <CardTitle className="font-display text-base leading-snug">{article.title}</CardTitle>
                        </div>
                        <CardDescription className="line-clamp-3">{article.summary}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminKnowledgeBase() {
  const params = useParams() as { slug?: string };
  const slug = params.slug?.trim();

  if (slug) {
    const article = getKbArticle(slug);
    if (!article) {
      return (
        <div>
          <PageHeader title="Article not found" description="This guide doesn’t exist or was moved." />
          <Button className="mt-6" asChild>
            <Link href="/admin/help">Back to Knowledge Base</Link>
          </Button>
        </div>
      );
    }
    return <ArticleView article={article} />;
  }

  return <HubView />;
}
