// Fictional data pools. Every person and company here is invented.

export const FIRST_NAMES_FR = [
  "Léa", "Hugo", "Chloé", "Louis", "Manon", "Arthur", "Inès", "Jules", "Sarah", "Lucas", "Emma", "Nathan",
  "Clara", "Théo", "Zoé", "Maxime", "Julie", "Antoine", "Pauline", "Romain", "Élise", "Thomas", "Anaïs",
  "Mehdi", "Yasmine", "Karim", "Margaux", "Bastien", "Océane", "Quentin", "Salomé", "Adrien", "Nora",
  "Victor", "Justine", "Rayan", "Lucie", "Damien", "Amandine", "Florian",
];

export const LAST_NAMES_FR = [
  "Morel", "Lefèvre", "Garnier", "Rousseau", "Fontaine", "Chevalier", "Robin", "Gauthier", "Perrin",
  "Masson", "Marchand", "Duval", "Lemaire", "Benali", "Haddad", "Roche", "Brunet", "Colin", "Vidal",
  "Lacroix", "Picard", "Aubert", "Renaud", "Barbier", "Leclerc", "Guerin", "Moulin", "Carpentier",
  "Dumont", "Hamel", "Tessier", "Joly", "Riviere", "Arnaud", "Poirier", "Faure",
];

export const FIRST_NAMES_EU = [
  "Lukas", "Anna", "Jonas", "Marta", "Pieter", "Elena", "Matteo", "Oskar", "Freya", "Nils", "Ingrid",
  "Diego", "Lucía", "Tiago", "Beatriz", "Aoife", "Ciarán", "Sanne", "Joost", "Katarzyna", "Mikkel",
  "Laura", "Felix", "Hanna", "Rui", "Sofia", "Emil", "Greta",
];

export const LAST_NAMES_EU = [
  "Meyer", "Schulz", "Vogel", "Jansen", "de Vries", "Conti", "Novak", "Lindqvist", "Berg", "Ortega",
  "Silva", "Byrne", "Kelly", "Hoffmann", "Visser", "Moretti", "Nowak", "Andersen", "Ferreira", "Navarro",
  "Kowalski", "Bakker", "Brandt", "Costa", "Larsen", "Keller",
];

export const PERSONAL_EMAIL_DOMAINS = ["nuvomail.fr", "postelle.eu", "mailbloc.com", "kourriel.fr"];

export const EU_CITIES: { city: string; country: string }[] = [
  { city: "Berlin", country: "Germany" },
  { city: "Amsterdam", country: "Netherlands" },
  { city: "Barcelona", country: "Spain" },
  { city: "Lisbon", country: "Portugal" },
  { city: "Munich", country: "Germany" },
  { city: "Stockholm", country: "Sweden" },
  { city: "Dublin", country: "Ireland" },
  { city: "Madrid", country: "Spain" },
  { city: "Milan", country: "Italy" },
  { city: "Copenhagen", country: "Denmark" },
  { city: "Brussels", country: "Belgium" },
  { city: "Paris", country: "France" },
  { city: "Lyon", country: "France" },
];

export const CITY_COUNTRY: Record<string, string> = {
  paris: "France",
  lyon: "France",
  bordeaux: "France",
  nantes: "France",
  lille: "France",
  marseille: "France",
  toulouse: "France",
  "ile-de-france": "France",
  london: "United Kingdom",
  berlin: "Germany",
  munich: "Germany",
  hamburg: "Germany",
  amsterdam: "Netherlands",
  rotterdam: "Netherlands",
  madrid: "Spain",
  barcelona: "Spain",
  lisbon: "Portugal",
  porto: "Portugal",
  dublin: "Ireland",
  stockholm: "Sweden",
  copenhagen: "Denmark",
  milan: "Italy",
  brussels: "Belgium",
};

export const EU_COUNTRIES = [
  "France", "Germany", "Spain", "Portugal", "Netherlands", "Ireland", "Sweden", "Italy", "Belgium",
  "Denmark", "Finland", "Austria", "Poland", "Estonia", "Luxembourg",
];

/** Syllables used to invent company names for daily surfacing. */
export const NAME_PREFIXES = [
  "Zelka", "Ombra", "Tivola", "Marlo", "Quilo", "Brisa", "Dorvo", "Ferno", "Galvi", "Hesto", "Ilvo",
  "Jarno", "Kelvo", "Lirra", "Murro", "Nesto", "Orvo", "Pilvo", "Ruvia", "Selo", "Tarvo", "Ulma",
  "Velto", "Wenzo", "Yarra", "Zinto",
];

export const SECTOR_SUFFIXES: Record<string, string[]> = {
  fintech: ["pay", "fin", "ledger", "cash", "funds", "treso"],
  healthtech: ["care", "med", "health", "clinic", "cura", "vita"],
  default: ["ly", "io", "hub", "labs", "works", "stack"],
};

