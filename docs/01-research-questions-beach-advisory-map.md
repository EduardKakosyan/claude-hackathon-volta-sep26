---
type: research-questions
---

# Research Questions

1. **Existing frontend scaffold.** In `volta-frontend/`, how is the app built and composed today? Document the build tooling and dependencies in `package.json` (React 19, Vite 7, TypeScript, Tailwind v4 via `@tailwindcss/vite`, shadcn/ui per `components.json`, Radix primitives, lucide icons, date-fns), the `@` path alias in `vite.config.ts` and `tsconfig.*.json`, and how `src/main.tsx`, `src/App.tsx`, and `src/components/Layout.tsx` switch between views (local `useState` page switching versus a router). How do the page components consume `src/data/mockData.ts` and `src/types/index.ts`, and is there any data fetching, environment-variable usage, backend code, or deployment configuration anywhere in the repo (note `public/sitemap.xml` and `public/robots.txt` reference `https://volta-app.com`, and the root `README.md` describes an n8n + Pinecone backend that is not in the tree)?

2. **Design system and visual conventions.** What design tokens does `volta-frontend/src/index.css` define: the `@theme inline` mapping, the `:root` and `.dark` token sets (record the actual oklch values for background, foreground, primary, secondary, muted, accent, destructive, border, ring, chart-1..5, sidebar-*), the `--radius` scale, and the `@custom-variant dark` mechanism? What fonts, shadows, and spacing conventions are in use (or absent)? Which shadcn/ui components exist under `src/components/ui/` and what variants do they expose (button, badge, card, sheet, dialog, tabs, select, switch, progress, etc.)? How do the existing page components (`Dashboard.tsx`, `Calendar.tsx`, `Tasks.tsx`, `Layout.tsx`) use color for status and priority (including the hex colors in `mockData.ts`), responsive breakpoints, and mobile navigation via `Sheet`?

3. **HRM supervised beach status data.** How does the Halifax Regional Municipality page at `https://www.halifax.ca/parks-recreation/programs-activities/swimming/supervised-beaches-outdoor-pools-splash-pads` structure its "Supervised beach status updates" table: the exact columns, the status vocabulary (Open / Risk Advisory in Effect / Closed / Supervision ended for the season), the stated update schedule, the per-beach sub-pages, and whether the HTML is static server-rendered or JS-driven? How does that page relate to the ArcGIS open-data "Beach Water Quality" layer at `https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/Beach_Water_Quality/FeatureServer/1` (schema, `BEACH_CLOSURE_FLAG`, `INDIVIDUAL_THRESHOLD` / `GEOMETRIC_THRESHOLD` semantics, `CATEGORY_TYPE`, years covered, and whether it carries geometry)? Where does HRM publish blue-green algae notices (`https://www.halifax.ca/about-halifax/environment-climate-change/lakes-rivers/harmful-algae-blooms`), and what does the Beach Water Quality Monitoring Protocol PDF say about sampling frequency and closure thresholds? What CORS headers and robots.txt rules do these pages return for browser-side versus server-side fetching?

4. **Provincial advisories and blue-green algae reports.** How is `https://parks.novascotia.ca/advisories` structured (card list, link to detail pages, which fields appear on the listing versus the detail page, how dates are shown, how beach closures and "Potential Blue-green Algae" notices are mixed with trail and facility notices)? Is there any RSS feed, JSON endpoint, or sitemap for advisories? What does `https://parks.novascotia.ca/supervised-swimming` list (beach names, hours, supervision dates)? How do `https://novascotia.ca/blue-green-algae/` and `https://novascotia.ca/dhw/environmental/blue-green-algae.asp` present the running list of reported blooms for the current year, and where does that list actually render? What CORS and robots.txt behavior do these provincial pages exhibit?

5. **Beach location and identity data.** What public datasets provide names and coordinates for Nova Scotia provincial park beaches, provincially supervised beaches (Nova Scotia Lifeguard Service, roughly 23 to 25 beaches), and HRM supervised beaches? Check the NS Open Data portal (`https://data.novascotia.ca/`, Socrata, including the Lifeguard Beach Counts dataset `ak4w-ymqm`), GeoNOVA / provincial parks boundary layers, the HRM ArcGIS layer `HRM_Park_Recreation_Features_2/FeatureServer/0`, Canada's open government portal, and OpenStreetMap tagging for these beaches. How do beach names differ across the HRM status table, the ArcGIS sample names (e.g. `BEACH_SAMPLE_NAME` values like "SANDY POINT ROCK A"), parks.novascotia.ca advisories, and the lifeguard beach lists?

