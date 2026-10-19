"use client";

export default function LogosBar() {
  const platforms = [
    { name: "Kiwify", tag: "EMBED COMPATÍVEL" },
    { name: "Hotmart", tag: "EMBED COMPATÍVEL" },
    { name: "Perfect Pay", tag: "EMBED COMPATÍVEL" },
    { name: "Monetizze", tag: "EMBED COMPATÍVEL" },
    { name: "ActiveCampaign", tag: "EMBED COMPATÍVEL" },
    { name: "Elementor & WordPress", tag: "EMBED 1 CLIQUE" },
  ];

  return (
    <section className="border-y border-[#191A23]/[0.06] bg-white py-12">
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[#191A23]/35">
          Funciona com as principais plataformas e construtores do mercado digital
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {platforms.map((p) => (
            <div key={p.name} className="group flex flex-col items-center gap-0.5">
              <span className="text-[15px] font-semibold tracking-tight text-[#191A23]/45 transition-colors group-hover:text-[#191A23]/80">
                {p.name}
              </span>
              <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#191A23]/25">
                {p.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
