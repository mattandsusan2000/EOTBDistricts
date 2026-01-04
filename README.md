# EOTB NC House District Finder

A static, client-side mapping application for exploring **North Carolina House districts and precincts**.

Built with Leaflet and designed so future maintainers can **add or swap map layers** without touching the core UI.

---

## Live Deployment

GitHub Pages (static site):
https://mattandsusan2000.github.io/EOTBDistricts/

Large datasets are fetched at runtime from Cloudflare R2.

---

## Project Structure

```text
site/
├── index.html      # Minimal HTML shell
├── app.js          # All map logic and data loading
└── style.css       # Layout and UI styles
