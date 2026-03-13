import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatErrorMessage } from "@/lib/errorMessage";
import {
  getMediaJob,
  getMediaJobProgress,
} from "@/lib/mediaService";
import { formatBytes } from "@/lib/storageAssets";
import {
  UploadTaskContext,
  type StartUploadTaskInput,
  type UploadTask,
  type UploadTaskContextValue,
} from "./uploadTrackerContext";

function createTaskId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function UploadTrackerDock({
  tasks,
  open,
  setOpen,
  dismissTask,
  clearFinishedTasks,
}: {
  tasks: UploadTask[];
  open: boolean;
  setOpen: (open: boolean) => void;
  dismissTask: (taskId: string) => void;
  clearFinishedTasks: () => void;
}) {
  const activeCount = tasks.filter((task) =>
    ["uploading", "processing"].includes(task.status),
  ).length;

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
      {open ? (
        <div className="pointer-events-auto w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Upload holati</p>
              <p className="text-xs text-muted-foreground">
                Faol: {activeCount}/{tasks.length}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={clearFinishedTasks}
              >
                Tozalash
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen(false)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
            {tasks.map((task) => {
              const icon =
                task.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : task.status === "failed" ? (
                  <CircleAlert className="h-4 w-4 text-destructive" />
                ) : (
                  <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                );

              return (
                <div
                  key={task.id}
                  className="rounded-xl border border-border bg-background/80 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {icon}
                        <p className="truncate text-sm font-medium text-foreground">
                          {task.title}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {task.errorMessage || task.phase || "Kutilmoqda"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => dismissTask(task.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {task.totalBytes > 0
                          ? `${formatBytes(task.loadedBytes)} / ${formatBytes(task.totalBytes)}`
                          : "Hajm aniqlanmoqda"}
                      </span>
                      <span>{task.progressPercent}%</span>
                    </div>
                    <Progress value={task.progressPercent} className="h-2" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-card px-4 py-3 shadow-xl transition hover:border-primary/40 hover:bg-card/95"
      >
        {activeCount > 0 ? (
          <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <Upload className="h-4 w-4 text-primary" />
        )}
        <div className="text-left">
          <p className="text-sm font-medium text-foreground">Yuklamalar</p>
          <p className="text-xs text-muted-foreground">
            {activeCount}/{tasks.length}
          </p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

export function UploadTrackerProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [open, setOpen] = useState(false);
  const tasksRef = useRef<UploadTask[]>([]);
  const redirectedTaskIdsRef = useRef<Set<string>>(new Set());
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const mutateTask = useCallback(
    (taskId: string, updater: (task: UploadTask) => UploadTask) => {
      setTasks((current) =>
        current.map((task) => (task.id === taskId ? updater(task) : task)),
      );
    },
    [],
  );

  const startTask = useCallback((input: StartUploadTaskInput) => {
    const now = Date.now();
    const taskId = createTaskId();

    setTasks((current) => [
      {
        id: taskId,
        title: input.title,
        status: "uploading",
        phase: input.phase || "Yuklanmoqda",
        progressPercent: 0,
        loadedBytes: 0,
        totalBytes: Math.max(Math.round(input.totalBytes || 0), 0),
        jobId: null,
        mediaStatus: null,
        errorMessage: null,
        redirectTo: input.redirectTo || null,
        createdAt: now,
        updatedAt: now,
        finishedAt: null,
      },
      ...current,
    ].slice(0, 10));

    setOpen(true);
    return taskId;
  }, []);

  const updateTask = useCallback(
    (taskId: string, patch: Partial<UploadTask>) => {
      mutateTask(taskId, (task) => ({
        ...task,
        ...patch,
        updatedAt: Date.now(),
      }));
    },
    [mutateTask],
  );

  const updateTaskProgress = useCallback(
    (
      taskId: string,
      details: UploadProgressDetails,
      patch: Partial<UploadTask> = {},
    ) => {
      mutateTask(taskId, (task) => ({
        ...task,
        ...patch,
        status: "uploading",
        progressPercent: details.percent,
        loadedBytes: details.loadedBytes,
        totalBytes: Math.max(details.totalBytes, task.totalBytes, details.loadedBytes),
        updatedAt: Date.now(),
      }));
    },
    [mutateTask],
  );

  const markTaskProcessing = useCallback(
    (taskId: string, job: MediaJob) => {
      mutateTask(taskId, (task) => ({
        ...task,
        status: "processing",
        jobId: job.id,
        mediaStatus: job.status,
        phase: job.phase || "Media qayta ishlanmoqda",
        progressPercent: getMediaJobProgress(job),
        loadedBytes: task.totalBytes || task.loadedBytes,
        totalBytes: task.totalBytes || task.loadedBytes,
        errorMessage: null,
        updatedAt: Date.now(),
      }));
      setOpen(true);
    },
    [mutateTask],
  );

  const completeTask = useCallback(
    (taskId: string, patch: Partial<UploadTask> = {}) => {
      const now = Date.now();
      mutateTask(taskId, (task) => ({
        ...task,
        ...patch,
        status: "completed",
        phase: patch.phase || task.phase || "Yakunlandi",
        progressPercent: 100,
        loadedBytes: task.totalBytes || task.loadedBytes,
        totalBytes: task.totalBytes || task.loadedBytes,
        errorMessage: null,
        updatedAt: now,
        finishedAt: now,
      }));
    },
    [mutateTask],
  );

  const failTask = useCallback(
    (taskId: string, error: unknown, patch: Partial<UploadTask> = {}) => {
      const now = Date.now();
      mutateTask(taskId, (task) => ({
        ...task,
        ...patch,
        status: "failed",
        phase: patch.phase || task.phase || "Xatolik yuz berdi",
        mediaStatus: "failed",
        errorMessage: formatErrorMessage(error, "Upload yakunlanmadi"),
        updatedAt: now,
        finishedAt: now,
      }));
      setOpen(true);
    },
    [mutateTask],
  );

  const dismissTask = useCallback((taskId: string) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, []);

  const clearFinishedTasks = useCallback(() => {
    setTasks((current) =>
      current.filter((task) => ["uploading", "processing"].includes(task.status)),
    );
  }, []);

  const pollKey = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "processing" && task.jobId)
        .map((task) => `${task.id}:${task.jobId}`)
        .join("|"),
    [tasks],
  );

  useEffect(() => {
    const pollableTasks = tasksRef.current.filter(
      (task) => task.status === "processing" && task.jobId,
    );

    if (pollableTasks.length === 0) {
      return;
    }

    let active = true;

    const pollJobs = async () => {
      const results = await Promise.all(
        pollableTasks.map(async (task) => {
          try {
            const response = await getMediaJob(task.jobId as string);
            return { taskId: task.id, job: response.job };
          } catch (error) {
            return { taskId: task.id, error };
          }
        }),
      );

      if (!active) return;

      results.forEach((result) => {
        if ("error" in result) {
          mutateTask(result.taskId, (task) => ({
            ...task,
            phase: task.phase || "Media holati tekshirilmoqda",
            updatedAt: Date.now(),
          }));
          return;
        }

        const { job } = result;
        const progress = getMediaJobProgress(job);
        const now = Date.now();

        mutateTask(result.taskId, (task) => {
          if (job.status === "completed") {
            return {
              ...task,
              status: "completed",
              mediaStatus: job.status,
              phase: job.phase || "Media tayyor",
              progressPercent: 100,
              loadedBytes: task.totalBytes || task.loadedBytes,
              totalBytes: task.totalBytes || task.loadedBytes,
              errorMessage: null,
              updatedAt: now,
              finishedAt: now,
            };
          }

          if (["failed", "cancelled"].includes(job.status)) {
            return {
              ...task,
              status: "failed",
              mediaStatus: job.status,
              phase: job.phase || "Media job to'xtadi",
              progressPercent: progress,
              errorMessage:
                job.failure_reason ||
                job.cancel_reason ||
                "Media job yakunlanmadi",
              updatedAt: now,
              finishedAt: now,
            };
          }

          return {
            ...task,
            status: "processing",
            mediaStatus: job.status,
            phase: job.phase || "Media qayta ishlanmoqda",
            progressPercent: progress,
            loadedBytes: task.totalBytes || task.loadedBytes,
            totalBytes: task.totalBytes || task.loadedBytes,
            updatedAt: now,
          };
        });
      });
    };

    void pollJobs();
    const interval = window.setInterval(() => {
      void pollJobs();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [mutateTask, pollKey]);

  useEffect(() => {
    const redirectTask = tasks.find(
      (task) =>
        task.status === "completed" &&
        task.redirectTo &&
        !redirectedTaskIdsRef.current.has(task.id),
    );

    if (!redirectTask?.redirectTo) {
      return;
    }

    redirectedTaskIdsRef.current.add(redirectTask.id);

    if (location.pathname !== redirectTask.redirectTo) {
      navigate(redirectTask.redirectTo);
    }
  }, [location.pathname, navigate, tasks]);

  const value = useMemo<UploadTaskContextValue>(
    () => ({
      tasks,
      startTask,
      updateTask,
      updateTaskProgress,
      markTaskProcessing,
      completeTask,
      failTask,
      dismissTask,
      clearFinishedTasks,
    }),
    [
      clearFinishedTasks,
      completeTask,
      dismissTask,
      failTask,
      markTaskProcessing,
      startTask,
      tasks,
      updateTask,
      updateTaskProgress,
    ],
  );

  return (
    <UploadTaskContext.Provider value={value}>
      {children}
      <UploadTrackerDock
        tasks={tasks}
        open={open}
        setOpen={setOpen}
        dismissTask={dismissTask}
        clearFinishedTasks={clearFinishedTasks}
      />
    </UploadTaskContext.Provider>
  );
}
