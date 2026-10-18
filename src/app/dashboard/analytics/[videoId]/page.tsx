import AnalyticsWorkspace from "@/features/analytics/components/AnalyticsWorkspace";

export default async function VideoAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { videoId } = await params;
  return <AnalyticsWorkspace videoId={videoId} />;
}
