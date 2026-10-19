"use client";

import { useState } from "react";
import { Send, CheckCircle } from "lucide-react";

export default function ContactForm() {
  const [profileType, setProfileType] = useState<"produtor" | "afiliado">("produtor");
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="contato" className="scroll-mt-28 bg-[#FAFAFB] px-4 py-20 sm:px-6 md:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#191A23]/50 ring-1 ring-[#191A23]/[0.06]">
            Fale Conosco
          </span>
          <h2 className="mt-5 text-balance text-[22px] font-medium leading-snug tracking-tight text-[#191A23] sm:text-[26px]">
            Tem alguma dúvida sobre migração de VSL, integração ou planos corporativos? Envie sua
            mensagem.
          </h2>
        </div>

        <div className="mt-14 rounded-[32px] border border-[#191A23]/[0.07] bg-white p-7 sm:p-10">
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              {submitted ? (
                <div className="rounded-[24px] bg-[#B9FF66]/30 p-8 text-center">
                  <CheckCircle className="mx-auto h-10 w-10 text-[#191A23]" />
                  <h3 className="mt-4 text-[19px] font-semibold tracking-tight text-[#191A23]">
                    Mensagem Enviada com Sucesso!
                  </h3>
                  <p className="mt-2 text-[13px] text-[#191A23]/60">
                    Nosso time técnico entrará em contato com você via e-mail ou WhatsApp.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <legend className="sr-only">Tipo de perfil</legend>
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="radio"
                        name="profile"
                        checked={profileType === "produtor"}
                        onChange={() => setProfileType("produtor")}
                        className="h-4 w-4 cursor-pointer accent-[#191A23]"
                      />
                      <span className="text-[13px] font-medium text-[#191A23]">
                        Sou Produtor / Coprodutor
                      </span>
                    </label>

                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="radio"
                        name="profile"
                        checked={profileType === "afiliado"}
                        onChange={() => setProfileType("afiliado")}
                        className="h-4 w-4 cursor-pointer accent-[#191A23]"
                      />
                      <span className="text-[13px] font-medium text-[#191A23]">
                        Sou Afiliado / Agência
                      </span>
                    </label>
                  </fieldset>

                  <div className="space-y-1.5">
                    <label htmlFor="contact-name" className="block text-[12px] font-medium text-[#191A23]/60">
                      Nome Completo*
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      name="name"
                      autoComplete="name"
                      required
                      placeholder="Seu nome"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full rounded-2xl border border-[#191A23]/[0.08] bg-[#FAFAFB] px-4 py-3 text-[14px] text-[#191A23] outline-none transition placeholder:text-[#191A23]/30 focus:border-[#191A23]/20 focus:bg-white focus:ring-4 focus:ring-[#B9FF66]/30"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="contact-email" className="block text-[12px] font-medium text-[#191A23]/60">
                      E-mail Corporativo ou WhatsApp*
                    </label>
                    <input
                      id="contact-email"
                      type="text"
                      name="email"
                      autoComplete="email"
                      spellCheck={false}
                      required
                      placeholder="seuemail@empresa.com ou (11) 99999-9999"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full rounded-2xl border border-[#191A23]/[0.08] bg-[#FAFAFB] px-4 py-3 text-[14px] text-[#191A23] outline-none transition placeholder:text-[#191A23]/30 focus:border-[#191A23]/20 focus:bg-white focus:ring-4 focus:ring-[#B9FF66]/30"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="contact-message" className="block text-[12px] font-medium text-[#191A23]/60">
                      Como podemos ajudar sua operação?*
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      rows={4}
                      required
                      placeholder="Descreva seu volume de tráfego, dúvidas ou necessidades de migração…"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full resize-none rounded-2xl border border-[#191A23]/[0.08] bg-[#FAFAFB] px-4 py-3 text-[14px] text-[#191A23] outline-none transition placeholder:text-[#191A23]/30 focus:border-[#191A23]/20 focus:bg-white focus:ring-4 focus:ring-[#B9FF66]/30"
                    />
                  </div>

                  <button
                    type="submit"
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#191A23] px-7 py-3.5 text-[14px] font-medium text-white transition hover:bg-[#191A23]/90 active:scale-[0.99]"
                  >
                    <span>Enviar Mensagem</span>
                    <Send className="h-4 w-4 text-[#B9FF66]" />
                  </button>
                </form>
              )}
            </div>

            <div className="hidden lg:col-span-5 lg:block">
              <div className="rounded-[26px] bg-[#191A23] p-7 text-white">
                <div className="rounded-2xl bg-[#B9FF66] p-4 text-[#191A23]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]">
                    Atendimento Prioritário
                  </p>
                  <p className="mt-1 text-[15px] font-semibold leading-snug">
                    Resposta rápida por e-mail ou WhatsApp
                  </p>
                </div>

                <ul className="mt-6 space-y-3 text-[13px] text-white/70">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B9FF66]" />
                    Migração gratuita de outros players
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B9FF66]" />
                    Suporte para integração no Elementor
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B9FF66]" />
                    Teste de carga e tráfego massivo
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B9FF66]" />
                    Acompanhamento de Pitch Delay
                  </li>
                </ul>

                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="text-[11px] font-mono text-[#B9FF66]">
                    prisma_vsl_support_active // online
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
