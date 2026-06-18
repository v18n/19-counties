# 19 Counties

A self-contained static mini-site for tracking which of Hungary's 19 counties Viktor has visited.

## Local Preview

Run a static server from this directory:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Deployment

The folder can be deployed as static files. To use it as a subdomain, point `19.viktornebehaj.com` at the deployed output for this directory.

The map saves county selections in `localStorage`. A URL like `?visited=pest,baranya` can also preload or share the current selection.

## Data

County boundaries are stored in `data/counties.geojson`, sourced from the public `wuerdo/geoHungary` GeoJSON repository. The source file includes Budapest, but the app filters it out so the tracker matches Hungary's 19 counties.
