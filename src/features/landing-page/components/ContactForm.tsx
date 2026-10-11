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
    <section id="contato" className="bg-[#F3F3F3] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-6 mb-16">
          <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
            Fale Conosco
          </div>
          <p className="max-w-xl text-lg text-[#191A23]/80 font-medium">
            Tem alguma dúvida sobre migração de VSL, integração ou planos corporativos? Envie sua mensagem.
          </p>
        </div>

        {/* Card Form */}
        <div className="relative overflow-hidden rounded-[45px] border-2 border-[#191A23] bg-[#F3F3F3] p-8 sm:p-14 shadow-[8px_8px_0px_#191A23]">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Form Column */}
            <div className="lg:col-span-7">
              {submitted ? (
                <div className="rounded-3xl border-2 border-[#191A23] bg-[#B9FF66] p-8 text-center space-y-4 shadow-[4px_4px_0px_#191A23]">
                  <CheckCircle className="mx-auto h-12 w-12 text-[#191A23]" />
                  <h3 className="text-2xl font-black text-[#191A23]">Mensagem Enviada com Sucesso!</h3>
                  <p className="text-sm font-bold text-[#191A23]/80">
                    Nosso time técnico entrará em contato com você via e-mail ou WhatsApp em até 15 minutos.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  
                  {/* Radio Selection Positivus Style */}
                  <div className="flex items-center gap-6 pb-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="profile"
                        checked={profileType === "produtor"}
                        onChange={() => setProfileType("produtor")}
                        className="h-5 w-5 accent-[#191A23] cursor-pointer"
                      />
                      <span className="text-base font-bold text-[#191A23]">Sou Produtor / Coprodutor</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="profile"
                        checked={profileType === "afiliado"}
                        onChange={() => setProfileType("afiliado")}
                        className="h-5 w-5 accent-[#191A23] cursor-pointer"
                      />
                      <span className="text-base font-bold text-[#191A23]">Sou Afiliado / Agência</span>
                    </label>
                  </div>

                  {/* Name Input */}
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#191A23]">Nome Completo*</label>
                    <input
                      type="text"
                      required
                      placeholder="Seu nome"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full rounded-2xl border-2 border-[#191A23] bg-white px-5 py-4 text-base font-medium text-[#191A23] shadow-[3px_3px_0px_#191A23] focus:outline-none focus:bg-[#B9FF66]/20 transition-colors"
                    />
                  </div>

                  {/* Email Input */}
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#191A23]">E-mail Corporativo ou WhatsApp*</label>
                    <input
                      type="text"
                      required
                      placeholder="seuemail@empresa.com ou (11) 99999-9999"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full rounded-2xl border-2 border-[#191A23] bg-white px-5 py-4 text-base font-medium text-[#191A23] shadow-[3px_3px_0px_#191A23] focus:outline-none focus:bg-[#B9FF66]/20 transition-colors"
                    />
                  </div>

                  {/* Message Input */}
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#191A23]">Como podemos ajudar sua operação?*</label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Descreva seu volume de tráfego, dúvidas ou necessidades de migração..."
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full rounded-2xl border-2 border-[#191A23] bg-white px-5 py-4 text-base font-medium text-[#191A23] shadow-[3px_3px_0px_#191A23] focus:outline-none focus:bg-[#B9FF66]/20 transition-colors"
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-3 rounded-2xl border-2 border-[#191A23] bg-[#191A23] px-8 py-4 text-lg font-bold text-white shadow-[4px_4px_0px_#B9FF66] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
                  >
                    <span>Enviar Mensagem</span>
                    <Send className="h-5 w-5 text-[#B9FF66]" />
                  </button>

                </form>
              )}
            </div>

            {/* Positivus Graphic Card Column */}
            <div className="lg:col-span-5 hidden lg:flex justify-center">
              <div className="w-full max-w-sm rounded-[35px] border-2 border-[#191A23] bg-[#191A23] p-8 text-white shadow-[6px_6px_0px_#B9FF66] space-y-6">
                <div className="rounded-2xl border-2 border-[#B9FF66] bg-[#B9FF66] p-4 text-[#191A23]">
                  <p className="text-xs font-black uppercase tracking-wider">Atendimento Prioritário</p>
                  <p className="text-lg font-black mt-1">Resposta em até 15 min</p>
                </div>

                <div className="space-y-3 text-sm font-medium text-white/80">
                  <p>✔ Migração gratuita de outros players</p>
                  <p>✔ Suporte para integração no Elementor</p>
                  <p>✔ Teste de carga e tráfego massivo</p>
                  <p>✔ Acompanhamento de Pitch Delay</p>
                </div>

                <div className="pt-4 border-t border-white/20">
                  <p className="text-xs font-mono text-[#B9FF66]">
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
