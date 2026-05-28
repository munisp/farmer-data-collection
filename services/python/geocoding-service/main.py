"""
Geocoding API Integration Service for FarmConnect

Provides forward and reverse geocoding for Nigerian/West African addresses
using Nominatim (OpenStreetMap) with Redis caching and offline fallback
for low-connectivity areas.

Endpoints:
    POST /geocode/forward    — address → lat/lng coordinates
    POST /geocode/reverse    — lat/lng → address components
    POST /geocode/batch      — batch geocode multiple addresses
    POST /geocode/validate   — validate and normalize delivery address
    GET  /geocode/suggestions?q=... — autocomplete address suggestions
    GET  /health             — health check

Port: 8100 (configurable via GEOCODING_PORT)
"""

import os
import time
import json
import logging
import hashlib
from typing import Optional
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s [Geocoding] %(message)s")
logger = logging.getLogger(__name__)

# ─── Nigerian city/state coordinate fallback database ───

NIGERIAN_LOCATIONS: dict[str, dict] = {
    # State capitals + major cities
    "lagos": {"lat": 6.5244, "lng": 3.3792, "state": "Lagos", "type": "city"},
    "ikeja": {"lat": 6.6018, "lng": 3.3515, "state": "Lagos", "type": "city"},
    "abuja": {"lat": 9.0579, "lng": 7.4951, "state": "FCT", "type": "capital"},
    "kano": {"lat": 12.0022, "lng": 8.5920, "state": "Kano", "type": "city"},
    "ibadan": {"lat": 7.3775, "lng": 3.9470, "state": "Oyo", "type": "city"},
    "port harcourt": {"lat": 4.8156, "lng": 7.0498, "state": "Rivers", "type": "city"},
    "benin city": {"lat": 6.3350, "lng": 5.6037, "state": "Edo", "type": "city"},
    "enugu": {"lat": 6.4584, "lng": 7.5464, "state": "Enugu", "type": "city"},
    "kaduna": {"lat": 10.5105, "lng": 7.4165, "state": "Kaduna", "type": "city"},
    "jos": {"lat": 9.8965, "lng": 8.8583, "state": "Plateau", "type": "city"},
    "ilorin": {"lat": 8.4799, "lng": 4.5418, "state": "Kwara", "type": "city"},
    "owerri": {"lat": 5.4850, "lng": 7.0352, "state": "Imo", "type": "city"},
    "abeokuta": {"lat": 7.1475, "lng": 3.3619, "state": "Ogun", "type": "city"},
    "onitsha": {"lat": 6.1452, "lng": 6.7857, "state": "Anambra", "type": "city"},
    "warri": {"lat": 5.5167, "lng": 5.7500, "state": "Delta", "type": "city"},
    "calabar": {"lat": 4.9757, "lng": 8.3417, "state": "Cross River", "type": "city"},
    "uyo": {"lat": 5.0510, "lng": 7.9330, "state": "Akwa Ibom", "type": "city"},
    "aba": {"lat": 5.1060, "lng": 7.3667, "state": "Abia", "type": "city"},
    "akure": {"lat": 7.2526, "lng": 5.1931, "state": "Ondo", "type": "city"},
    "sokoto": {"lat": 13.0622, "lng": 5.2339, "state": "Sokoto", "type": "city"},
    "maiduguri": {"lat": 11.8311, "lng": 13.1510, "state": "Borno", "type": "city"},
    "makurdi": {"lat": 7.7338, "lng": 8.5214, "state": "Benue", "type": "city"},
    "awka": {"lat": 6.2104, "lng": 7.0744, "state": "Anambra", "type": "city"},
    "oshogbo": {"lat": 7.7827, "lng": 4.5418, "state": "Osun", "type": "city"},
    "minna": {"lat": 9.6139, "lng": 6.5569, "state": "Niger", "type": "city"},
    "lafia": {"lat": 8.4966, "lng": 8.5225, "state": "Nasarawa", "type": "city"},
    "birnin kebbi": {"lat": 12.4539, "lng": 4.1975, "state": "Kebbi", "type": "city"},
    "yola": {"lat": 9.2035, "lng": 12.4954, "state": "Adamawa", "type": "city"},
    "bauchi": {"lat": 10.3158, "lng": 9.8442, "state": "Bauchi", "type": "city"},
    "gombe": {"lat": 10.2890, "lng": 11.1671, "state": "Gombe", "type": "city"},
    "damaturu": {"lat": 11.7470, "lng": 11.9608, "state": "Yobe", "type": "city"},
    "dutse": {"lat": 11.7560, "lng": 9.3381, "state": "Jigawa", "type": "city"},
    "gusau": {"lat": 12.1704, "lng": 6.6611, "state": "Zamfara", "type": "city"},
    "lokoja": {"lat": 7.8023, "lng": 6.7333, "state": "Kogi", "type": "city"},
    "abakaliki": {"lat": 6.3249, "lng": 8.1137, "state": "Ebonyi", "type": "city"},
    "asaba": {"lat": 6.1943, "lng": 6.7319, "state": "Delta", "type": "city"},
    "ado ekiti": {"lat": 7.6211, "lng": 5.2212, "state": "Ekiti", "type": "city"},
    # West African cities
    "accra": {"lat": 5.6037, "lng": -0.1870, "state": "Greater Accra", "type": "city", "country": "Ghana"},
    "kumasi": {"lat": 6.6885, "lng": -1.6244, "state": "Ashanti", "type": "city", "country": "Ghana"},
    "lome": {"lat": 6.1375, "lng": 1.2123, "state": "Maritime", "type": "city", "country": "Togo"},
    "cotonou": {"lat": 6.3703, "lng": 2.3912, "state": "Littoral", "type": "city", "country": "Benin"},
    "niamey": {"lat": 13.5116, "lng": 2.1254, "state": "Niamey", "type": "city", "country": "Niger"},
    "dakar": {"lat": 14.6928, "lng": -17.4467, "state": "Dakar", "type": "city", "country": "Senegal"},
    "bamako": {"lat": 12.6392, "lng": -8.0029, "state": "Bamako", "type": "city", "country": "Mali"},
    "ouagadougou": {"lat": 12.3714, "lng": -1.5197, "state": "Centre", "type": "city", "country": "Burkina Faso"},
    "freetown": {"lat": 8.4657, "lng": -13.2317, "state": "Western", "type": "city", "country": "Sierra Leone"},
    "monrovia": {"lat": 6.3156, "lng": -10.8074, "state": "Montserrado", "type": "city", "country": "Liberia"},
}

