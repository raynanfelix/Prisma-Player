import { beforeEach, describe, expect, it, vi } from "vitest";

const r2State = vi.hoisted(() => ({
  /** Objeto S3 ({ Body }) devolvido por send. */
  body: null as unknown,
  /** Quando definido, o próprio send rejeita (R2 fora do ar). */
  sendError: null as Error | null,
  /** Inputs dos GetObjectCommand recebidos por send (contrato do Range GET). */
  commands: [] as Array<{ Bucket?: string; Key?: string; Range?: string }>,
}));

// O alvo aqui é o PARSER real (src/lib/storage/faststart.ts), não o S3:
// mockamos só o client do R2 e construímos os bytes na mão.
vi.mock("@/lib/storage/r2", () => ({
  bucket: () => "bucket-teste",
  client: () => ({
    send: async (command: { input: { Bucket?: string; Key?: string; Range?: string } }) => {
      r2State.commands.push(command.input);
      if (r2State.sendError) throw r2State.sendError;
      return { Body: r2State.body };
    },
  }),
}));

import { detectMp4Faststart } from "@/lib/storage/faststart";

/** Janela que o helper pede: Range GET de 64 KiB. */
const WINDOW = 65_536;
const OBJECT_PATH = "user-owner/vsl.mp4";

/** Body lido via transformToByteArray — o caminho primário do SDK v3. */
function byteArrayBody(bytes: Uint8Array) {
  return { transformToByteArray: async () => bytes };
}

/**
 * Prefixo de até 64 KiB com as marcas de átomo nos offsets pedidos.
 * Preenchido com zeros: nenhuma colisão acidental com "moov"/"mdat".
 */
function windowBytes(marks: Array<{ mark: string; at: number }>, size = WINDOW): Buffer {
  const bytes = Buffer.alloc(size, 0);
  for (const { mark, at } of marks) bytes.write(mark, at, "ascii");
  return bytes;
}

beforeEach(() => {
  r2State.body = null;
  r2State.sendError = null;
  r2State.commands = [];
});

describe("detectMp4Faststart — parser (sem rede)", () => {
  it("faz exatamente um Range GET de 64 KiB no objeto pedido", async () => {
    r2State.body = byteArrayBody(windowBytes([{ mark: "moov", at: 8 }, { mark: "mdat", at: 4096 }]));
    await detectMp4Faststart(OBJECT_PATH);
    expect(r2State.commands).toHaveLength(1);
    expect(r2State.commands[0]).toMatchObject({ Bucket: "bucket-teste", Key: OBJECT_PATH, Range: "bytes=0-65535" });
  });

  it("(a) moov antes de mdat → true", async () => {
    r2State.body = byteArrayBody(windowBytes([{ mark: "moov", at: 4 }, { mark: "mdat", at: 100 }]));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(true);
  });

  it("(b) mdat antes de moov → false", async () => {
    r2State.body = byteArrayBody(windowBytes([{ mark: "mdat", at: 4 }, { mark: "moov", at: 100 }]));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(false);
  });

  it("(c) só moov, sem mdat → true (índice na frente)", async () => {
    r2State.body = byteArrayBody(windowBytes([{ mark: "moov", at: 16 }]));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(true);
  });

  it("(d) bytes sem nenhuma marca → null; body vazio → null", async () => {
    r2State.body = byteArrayBody(windowBytes([], 1024));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(null);
    r2State.body = byteArrayBody(Buffer.alloc(0));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(null);
  });

  it("(e) Body que lança → null (best-effort), nunca propaga", async () => {
    r2State.body = { transformToByteArray: async () => { throw new Error("stream corrompido"); } };
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(null);
    r2State.sendError = new Error("r2 indisponível");
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(null);
  });

  it("(f) sem transformToByteArray: fallback que também falha → null, sem lançar", async () => {
    // Forma desconhecida: o for-await lança dentro do helper e vira null.
    r2State.body = {};
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(null);
    // Blob cujo arrayBuffer rejeita: mesmo catch do best-effort.
    class BlobQueFalha extends Blob {
      async arrayBuffer(): Promise<ArrayBuffer> {
        throw new Error("blob ilegível");
      }
    }
    r2State.body = new BlobQueFalha([new Uint8Array(windowBytes([{ mark: "moov", at: 0 }]))]);
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(null);
    // Stream async-iterável que quebra no meio da leitura.
    r2State.body = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from("moov");
        throw new Error("conexão caiu");
      },
    };
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(null);
  });

  it("fallbacks que funcionam também alimentam o parser (Blob, stream e Uint8Array direto)", async () => {
    r2State.body = new Blob([new Uint8Array(windowBytes([{ mark: "moov", at: 0 }, { mark: "mdat", at: 1000 }]))]);
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(true);
    r2State.body = new Blob([new Uint8Array(windowBytes([{ mark: "mdat", at: 0 }, { mark: "moov", at: 1000 }]))]);
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(false);
    // Chunks concatenados: moov no primeiro, mdat no segundo.
    r2State.body = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from("....moov");
        yield Buffer.from("....mdat");
      },
    };
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(true);
    // Body que já é Uint8Array: caminho direto do helper.
    r2State.body = windowBytes([{ mark: "moov", at: 0 }, { mark: "mdat", at: 10 }]);
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(true);
  });

  it("(g) marcas em offsets variados dentro da janela de 64 KiB (não só 0-15)", async () => {
    // moov no meio dos 64 KiB, mdat no fim.
    r2State.body = byteArrayBody(windowBytes([{ mark: "mdat", at: 60_000 }, { mark: "moov", at: 30_000 }]));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(true);
    r2State.body = byteArrayBody(windowBytes([{ mark: "moov", at: 60_000 }, { mark: "mdat", at: 30_000 }]));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(false);
    // Marca encostada no fim exato da janela (últimos 4 bytes do Range).
    r2State.body = byteArrayBody(windowBytes([{ mark: "moov", at: WINDOW - 4 }]));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(true);
    r2State.body = byteArrayBody(windowBytes([{ mark: "mdat", at: WINDOW - 4 }]));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(false);
  });

  it("(g+) arquivo maior que a janela: só os primeiros 64 KiB são vistos", async () => {
    // S3 honra o Range: o moov depois do byte 65535 não aparece no resultado.
    const bigFile = windowBytes([{ mark: "mdat", at: 500 }, { mark: "moov", at: 66_000 }], 70_000);
    r2State.body = byteArrayBody(bigFile.subarray(0, WINDOW));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(false);
    const onlyLateMoov = windowBytes([{ mark: "moov", at: 66_000 }], 70_000);
    r2State.body = byteArrayBody(onlyLateMoov.subarray(0, WINDOW));
    await expect(detectMp4Faststart(OBJECT_PATH)).resolves.toBe(null);
  });
});
