/**
 * Knowledge base seed manifest.
 *
 * Sources:
 *   - World Health Organization (WHO) public fact sheets — CC BY-NC-SA 3.0 IGO
 *     https://www.who.int/about/policies/publishing/copyright
 *   - Australian Government Department of Health and Aged Care — CC BY 4.0
 *     https://www.health.gov.au/copyright
 *
 * Project use: non-commercial educational platform — within both license terms.
 *
 * To re-fetch, edit the file in place and re-run `pnpm seed:kb` — the script
 * deletes prior chunks per `source` before re-ingesting, so updates are safe.
 *
 * Known gaps (TODO #48 follow-up — fetched 2026-05-02):
 *   - https://www.who.int/news-room/questions-and-answers/item/human-papillomavirus-(hpv)
 *     returned 404. WHO removed or moved the page; no live replacement found
 *     under /health-topics/. The cervical-cancer fact sheet (#1 below) covers
 *     HPV-as-cause comprehensively, so this gap is not blocking.
 *   - https://www.who.int/news-room/questions-and-answers/item/cervical-cancer
 *     returned only navigation/footer (FETCH_FAILED). Replaced with the
 *     /health-topics/cervical-cancer overview page (entry #4 below).
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
    source: "WHO — HPV Vaccines",
    url: "https://www.who.int/teams/immunization-vaccines-and-biologicals/diseases/human-papillomavirus-vaccines-(hpv)",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "03-hpv-vaccine.md",
  },
  {
    source: "WHO — Cervical Cancer Overview",
    url: "https://www.who.int/health-topics/cervical-cancer",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "04-cervical-cancer-overview.md",
  },
  {
    source: "WHO — Cervical Cancer Elimination Initiative",
    url: "https://www.who.int/initiatives/cervical-cancer-elimination-initiative",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "05-elimination-initiative.md",
  },
  {
    source: "Australian Department of Health — HPV Immunisation Service",
    url: "https://www.health.gov.au/topics/immunisation/vaccines/human-papillomavirus-hpv-immunisation-service",
    license: "CC BY 4.0",
    retrievedOn: "2026-05-03",
    file: "06-au-hpv-immunisation.md",
  },
  {
    source: "Australian Department of Health — Cervical Screening Eligibility",
    url: "https://www.health.gov.au/our-work/national-cervical-screening-program/getting-a-cervical-screening-test/who-should-get-a-cervical-screening-test",
    license: "CC BY 4.0",
    retrievedOn: "2026-05-03",
    file: "07-au-screening-eligibility.md",
  },
  {
    source: "Australian Department of Health — How Cervical Screening Works",
    url: "https://www.health.gov.au/our-work/national-cervical-screening-program/getting-a-cervical-screening-test/how-cervical-screening-works",
    license: "CC BY 4.0",
    retrievedOn: "2026-05-03",
    file: "08-au-screening-process.md",
  },
];
