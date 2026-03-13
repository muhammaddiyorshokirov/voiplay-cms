import { useContext } from "react";
import { UploadTaskContext } from "@/components/uploads/uploadTrackerContext";

export function useUploadTracker() {
  const context = useContext(UploadTaskContext);

  if (!context) {
    throw new Error("useUploadTracker must be used within UploadTrackerProvider");
  }

  return context;
}
