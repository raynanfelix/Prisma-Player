import EmbedPlayer from "@/features/player/components/EmbedPlayer";
import { createEmbedOriginTokenSafely, trustedEmbedHostFromHeaders } from "@/lib/security/embed-origin";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const trustedHost = trustedEmbedHostFromHeaders(requestHeaders);
  // Nonce desta renderização única (injetado pelo proxy e replicado no cookie
  // `pp_embed`). Token sem o nonce é rejeitado no consumo (RM-02).
  const renderNonce = requestHeaders.get("x-nonce") ?? "";
  const originToken = createEmbedOriginTokenSafely({ playerId: id, host: trustedHost, nonce: renderNonce || undefined });

  return <EmbedPlayer playerId={id} originToken={originToken} />;
}
