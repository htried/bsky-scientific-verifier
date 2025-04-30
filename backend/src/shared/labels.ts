// Define the label value definition type
interface LabelValueDefinition {
  identifier: string;
  severity: 'inform' | 'alert' | 'none';
  blurs: 'content' | 'media' | 'none';
  defaultSetting: 'ignore' | 'warn' | 'hide';
  adultOnly?: boolean;
  locales: Array<{
    lang: string;
    name: string;
    description: string;
  }>;
}

// Define our label values
export const LABEL_DEFINITIONS: LabelValueDefinition[] = [
  {
    identifier: 'verified-scientist',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    locales: [
      { lang: 'en', name: 'Verified Scientist 🔬', description: 'This account has been verified as a scientist through ORCID' }
    ]
  },
  {
    identifier: 'publications-0-9',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    locales: [
      { lang: 'en', name: '0-9 Publications 📚', description: 'This scientist has published 0-9 papers' }
    ]
  },
  {
    identifier: 'publications-10-49',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    locales: [
      { lang: 'en', name: '10-49 Publications 📚', description: 'This scientist has published 10-49 papers' }
    ]
  },
  {
    identifier: 'publications-50-99',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    locales: [
      { lang: 'en', name: '50-99 Publications 📚', description: 'This scientist has published 50-99 papers' }
    ]
  },
  {
    identifier: 'publications-100-499',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    locales: [
      { lang: 'en', name: '100-499 Publications 📚', description: 'This scientist has published 100-499 papers' }
    ]
  },
  {
    identifier: 'publications-500+',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    locales: [
      { lang: 'en', name: '500+ Publications 📚', description: 'This scientist has published 500 or more papers' }
    ]
  },
  {
    identifier: 'publication-years-0-4',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    locales: [
      { lang: 'en', name: '0-4 Years Publishing 📅', description: 'This scientist has been publishing for 0-4 years' }
    ]
  },
  {
    identifier: 'publication-years-5-9',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    locales: [
      { lang: 'en', name: '5-9 Years Publishing 📅', description: 'This scientist has been publishing for 5-9 years' }
    ]
  },
  {
    identifier: 'publication-years-10-19',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    locales: [
      { lang: 'en', name: '10-19 Years Publishing 📅', description: 'This scientist has been publishing for 10-19 years' }
    ]
  },
  {
    identifier: 'publication-years-20+',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    adultOnly: false,
    locales: [
      { lang: 'en', name: '20+ Years Publishing 📅', description: 'This scientist has been publishing for 20 or more years' }
    ]
  }
]; 