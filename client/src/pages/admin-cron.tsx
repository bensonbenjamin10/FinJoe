import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Calendar, Zap, History } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CRON_JOBS = [
  {
    id: "recurring-expenses",
    name: "Recurring Expenses",
    description: "Generates draft expenses from recurring templates (rent, salaries, etc.). Runs daily at 00:05 UTC.",
    schedule: "Daily 00:05 UTC",
  },
  {
    id: "recurring-income",
    name: "Recurring Income",
    description: "Generates income records from recurring income templates (monthly fees, rent, etc.). Runs daily at 00:05 UTC.",
    schedule: "Daily 00:05 UTC",
  },
  {
    id: "weekly-insights",
    name: "Weekly Insights",
    description: "Sends expense/income summaries to admin/finance WhatsApp contacts.",
    schedule: "Mondays only",
  },
  {
    id: "cfo-insight-snapshots",
    name: "CFO insight snapshots",
    description: "Persists structured CFO analytics + MIS facts per tenant for the last 7 days (dashboard history).",
    schedule: "Weekly with /cron/cfo-insight-snapshots",
  },
  {
    id: "backfill-embeddings",
    name: "Backfill Embeddings",
    description: "Processes expenses without embeddings for RAG/semantic search.",
    schedule: "Daily 00:05 UTC",
  },
  {
    id: "demo-expiry",
    name: "Demo workspace expiry",
    description: "Deactivates demo tenants past their demo_expires_at (also runs hourly on the server).",
    schedule: "Hourly (server interval) + /cron/demo-expiry",
  },
  {
    id: "backup-to-s3",
    name: "Backup to S3",
    description:
      "Uploads pg_dump (custom format) plus optional media tarball to your S3-compatible bucket. Server needs AWS_* and pg_dump; volume at MEDIA_STORAGE_PATH for media.",
    schedule: "Daily via cron if FINJOE_APP_URL set (see run-all-cron.mjs)",
  },
] as const;

type JobId = (typeof CRON_JOBS)[number]["id"];

type CronRun = {
  id: string;
  jobName: string;
  status: string;
  resultJson: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
};

type TriggerResult = {
  ok: boolean;
  job: string;
  generated?: number;
  errors?: string[];
  tenantsProcessed?: number;
  messagesSent?: number;
  snapshotsWritten?: number;
  processed?: number;
  skipped?: boolean;
  total?: number;
  remaining?: number;
  deactivated?: number;
  keys?: string[];
  datePrefix?: string;
};

export default function AdminCron() {
  const { toast } = useToast();
  const [runningJob, setRunningJob] = useState<JobId | null>(null);
  const [lastResult, setLastResult] = useState<Record<JobId, TriggerResult | null>>({
    "recurring-expenses": null,
    "recurring-income": null,
    "weekly-insights": null,
    "cfo-insight-snapshots": null,
    "backfill-embeddings": null,
    "demo-expiry": null,
    "backup-to-s3": null,
  });

  const triggerMutation = useMutation({
    mutationFn: async (job: JobId) => {
      const res = await apiRequest("POST", "/api/admin/cron/trigger", { job });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.details || "Failed to run");
      }
      return res.json() as Promise<TriggerResult>;
    },
    onMutate: (job) => setRunningJob(job),
    onSuccess: (data, job) => {
      setLastResult((prev) => ({ ...prev, [job]: data }));
      setRunningJob(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cron/history"] });
      const msg =
        data.generated !== undefined
          ? `Generated ${data.generated} expense(s)`
          : data.messagesSent !== undefined
            ? `Sent ${data.messagesSent} message(s)`
            : data.snapshotsWritten !== undefined
              ? `Wrote ${data.snapshotsWritten} CFO snapshot(s)`
            : data.processed !== undefined
              ? `Processed ${data.processed} embedding(s)`
              : data.deactivated !== undefined
                ? `Deactivated ${data.deactivated} demo tenant(s)`
                : data.keys && data.keys.length > 0
                  ? `Uploaded ${data.keys.length} object(s) to S3`
                  : data.skipped
                    ? "Skipped (no work needed)"
                    : "Completed";
      toast({ title: `${job} completed`, description: msg });
    },
    onError: (e: Error, job) => {
      setRunningJob(null);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const { data: history = [] } = useQuery<CronRun[]>({
    queryKey: ["/api/admin/cron/history"],
    queryFn: async () => {
      const res = await fetch("/api/admin/cron/history?limit=20", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div className="w-full py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-6 w-6" />
            Cron Jobs
          </CardTitle>
          <CardDescription>
            Trigger scheduled jobs manually. Railway cron runs these daily at 00:05 UTC. Use this to run on demand or verify jobs work.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {CRON_JOBS.map((job) => {
            const isRunning = runningJob === job.id;
            const result = lastResult[job.id];
            return (
              <div
                key={job.id}
                className="flex flex-col gap-2 rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium">{job.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {job.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {job.schedule}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => triggerMutation.mutate(job.id)}
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Run now
                  </Button>
                </div>
                {result && (
                  <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm">
                    <div className="font-medium truncate" title={JSON.stringify(result)}>
                      Last run result:
                      {result.generated !== undefined && (
                        <span className="ml-2">
                          Generated {result.generated} expense(s)
                          {result.errors && result.errors.length > 0 && (
                            <span className="text-destructive"> ({result.errors.length} error(s))</span>
                          )}
                        </span>
                      )}
                      {result.messagesSent !== undefined && (
                        <span className="ml-2">
                          Sent {result.messagesSent} message(s) to {result.tenantsProcessed} tenant(s)
                        </span>
                      )}
                      {result.snapshotsWritten !== undefined && (
                        <span className="ml-2">
                          Wrote {result.snapshotsWritten} snapshot(s) for {result.tenantsProcessed} tenant(s)
                        </span>
                      )}
                      {result.processed !== undefined && !result.skipped && (
                        <span className="ml-2">
                          Processed {result.processed} embedding(s)
                          {result.remaining != null && ` (${result.remaining} remaining)`}
                        </span>
                      )}
                      {result.skipped && result.processed === undefined && (
                        <span className="ml-2 text-muted-foreground">Skipped (no GEMINI_API_KEY or no expenses to process)</span>
                      )}
                      {result.deactivated !== undefined && (
                        <span className="ml-2">Deactivated {result.deactivated} demo tenant(s)</span>
                      )}
                      {result.keys && result.keys.length > 0 && (
                        <span className="ml-2">
                          S3 keys: {result.keys.join(", ")}
                          {result.datePrefix && ` (prefix ${result.datePrefix})`}
                        </span>
                      )}
                    </div>
                    {result.errors && result.errors.length > 0 && (
                      <ul className="mt-2 list-disc list-inside text-destructive text-xs">
                        {result.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {result.errors.length > 5 && (
                          <li>...and {result.errors.length - 5} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent Runs
          </CardTitle>
          <CardDescription>
            History of cron job runs (admin-triggered and worker).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No cron runs recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{run.jobName}</TableCell>
                    <TableCell>
                      <span className={run.status === "error" ? "text-destructive" : ""}>
                        {run.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(run.startedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate" title={run.errorMessage || JSON.stringify(run.resultJson)}>
                      {run.errorMessage || (run.resultJson?.generated != null && `Generated ${run.resultJson.generated}`) || (run.resultJson?.messagesSent != null && `Sent ${run.resultJson.messagesSent} msgs`) || (run.resultJson?.processed != null && `Processed ${run.resultJson.processed}`) || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
