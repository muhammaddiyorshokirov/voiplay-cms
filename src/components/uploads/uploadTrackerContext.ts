import { createContext } from "react";
import type { MediaJob } from "@/lib/mediaService";
import type { UploadProgressDetails } from "@/lib/uploadProgress";

export type UploadTaskStatus = "uploading" | "processing" | "completed" | "failed";

export interface UploadTask {
  id: string;
  title: string;
  status: UploadTaskStatus;
  phase: string | null;
  progressPercent: number;
  loadedBytes: number;
  totalBytes: number;
  jobId: string | null;
  mediaStatus: string | null;
  errorMessage: string | null;
  redirectTo: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
}

export interface StartUploadTaskInput {
  title: string;
  phase?: string | null;
  totalBytes?: number | null;
  redirectTo?: string | null;
}

export interface UploadTaskContextValue {
  tasks: UploadTask[];
  startTask: (input: StartUploadTaskInput) => string;
  updateTask: (taskId: string, patch: Partial<UploadTask>) => void;
  updateTaskProgress: (
    taskId: string,
    details: UploadProgressDetails,
    patch?: Partial<UploadTask>,
  ) => void;
  markTaskProcessing: (taskId: string, job: MediaJob) => void;
  completeTask: (taskId: string, patch?: Partial<UploadTask>) => void;
  failTask: (taskId: string, error: unknown, patch?: Partial<UploadTask>) => void;
  dismissTask: (taskId: string) => void;
  clearFinishedTasks: () => void;
}

export const UploadTaskContext = createContext<UploadTaskContextValue | null>(null);
