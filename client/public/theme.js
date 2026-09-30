// Runs before first paint (blocking, not a module) so dark mode never flashes light.
// A separate file because the production CSP forbids inline scripts.
try {
  document.documentElement.dataset.theme =
    localStorage.getItem('aegis.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch {
  document.documentElement.dataset.theme = 'light';
}
