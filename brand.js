// Branding for this deployment. Edit this file (and manifest.webmanifest + the images in brand/)
// to rebrand the app. The company details below pre-fill the company profile on first launch.
window.BRAND = {
  appName: 'Advanced Tree Service',

  colors: {
    primary: '#d4e12b',     // neon lime — buttons, selected choices
    primaryDark: '#a8b512', // pressed / darker lime
    accent: '#e0312b',      // brand red — danger, accents
    background: '#0d0f0e',  // charcoal black app background
    ink: '#f2f4f1',
    muted: '#a7aea8',
    line: '#2c322e',
    card: '#1a1d1b',
    danger: '#e0312b',
    onPrimary: '#0d0f0e',   // text on lime buttons
  },

  company: {
    name: 'Advanced Tree Service',
    license: '',
    address: '',
    phone: '',
    email: '',
    website: 'advanced-treeservice.com',
    dayRate: 2000,   // price per crew day
    taxRate: 0,
    depositPct: 0,
    validDays: 30,
    logo: 'brand/logo.svg',
  },
};

// Apply colors before the page paints so there's no flash of the default theme.
(() => {
  const c = window.BRAND.colors;
  const s = document.documentElement.style;
  s.setProperty('--green', c.primary);
  s.setProperty('--green-dark', c.primaryDark);
  s.setProperty('--bark', c.accent);
  s.setProperty('--bg', c.background);
  if (c.ink) s.setProperty('--ink', c.ink);
  if (c.muted) s.setProperty('--muted', c.muted);
  if (c.line) s.setProperty('--line', c.line);
  if (c.card) s.setProperty('--card', c.card);
  if (c.danger) s.setProperty('--danger', c.danger);
  if (c.onPrimary) s.setProperty('--on-primary', c.onPrimary);
})();
