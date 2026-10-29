// srcDoc has an opaque origin. Never grant allow-same-origin to the preview.
export function sandboxDocument(html) {
  const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src blob:; base-uri 'none'; form-action 'none'";
  // Parse author content only after the policy. A detached DOMParser document may
  // fetch resources before it is inserted, so do not parse untrusted HTML here.
  // The HTML parser merges the author's html/head/body tags into this document.
  // Electron also blocks all preview frame navigation and external requests.
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body>${html}</body></html>`;
}
