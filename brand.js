// Branding for this deployment. Edit this file (and manifest.webmanifest + the images in brand/)
// to rebrand the app. The company details below pre-fill the company profile on first launch.
window.BRAND = {
  appName: 'Advanced Tree Service',

  colors: {
    primary: '#2f5d3a',     // header, buttons, selected choices
    primaryDark: '#224529',
    accent: '#6b4f3a',      // "ESTIMATE" title on the printout
    background: '#eef1ec',  // app background
  },

  company: {
    name: 'Advanced Tree Service',
    license: '',
    address: '',
    phone: '',
    email: '',
    website: 'advanced-treeservice.com',
    dayRate: 2000,   // crew price per day
    crew: '3 regular employees + 1 part-time',
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
})();
