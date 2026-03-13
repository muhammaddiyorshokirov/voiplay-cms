export interface UploadProgressDetails {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
}

export function createUploadProgressDetails(
  loadedBytes: number,
  totalBytes: number,
): UploadProgressDetails {
  const safeLoaded = Math.max(Math.round(loadedBytes || 0), 0);
  const safeTotal = Math.max(Math.round(totalBytes || 0), safeLoaded, 0);
  const percent =
    safeTotal > 0
      ? Math.min(Math.round((safeLoaded / safeTotal) * 100), 100)
      : 0;

  return {
    loadedBytes: safeLoaded,
    totalBytes: safeTotal,
    percent,
  };
}

export function combineUploadProgress(
  details: UploadProgressDetails,
  totalBytes?: number | null,
  offsetBytes = 0,
): UploadProgressDetails {
  const safeOffset = Math.max(Math.round(offsetBytes || 0), 0);
  const resolvedTotal = Math.max(
    Math.round(totalBytes || 0),
    safeOffset + Math.round(details.totalBytes || 0),
    safeOffset + Math.round(details.loadedBytes || 0),
  );
  const loadedBytes = Math.min(
    safeOffset + Math.round(details.loadedBytes || 0),
    resolvedTotal,
  );

  return createUploadProgressDetails(loadedBytes, resolvedTotal);
}
