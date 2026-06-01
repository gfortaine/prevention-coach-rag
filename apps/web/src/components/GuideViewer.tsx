"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Button, Link as CanopeeLink, Tag } from "@axa-fr/canopee-react/prospect";
import {
  climateGuideCdnUrl,
  naturalEventsGuideCdnUrl,
  roadSafetyGuideCdnUrl,
} from "@/lib/coach/corpus";

interface GuideViewerProps {
  domain: string;
  initialPage: number;
}

const guides = {
  securite_routiere: {
    title: 'Découvrez le guide "20 ans de prévention routière"',
    pdfUrl: roadSafetyGuideCdnUrl,
    downloadUrl: roadSafetyGuideCdnUrl,
    tag: "Sécurité routière",
  },
  climat: {
    title: 'Découvrez le guide "Climat et Environnement"',
    pdfUrl: climateGuideCdnUrl,
    downloadUrl: climateGuideCdnUrl,
    tag: "Climat",
  },
  miniguide: {
    title: 'Découvrez le guide "Bien se protéger face aux événements naturels"',
    pdfUrl: naturalEventsGuideCdnUrl,
    downloadUrl: naturalEventsGuideCdnUrl,
    tag: "Événements naturels",
  },
} as const;

export function GuideViewer({ domain, initialPage }: GuideViewerProps) {
  const [page, setPage] = useState(() => {
    if (typeof window === "undefined") {
      return initialPage;
    }

    const hashPage = Number.parseInt(window.location.hash.replace("#", ""), 10);
    return Number.isFinite(hashPage) && hashPage > 0 ? hashPage : initialPage;
  });
  const guide = guides[domain as keyof typeof guides] || guides.securite_routiere;

  useEffect(() => {
    const handleHashChange = () => {
      const hashPage = Number.parseInt(window.location.hash.replace("#", ""), 10);
      if (Number.isFinite(hashPage) && hashPage > 0) {
        setPage(hashPage);
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const pdfSrc = useMemo(() => `${guide.pdfUrl}#page=${page}`, [guide.pdfUrl, page]);

  return (
    <main className="guide-viewer">
      <header className="guide-viewer__header">
        <Link className="guide-viewer__logo" href="/" aria-label="Retour à l'assistant">
          <Image src="/logo-axa.svg" alt="AXA" width={46} height={46} priority />
        </Link>
        <div>
          <Tag variant="info">{guide.tag}</Tag>
          <h1>{guide.title}</h1>
          <p>Source ouverte utilisée par l&apos;assistant, alignée sur le comportement observé du BFF AXA.</p>
        </div>
        <div className="guide-viewer__actions">
          <CanopeeLink href="/" className="guide-viewer__link">
            Assistant
          </CanopeeLink>
          <Button type="button" variant="secondary" onClick={() => window.open(guide.downloadUrl, "_blank", "noopener")}>
            Téléchargez-le
          </Button>
        </div>
      </header>
      <section className="guide-viewer__pdf" aria-label={`${guide.title}, page ${page}`}>
        <iframe key={pdfSrc} title={`${guide.title} - page ${page}`} src={pdfSrc} />
      </section>
    </main>
  );
}
