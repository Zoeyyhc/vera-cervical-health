/**
 * Knowledge base seed manifest.
 *
 * Source: World Health Organization public fact sheets / Q&A pages.
 * License: CC BY-NC-SA 3.0 IGO (https://www.who.int/about/policies/publishing/copyright).
 * Project use: non-commercial educational platform — within license terms.
 *
 * To re-fetch, edit the file in place and re-run `pnpm seed:kb` — the script
 * deletes prior chunks per `source` before re-ingesting, so updates are safe.
 */

export type SeedDocument = {
  /** Human-readable display name. Surfaces in citation chips. */
  source: string;
  /** Authoritative URL. Stored in metadata.url; surfaces in citation chips. */
  url: string;
  /** License string. Stored in metadata.license. */
  license: string;
  /** ISO date the content was retrieved. Stored in metadata.retrieved_on. */
  retrievedOn: string;
  /** Filename relative to this manifest's directory. */
  file: string;
};

export const SEED_DOCUMENTS: SeedDocument[] = [
  {
    source: "WHO — Cervical Cancer",
    url: "https://www.who.int/news-room/fact-sheets/detail/cervical-cancer",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "01-cervical-cancer.md",
  },
  {
    source: "WHO — Human Papillomavirus (HPV)",
    url: "https://www.who.int/news-room/questions-and-answers/item/human-papillomavirus-(hpv)",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "02-hpv-overview.md",
  },
  {
    source: "WHO — HPV Vaccines",
    url: "https://www.who.int/teams/immunization-vaccines-and-biologicals/diseases/human-papillomavirus-vaccines-(hpv)",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "03-hpv-vaccine.md",
  },
  {
    source: "WHO — Cervical Cancer Q&A (Prevention & Screening)",
    url: "https://www.who.int/news-room/questions-and-answers/item/cervical-cancer",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "04-cervical-cancer-prevention.md",
  },
  {
    source: "WHO — Cervical Cancer Elimination Initiative",
    url: "https://www.who.int/initiatives/cervical-cancer-elimination-initiative",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "05-elimination-initiative.md",
  },
];
