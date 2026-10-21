import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false, noarchive: true } };

/**
 * Preconnect ao endpoint do R2: o DNS + TLS do storage custa ~100-300ms e
 * antes só começava DEPOIS de a config assinada chegar (o `source` é a
 * primeira URL do R2 que o navegador vê). Com o preconnect no <head>, a
 * conexão abre em paralelo com o fetch de config - quando o source chega,
 * o handshake já foi pago. O endpoint é o mesmo de lib/storage/r2 (env
 * CLOUDFLARE_R2_ENDPOINT com prioridade, senão account id); aqui é
 * best-effort: sem env configurado o embed segue funcionando sem preconnect.
 */
function r2Origin(): string | null {
  try {
    const configured = process.env.CLOUDFLARE_R2_ENDPOINT?.trim();
    if (configured) return new URL(configured).origin;
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
    if (accountId) return `https://${accountId}.r2.cloudflarestorage.com`;
    return null;
  } catch {
    return null;
  }
}

const R2_ORIGIN = r2Origin();

export default function EmbedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {R2_ORIGIN ? (
        <>
          {/* Sem crossOrigin: o <video> do player busca o source em modo
              no-cors; o preconnect precisa abrir o mesmo tipo de conexão. */}
          <link rel="preconnect" href={R2_ORIGIN} />
          <link rel="dns-prefetch" href={R2_ORIGIN} />
        </>
      ) : null}
      <style>{`html,body{height:auto!important;min-height:0!important;overflow:hidden!important;background:transparent!important;background-color:transparent!important;color-scheme:normal!important}body{margin:0!important}`}</style>
      {children}
    </>
  );
}
