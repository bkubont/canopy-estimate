// Branding for this deployment. Edit this file (and manifest.webmanifest + the images in brand/)
// to rebrand the app. Company details here are the defaults on every device; each device can
// still override them under the "Company" button.
window.BRAND = {
  appName: 'Canopy Estimate',

  colors: {
    primary: '#2f5d3a',     // toolbar, headings, table header
    primaryDark: '#224529',
    accent: '#6b4f3a',      // "ESTIMATE" title
    background: '#eef1ec',  // page background behind the form
  },

  company: {
    coName: 'Your Tree Service',
    coAddress: '',
    coPhone: '',
    coEmail: '',
    coWebsite: '',
    coLicense: '',
    coTax: 0,
    coDeposit: 0,
    coValidDays: 30,
    coTerms: '', // leave blank to use the built-in default terms
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
