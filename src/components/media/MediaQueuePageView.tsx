import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  cancelMediaJob,
  formatDateTime,
  formatRelativeTime,
  formatSeconds,
  getMediaJob,
  getMediaJobProgress,
  getMediaQueueSummary,
  listMediaJobs,
  type MediaBranch,
  type MediaEvent,
  type MediaJob,
  type MediaQueueSummary,
} from "@/lib/mediaService";
import { MediaStatusBadge } from "./MediaStatusBadge";

interface MediaQueuePageViewProps {
  title: string;
  subtitle: string;
  emptyMessage: string;
}

const defaultSummary: MediaQueueSummary = {
  total: 0,
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  oldestQueuedAt: null,
  activeJobId: null,
};

export function MediaQueuePageView({
  title,
  subtitle,
  emptyMessage,
}: MediaQueuePageViewProps) {
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [summary, setSummary] = useState<MediaQueueSummary>(defaultSummary);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<MediaJob | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<MediaBranch[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<MediaEvent[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const [jobsRes, summaryRes] = await Promise.all([listMediaJobs(), getMediaQueueSummary()]);
    setJobs(jobsRes.jobs);
    setSummary(summaryRes);
  }, []);

  const loadDetail = useCallback(async (jobId: string) => {
    const response = await getMediaJob(jobId);
    setSelectedJob(response.job);
    setSelectedBranches(response.branches);
    setSelectedEvents(response.events);
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        await loadQueue();
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Navbatni yuklab bo'lmadi");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    const interval = window.setInterval(() => {
      void loadQueue();
      if (detailOpen && selectedJobId) {
        void loadDetail(selectedJobId);
      }
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [detailOpen, loadDetail, loadQueue, selectedJobId]);

  const openDetail = async (jobId: string) => {
    setSelectedJobId(jobId);
    setDetailOpen(true);
    try {
      await loadDetail(jobId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Job tafsilotlarini yuklab bo'lmadi");
    }
  };

  const handleCancel = async (jobId: string) => {
    setCancellingId(jobId);
    try {
      await cancelMediaJob(jobId, "Admin panel orqali bekor qilindi");
      toast.success("Job bekor qilindi");
      await loadQueue();
      if (selectedJobId === jobId) {
        await loadDetail(jobId);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Jobni bekor qilib bo'lmadi");
    } finally {
      setCancellingId(null);
    }
  };

  const sortedEvents = useMemo(
    () => [...selectedEvents].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
    [selectedEvents],
  );

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title={title} subtitle={subtitle} />

      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "Jami", value: summary.total },
          { label: "Navbatda", value: summary.queued },
          { label: "Jarayonda", value: summary.running },
          { label: "Tayyor", value: summary.completed },
          { label: "Xato/Bekor", value: summary.failed + summary.cancelled },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Kontent</TableHead>
              <TableHead>Holat</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Davom etmoqda</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead>Qo'yilgan</TableHead>
              <TableHead className="w-36 text-right">Amallar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                  Yuklanmoqda...
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id} className="border-border">
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {job.content_title || "Kontent"} · {job.episode_number}-qism
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {job.channel_name || "Kanal"}{job.requested_by_name ? ` · ${job.requested_by_name}` : ""}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <MediaStatusBadge status={job.status} />
                      <p className="text-xs text-muted-foreground">{job.phase}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-40 space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{job.completed_branch_count}/{job.planned_branch_count || 0}</span>
                        <span>{Math.round(getMediaJobProgress(job))}%</span>
                      </div>
                      <Progress value={getMediaJobProgress(job)} className="h-2" />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatSeconds(job.elapsed_seconds)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(job.estimated_completion_at)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatRelativeTime(job.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openDetail(job.id)} className="border-border">
                        Ko'rish
                      </Button>
                      {["queued", "running", "uploading", "cancelling"].includes(job.status) ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={cancellingId === job.id}
                          onClick={() => handleCancel(job.id)}
                        >
                          Bekor qilish
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Media job tafsiloti</DialogTitle>
          </DialogHeader>

          {selectedJob ? (
            <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {selectedJob.content_title || "Kontent"} · {selectedJob.episode_number}-qism
                      </p>
                      <p className="text-xs text-muted-foreground">{selectedJob.channel_name || "Kanal"}</p>
                    </div>
                    <MediaStatusBadge status={selectedJob.status} />
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                    <div>
                      <p>R2 path</p>
                      <p className="mt-1 truncate font-mono text-foreground">{selectedJob.r2_base_path}</p>
                    </div>
                    <div>
                      <p>Oxirgi heartbeat</p>
                      <p className="mt-1 text-foreground">{formatDateTime(selectedJob.last_heartbeat_at)}</p>
                    </div>
                    <div>
                      <p>Tugash</p>
                      <p className="mt-1 text-foreground">{formatDateTime(selectedJob.completed_at || selectedJob.estimated_completion_at)}</p>
                    </div>
                  </div>

                  {selectedJob.failure_reason ? (
                    <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {selectedJob.failure_reason}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="mb-3 text-sm font-medium text-foreground">Branchlar</p>
                  <ScrollArea className="h-72">
                    <div className="space-y-3 pr-4">
                      {selectedBranches.map((branch) => (
                        <div key={branch.id} className="rounded-md border border-border px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">Branch {branch.branch_index + 1}</p>
                            <span className="text-xs text-muted-foreground">{branch.status}</span>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
                            <div>Boshlanish: <span className="text-foreground">{formatSeconds(branch.start_seconds)}</span></div>
                            <div>Tugash: <span className="text-foreground">{formatSeconds(branch.end_seconds)}</span></div>
                            <div>Resume: <span className="text-foreground">{formatSeconds(branch.resume_from_seconds)}</span></div>
                            <div>Segmentlar: <span className="text-foreground">{branch.segment_count}</span></div>
                          </div>
                          {branch.last_error ? (
                            <p className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{branch.last_error}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <p className="mb-3 text-sm font-medium text-foreground">Eventlar</p>
                <ScrollArea className="h-[30rem]">
                  <div className="space-y-3 pr-4">
                    {sortedEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Eventlar topilmadi</p>
                    ) : (
                      sortedEvents.map((event) => (
                        <div key={event.id} className="rounded-md border border-border px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">{event.message}</p>
                            <span className="text-xs text-muted-foreground">{event.level}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-muted-foreground">Tafsilotlar yuklanmoqda...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
