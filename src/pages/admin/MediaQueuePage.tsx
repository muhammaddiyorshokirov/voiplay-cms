import { MediaQueuePageView } from "@/components/media/MediaQueuePageView";

export default function MediaQueuePage() {
  return (
    <MediaQueuePageView
      title="Media navbati"
      subtitle="Barcha HLS joblar va ularning holati"
      emptyMessage="Hozircha media navbatlari yo'q"
    />
  );
}
