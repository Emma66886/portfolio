"use client";

import dynamic from "next/dynamic";
import About from "@/components/About";
import Contact from "@/components/Contact";
import Experience from "@/components/Experience";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Nav from "@/components/Nav";
import Projects from "@/components/Projects";
import Services from "@/components/Services";
import Skills from "@/components/Skills";
import { useInteractions } from "@/lib/useInteractions";
import { useReveal } from "@/lib/useReveal";

// WebGL-only and the heaviest thing on the page, so it loads after hydration.
const Scene3D = dynamic(() => import("@/components/Scene3D"), { ssr: false });

export default function Home() {
  useReveal();
  useInteractions();

  return (
    <>
      <Scene3D />
      <Nav />
      <main>
        <Hero />
        <About />
        <Services />
        <Skills />
        <Experience />
        <Projects />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
