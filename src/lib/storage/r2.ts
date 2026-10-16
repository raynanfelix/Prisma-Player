import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2ErrorShape = Error & {
  Code?: string;
  code?: string;
  $metadata?: { httpStatusCode?: number; requestId?: string };
};

export function describeR2Error(error: unknown) {
  const candidate = error as R2ErrorShape;
  const providerCode = String(candidate?.Code || candidate?.code || candidate?.name || "unknown");
  const normalized = providerCode.toLowerCase();
  const internalMessage = String(candidate?.message || "");
  let code = "r2_operation_failed";
  let message = "O R2 recusou a operação. Confira as credenciais e a configuração do bucket.";

  if (internalMessage.startsWith("invalid_cloudflare_r2_")) {
    code = "r2_invalid_configuration";
    message = "Uma variável CLOUDFLARE_R2 está ausente, contém quebra de linha ou usa um endpoint inválido.";
  } else if (["accessdenied", "forbidden"].includes(normalized)) {
    code = "r2_access_denied";
    message = "O token do R2 não tem permissão Object Read & Write neste bucket.";
  } else if (["invalidaccesskeyid", "signaturedoesnotmatch", "invalidtoken", "invalidsignatureexception"].includes(normalized)) {
    code = "r2_invalid_credentials";
    message = "Access Key ID ou Secret Access Key do R2 inválidos. Não use o valor do API Token como credencial S3.";
  } else if (normalized === "nosuchbucket") {
    code = "r2_bucket_not_found";
    message = "O bucket configurado não existe nesta conta do Cloudflare R2.";
  } else if (["permanentredirect", "authorizationheadermalformed", "illegallocationconstraintexception"].includes(normalized)) {
    code = "r2_endpoint_mismatch";
    message = "O endpoint não corresponde à conta ou à jurisdição do bucket R2.";
  } else if (["timeouterror", "networkingerror", "enotfound", "econnrefused"].includes(normalized) || candidate?.message === "fetch failed") {
    code = "r2_unreachable";
    message = "Não foi possível alcançar o endpoint S3 do Cloudflare R2.";
  }

  return {
    code,
    message,
    providerCode,
    status: candidate?.$metadata?.httpStatusCode,
    requestId: candidate?.$metadata?.requestId,
  };
}

function endpoint() {
  const configured = process.env.CLOUDFLARE_R2_ENDPOINT?.trim();
  if (!configured) return `https://${required("CLOUDFLARE_R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
  if (/\r|\n/.test(configured)) throw new Error("invalid_cloudflare_r2_endpoint");
  const url = new URL(configured);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".r2.cloudflarestorage.com")) throw new Error("invalid_cloudflare_r2_endpoint");
  return url.origin;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value || /[\r\n]/.test(value)) throw new Error(`invalid_${name.toLowerCase()}`);
  return value;
}

function client() {
  return new S3Client({
    region: "auto",
    endpoint: endpoint(),
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("CLOUDFLARE_R2_ACCESS_KEY_ID"),
      secretAccessKey: required("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    },
  });
}

const bucket = () => required("CLOUDFLARE_R2_BUCKET");

export async function createR2MultipartUpload(key: string, contentType: string, metadata: Record<string, string>) {
  const result = await client().send(new CreateMultipartUploadCommand({
    Bucket: bucket(), Key: key, ContentType: contentType, CacheControl: "private, max-age=0, no-store", Metadata: metadata,
  }));
  if (!result.UploadId) throw new Error("r2_upload_id_missing");
  return result.UploadId;
}

export function signR2UploadPart(key: string, uploadId: string, partNumber: number) {
  return getSignedUrl(client(), new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 300 });
}

export async function completeR2MultipartUpload(key: string, uploadId: string, parts: Array<{ ETag: string; PartNumber: number }>) {
  await client().send(new CompleteMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }));
  return client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
}

export function abortR2MultipartUpload(key: string, uploadId: string) {
  return client().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
}

/** Confirma que o objeto existe no bucket (usado ao promover um vídeo a "ready"). */
export function headR2Object(key: string) {
  return client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
}

export function deleteR2Object(key: string) {
  return client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Envia um objeto completo (assets de player: ≤10 MB, sem multipart). */
export function uploadR2Object(key: string, body: Buffer | Uint8Array, contentType: string, cacheControl: string) {
  return client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }));
}

/**
 * Lista objetos sob um prefixo (tamanho incluso). Usado para somar os bytes de
 * assets já enviados por um vídeo na checagem de quota do estúdio.
 */
export async function listR2Objects(prefix: string, maxKeys = 100) {
  const result = await client().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, MaxKeys: maxKeys }));
  return (result.Contents ?? [])
    .filter((item): item is { Key: string; Size?: number } => typeof item.Key === "string")
    .map((item) => ({ key: item.Key, size: Number(item.Size ?? 0) }));
}

export function copyR2Object(sourceKey: string, destinationKey: string, contentType: string) {
  return client().send(new CopyObjectCommand({ Bucket: bucket(), Key: destinationKey, CopySource: `${bucket()}/${encodeURIComponent(sourceKey).replace(/%2F/g, "/")}`, ContentType: contentType, MetadataDirective: "REPLACE" }));
}

export function signR2ReadUrl(key: string, expiresIn = 900) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export function r2MaxUploadBytes() {
  const configured = Number(process.env.R2_MAX_UPLOAD_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 20 * 1024 ** 3;
}
