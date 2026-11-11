// Branding for this deployment. Edit this file (and manifest.webmanifest + the images in brand/)
// to rebrand the app. The company details below pre-fill the company profile on first launch.
window.BRAND = {
  appName: 'Advanced Tree Service',

  colors: {
    // Light workspace (Phase D) with ATS chartreuse accent used sparingly
    primary: '#C5D92A',
    primaryDark: '#A8B512',
    accent: '#B42318',
    background: '#F5F7FA',
    ink: '#172022',
    muted: '#5B6B73',
    line: '#DDE3EA',
    card: '#FFFFFF',
    danger: '#B42318',
    onPrimary: '#172022',
  },

  company: {
    name: 'Advanced Tree Service',
    contactName: 'Joey Beairl',
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
