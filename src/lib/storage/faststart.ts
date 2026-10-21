import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";

import { bucket, client } from "@/lib/storage/r2";

/**
 * Detecta faststart (moov atom no início do arquivo) de um MP4 no R2.
 * Best-effort: NUNCA lança - objeto ilegível, ausente ou sem as marcas de
 * átomo nos primeiros bytes devolvem null em vez de booleano.
 *
 * Lê só os primeiros 64 KiB (Range GET): o "moov" de um MP4 com faststart
 * cabe no início; num MP4 sem faststart o "mdat" (a mídia em si) aparece
 * primeiro e o "moov" fica no fim do arquivo.
 */
export async function detectMp4Faststart(objectPath: string): Promise<boolean | null> {
  try {
    const result = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: objectPath, Range: "bytes=0-65535" }));
    const bytes = await bodyBytes(result.Body);
    if (!bytes || bytes.length === 0) return null;
    const moov = bytes.indexOf("moov");
    const mdat = bytes.indexOf("mdat");
    if (moov === -1 && mdat === -1) return null; // nem parece MP4 nos primeiros bytes
    if (mdat === -1) return true; // moov presente, mdat ausente: índice na frente
    if (moov === -1) return false; // mdat na frente: moov (se existir) vem depois
    return moov < mdat;
  } catch {
    return null;
  }
}

/**
 * Body do S3 SDK v3 varia por runtime (Readable no Node, ReadableStream/Blob
 * na web). Aceita qualquer forma e devolve Buffer, ou null quando não
 * conseguir ler - a detecção degrada para "indeterminado", nunca quebra.
 */
async function bodyBytes(body: unknown): Promise<Buffer | null> {
  try {
    if (body instanceof Uint8Array) return Buffer.from(body);
    const stream = body as { transformToByteArray?: () => Promise<Uint8Array> };
    if (typeof stream?.transformToByteArray === "function") return Buffer.from(await stream.transformToByteArray());
    if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}
