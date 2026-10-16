import { getAuth } from "@/lib/auth/server";

/**
 * Proxy das rotas do Managed Better Auth (Neon Auth): /api/auth/sign-in/email,
 * /api/auth/get-session, /api/auth/sign-out, /api/auth/callback/* (OAuth), etc.
 *
 * Rotas específicas em src/app/api/auth/{login,signup,logout,reset,...} têm
 * precedência sobre este catch-all — elas preservam os contratos que a UI já
 * consome e chamam o SDK server-side por cima deste mesmo `auth`.
 *
 * A resolução é lazy (por requisição) para o build não exigir NEON_AUTH_*.
 *
 * Tipos: o segmento é [...all], então o Next 16 exige params { all: string[] }
 * no handler exportado. O SDK tipa os handlers dele com o próprio `Params`
 * (convenção { path: string[] }) e resolve a rota pela URL do request — os
 * params nunca são lidos em runtime, por isso o cast na chamada é seguro.
 */

type NextRouteContext = { params: Promise<{ all: string[] }> };

type AuthHandler = (request: Request, context: { params: Promise<unknown> }) => Promise<Response>;

function handlers(): Record<"GET" | "POST" | "PUT" | "DELETE" | "PATCH", AuthHandler> {
  return getAuth().handler() as unknown as Record<"GET" | "POST" | "PUT" | "DELETE" | "PATCH", AuthHandler>;
}

export async function GET(request: Request, context: NextRouteContext) {
  return handlers().GET(request, context);
}

export async function POST(request: Request, context: NextRouteContext) {
  return handlers().POST(request, context);
}

export async function PUT(request: Request, context: NextRouteContext) {
  return handlers().PUT(request, context);
}

export async function DELETE(request: Request, context: NextRouteContext) {
  return handlers().DELETE(request, context);
}

export async function PATCH(request: Request, context: NextRouteContext) {
  return handlers().PATCH(request, context);
}
