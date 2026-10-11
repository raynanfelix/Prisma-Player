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
    <div className="min-h-screen bg-[#F3F3F3] text-[#191A23] font-sans antialiased selection:bg-[#B9FF66] selection:text-[#191A23]">
      <Nav account={account} />
      <main>
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