# Nigerian states with their approximate center coordinates
NIGERIAN_STATES: dict[str, dict] = {
    "abia": {"lat": 5.4527, "lng": 7.5248}, "adamawa": {"lat": 9.3265, "lng": 12.3984},
    "akwa ibom": {"lat": 5.0073, "lng": 7.8494}, "anambra": {"lat": 6.2209, "lng": 6.9370},
    "bauchi": {"lat": 10.7760, "lng": 9.9992}, "bayelsa": {"lat": 4.7717, "lng": 6.0699},
    "benue": {"lat": 7.3369, "lng": 8.7400}, "borno": {"lat": 11.8846, "lng": 13.1520},
    "cross river": {"lat": 5.8702, "lng": 8.5988}, "delta": {"lat": 5.7040, "lng": 5.9339},
    "ebonyi": {"lat": 6.2649, "lng": 8.0137}, "edo": {"lat": 6.6342, "lng": 5.9304},
    "ekiti": {"lat": 7.7190, "lng": 5.3110}, "enugu": {"lat": 6.5364, "lng": 7.4356},
    "fct": {"lat": 9.0579, "lng": 7.4951}, "gombe": {"lat": 10.3632, "lng": 11.1927},
    "imo": {"lat": 5.5720, "lng": 7.0588}, "jigawa": {"lat": 12.2280, "lng": 9.5616},
    "kaduna": {"lat": 10.6104, "lng": 7.6002}, "kano": {"lat": 12.0022, "lng": 8.5920},
    "katsina": {"lat": 12.9908, "lng": 7.6006}, "kebbi": {"lat": 11.4942, "lng": 4.2333},
    "kogi": {"lat": 7.7337, "lng": 6.6906}, "kwara": {"lat": 8.9669, "lng": 4.3874},
    "lagos": {"lat": 6.5244, "lng": 3.3792}, "nasarawa": {"lat": 8.5399, "lng": 8.5727},
    "niger": {"lat": 10.0000, "lng": 6.0000}, "ogun": {"lat": 7.1600, "lng": 3.3500},
    "ondo": {"lat": 7.0907, "lng": 4.8425}, "osun": {"lat": 7.5629, "lng": 4.5200},
    "oyo": {"lat": 8.1574, "lng": 3.6147}, "plateau": {"lat": 9.2182, "lng": 9.5175},
    "rivers": {"lat": 4.8396, "lng": 6.9112}, "sokoto": {"lat": 13.0533, "lng": 5.3223},
    "taraba": {"lat": 7.9994, "lng": 10.7741}, "yobe": {"lat": 12.2939, "lng": 11.4390},
    "zamfara": {"lat": 12.1222, "lng": 6.2236},
}


