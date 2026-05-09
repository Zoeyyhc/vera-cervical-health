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
    readMinutes: 5,
    updated: "9 May 2026",
    excerpt: "HPV is common. Cervical cancer is rare. Here's how the two relate.",
  },
  {
    slug: "screening-test-overview",
    title: "Cervical Screening Test: what it is and why it matters",
    category: "Screening",
    layout: "standard",
    reader: "Anyone eligible for screening in Australia",
    readMinutes: 6,
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
    readMinutes: 6,
    updated: "9 May 2026",
    excerpt: "What each result category really means, and what comes next.",
  },
  {
    slug: "hpv-vaccine",
    title: "The HPV vaccine: who, when, why",
    category: "HPV Vaccine",
    layout: "standard",
    reader: "Parents, young adults, and adults considering catch-up vaccination",
    readMinutes: 6,
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

// Section types. `text` and `items` fields support inline markdown
// (`**bold**`, `*italic*`, `[link](href)`) rendered through react-markdown
// in standard-article.tsx. Keep h2 / cta as plain strings.
export type StandardSection =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "quote"; text: string; source: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "cta"; text: string; href: string };

export const standardBodies: Record<string, StandardSection[]> = {
  "what-is-hpv": [
    {
      type: "p",
      text: "If you haven't heard of HPV, you're in good company - but you almost certainly will encounter it at some point. It's the most common sexually transmitted infection in the world, and most people who get it never know. This article walks through what HPV actually is, why most cases are nothing to worry about, and the small share that matter.",
    },
    { type: "h2", text: "What is HPV?" },
    {
      type: "p",
      text: "HPV stands for **Human Papillomavirus**. It's not one virus but a family of more than 200 related viruses. Some cause harmless warts on hands or feet. Some cause genital warts. A small group can cause cancer, including cervical cancer, if they don't clear from your body over many years.",
    },
    { type: "p", text: "HPV spreads through intimate skin-to-skin contact. The CDC notes you can catch it:" },
    {
      type: "quote",
      text: "by having vaginal, anal, or oral sex with someone who has the virus, even if they don't have signs or symptoms.",
      source: "Centers for Disease Control and Prevention",
    },
    { type: "h2", text: "How common is it?" },
    { type: "p", text: "**Most sexually active people get HPV at some point.** It's that common." },
    {
      type: "p",
      text: "In the United States, the CDC estimates over 42 million people currently carry a disease-causing type of HPV, with around 13 million new infections every year. The numbers are similar everywhere HPV is studied. Whatever your age, sexual history, or relationship status, getting HPV doesn't reflect anything about you - it reflects how widespread the virus is.",
    },
    { type: "h2", text: "Most infections clear on their own" },
    {
      type: "p",
      text: "Here's the news that should change how you read everything that follows: **most HPV infections clear on their own**.",
    },
    { type: "p", text: "The World Health Organization puts it directly:" },
    {
      type: "quote",
      text: "Most people clear the virus naturally through immune response.",
      source: "World Health Organization",
    },
    { type: "p", text: "The CDC adds:" },
    {
      type: "quote",
      text: "Most HPV infections (9 out of 10) go away by themselves within 2 years.",
      source: "Centers for Disease Control and Prevention",
    },
    {
      type: "p",
      text: "You usually don't know you have HPV. There are no symptoms in most cases. Your immune system handles it the way it handles thousands of other things every day, and you go on with your life.",
    },
    { type: "h2", text: "Which HPV types matter?" },
    { type: "p", text: "HPV types fall into two groups:" },
    {
      type: "ul",
      items: [
        "**Low-risk types** (like HPV 6 and 11) cause genital warts. They don't cause cancer.",
        "**High-risk types** (like HPV 16 and 18) can cause cervical cancer if they persist for many years.",
      ],
    },
    {
      type: "p",
      text: "Two types do most of the damage. The WHO reports that the licensed HPV vaccines all protect against types 16 and 18 specifically because they:",
    },
    {
      type: "quote",
      text: "cause approximately 76% of cervical cancers.",
      source: "World Health Organization",
    },
    {
      type: "p",
      text: "That's why you'll see these two numbers - 16 and 18 - turn up so often in cervical health information.",
    },
    { type: "h2", text: "What if it doesn't clear?" },
    {
      type: "p",
      text: "For a small share of people, the immune system doesn't clear a high-risk HPV infection. Persistent infection can, over time, cause changes in cervical cells that may eventually become cancer.",
    },
    { type: "p", text: "The 'over time' part is critical. The WHO writes:" },
    {
      type: "quote",
      text: "Progression typically requires 15-20 years; in immunocompromised individuals (such as those with untreated HIV), this accelerates to 5-10 years.",
      source: "World Health Organization",
    },
    {
      type: "p",
      text: "A 15-to-20-year window is what makes cervical screening so effective. There is plenty of time to detect changes and treat them long before they become dangerous.",
    },
    {
      type: "p",
      text: "This is the entire reason the screening program exists: to catch cell changes during that long, silent window, when they're easy to manage.",
    },
    { type: "h2", text: "What you can do" },
    { type: "p", text: "Two things have strong evidence for protecting against cervical cancer:" },
    {
      type: "ul",
      items: [
        "**HPV vaccination** covers the most dangerous types. [Read more about the HPV vaccine](/learn/hpv-vaccine)",
        "**Cervical screening** finds changes early, when treatment is simple. [Read more about cervical screening](/learn/screening-test-overview)",
      ],
    },
    {
      type: "p",
      text: "Both are core to the WHO's global strategy to eliminate cervical cancer. If you've done one, you've done meaningful work; if you've done both, you've done what the evidence currently supports.",
    },
    { type: "h2", text: "Bottom line" },
    {
      type: "p",
      text: "HPV is common, usually clears on its own, and rarely causes cancer - but the small share that does is exactly why we vaccinate and screen. Now you know what HPV actually is. The next time you read about it, you have context.",
    },
    { type: "cta", text: "Have a personal question about HPV? Ask the AI", href: "/chat?q=What+is+HPV" },
  ],

  "hpv-vs-cervical-cancer": [
    {
      type: "p",
      text: "If you've heard 'HPV causes cervical cancer', you've heard a true statement that hides a much more nuanced reality. Most HPV doesn't cause cancer. Most cervical cancer comes from HPV. This article walks through how that connection actually works.",
    },
    { type: "h2", text: "The 200+ types of HPV" },
    {
      type: "p",
      text: "HPV (Human Papillomavirus) isn't one virus. It's a family of more than 200 related viruses. Different types affect different parts of the body and cause different problems:",
    },
    {
      type: "ul",
      items: [
        "**Cutaneous types** cause common warts on hands and feet",
        "**Low-risk genital types** (notably HPV 6 and 11) cause genital warts but not cancer",
        "**High-risk genital types** (notably HPV 16 and 18, plus 31, 33, 45, 52, 58 and others) can cause cancer if they persist long enough in the body",
      ],
    },
    {
      type: "p",
      text: "When HPV is mentioned in cervical cancer context, it's almost always the high-risk types that matter.",
    },
    { type: "h2", text: "Two types do most of the damage" },
    { type: "p", text: "Of the high-risk group, two types stand out." },
    {
      type: "p",
      text: "**HPV 16 and HPV 18 cause approximately 76% of cervical cancers** worldwide. The WHO writes that the licensed HPV vaccines all protect against these two types specifically because they:",
    },
    {
      type: "quote",
      text: "cause approximately 76% of cervical cancers.",
      source: "World Health Organization",
    },
    {
      type: "p",
      text: "That's why every licensed HPV vaccine is built around 16 and 18, and why those two numbers turn up so often in cervical health information.",
    },
    { type: "h2", text: "From infection to cancer: the timeline" },
    {
      type: "p",
      text: "Here is how HPV becomes cervical cancer in the small share of cases where it does:",
    },
    {
      type: "ol",
      items: [
        "**HPV infection.** Exposure happens through skin-to-skin sexual contact, including vaginal, anal, or oral sex.",
        "**Most infections clear.** *Most HPV infections (9 out of 10) go away by themselves within 2 years* (CDC). You usually never know you had it.",
        "**Persistent infection.** In a minority of cases, the high-risk virus stays. The immune system doesn't manage to clear it.",
        "**Cell changes.** Persistent high-risk HPV slowly changes the cells of the cervix. These changes are called precancerous, but they are not cancer.",
        "**Cancer.** If the cell changes are not detected and treated, they may eventually become cervical cancer.",
      ],
    },
    {
      type: "p",
      text: "The full timeline from initial infection to cancer is long. The WHO writes:",
    },
    {
      type: "quote",
      text: "Progression typically requires 15-20 years; in immunocompromised individuals (such as those with untreated HIV), this accelerates to 5-10 years.",
      source: "World Health Organization",
    },
    { type: "h2", text: "Why this timeline matters" },
    { type: "p", text: "The 15-to-20-year window is the entire reason cervical screening works." },
    { type: "p", text: "Cervical screening doesn't catch HPV the day you're infected. It catches:" },
    {
      type: "ul",
      items: [
        "**The virus**, before it has caused changes (an early 'HPV detected' result)",
        "**Cell changes**, before they become cancer (when changes have started but cancer has not)",
        "**Early cancer**, before it becomes hard to treat",
      ],
    },
    {
      type: "p",
      text: "Each of these is a chance to act. With a 15-year window, even people who screen every 5 years catch changes in plenty of time. This is why 'HPV detected' on a screening result is news to follow up on, not a diagnosis.",
    },
    { type: "h2", text: "Having HPV does not mean having cancer" },
    {
      type: "p",
      text: "Read this twice if you need to: **almost all cervical cancers come from HPV, but almost no HPV becomes cervical cancer.**",
    },
    { type: "p", text: "The first half is the public-health fact that drives vaccination and screening programs. The WHO puts it plainly:" },
    {
      type: "quote",
      text: "Almost all cervical cancer cases result from infection with oncogenic types of HPV.",
      source: "World Health Organization",
    },
    {
      type: "p",
      text: "The second half is the personal fact that should drive how you feel if you ever get an HPV-positive screening result. The numbers are on your side.",
    },
    { type: "h2", text: "What this means for you" },
    {
      type: "ul",
      items: [
        "If you're sexually active, you have a high lifetime chance of getting HPV. That's normal, expected, and not a reflection on you.",
        "If you carry HPV, your immune system will most likely clear it on its own within two years.",
        "If you carry high-risk HPV that persists, screening will detect cell changes years before they become dangerous.",
        "HPV vaccination plus regular screening cover both the prevention side and the early-detection side.",
      ],
    },
    { type: "cta", text: "Read about cervical screening", href: "/learn/screening-test-overview" },
  ],

  "screening-test-overview": [
    {
      type: "p",
      text: "Australia has one of the most effective cervical screening programs in the world. Since the program began in 1991, the country's cervical cancer rate has halved. In December 2017, the test changed - and it's now even more effective. This article walks through what the current test is, who it's for, and how to start.",
    },
    { type: "h2", text: "What changed in 2017: Pap test out, HPV test in" },
    {
      type: "p",
      text: "Until 2017, Australia used the Pap test - a check for abnormal cervical cells, repeated every two years, eligible from ages 18 to 69.",
    },
    {
      type: "p",
      text: "From December 2017, the program switched to the **HPV test**, repeated every five years, eligible from ages 25 to 74. Cancer Council Australia summarises why:",
    },
    {
      type: "quote",
      text: "The HPV test represents a significant improvement: it is more accurate, requiring testing only every 5 years, and is expected to reduce cervical cancer deaths by at least 20% more.",
      source: "Cancer Council Australia",
    },
    {
      type: "p",
      text: "The change makes sense once you know what causes cervical cancer. Almost all cases come from a long-term infection with high-risk HPV. The Pap test looked for the cell changes the virus eventually causes; the HPV test looks for the virus itself, catching trouble years earlier.",
    },
    { type: "h2", text: "Are you eligible?" },
    { type: "p", text: "You're eligible for cervical screening in Australia if **all** of the following are true:" },
    {
      type: "ul",
      items: [
        "You are aged **25 to 74**",
        "You have a **cervix**",
        "You have **ever been sexually active**",
      ],
    },
    { type: "p", text: "Cancer Council Australia is explicit:" },
    {
      type: "quote",
      text: "The program applies regardless of sexual orientation, gender identity, vaccination status, sexual activity level, or menopausal status.",
      source: "Cancer Council Australia",
    },
    { type: "p", text: "In practice, that means:" },
    {
      type: "ul",
      items: [
        "**Trans men and non-binary people with a cervix:** yes, this includes you",
        "**Vaccinated against HPV:** yes - the vaccine doesn't cover every high-risk type",
        "**In a same-sex relationship:** yes",
        "**Past menopause:** yes, until age 74",
      ],
    },
    { type: "h2", text: "Self-collection: a real option since 2022" },
    {
      type: "p",
      text: "Since July 2022, Australia has offered **self-collection** as a fully equivalent alternative to clinician collection.",
    },
    {
      type: "p",
      text: "You collect your own sample using a simple swab, under healthcare provider guidance. Cancer Council Australia describes it:",
    },
    {
      type: "quote",
      text: "You collect your own sample using a simple swab under healthcare provider guidance - equally effective and suitable for those uncomfortable with clinician collection.",
      source: "Cancer Council Australia",
    },
    {
      type: "p",
      text: "For many people, self-collection removes the biggest barrier to screening: discomfort with the speculum exam, modesty concerns, or past medical trauma.",
    },
    {
      type: "p",
      text: "**Important:** self-collection isn't appropriate if you have **symptoms** (unusual bleeding, unusual discharge, or pain). Symptoms need a clinician examination, not a swab.",
    },
    { type: "h2", text: "How often?" },
    {
      type: "p",
      text: "If your HPV test is normal (HPV not detected), the next screening is in **five years**.",
    },
    {
      type: "p",
      text: "The National Cancer Screening Register sends invitations and reminders by mail. If you've missed an invitation, you can call the NCSR on **1800 627 701** to check your status and get back on track.",
    },
    { type: "h2", text: "What happens at the appointment" },
    {
      type: "p",
      text: "Most appointments take about ten minutes. You can request a female provider if that's important to you. The full process - what to wear, what happens in the room, what comes afterward - is covered in its own article: [What to expect at your screening appointment](/learn/screening-appointment).",
    },
    { type: "h2", text: "What about your results?" },
    { type: "p", text: "You'll get your results, usually by SMS or letter, within a few weeks." },
    {
      type: "p",
      text: "**HPV detected does not mean cancer.** It means the test caught something to follow up on, while there is plenty of time to act. The full breakdown is in [Understanding your screening results](/learn/understanding-results).",
    },
    { type: "h2", text: "How to book" },
    { type: "p", text: "Three ways to start:" },
    {
      type: "ol",
      items: [
        "**Talk to your GP.** Most appointments are bulk-billed. If you don't have a regular GP, any GP can do this.",
        "**No GP yet?** Find a screening provider near you using our clinic finder.",
        "**Missed an invitation?** Call the National Cancer Screening Register on **1800 627 701**.",
      ],
    },
    { type: "cta", text: "Find a screening clinic near you", href: "/clinics" },
  ],

  "understanding-results": [
    {
      type: "p",
      text: "You have your cervical screening result and you're reading this. First, a deep breath. Then, what each possible result actually means.",
    },
    {
      type: "p",
      text: "This article describes the result categories used in HPV-first cervical screening, the system Australia adopted in December 2017.",
    },
    { type: "h2", text: "Result 1: HPV not found" },
    { type: "p", text: "The most common result. The lab found no high-risk HPV in your sample." },
    {
      type: "p",
      text: "**What it means:** Your risk of cervical cancer in the next few years is very low. The screening test has done its job.",
    },
    {
      type: "p",
      text: "**Next step:** Your next screening invitation will arrive in **5 years** (Australia's standard interval for ages 25 to 74).",
    },
    { type: "p", text: "The NHS notes plainly:" },
    {
      type: "quote",
      text: "Most people will not have HPV (an HPV negative result).",
      source: "NHS",
    },
    { type: "h2", text: "Result 2: Inadequate or unclear result" },
    {
      type: "p",
      text: "The lab couldn't get a clear reading from your sample. This is not a sign that anything is wrong.",
    },
    {
      type: "p",
      text: "**What it means:** The result was technically unclear, often because the sample didn't contain enough cells or there was an issue at the lab.",
    },
    { type: "p", text: "**Next step:** A repeat test, usually in around 3 months." },
    { type: "p", text: "The NHS reassures:" },
    {
      type: "quote",
      text: "This does not mean there's anything wrong, it's because the results were unclear.",
      source: "NHS",
    },
    { type: "h2", text: "Result 3: HPV found, no abnormal cell changes" },
    {
      type: "p",
      text: "The lab found high-risk HPV in your sample, but your cervical cells look normal.",
    },
    {
      type: "p",
      text: "**What it means:** You have an HPV infection that has not (yet) caused any cell changes. Most HPV infections clear on their own within 2 years (CDC), so the most likely outcome is that this resolves without further intervention.",
    },
    {
      type: "p",
      text: "**Next step:** Your next screening will be **earlier than 5 years**, usually 1 year, to monitor whether the HPV clears. If it does, you return to the standard schedule. If HPV is still present at the follow-up screening, you'll be invited again. If HPV remains after 2 years total, you'll be referred for **colposcopy** (a closer look at the cervix).",
    },
    { type: "h2", text: "Result 4: HPV found, with abnormal cell changes" },
    {
      type: "p",
      text: "The lab found high-risk HPV and noticed abnormal cells in your sample.",
    },
    {
      type: "p",
      text: "**What it means:** It's worth taking a closer look. Abnormal cells are not cancer. They are changes that, if left for many years, could potentially develop into cancer. Detecting them at this stage is exactly what the screening program is designed to do.",
    },
    {
      type: "p",
      text: "**Next step:** Referral for **colposcopy**, a hospital-based examination where a doctor uses a magnifying device to look at your cervix and may take a small biopsy if needed.",
    },
    { type: "p", text: "The NHS offers reassurance worth quoting in full:" },
    {
      type: "quote",
      text: "Try not to worry if you've been referred for a colposcopy. Any changes to your cells will not get worse while you're waiting.",
      source: "NHS",
    },
    { type: "h2", text: "Important: HPV detected does not mean cancer" },
    { type: "p", text: "A common reaction to 'HPV detected' is fear and self-blame. Both are misplaced." },
    {
      type: "ul",
      items: [
        "**HPV detected does not equal cancer.** It means the screening worked exactly as designed: it caught the virus during the long window when something can be done about it.",
        "**HPV detected does not equal infidelity.** HPV can persist undetected for many years. A new positive result does not tell you anything about a current partner.",
        "**HPV detected is common.** Most sexually active adults will have HPV at some point in their lives.",
      ],
    },
    {
      type: "p",
      text: "If your result is 'HPV detected', what you're seeing is the system doing its job.",
    },
    { type: "h2", text: "How long until I hear back?" },
    {
      type: "p",
      text: "In Australia, results typically arrive within a few weeks, by SMS or letter. If you haven't heard after a few weeks, contact your GP or call the National Cancer Screening Register on **1800 627 701**.",
    },
    { type: "h2", text: "What to do now" },
    {
      type: "ul",
      items: [
        "**HPV not found?** Mark your calendar for 5 years. Your next invitation will come automatically.",
        "**Inadequate or unclear?** Book a repeat test for around 3 months from now.",
        "**HPV found, normal cells?** Note your follow-up date. You don't need to do anything else right now.",
        "**HPV found, abnormal cells?** Wait for your colposcopy appointment.",
      ],
    },
    {
      type: "p",
      text: "If anything in your result confuses you, your GP can walk you through it. Self-collection results can also be discussed with your healthcare provider.",
    },
    { type: "cta", text: "Have a personal question about your result? Ask the AI", href: "/chat?q=Understanding+results" },
  ],

  "hpv-vaccine": [
    {
      type: "p",
      text: "The HPV vaccine is the closest thing modern medicine has to a cancer vaccine. It doesn't treat cancer; it prevents the infection that causes the great majority of cervical cancer (and several other cancers as well). This article walks through what the vaccine is, who Australia funds it for, and whether you should consider it as an adult.",
    },
    { type: "h2", text: "What's in the vaccine" },
    { type: "p", text: "The vaccine used in Australia and most other developed countries is **Gardasil 9**." },
    {
      type: "p",
      text: "It protects against nine HPV types - 6, 11, 16, 18, 31, 33, 45, 52, and 58. Cancer Council Australia notes these nine types are responsible for **approximately 90% of cervical cancers**.",
    },
    {
      type: "p",
      text: "The two most important types it covers are HPV 16 and 18. The WHO writes these two types alone:",
    },
    {
      type: "quote",
      text: "cause approximately 76% of cervical cancers.",
      source: "World Health Organization",
    },
    {
      type: "p",
      text: "Gardasil 9 catches them both, plus the next seven highest-risk types.",
    },
    { type: "h2", text: "Australia's program: who gets it for free" },
    {
      type: "p",
      text: "The HPV vaccine is **free for everyone aged 12 to 25** in Australia, through the National Immunisation Program.",
    },
    { type: "p", text: "**At school (most common path):**" },
    {
      type: "ul",
      items: [
        "Delivered to **boys and girls aged 12 to 13** through school-based programs",
        "Currently a **single dose** is sufficient under the Australian schedule",
      ],
    },
    { type: "p", text: "**Catch-up vaccination (free up to age 25):**" },
    {
      type: "p",
      text: "If you missed the school program, or you weren't vaccinated for any reason, you can still get it free up to your 26th birthday. Talk to your GP.",
    },
    { type: "h2", text: "I'm older than 25 - is it worth it?" },
    {
      type: "p",
      text: "If you're between 26 and 45, the vaccine is **not free** under the program, but it's still available privately through your GP.",
    },
    { type: "p", text: "The CDC takes a measured position:" },
    {
      type: "quote",
      text: "Some adults age 27 through 45 years who are not already vaccinated may decide to get HPV vaccine after speaking with their doctor about their risk for new HPV infections.",
      source: "Centers for Disease Control and Prevention",
    },
    {
      type: "p",
      text: "The decision depends on your individual situation - new partners, your existing HPV status, your immune health. If this applies to you, ask your GP. Privately, the vaccine course in Australia typically costs around AUD $200 to $250.",
    },
    { type: "h2", text: "Does it actually work?" },
    { type: "p", text: "Yes - and the data is strong." },
    { type: "p", text: "Since the HPV vaccine was introduced in 2006, the CDC reports:" },
    {
      type: "ul",
      items: [
        "**Infections dropped 88% among teen girls**",
        "**Infections dropped 81% among young adult women**",
        "**Cervical pre-cancers declined 40% among vaccinated women**",
      ],
    },
    { type: "p", text: "The CDC summarises the long-term potential:" },
    {
      type: "quote",
      text: "[The vaccine] has the potential to prevent more than 90% of cancers caused by HPV.",
      source: "Centers for Disease Control and Prevention",
    },
    {
      type: "p",
      text: "Australia's program has been one of the world's most successful. Cancer Council Australia notes:",
    },
    {
      type: "quote",
      text: "Australia is set to be the first country to eliminate cervical cancer as a public health issue.",
      source: "Cancer Council Australia",
    },
    { type: "h2", text: "I had the vaccine. Do I still need screening?" },
    { type: "p", text: "**Yes.** This is the single most important thing to know about the vaccine." },
    { type: "p", text: "Cancer Council Australia is direct:" },
    {
      type: "quote",
      text: "If you have been vaccinated against HPV, you should have your first screening at age 25 and then every five years.",
      source: "Cancer Council Australia",
    },
    { type: "p", text: "Two reasons screening is still essential:" },
    {
      type: "ol",
      items: [
        "**The vaccine doesn't cover every high-risk type.** Gardasil 9 covers nine types, including the two most dangerous ones - but there are other high-risk types it doesn't cover.",
        "**The vaccine works best before exposure.** If you were exposed to a covered HPV type before vaccination, the vaccine cannot retroactively clear it.",
      ],
    },
    {
      type: "p",
      text: "Both vaccination and screening are part of the WHO's global strategy. Either one alone helps. Both together is what the evidence currently supports.",
    },
    { type: "h2", text: "What to expect after the shot" },
    { type: "p", text: "Common side effects are mild and short-lived:" },
    {
      type: "ul",
      items: [
        "**Soreness at the injection site** (most common)",
        "**Headache, mild fever, or nausea** in some people",
        "**Fainting can occur** in some recipients - which is why you typically sit or lie down for around 15 minutes after the shot",
      ],
    },
    {
      type: "p",
      text: "The CDC has tracked the vaccine's safety closely since 2006 and the safety profile remains strong.",
    },
    { type: "h2", text: "How to get the vaccine" },
    {
      type: "ul",
      items: [
        "**For school-age children (12 to 13):** the school program handles it. You may receive a consent form from the school.",
        "**For catch-up (under 26):** book a GP appointment. Mention 'HPV vaccination - National Immunisation Program.'",
        "**For private vaccination (26 to 45):** book a GP appointment to discuss whether it makes sense for your situation.",
      ],
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
  { title: "World Health Organization - Cervical cancer", license: "CC BY-NC-SA 3.0 IGO", url: "https://www.who.int/news-room/fact-sheets/detail/cervical-cancer" },
  { title: "Cancer Council Australia - Cervical screening", license: "Used with attribution", url: "https://www.cancer.org.au/cancer-information/causes-and-prevention/early-detection-and-screening/cervical-cancer-screening" },
  { title: "HealthDirect Australia - Cervical screening test", license: "CC BY 4.0", url: "https://www.healthdirect.gov.au/cervical-screening-test" },
  { title: "NHS - Your cervical screening results", license: "Open Government Licence v3.0", url: "https://www.nhs.uk/conditions/cervical-screening/your-results/" },
];
