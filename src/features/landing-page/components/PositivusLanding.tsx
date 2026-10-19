"use client";

import Nav from "./Nav";
import Hero from "./Hero";
import LogosBar from "./LogosBar";
import ServicesGrid from "./ServicesGrid";
import CtaProposal from "./CtaProposal";
import CaseStudies from "./CaseStudies";
import PricingSection from "./PricingSection";
import WorkingProcess from "./WorkingProcess";
import TeamSupport from "./TeamSupport";
import Testimonials from "./Testimonials";
import ContactForm from "./ContactForm";
import Footer from "./Footer";

interface PositivusLandingProps {
  account?: { firstName: string } | null;
}

export default function PositivusLanding({ account }: PositivusLandingProps) {
  return (
    <div className="min-h-screen bg-white font-sans text-[#191A23] antialiased selection:bg-[#B9FF66] selection:text-[#191A23]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-[#191A23] focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <Nav account={account} />
      <main id="conteudo" className="scroll-mt-28">
        <Hero />
        <LogosBar />
        <ServicesGrid />
        <CtaProposal />
        <CaseStudies />
        <PricingSection />
        <WorkingProcess />
        <TeamSupport />
        <Testimonials />
        <ContactForm />
      </main>
      <Footer />
    </div>
  );
}
