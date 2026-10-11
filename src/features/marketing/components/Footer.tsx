export default function Footer() {
  return (
    <footer className="themeable-bg-canvas-parchment pt-16 pb-8 px-6">
      <div className="max-w-[980px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <h4 className="text-caption-strong themeable-text-ink-muted-48 mb-4 uppercase tracking-wider">
              Produto
            </h4>
            <ul className="space-y-2">
              {[
                "Início",
                "Headlines AI",
                "Smart Autoplay",
                "Turbo Playback",
                "Teste A/B",
                "Analytics",
              ].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className="text-fine themeable-text-ink-muted-48 hover:text-prisma-blue transition-colors"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-caption-strong themeable-text-ink-muted-48 mb-4 uppercase tracking-wider">
              Empresa
            </h4>
            <ul className="space-y-2">
              {[
                "Sobre nós",
                "Trabalhe Conosco",
                "Parcerias",
                "Podcast",
                "Blog",
              ].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className="text-fine themeable-text-ink-muted-48 hover:text-prisma-blue transition-colors"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-caption-strong themeable-text-ink-muted-48 mb-4 uppercase tracking-wider">
              Legal
            </h4>
            <ul className="space-y-2">
              {[
                { label: "Termos de Uso", href: "/terms" },
                { label: "Política de Privacidade", href: "/privacy" },
                { label: "Canal de Denúncias", href: "mailto:privacidade@prismaplayer.com.br" },
              ].map(
                (item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="text-fine themeable-text-ink-muted-48 hover:text-prisma-blue transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                )
              )}
            </ul>
          </div>
          <div>
            <h4 className="text-caption-strong themeable-text-ink-muted-48 mb-4 uppercase tracking-wider">
              Ajuda
            </h4>
            <ul className="space-y-2">
              {["Central de Ajuda", "WhatsApp", "contato@prismaplayer.com.br"].map(
                (item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-fine themeable-text-ink-muted-48 hover:text-prisma-blue transition-colors"
                    >
                      {item}
                    </a>
                  </li>
                )
              )}
            </ul>
          </div>
        </div>
        <div className="border-t themeable-border-hairline pt-6">
          <p className="text-fine themeable-text-ink-muted-48 text-center">
            &copy; Prisma Player Ltda {new Date().getFullYear()}. Todos os direitos
            reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