# ─── Redis cache wrapper ───

class GeoCache:
    def __init__(self):
        self.redis = None
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            import redis as redis_lib
            self.redis = redis_lib.from_url(redis_url, decode_responses=True)
            self.redis.ping()
            logger.info("Redis connected for geocoding cache")
        except Exception:
            logger.warning("Redis not available, using in-memory cache only")
            self.redis = None
        self._mem_cache: dict[str, str] = {}

    def get(self, key: str) -> Optional[dict]:
        cache_key = f"geocode:{key}"
        if self.redis:
            try:
                val = self.redis.get(cache_key)
                if val:
                    return json.loads(val)
            except Exception:
                pass
        if cache_key in self._mem_cache:
            return json.loads(self._mem_cache[cache_key])
        return None

    def set(self, key: str, value: dict, ttl: int = 86400 * 30):
        cache_key = f"geocode:{key}"
        serialized = json.dumps(value)
        self._mem_cache[cache_key] = serialized
        if self.redis:
            try:
                self.redis.setex(cache_key, ttl, serialized)
            except Exception:
                pass


# ─── Nominatim client ───

NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
_last_nominatim_call = 0.0

async def _nominatim_get(path: str, params: dict) -> Optional[dict | list]:
    """Rate-limited Nominatim request (max 1 req/sec per OSM policy)."""
    global _last_nominatim_call
    elapsed = time.time() - _last_nominatim_call
    if elapsed < 1.1:
        import asyncio
        await asyncio.sleep(1.1 - elapsed)

    headers = {"User-Agent": "FarmConnect-Geocoding/1.0 (agricultural-platform)"}
    params["format"] = "json"

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{NOMINATIM_BASE}{path}", params=params, headers=headers)
            _last_nominatim_call = time.time()
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.warning(f"Nominatim request failed: {e}")
    return None


# ─── Pydantic models ───

class ForwardGeocodeRequest(BaseModel):
    address: str = Field(..., min_length=2, max_length=500)
    country: str = Field(default="ng", description="ISO 3166-1 alpha-2 country code")
    limit: int = Field(default=5, ge=1, le=20)

class ReverseGeocodeRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)

class BatchGeocodeRequest(BaseModel):
    addresses: list[str] = Field(..., min_length=1, max_length=50)
    country: str = Field(default="ng")

class ValidateAddressRequest(BaseModel):
    address: str = Field(default="")
    city: str = Field(default="")
    state: str = Field(default="")
    zip: str = Field(default="")
    country: str = Field(default="Nigeria")

class GeocodeResult(BaseModel):
    latitude: float
    longitude: float
    display_name: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    confidence: float = 0.0
    source: str = "nominatim"


# ─── App ───

cache = GeoCache()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Geocoding service starting")
    yield
    logger.info("Geocoding service shutting down")

