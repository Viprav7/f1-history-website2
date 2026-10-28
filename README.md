# Formula 1 History

Unofficial, educational site: cars, drivers, champions and records from 1950 to today.

## Run it

The site loads `data/*.json` with `fetch`, so open it through a local web server (not by double-clicking `index.html`):

    cd f1-history
    python3 -m http.server 8000

Then visit http://localhost:8000

## Data files

`data/cars.json`, `data/drivers.json` and `data/champions.json` are sample data. Replace them with your own; the fields are:

- **cars:** `name`, `year`, `team`, `engine`; optional `constructorName`, `power`, `weight`, `notable`, `notes`, `image`, `credit`
- **drivers:** `name`, `nationality`, `years` (e.g. `"1996–2012"` or `"2007–present"`), `teams` (array); optional `championships`, `wins`, `poles`, `podiums`, `primaryTeam`, `bio`, `image`, `credit`
- **champions:** `year`, `driver`, `team`, `car`; optional `points`, `notes`, `image`, `credit`

Missing images fall back to a generated placeholder. Use only images you have the rights to, and fill `credit` for attribution.
