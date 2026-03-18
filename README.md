# ভাড়া কত (Vara Koto)

A bilingual (Bengali/English) BRTA fare calculator for Dhaka bus commuters. Select your origin and destination stops, and get the officially approved bus fare across all matching routes — instantly.

## Features

- **Accurate Fares** — Uses BRTA-approved rates (&#2547;2.41/km) with Google Maps-verified distances
- **Bilingual UI** — Full Bengali and English support with one-tap language switching
- **Dark Mode** — Light and dark themes with design-token-driven color system
- **Student Fare** — Toggle to see half-fare for students
- **Search History** — Recent searches saved locally with confirmation before clearing
- **Multi-bus Transfers** — Suggests transfer routes when no direct route exists
- **Offline Support** — PWA with service worker, versioned cache busting, and skeleton loading screens
- **Accessible** — Screen-reader-friendly navigation separators, semantic markup
- **Nearest Stop** — GPS-based origin detection via Barikoi reverse geocoding

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui v4 |
| Backend | Express 5, Mongoose, TypeScript |
| Database | MongoDB Atlas |
| Runtime | Node.js 20+ via tsx |

## Getting Started

### Prerequisites

- Node.js 20 LTS or 22 LTS
- MongoDB Atlas connection string (or local MongoDB)

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/varakoto.git
cd varakoto

# Install all dependencies (root + both apps)
npm run install:all
```

### Environment Setup

**Backend** — copy `apps/api/.env.example` to `apps/api/.env`:

```env
MONGODB_URI=mongodb+srv://...
PORT=5001
```

**Frontend** — copy `apps/web/.env.example` to `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5001
```

### Run

```bash
# Run both frontend and backend
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:5001

## Project Structure

```
varakoto/
├── apps/
│   ├── api/          # Express 5 REST API
│   │   ├── src/
│   │   │   ├── controllers/   # Route handlers (fare, stops)
│   │   │   ├── models/        # Mongoose schemas
│   │   │   ├── utils/         # Stop aliases, distance consensus, text normalization
│   │   │   └── server.ts      # Entry point
│   │   └── scripts/           # Distance precomputation & calibration tools
│   └── web/          # Next.js frontend
│       ├── app/               # App Router pages (home, results, history, settings)
│       ├── components/        # UI components (navbar, bottom-nav, fare cards)
│       ├── context/           # Language & theme providers
│       └── lib/               # API client, i18n, history
└── package.json      # Monorepo root with concurrently
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Server health status and uptime |
| `GET` | `/api/v1/stops` | Returns all unique stops with Bengali & English names |
| `POST` | `/api/v1/fare/calculate` | Calculates fare for origin → destination |
| `GET` | `/api/v1/nearest-stop?lat=...&lng=...` | GPS-based nearest stop finder |

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
4. Fare = `max(min_fare, distance x 2.41)`, rounded to nearest taka
5. Results sorted by fare, deduplicated by bus name

## Supported By

<a href="https://barikoi.com" target="_blank">
  <img src="apps/web/public/barikoi-logo.svg" alt="Barikoi Maps" height="30" />
</a>

Location data and geocoding services powered by [Barikoi Maps](https://barikoi.com).

## License

MIT

## Contact

For questions or feedback: ertsourav@gmail.com
