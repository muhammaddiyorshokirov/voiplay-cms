import { MediaQueuePageView } from "@/components/media/MediaQueuePageView";

export default function CMMediaQueuePage() {
  return (
    <MediaQueuePageView
      title="Media navbatim"
      subtitle="O'zingizga tegishli HLS joblar"
      emptyMessage="Sizda hozircha media navbatlari yo'q"
    />
  );
}
