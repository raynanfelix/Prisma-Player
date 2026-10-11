import AnalyticsWorkspace from "@/features/analytics/components/AnalyticsWorkspace";

export default async function VideoAnalyticsPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  return <AnalyticsWorkspace videoId={videoId} />;
}