export const SECTOR_DESCRIPTIONS: Record<string, string[]> = {
  fintech: [
    "Treasury automation for mid-market finance teams",
    "Embedded payments for vertical SaaS",
    "Spend management for multi-entity groups",
    "Open banking data for lenders",
    "Accounts payable automation for SMEs",
    "FX and cross-border payouts for marketplaces",
    "Credit scoring infrastructure for neobanks",
    "Real-time reconciliation for e-commerce",
  ],
  healthtech: [
    "Remote patient monitoring for cardiology",
    "Scheduling software for private clinics",
    "Digital therapeutics for chronic pain",
    "Care coordination for home nursing",
    "Clinical trial matching for hospitals",
    "Mental health benefits for employers",
    "Pharmacy inventory optimisation",
  ],
  default: [
    "Workflow automation for operations teams",
    "Analytics platform for B2B marketplaces",
    "Collaboration software for field teams",
    "Data infrastructure for retailers",
  ],
};

export const ADJACENT_SECTORS: Record<string, string[]> = {
  fintech: ["payments", "insurtech", "banking", "regtech", "wealthtech", "banking-as-a-service", "lending"],
  healthtech: ["medtech", "digital health", "biotech", "healthcare", "mental health", "pharma"],
  saas: ["b2b saas", "software", "devtools"],
};

/** Employers Candidates come from (fictional). sector is used for Fit "sector background". */
export const EMPLOYERS: { name: string; sector: string }[] = [
  { name: "Banque Orsay", sector: "Banking" },
  { name: "Coralis Bank", sector: "Fintech" },
  { name: "Mondia Pay", sector: "Payments" },
  { name: "Assurinvest", sector: "Insurtech" },
  { name: "Kordo", sector: "Fintech" },
  { name: "Trelliq", sector: "Fintech" },
  { name: "Datavelle", sector: "SaaS" },
  { name: "Brumeo", sector: "E-commerce" },
  { name: "Lumicor", sector: "SaaS" },
  { name: "Selvane", sector: "Payments" },
  { name: "Nexaro", sector: "Fintech" },
  { name: "Orbipay", sector: "Payments" },
  { name: "Vantiel", sector: "Banking" },
  { name: "Quaro Health", sector: "Healthtech" },
  { name: "Medvia", sector: "Healthtech" },
  { name: "Soigno", sector: "Healthtech" },
  { name: "Klinikon", sector: "Healthtech" },
  { name: "Atrium Labs", sector: "SaaS" },
  { name: "Fennel Studio", sector: "Agency" },
  { name: "Pixelharbor", sector: "Agency" },
  { name: "Caremetric", sector: "Healthtech" },
  { name: "Tandemic", sector: "SaaS" },
];

export const ROLE_SKILLS: { match: RegExp; skills: string[] }[] = [
  { match: /backend|platform|software|python|go\b|kotlin/i, skills: ["Go", "PostgreSQL", "Kafka", "gRPC", "Kubernetes", "Python", "Kotlin", "Event sourcing", "AWS"] },
  { match: /frontend|full-stack|fullstack/i, skills: ["TypeScript", "React", "Next.js", "GraphQL", "Design systems", "Node.js"] },
  { match: /design|ux|ui/i, skills: ["Figma", "Design systems", "User research", "Prototyping", "Accessibility", "B2B SaaS", "Service design"] },
  { match: /data|machine learning|ml\b/i, skills: ["Python", "dbt", "SQL", "Airflow", "Spark", "Snowflake"] },
  { match: /product manager|product owner/i, skills: ["Discovery", "Roadmapping", "B2B SaaS", "Analytics", "Pricing"] },
  { match: /sales|account executive|business developer/i, skills: ["SaaS sales", "Mid-market", "MEDDIC", "Outbound", "Negotiation"] },
  { match: /mobile|ios|android/i, skills: ["Swift", "Kotlin", "React Native", "CI/CD"] },
];

export const DEFAULT_SKILLS = ["Stakeholder management", "Cross-functional delivery", "Mentoring"];

export const HIRING_CONTACT_TITLES_TECH = ["CTO", "VP Engineering", "Head of Talent", "Engineering Manager", "Co-founder & CEO"];
export const HIRING_CONTACT_TITLES_DESIGN = ["VP Product", "Head of Design", "Talent Acquisition Lead", "Chief Product Officer"];
export const HIRING_CONTACT_TITLES_GENERIC = ["Co-founder & CEO", "Head of Talent", "COO", "Head of People"];

export const TURBULENCE_EVENTS = [
  "announced a restructuring",
  "lost its CTO",
  "postponed its funding round",
  "was acquired by a larger group",
  "froze hiring for two quarters",
];

export const NEWS_SITE = { name: "Tech Capital Weekly", domain: "techcapitalweekly.example" };
