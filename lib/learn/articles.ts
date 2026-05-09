export type Category = "HPV Basics" | "Screening" | "HPV Vaccine" | "Myths and Facts";
export type Layout = "standard" | "scrollytelling" | "card-grid";

export type Article = {
  slug: string;
  title: string;
  category: Category;
  layout: Layout;
  reader: string;
  readMinutes: number;
  updated: string;
  excerpt: string;
};

export const articles: Article[] = [
  {
    slug: "what-is-hpv",
    title: "What is HPV?",
    category: "HPV Basics",
    layout: "standard",
    reader: "People with no prior knowledge of HPV",
    readMinutes: 5,
    updated: "9 May 2026",
    excerpt: "The most common STI in the world, and why most cases are nothing to worry about.",
  },
  {
    slug: "hpv-vs-cervical-cancer",
    title: "HPV vs Cervical Cancer: How are they connected?",
    category: "HPV Basics",
    layout: "standard",
    reader: "Anyone who has heard the two terms used interchangeably",
    readMinutes: 4,
    updated: "9 May 2026",
    excerpt: "HPV is common. Cervical cancer is rare. Here's how the two relate.",
  },
  {
    slug: "screening-test-overview",
    title: "Cervical Screening Test: what it is and why it matters",
    category: "Screening",
    layout: "standard",
    reader: "Anyone eligible for screening in Australia",
    readMinutes: 5,
    updated: "9 May 2026",
    excerpt: "The five-yearly HPV-based test that replaced the Pap smear in 2017.",
  },
  {
    slug: "screening-appointment",
    title: "What to expect at your screening appointment",
    category: "Screening",
    layout: "scrollytelling",
    reader: "First-time screeners and anyone anxious about the procedure",
    readMinutes: 6,
    updated: "9 May 2026",
    excerpt: "Six short steps, with the cervix-shaped clinic chair finally explained.",
  },
  {
    slug: "understanding-results",
    title: "Understanding your screening results",
    category: "Screening",
    layout: "standard",
    reader: "Anyone who has received a result letter",
    readMinutes: 5,
    updated: "9 May 2026",
    excerpt: "What each result category really means, and what comes next.",
  },
  {
    slug: "hpv-vaccine",
    title: "The HPV vaccine: who, when, why",
    category: "HPV Vaccine",
    layout: "standard",
    reader: "Parents, young adults, and adults considering catch-up vaccination",
    readMinutes: 5,
    updated: "9 May 2026",
    excerpt: "Australia's program, eligibility, and the adult catch-up question.",
  },
  {
    slug: "myths-debunked",
    title: "7 myths about cervical health, debunked",
    category: "Myths and Facts",
    layout: "card-grid",
    reader: "Anyone who has heard one of these from a friend",
    readMinutes: 6,
    updated: "9 May 2026",
    excerpt: "From 'the test is painful' to 'the vaccine covers everything', plainly answered.",
  },
];

export function getArticle(slug: string) {
  return articles.find((a) => a.slug === slug);
}

export function getRelated(slug: string, n = 3) {
  return articles.filter((a) => a.slug !== slug).slice(0, n);
}

export type StandardSection =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "quote"; text: string; source: string }
  | { type: "ul"; items: string[] }
  | { type: "cta"; text: string; href: string };

