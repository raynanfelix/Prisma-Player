import AbTestPlayer from "@/features/player/components/AbTestPlayer";
import { createEmbedOriginTokenSafely, trustedEmbedHostFromHeaders } from "@/lib/security/embed-origin";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AbEmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const trustedHost = trustedEmbedHostFromHeaders(requestHeaders);
  const renderNonce = requestHeaders.get("x-nonce") ?? "";
  // RM-04: o token do embed A/B é mintado no escopo do TESTE (playerId = testId
  // + claim `abTest`), nunca com curinga `*`. O curinga antigo era aceito por
  // `verifyEmbedOriginToken` contra QUALQUER playerId da plataforma.
  const originToken = createEmbedOriginTokenSafely({ playerId: id, abTestId: id, host: trustedHost, nonce: renderNonce || undefined });

  return <AbTestPlayer testId={id} originToken={originToken} />;
}