6. **Mapping library capabilities.** What do the Apple MapKit JS docs (`https://developer.apple.com/documentation/mapkitjs`, `https://developer.apple.com/maps/web/`) say about authentication (Maps ID, private key, JWT generation, token expiry and origin restrictions, Apple Developer Program membership requirement), supported map types (standard, satellite, hybrid), 3D and camera controls (tilt, heading, elevation, 3D buildings), annotations, overlays, clustering, and free-tier limits (map views and service calls per day)? How do MapLibre GL JS (terrain and 3D extrusions, free vector tile sources such as OpenFreeMap or Protomaps, `react-map-gl` bindings) and CesiumJS (true 3D globe, Cesium Ion dependency) compare on setup, licensing, and bundle weight? How is each typically loaded in a React 19 + Vite app?

7. **Existing comparable tools.** How does Swim Guide (`https://www.theswimguide.org/beaches/nova-scotia`, iOS app) present Nova Scotia and Halifax beach status: which government sources does it aggregate, how current is its data during the season, what does a beach detail page show, and does it expose an API? What does SolveHFX (`https://www.solvehfx.ca/`) do and how is it built as a comparable independent civic map site? Are there any other existing sites, apps, or notification services (email, SMS, social accounts) that already surface Nova Scotia beach closures or blue-green algae advisories?

## Key Context Pointers

From the ticket:

- Links: https://parks.novascotia.ca/advisories
- Problem statement (verbatim from ticket): "halifax tests every supervised beach each morning for bacteria and blue-green algae, which can make people sick and kill dogs and posts the result on one webpage nobody checks"
- Libraries / dependencies: "latest apple maps api or other open source maps" (3D map of Nova Scotia)
- Comparable site mentioned in the transcript: Solve HFX (civic reporting site for HRM)
- Judging criteria from the ticket: day-one impact weighted 2x ("could they use it Monday?"), product usability, idea from a real insight, demo clarity. Four-hour build window, three-minute demo.
- Repositories: this repo (`volta_hackathon`), a prior hackathon submission whose `volta-frontend/` Vite + React + shadcn/ui scaffold is the only code present

Found during scoping (starting points for the research agent):

- HRM supervised beach status table: https://www.halifax.ca/parks-recreation/programs-activities/swimming/supervised-beaches-outdoor-pools-splash-pads
- HRM harmful algae blooms page: https://www.halifax.ca/about-halifax/environment-climate-change/lakes-rivers/harmful-algae-blooms
- HRM open data "Beach Water Quality" (ArcGIS Hub, non-spatial, 2022 to 2024): https://data-hrm.hub.arcgis.com/datasets/HRM::beach-water-quality and https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/Beach_Water_Quality/FeatureServer/1
- HRM park/recreation features layer (possible beach geometry): https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/HRM_Park_Recreation_Features_2/FeatureServer/0
- NS supervised swimming list: https://parks.novascotia.ca/supervised-swimming
- NS blue-green algae pages: https://novascotia.ca/blue-green-algae/ and https://novascotia.ca/dhw/environmental/blue-green-algae.asp
- NS Open Data portal and Lifeguard Beach Counts: https://data.novascotia.ca/ and https://data.novascotia.ca/datasets/ak4w-ymqm
- Nova Scotia Lifeguard Service: https://nsls.lifesavingns.ca/ and https://ns.211.ca/services/nova-scotia-lifeguard-service/list-of-supervised-beaches/
- Swim Guide: https://www.theswimguide.org/beaches/nova-scotia
- SolveHFX: https://www.solvehfx.ca/
- Apple MapKit JS: https://developer.apple.com/documentation/mapkitjs, https://developer.apple.com/maps/web/, https://developer.apple.com/documentation/applemapsserverapi/creating-a-maps-identifier-and-a-private-key
- MapLibre GL JS: https://maplibre.org/projects/gl-js/
- Filepaths: `volta-frontend/package.json`, `volta-frontend/components.json`, `volta-frontend/vite.config.ts`, `volta-frontend/src/index.css`, `volta-frontend/src/App.tsx`, `volta-frontend/src/components/Layout.tsx`, `volta-frontend/src/components/ui/`, `volta-frontend/src/data/mockData.ts`, `volta-frontend/src/types/index.ts`, `volta-frontend/public/sitemap.xml`
