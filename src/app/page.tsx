import { redirect } from "next/navigation";

/**
 * Raiz do app (app.prismaplayer.online): redireciona para /login.
 * O site de marketing vive em prismaplayer.online (repo separado);
 * quem acessa o domínio do app quer entrar na aplicação.
 */
export default function Home() {
  redirect("/login");
}