# ভাড়া কত (Vara Koto)

A bilingual (Bengali/English) BRTA fare calculator for Dhaka bus commuters. Select your origin and destination stops, and get the officially approved bus fare across all matching routes — instantly.

## Features

- **Accurate Fares** — Uses BRTA-approved rates (&#2547;2.42/km) with Google Maps-verified distances
- **Bilingual UI** — Full Bengali and English support with one-tap language switching
- **Dark Mode** — Light and dark themes with design-token-driven color system
- **Student Fare** — Toggle to see half-fare for students
- **Search History** — Recent searches saved locally with confirmation before clearing
- **Multi-bus Transfers** — Suggests transfer routes when no direct route exists
- **Offline Support** — PWA with service worker, versioned cache busting, and skeleton loading screens
- **Accessible** — Screen-reader-friendly navigation separators, semantic markup
- **Nearest Stop with Route** — GPS-based origin detection with walking route visualization to the nearest bus stop (inline + fullscreen map)
- **Nearby Stops Map** — Full-screen map showing all bus stops within 5 km of the user's GPS position, with distance labels and one-tap stop selection
- **Route Preview** — Interactive map preview showing the actual road route between origin and destination stops
- **Results Map** — Interactive Barikoi GL map on the results page with origin, destination, transfer markers and real driving route geometry, with dark mode support
- **Barikoi Place Search** — Fallback autocomplete via Barikoi when a typed query doesn't match any known stop, mapping places to the nearest bus stop
- **Elevated Expressway** — Automatic detection when a route may use the Dhaka Elevated Expressway (Kawla–Farmgate corridor)

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui v4 |
| Backend | Express 5, Mongoose, TypeScript |
| Database | MongoDB Atlas |
| Maps | Barikoi GL (MapLibre) for results map, Leaflet + OpenStreetMap for route preview and nearest-stop maps, Barikoi Geocoding & Routing APIs |
| Analytics | Vercel Analytics + Speed Insights |
| Runtime | Node.js 20+ via tsx |

## Getting Started

### Prerequisites

- Node.js 20 LTS or 22 LTS
- MongoDB Atlas connection string (or local MongoDB)

### Installation

```bash
# Clone the repo
git clone https://github.com/masudursourav/varakoto.git
cd varakoto

# Install all dependencies (root + both apps)
npm run install:all
```

### Environment Setup

**Backend** — copy `apps/api/.env.example` to `apps/api/.env`:

```env
MONGODB_URI=mongodb+srv://...
PORT=5001
BARIKOI_API_KEY=your_barikoi_api_key
ALLOWED_ORIGINS=http://localhost:3000
```

**Frontend** — copy `apps/web/.env.example` to `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5001
NEXT_PUBLIC_BARIKOI_API_KEY=your_barikoi_api_key
```

### Run

```bash
# Run both frontend and backend
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:5001
- API Docs: http://localhost:5001/api-docs

## Project Structure

```
varakoto/
├── apps/
│   ├── api/          # Express 5 REST API
│   │   ├── src/
│   │   │   ├── controllers/   # Route handlers (fare, stops, nearest stop, place search, routing, maps)
│   │   │   ├── middleware/     # Error handler, Zod request validation
│   │   │   ├── models/        # Mongoose schemas
│   │   │   ├── utils/         # Stop aliases, distance consensus, text normalization, geo utilities, stop map cache
│   │   │   └── server.ts      # Entry point
│   │   └── scripts/           # Distance precomputation & calibration tools
│   └── web/          # Next.js frontend
│       ├── app/               # App Router pages (home, results, history, settings)
│       ├── components/        # UI components (navbar, bottom-nav, fare cards, map previews)
│       ├── context/           # Language & theme providers
│       ├── lib/               # API client, i18n, history, utilities
│       └── public/            # PWA manifest, icons, service worker
└── package.json      # Monorepo root with concurrently
```

## API Endpoints

All endpoints are under `/api/v1`. Interactive Swagger docs are available at `/api-docs`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health status and uptime |
| `GET` | `/stops` | All unique stops with Bengali & English names |
| `POST` | `/fare/calculate` | Calculates fare for origin → destination |
| `GET` | `/nearest-stop?lat=...&lng=...` | GPS-based nearest stop finder with Barikoi reverse geocoding |
| `GET` | `/nearby-stops?lat=...&lng=...` | All stops within 5 km with coordinates for map rendering |
| `GET` | `/search/places?q=...` | Barikoi autocomplete proxy — maps places to nearest bus stops |
| `GET` | `/stop-coords?origin=...&destination=...` | GPS coordinates for two stops |
| `GET` | `/route-to-stop?lat=...&lng=...` | Walking route from user's position to nearest bus stop |
| `GET` | `/route-map?origin=...&destination=...&transfer=...` | Route geometry and stop coordinates for interactive map |

### Rate Limiting

| Scope | Limit |
|-------|-------|
| General (`/api/v1/*`) | 120 req/min per IP |
| Fare calculation | 30 req/min per IP |
| Barikoi-proxying endpoints (`nearest-stop`, `route-to-stop`, `search/places`, `route-map`) | 15 req/min per IP |

### Example Request

```bash
curl -X POST http://localhost:5001/api/v1/fare/calculate \
  -H "Content-Type: application/json" \
  -d '{"origin": "Airport", "destination": "Farmgate"}'
```

## Scripts

```bash
# Typecheck backend
npm run typecheck --prefix apps/api

# Lint frontend
npm run lint --prefix apps/web

# Build frontend for production (generates PWA icons + versioned service worker)
npm run build
```

### Distance Tools (in `apps/api/scripts/`)

```bash
# Update DB route distances from Google Maps cache
npx tsx scripts/update-distances.ts          # dry-run
npx tsx scripts/update-distances.ts --apply  # commit to DB

# Precompute Google direct distances for all stop pairs
npx tsx scripts/precompute-distances.ts --count  # estimate cost
npx tsx scripts/precompute-distances.ts --fetch  # fetch from Google

# Calibrate Dijkstra correction factor
npx tsx scripts/calibrate-factor.ts
```

## Design System

The frontend uses a token-driven design system defined in `globals.css`:

- **Colors** — Brand blue is set via `--primary` (light: `#1a4a8e`, dark: Tailwind `blue-400`). All components use `text-primary`, `bg-primary` instead of hardcoded hex values.
- **Radius scale** — Three semantic tokens control all surface corner radii:
  - `rounded-container` — Hero cards, modals, bottom sheets
  - `rounded-card` — Interactive cards, CTA buttons, dialogs
  - `rounded-panel` — Inner sections, dropdowns, info blocks
- **Shadows** — Standard Tailwind shadow utilities (`shadow-xl`, `shadow-md`) instead of custom CSS classes.

Changing `--radius` or `--primary` in `:root` scales the entire UI proportionally.

## How Fare Calculation Works

1. User selects origin and destination stops (Bengali or English input)
2. Stop alias system resolves spelling variants to canonical English names
3. Distance consensus engine picks the best distance from:
   - Precomputed Google Maps direct driving distance (primary)
   - Dijkstra shortest path through verified edges (fallback)
   - Database minimum km difference (last resort)
4. Fare = `max(min_fare, distance × 2.42)`, rounded to nearest taka
5. Results sorted by fare, deduplicated by bus name

## Map Features

- **Route Preview** — When both origin and destination are selected, an interactive Leaflet map appears showing the two stops connected by the actual driving route via Barikoi Routing API. Supports zoom (+/−) and drag.
- **Results Map** — On the results page, a Barikoi GL (MapLibre) map displays origin (green), destination (red), and transfer (amber) markers with real driving route geometry. Supports dark mode via automatic style switching with `MutationObserver`.
- **Nearest Stop Route** — After GPS detection, a walking route map shows the path from the user's current position to the nearest bus stop, with distance and estimated walking time. Supports inline and fullscreen views.
- **Nearby Stops Map** — Full-screen Leaflet map with all bus stops within 5 km rendered as markers. Includes a scrollable bottom panel listing stops with distances and one-tap selection.
- **Barikoi Integration** — Stop coordinate lookup uses hardcoded STOP_COORDS (69 major stops) with automatic Barikoi forward geocoding fallback. Walking routes use the `foot` profile; driving routes use the default profile. Geocode results and stop maps are cached in-memory with TTL.

## Supported By

<a href="https://barikoi.com" target="_blank">
  <img src="apps/web/public/barikoi-logo.svg" alt="Barikoi Maps" height="30" />
</a>

Location data, geocoding, autocomplete, and routing services powered by [Barikoi Maps](https://barikoi.com).

## License

MIT

## Contact

For questions or feedback: ertsourav@gmail.com