export const standardBodies: Record<string, StandardSection[]> = {
  "what-is-hpv": [
    {
      type: "p",
      text: "If you haven't heard of HPV, you're in good company. But you almost certainly will encounter it at some point. It's the most common sexually transmitted infection in the world, and most people who get it never know. This article walks through what HPV actually is, why most cases are nothing to worry about, and the small share that matter.",
    },
    { type: "h2", text: "What is HPV?" },
    {
      type: "p",
      text: "HPV stands for Human Papillomavirus. It's not one virus but a family of more than 200 related viruses. Some cause harmless warts on hands or feet. Some cause genital warts. A small group can cause cancer, including cervical cancer, if they don't clear from your body over many years.",
    },
    {
      type: "quote",
      text: "by having vaginal, anal, or oral sex with someone who has the virus, even if they don't have signs or symptoms.",
      source: "Centers for Disease Control and Prevention",
    },
    { type: "h2", text: "How common is it?" },
    {
      type: "p",
      text: "Most sexually active people get HPV at some point. It's that common. In the United States, the CDC estimates over 42 million people currently carry a disease-causing type of HPV, with around 13 million new infections every year.",
    },
    { type: "h2", text: "Most infections clear on their own" },
    {
      type: "p",
      text: "Here's the news that should change how you read everything that follows: most HPV infections clear on their own.",
    },
    {
      type: "quote",
      text: "Most people clear the virus naturally through immune response.",
      source: "World Health Organization",
    },
    {
      type: "quote",
      text: "Most HPV infections (9 out of 10) go away by themselves within 2 years.",
      source: "Centers for Disease Control and Prevention",
    },
    { type: "h2", text: "What you can do" },
    { type: "p", text: "Two things have strong evidence for protecting against cervical cancer:" },
    {
      type: "ul",
      items: [
        "HPV vaccination covers the most dangerous types. See: /learn/hpv-vaccine",
        "Cervical screening finds changes early, when treatment is simple. See: /learn/screening-test-overview",
      ],
    },
    { type: "cta", text: "Have a personal question about HPV? Ask the AI", href: "/chat?q=What+is+HPV" },
  ],
  "hpv-vs-cervical-cancer": [
    {
      type: "p",
      text: "HPV is extremely common. Cervical cancer is rare. The two get talked about as if they were the same thing, which understandably scares people. They aren't. Here is the actual relationship between them.",
    },
    { type: "h2", text: "HPV is common, cancer is rare" },
    {
      type: "p",
      text: "Most adults will have HPV at some point. Almost all of them will never develop cancer. The body clears the vast majority of infections without anyone noticing.",
    },
    {
      type: "quote",
      text: "Almost all cervical cancer cases result from infection with oncogenic (cancer-causing) types of HPV.",
      source: "World Health Organization",
    },
    { type: "h2", text: "It takes years, not weeks" },
    {
      type: "p",
      text: "When HPV does cause cervical cancer, it does so slowly. The change from a persistent infection to an invasive cancer typically takes 15 to 20 years. That long window is exactly what cervical screening is designed to use.",
    },
    { type: "quote", text: "typically requires 15-20 years.", source: "World Health Organization" },
    { type: "h2", text: "Screening uses that window" },
    {
      type: "p",
      text: "Cervical screening looks for the high-risk HPV types and any cell changes long before they could become cancer. Most positive results lead to monitoring, not treatment, and even when treatment is needed, it's typically a simple outpatient procedure.",
    },
    { type: "cta", text: "Read about cervical screening", href: "/learn/screening-test-overview" },
  ],
  "screening-test-overview": [
    {
      type: "p",
      text: "In 2017, Australia replaced the two-yearly Pap smear with the five-yearly Cervical Screening Test. The new test looks for HPV directly. Here's what it is and why it matters.",
    },
    { type: "h2", text: "What the test looks for" },
    {
      type: "p",
      text: "The Cervical Screening Test checks for high-risk HPV types in cervical cells. If HPV is found, the same sample is examined for any cell changes. The whole sample takes around ten seconds to collect.",
    },
    {
      type: "quote",
      text: "The Cervical Screening Test detects HPV before any cell changes occur.",
      source: "Cancer Council Australia",
    },
    { type: "h2", text: "Self-collection is now an option" },
    {
      type: "p",
      text: "Since 2022, anyone eligible for screening in Australia can choose to self-collect their sample with a swab. Self-collection is just as accurate as clinician-collection for HPV detection.",
    },
    {
      type: "quote",
      text: "You collect your own sample using a simple swab under healthcare provider guidance, equally effective and suitable for those uncomfortable with clinician collection.",
      source: "Cancer Council Australia",
    },
    { type: "h2", text: "Who and when" },
    {
      type: "p",
      text: "Anyone with a cervix aged 25 to 74 who has ever been sexually active should be screened every five years, regardless of vaccination status, gender identity, or menopausal status.",
    },
    { type: "cta", text: "Find a screening clinic near you", href: "/clinics" },
  ],
  "understanding-results": [
    {
      type: "p",
      text: "A screening result letter can be confusing. Here's a plain-language guide to each category and what it means for you.",
    },
    { type: "h2", text: "HPV not detected" },
    {
      type: "p",
      text: "The most common result. No high-risk HPV was found. You'll be invited back in five years.",
    },
    { type: "h2", text: "HPV detected, types other than 16 or 18" },
    {
      type: "p",
      text: "Higher-risk types weren't found, but another high-risk type was. The lab also looked at the cells. If they look normal, you'll be asked to repeat the test in 12 months. Most of these clear on their own in that window.",
    },
    { type: "h2", text: "HPV types 16 or 18 detected" },
    {
      type: "p",
      text: "These two types cause about 76% of cervical cancers, so a closer look (a colposcopy) is recommended. This isn't a cancer diagnosis. It's a careful next look.",
    },
    {
      type: "quote",
      text: "HPV vaccines all protect against types 16 and 18, which cause approximately 76% of cervical cancers.",
      source: "World Health Organization",
    },
    { type: "h2", text: "Unsatisfactory sample" },
    {
      type: "p",
      text: "Sometimes the sample doesn't have enough cells to read. You'll be asked to repeat the test, usually within 6-12 weeks. It's a logistics issue, not a result.",
    },
    { type: "cta", text: "Have a personal question about your result? Ask the AI", href: "/chat?q=Understanding+results" },
  ],
  "hpv-vaccine": [
    {
      type: "p",
      text: "Australia runs one of the most successful HPV vaccination programs in the world. Here's who it's for, when it's given, and why adult catch-up is now a real option.",
    },
    { type: "h2", text: "Who and when" },
    {
      type: "p",
      text: "The vaccine is offered free through schools to all students in year 7 (around age 12-13). It's a single dose under the current schedule.",
    },
    { type: "h2", text: "What it covers" },
    {
      type: "p",
      text: "The vaccine used in Australia (Gardasil 9) protects against nine HPV types, including types 16 and 18, which cause about 76% of cervical cancers, and types 6 and 11, which cause most genital warts.",
    },
    {
      type: "quote",
      text: "HPV vaccines all protect against types 16 and 18, which cause approximately 76% of cervical cancers.",
      source: "World Health Organization",
    },
    { type: "h2", text: "Adult catch-up" },
    {
      type: "p",
      text: "If you missed it at school, you can still get vaccinated as an adult. The benefit decreases with age and prior exposure, but it's not zero. Talk to your GP about whether catch-up makes sense for you.",
    },
    { type: "h2", text: "Vaccinated and still need screening?" },
    {
      type: "p",
      text: "Yes. The vaccine doesn't cover every high-risk HPV type. Screening catches what the vaccine misses.",
    },
    { type: "cta", text: "Read about cervical screening", href: "/learn/screening-test-overview" },
  ],
};

