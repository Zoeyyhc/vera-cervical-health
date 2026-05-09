# /learn Content Workspace

Working folder for the v1 Health Information Hub (`/learn` route, Epic 6). Each article has its own `.md` file so you can collect source material and draft content one at a time.

This is **content prep, not the production format yet**. Once articles are filled in, we'll decide together whether they ship as static MDX files, a Supabase table, or hardcoded into the page.

---

## Status tracker

### v1  -  must ship (7 articles)

| # | Article | Status |
|---|---|---|
| 1 | [What is HPV?](v1/01-what-is-hpv.md) | drafted (review) |
| 2 | [HPV vs Cervical Cancer: How are they connected?](v1/02-hpv-vs-cervical-cancer.md) | drafted (review) |
| 3 | [Cervical Screening Test: what it is and why it matters](v1/03-screening-test-overview.md) | drafted (review) |
| 4 | [What to expect at your screening appointment](v1/04-screening-appointment.md) | drafted (review) |
| 5 | [Understanding your screening results](v1/05-understanding-results.md) | drafted (review) |
| 6 | [The HPV vaccine: who, when, why](v1/06-hpv-vaccine.md) | drafted (review) |
| 7 | [7 myths about cervical health, debunked](v1/07-myths-debunked.md) | drafted (review) |

### v1-plus  -  nice to have (4 articles)

| # | Article | Status |
|---|---|---|
| 1 | [What is colposcopy and what happens next?](v1-plus/01-colposcopy.md) | todo |
| 2 | [Treatment options for abnormal cells](v1-plus/02-treatment-options.md) | todo |
| 3 | [What actually affects your cervical cancer risk](v1-plus/03-risk-factors.md) | todo |
| 4 | [Cervical cancer symptoms: what to watch for](v1-plus/04-symptoms.md) | todo |

### v2  -  deferred (not yet drafted as files)
- Special populations (trans/non-binary, pregnancy, post-menopause, immunocompromised)
- Emotional support & coping
- Cost & access (Medicare, finding a GP, bulk-billing)

---

## Workflow with Claude

1. Pick an article file
2. Either (a) paste the source URL in chat -> I'll fetch it and pre-fill the Content section, or (b) collect content yourself and paste it in
3. When 1-2 articles are ready, ask me to write a **section-level brief** (structure, headings, what each section should say, attribution lines)
4. You polish prose to final
5. Once 2-3 articles exist, we move to the **Lovable prompt** for the page layout

**Best ways to give me sources:**
- URL -> preferred (I'll WebFetch it)
- PDF -> save in this folder, I'll Read it
- Pasted plain text / markdown -> fine
- HTML -> works but messy, I'll have to strip nav/scripts

---

## Image sources (free / properly licensed)

| Library | URL | License | Best for |
|---|---|---|---|
| Smart Servier Medical Art | smart.servier.com | CC BY 3.0 | Anatomy, virus, organ illustrations |
| CDC PHIL | phil.cdc.gov | Public domain | HPV / cervical microscopy, clinical photos |
| Storyset | storyset.com | Free w/ attribution (or paid no-attribution) | Friendly explainer illustrations |
| unDraw | undraw.co | MIT-style free | Flat illustrations, easy color match |
| Unsplash | unsplash.com | Unsplash License | Lifestyle photos, doctor-patient |
| Pexels | pexels.com | Pexels License | Same as Unsplash |
| Wikimedia Commons | commons.wikimedia.org | Mixed (per file) | Last resort, always check license |

---

## Source library (recap)

**Authoritative  -  use directly with attribution**
- Cancer Council Australia  -  `cancer.org.au`  -  © Cancer Council, attribution + link, non-commercial
- WHO  -  `who.int`  -  CC BY-NC-SA 3.0 IGO
- HealthDirect Australia  -  `healthdirect.gov.au`  -  Crown copyright, non-commercial use OK with attribution
- CDC (US)  -  `cdc.gov`  -  **Public domain**, easiest to use
- NHS (UK)  -  `nhs.uk`  -  Open Government Licence v3.0
- NCI (US)  -  `cancer.gov`  -  **Public domain**

**Reference for tone / structure only  -  do NOT copy**
- Jo's Cervical Cancer Trust  -  `jostrust.org.uk`  -  © copyrighted, but the warmest patient-voice writing in the field

---

## Open question: relationship to RAG knowledge base

The project also seeds a separate RAG knowledge base (`knowledge_chunks` table, see `docs/epics/epic4-rag-knowledge-base-tickets.md` ticket EPIC4-07) drawn from the same authoritative sources. **Decide later:** do these `/learn` articles double as RAG seed content, or are they distinct? Reusing them saves work; keeping them separate lets us tune RAG retrieval without touching user-facing copy.