app = FastAPI(
    title="FarmConnect Geocoding Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _offline_forward(query: str) -> Optional[GeocodeResult]:
    """Offline fallback: match against Nigerian city/state database."""
    q = query.lower().strip()
    # Try exact city match
    if q in NIGERIAN_LOCATIONS:
        loc = NIGERIAN_LOCATIONS[q]
        return GeocodeResult(
            latitude=loc["lat"], longitude=loc["lng"],
            display_name=f"{q.title()}, {loc['state']}, Nigeria",
            city=q.title(), state=loc["state"],
            country=loc.get("country", "Nigeria"),
            confidence=0.9, source="offline_db",
        )
    # Try partial match
    for name, loc in NIGERIAN_LOCATIONS.items():
        if name in q or q in name:
            return GeocodeResult(
                latitude=loc["lat"], longitude=loc["lng"],
                display_name=f"{name.title()}, {loc['state']}, Nigeria",
                city=name.title(), state=loc["state"],
                country=loc.get("country", "Nigeria"),
                confidence=0.7, source="offline_db",
            )
    # Try state match
    for state, coords in NIGERIAN_STATES.items():
        if state in q:
            return GeocodeResult(
                latitude=coords["lat"], longitude=coords["lng"],
                display_name=f"{state.title()} State, Nigeria",
                state=state.title(), country="Nigeria",
                confidence=0.5, source="offline_db",
            )
    return None


def _offline_reverse(lat: float, lng: float) -> Optional[GeocodeResult]:
    """Offline fallback: find nearest known city."""
    from math import radians, sin, cos, sqrt, atan2
    best = None
    best_dist = float("inf")
    for name, loc in NIGERIAN_LOCATIONS.items():
        dlat = radians(loc["lat"] - lat)
        dlng = radians(loc["lng"] - lng)
        a = sin(dlat/2)**2 + cos(radians(lat)) * cos(radians(loc["lat"])) * sin(dlng/2)**2
        d = 6371000 * 2 * atan2(sqrt(a), sqrt(1 - a))
        if d < best_dist:
            best_dist = d
            best = (name, loc, d)
    if best and best[2] < 100_000:  # within 100km
        name, loc, dist = best
        return GeocodeResult(
            latitude=loc["lat"], longitude=loc["lng"],
            display_name=f"Near {name.title()}, {loc['state']}, Nigeria",
            city=name.title(), state=loc["state"],
            country=loc.get("country", "Nigeria"),
            confidence=max(0.3, 1.0 - dist / 100_000),
            source="offline_db",
        )
    return None


@app.post("/geocode/forward", response_model=list[GeocodeResult])
async def forward_geocode(req: ForwardGeocodeRequest):
    """Convert address text to lat/lng coordinates."""
    cache_key = hashlib.md5(f"fwd:{req.address}:{req.country}".encode()).hexdigest()
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Try Nominatim first
    results = []
    data = await _nominatim_get("/search", {
        "q": req.address,
        "countrycodes": req.country,
        "limit": req.limit,
        "addressdetails": 1,
    })

    if data:
        for item in data:
            addr = item.get("address", {})
            results.append(GeocodeResult(
                latitude=float(item["lat"]),
                longitude=float(item["lon"]),
                display_name=item.get("display_name", ""),
                city=addr.get("city") or addr.get("town") or addr.get("village"),
                state=addr.get("state"),
                country=addr.get("country"),
                confidence=float(item.get("importance", 0.5)),
                source="nominatim",
            ))

    # Fallback to offline DB
    if not results:
        offline = _offline_forward(req.address)
        if offline:
            results.append(offline)

    if results:
        cache.set(cache_key, [r.model_dump() for r in results])

    return results


@app.post("/geocode/reverse", response_model=GeocodeResult)
async def reverse_geocode(req: ReverseGeocodeRequest):
    """Convert lat/lng to address components."""
    cache_key = hashlib.md5(f"rev:{req.latitude:.5f}:{req.longitude:.5f}".encode()).hexdigest()
    cached = cache.get(cache_key)
    if cached:
        return cached

    data = await _nominatim_get("/reverse", {
        "lat": req.latitude,
        "lon": req.longitude,
        "zoom": 16,
        "addressdetails": 1,
    })

    if data and "lat" in data:
        addr = data.get("address", {})
        result = GeocodeResult(
            latitude=float(data["lat"]),
            longitude=float(data["lon"]),
            display_name=data.get("display_name", ""),
            city=addr.get("city") or addr.get("town") or addr.get("village"),
            state=addr.get("state"),
            country=addr.get("country"),
            confidence=float(data.get("importance", 0.5)),
            source="nominatim",
        )
        cache.set(cache_key, result.model_dump())
        return result

    # Offline fallback
    offline = _offline_reverse(req.latitude, req.longitude)
    if offline:
        cache.set(cache_key, offline.model_dump())
        return offline

    raise HTTPException(status_code=404, detail="No address found for coordinates")


@app.post("/geocode/batch")
async def batch_geocode(req: BatchGeocodeRequest):
    """Batch geocode multiple addresses."""
    results = []
    for address in req.addresses:
        try:
            sub_results = await forward_geocode(ForwardGeocodeRequest(
                address=address, country=req.country, limit=1
            ))
            results.append({
                "address": address,
                "result": sub_results[0].model_dump() if sub_results else None,
                "found": len(sub_results) > 0,
            })
        except Exception as e:
            results.append({
                "address": address,
                "result": None,
                "found": False,
                "error": str(e),
            })
    return {"results": results, "total": len(results), "found": sum(1 for r in results if r["found"])}


@app.post("/geocode/validate")
async def validate_address(req: ValidateAddressRequest):
    """Validate and geocode a delivery address, returning normalized components."""
    search_parts = [p for p in [req.address, req.city, req.state, req.country] if p]
    search_query = ", ".join(search_parts)

    if not search_query.strip():
        raise HTTPException(status_code=400, detail="At least one address component required")

    country_code = "ng"
    if req.country.lower() in ("ghana",): country_code = "gh"
    elif req.country.lower() in ("togo",): country_code = "tg"
    elif req.country.lower() in ("benin",): country_code = "bj"

    results = await forward_geocode(ForwardGeocodeRequest(
        address=search_query, country=country_code, limit=1
    ))

    if results:
        r = results[0]
        return {
            "valid": True,
            "normalized": {
                "address": req.address,
                "city": r.city or req.city,
                "state": r.state or req.state,
                "country": r.country or req.country,
                "latitude": r.latitude,
                "longitude": r.longitude,
            },
            "confidence": r.confidence,
            "source": r.source,
            "display_name": r.display_name,
        }

    return {
        "valid": False,
        "normalized": None,
        "confidence": 0,
        "source": "none",
        "message": "Could not validate address",
    }


@app.get("/geocode/suggestions")
async def suggestions(q: str = Query(..., min_length=2)):
    """Autocomplete address suggestions (offline + Nominatim)."""
    results = []
    q_lower = q.lower()

    # Fast offline suggestions first
    for name, loc in NIGERIAN_LOCATIONS.items():
        if q_lower in name:
            results.append({
                "text": f"{name.title()}, {loc['state']}, {loc.get('country', 'Nigeria')}",
                "latitude": loc["lat"],
                "longitude": loc["lng"],
                "source": "offline_db",
            })
        if len(results) >= 5:
            break

    # Supplement with Nominatim if fewer than 5 results
    if len(results) < 5:
        data = await _nominatim_get("/search", {
            "q": q, "countrycodes": "ng,gh,tg,bj",
            "limit": 5 - len(results), "addressdetails": 1,
        })
        if data:
            for item in data:
                results.append({
                    "text": item.get("display_name", ""),
                    "latitude": float(item["lat"]),
                    "longitude": float(item["lon"]),
                    "source": "nominatim",
                })

    return {"suggestions": results, "count": len(results)}


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "geocoding-service",
        "redis": cache.redis is not None,
        "offline_cities": len(NIGERIAN_LOCATIONS),
        "offline_states": len(NIGERIAN_STATES),
        "features": [
            "forward-geocoding",
            "reverse-geocoding",
            "batch-geocoding",
            "address-validation",
            "autocomplete-suggestions",
            "offline-nigerian-fallback",
            "redis-caching",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("GEOCODING_PORT", "8100"))
    logger.info(f"Starting geocoding service on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