export type ScrollyStep = {
  number: string;
  title: string;
  body: string;
  quote?: { text: string; source: string };
  illustration: "envelope" | "calendar" | "chair" | "leaf" | "swab" | "door";
};

export const screeningSteps: ScrollyStep[] = [
  {
    number: "01",
    title: "Booking",
    body: "You can book through your usual GP, a women's health clinic, a sexual health clinic, or some community health centres. When you book, you can ask whether the appointment will be bulk-billed (most are), and whether a female provider can do the test.",
    quote: { text: "tell them if you would prefer a female to do the test.", source: "HealthDirect Australia" },
    illustration: "envelope",
  },
  {
    number: "02",
    title: "On the day",
    body: "Wear something easy to take off below the waist. The clinic provides a sheet for coverage. Try to book outside your period if possible. Cells are easier to read without menstrual blood in the sample.",
    illustration: "calendar",
  },
  {
    number: "03",
    title: "Position",
    body: "Lie on your back with knees bent. A staff member explains what they're about to do.",
    quote: { text: "Lie on your back with knees bent while a staff member explains the procedure.", source: "HealthDirect Australia" },
    illustration: "chair",
  },
  {
    number: "04",
    title: "Speculum",
    body: "A small device, metal or plastic, is gently inserted into the vagina to make the cervix visible. This is the part most people associate with discomfort. You can ask for a smaller speculum, or to slow down, at any point.",
    illustration: "leaf",
  },
  {
    number: "05",
    title: "Swab",
    body: "A small soft brush collects cells from the cervix. This part takes about 30 seconds.",
    quote: { text: "This should not hurt. If you do feel any pain, let the doctor or nurse know straight away.", source: "HealthDirect Australia" },
    illustration: "swab",
  },
  {
    number: "06",
    title: "Done",
    body: "The speculum is removed. You're given privacy to dress. Most people are out the door within ten minutes.",
    illustration: "door",
  },
];

