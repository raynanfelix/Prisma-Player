# Cloudflare R2 — vídeos da Prisma

## Arquitetura

- O bucket permanece privado.
- O navegador envia partes de 25 MiB diretamente ao endpoint S3 do R2.
- A API cria URLs pré-assinadas de 15 minutos; as chaves S3 nunca chegam ao cliente.
- A reprodução usa uma URL GET temporária de seis horas para suportar VSLs longas e requisições HTTP Range tardias.
- Vídeos antigos continuam no Supabase Storage por meio de `videos.storage_provider`.
- Uploads incompletos são abortados pela aplicação e pelo lifecycle padrão do R2 após sete dias.

## Configuração no Cloudflare

1. Em **R2 Object Storage**, crie o bucket `prisma-videos` na classe **Standard**.
2. Mantenha **Public Development URL (r2.dev) desativada**.
3. Em **Manage R2 API Tokens**, crie um token **Object Read & Write**, limitado somente ao bucket.
   - Copie especificamente **Access Key ID** e **Secret Access Key** exibidos ao criar o token.
   - O valor chamado apenas de **API Token** não substitui essas duas credenciais S3.
4. Em **Bucket > Settings > CORS**, aplique:

```json
[
  {
    "AllowedOrigins": ["https://prisma-player.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Remova `localhost` quando não for mais necessário. O `ETag` exposto é obrigatório para concluir o multipart.

Use esta política no bucket que recebe uploads pelo navegador. A origem não pode
conter barra no final nem caminho. Depois de salvar, aguarde até 30 segundos:

```json
[
  {
    "AllowedOrigins": [
      "https://prisma-player.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "x-amz-checksum-crc32", "x-amz-sdk-checksum-algorithm"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

Um `OPTIONS 403` indica que a origem ou o método `PUT` não corresponde à regra
do bucket. Os parâmetros `X-Amz-*`, `uploadId` e `partNumber` no Network são a
autorização temporária normal do multipart; a Secret Access Key nunca é enviada
ao navegador. As URLs de upload expiram em cinco minutos.

## Variáveis na Vercel

```text
CLOUDFLARE_R2_ACCOUNT_ID=
# Opcional. Deixe vazio para usar o endpoint S3 padrao derivado do Account ID.
CLOUDFLARE_R2_ENDPOINT=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=prisma-videos
R2_MAX_UPLOAD_BYTES=21474836480
```

Configure nos ambientes necessários e faça um novo deploy. Nunca use `NEXT_PUBLIC_` nessas credenciais.

O endpoint padrão tem o formato `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` e já é montado pela aplicação. Preencha `CLOUDFLARE_R2_ENDPOINT` somente quando o bucket estiver vinculado a uma jurisdição específica, como União Europeia. Não use o endpoint público `r2.dev` neste campo.

Depois de alterar qualquer variável na Vercel, faça um novo deploy. Confirme também que `CLOUDFLARE_R2_BUCKET` é exatamente o nome do bucket e que o token foi limitado a esse mesmo bucket.

## Banco e produção

- Execute `20260718000500_cloudflare_r2_video_storage.sql` antes do deploy.
- Sem as quatro variáveis obrigatórias, a aplicação mantém o fallback do Supabase Storage.
- Não use `r2.dev` em produção; ele possui rate limit.
- Para VSLs, use Standard. Infrequent Access cobra recuperação e tem permanência mínima.
- Monitore Storage, Class A e Class B. O egress é gratuito, mas armazenamento e operações não são.
