import { getAuth } from "@/lib/auth/server";

/**
 * Proxy das rotas do Managed Better Auth (Neon Auth): /api/auth/sign-in/social,
 * /api/auth/sign-in/email, /api/auth/get-session, /api/auth/sign-out,
 * /api/auth/callback/* (OAuth), etc.
 *
 * Rotas específicas em src/app/api/auth/{login,signup,logout,reset,...} têm
 * precedência sobre este catch-all - elas preservam os contratos que a UI já
 * consome e chamam o SDK server-side por cima deste mesmo `auth`.
 *
 * A resolução é lazy (por requisição) para o build não exigir NEON_AUTH_*.
 *
 * O segmento PRECISA chamar-se [...path]: o handler do SDK lê
 * `(await params).path.join("/")` em TODA request (dist/next/server/index.mjs
 * linha 69) para montar o caminho upstream. Como [...all] o params resolvia
 * { all: string[] } e `params.path` era undefined => TypeError "reading 'join'"
 * - bug latente que só apareceu no primeiro fluxo que atravessa o catch-all
 * (sign-in/social do botão Google; login/signup de e-mail usam rotas próprias).
 * [...path] é o mounting canônico da doc oficial do Neon.
 */

type NextRouteContext = { params: Promise<{ path: string[] }> };

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