export type Myth = {
  number: string;
  myth: string;
  reality: string;
  evidence: string;
  source: string;
};

export const myths: Myth[] = [
  {
    number: "01",
    myth: "If I have HPV, I'm going to get cancer.",
    reality: "Almost all HPV infections clear on their own. Only the small share that persist for many years carry a real cancer risk, and screening catches changes long before then.",
    evidence: "Most HPV infections (9 out of 10) go away by themselves within 2 years.",
    source: "Centers for Disease Control and Prevention",
  },
  {
    number: "02",
    myth: "The test is painful, I keep avoiding it.",
    reality: "Uncomfortable, sometimes. Painful for most people, no. The whole sample takes around ten seconds. And since 2022 in Australia, you can self-collect with a swab if a clinician collection feels like too much.",
    evidence: "You collect your own sample using a simple swab under healthcare provider guidance, equally effective and suitable for those uncomfortable with clinician collection.",
    source: "Cancer Council Australia",
  },
  {
    number: "03",
    myth: "Once you're through menopause, you can stop being screened.",
    reality: "In Australia, eligibility runs to age 74. Cervical cancer can develop at any age, and post-menopausal screening still matters.",
    evidence: "Eligibility applies regardless of menopausal status.",
    source: "Cancer Council Australia",
  },
  {
    number: "04",
    myth: "I'm only at risk if I'm having vaginal sex with men.",
    reality: "HPV spreads through any intimate skin-to-skin contact: vaginal, anal, or oral. People in same-sex relationships can have HPV. People who've never had penetrative sex can have HPV. People with one lifetime partner can have HPV.",
    evidence: "You can contract it by having vaginal, anal, or oral sex with someone who has the virus, even if they don't have signs or symptoms.",
    source: "Centers for Disease Control and Prevention",
  },
  {
    number: "05",
    myth: "The vaccine covers it, I'm done.",
    reality: "The vaccine protects against the highest-risk HPV types, 16 and 18, which cause about 76% of cervical cancers. It doesn't cover every high-risk type. Screening catches what the vaccine misses.",
    evidence: "HPV vaccines all protect against types 16 and 18, which cause approximately 76% of cervical cancers.",
    source: "World Health Organization",
  },
  {
    number: "06",
    myth: "Cervical cancer is in my genes, or it isn't.",
    reality: "Almost all cervical cancers are caused by long-term HPV infection, not inherited genes. Family history is much less predictive than your screening status.",
    evidence: "Almost all cervical cancer cases result from infection with oncogenic (cancer-causing) types of HPV.",
    source: "World Health Organization",
  },
  {
    number: "07",
    myth: "We're monogamous, HPV isn't relevant to me.",
    reality: "HPV can stay dormant for years before being detected. You may be carrying it from a relationship years ago and only see it now. A new HPV diagnosis doesn't mean a partner has cheated.",
    evidence: "Progression typically requires 15-20 years, and HPV transmits even if they don't have signs or symptoms.",
    source: "World Health Organization and CDC",
  },
];

export const sourcesList = [
  { title: "Centers for Disease Control and Prevention - HPV", license: "Public domain", url: "https://www.cdc.gov/hpv/" },
  { title: "World Health Organization - Cervical cancer", license: "CC BY-NC-SA 3.0 IGO", url: "https://www.who.int/health-topics/cervical-cancer" },
  { title: "Cancer Council Australia - Cervical screening", license: "Used with attribution", url: "https://www.cancer.org.au/cancer-information/types-of-cancer/cervical-cancer" },
  { title: "HealthDirect Australia - Cervical screening test", license: "CC BY 4.0", url: "https://www.healthdirect.gov.au/cervical-screening-test" },
];
