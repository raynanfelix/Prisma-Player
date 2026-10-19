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
    <section className="bg-white py-10 border-y-2 border-[#191A23]/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-[#191A23]/60 mb-6">
          Funciona com as principais plataformas e construtores do mercado digital
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {platforms.map((p) => (
            <div
              key={p.name}
              className="flex flex-col items-center justify-center rounded-2xl border border-[#191A23]/10 bg-white p-4 text-center shadow-[3px_3px_0px_#191A23] hover:bg-[#B9FF66]/40 transition-colors group cursor-default"
            >
              <span className="text-base font-black text-[#191A23] tracking-tight">
                {p.name}
              </span>
              <span className="mt-1 text-[9px] font-bold tracking-wider text-[#191A23]/70 uppercase group-hover:text-[#191A23]">
                {p.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
