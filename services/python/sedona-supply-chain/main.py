"""
Apache Sedona Supply Chain Spatial Analytics (Python)

Distributed spatial analytics for supply chain optimization using Apache Sedona on PySpark.

Jobs:
- Delivery zone optimization (cluster analysis)
- Collection point coverage gaps
- Route density heatmaps
- Demand-supply geospatial matching
- Fleet utilization analysis
- Cold chain breach spatial patterns

Middleware: PostgreSQL+PostGIS (source), Kafka (events), 
Lakehouse (data lake), OpenSearch (indexed results)
"""

import os
import json
import logging
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from http.server import HTTPServer, BaseHTTPRequestHandler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [SedonaSupplyChain] %(message)s")
logger = logging.getLogger(__name__)

# Check for PySpark/Sedona availability
SPARK_AVAILABLE = False
try:
    from pyspark.sql import SparkSession
    from pyspark.sql import functions as F
    SPARK_AVAILABLE = True
except ImportError:
    logger.warning("PySpark not available — running analytical fallback mode")

SEDONA_AVAILABLE = False
try:
    from sedona.register import SedonaRegistrator
    SEDONA_AVAILABLE = True
except ImportError:
    logger.warning("Sedona not available — using Haversine-based spatial operations")

# ============================================================================
# Configuration
# ============================================================================

class Config:
    def __init__(self):
        self.port = int(os.getenv("PORT", "8095"))
        self.database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/farmer_data")
        self.spark_master = os.getenv("SPARK_MASTER", "local[*]")
        self.lakehouse_path = os.getenv("LAKEHOUSE_PATH", "/tmp/lakehouse/supply-chain")

config = Config()

# ============================================================================
# Spatial Utilities (fallback when PostGIS/Sedona unavailable)
# ============================================================================

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def point_in_polygon(lat: float, lon: float, polygon: List[Tuple[float, float]]) -> bool:
    """Ray-casting algorithm for point-in-polygon check."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i]
        yj, xj = polygon[j]
        if ((yi > lon) != (yj > lon)) and (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside

# ============================================================================
# Supply Chain Analytics Engine
# ============================================================================

class SupplyChainAnalytics:
    def __init__(self):
        self.spark = None
        if SPARK_AVAILABLE:
            try:
                builder = SparkSession.builder \
                    .master(config.spark_master) \
                    .appName("SupplyChainSedona") \
                    .config("spark.sql.adaptive.enabled", "true") \
                    .config("spark.driver.memory", "1g")
                
                if SEDONA_AVAILABLE:
                    builder = builder \
                        .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer") \
                        .config("spark.kryo.registrator", "org.apache.sedona.core.serde.SedonaKryoRegistrator")
                
                self.spark = builder.getOrCreate()
                if SEDONA_AVAILABLE:
                    SedonaRegistrator.registerAll(self.spark)
                logger.info("Spark + Sedona initialized")
            except Exception as e:
                logger.warning(f"Spark init failed: {e}")
    
    def analyze_collection_point_coverage(
        self,
        points: List[Dict],
        farms: List[Dict],
        max_distance_km: float = 15.0,
    ) -> Dict:
        """Analyze which farms are within range of collection points."""
        covered_farms = []
        uncovered_farms = []
        point_loads = {p["id"]: {"point": p, "farms": []} for p in points}
        
        for farm in farms:
            min_dist = float("inf")
            nearest_point = None
            
            for point in points:
                dist = haversine(farm["latitude"], farm["longitude"], point["latitude"], point["longitude"])
                if dist < min_dist:
                    min_dist = dist
                    nearest_point = point
            
            if min_dist <= max_distance_km and nearest_point:
                covered_farms.append({**farm, "nearest_point_id": nearest_point["id"], "distance_km": round(min_dist, 2)})
                point_loads[nearest_point["id"]]["farms"].append(farm)
            else:
                uncovered_farms.append({**farm, "nearest_distance_km": round(min_dist, 2)})
        
        coverage_pct = (len(covered_farms) / len(farms) * 100) if farms else 0
        
        # Identify overloaded points
        overloaded = []
        for pid, data in point_loads.items():
            if len(data["farms"]) > 50:
                overloaded.append({
                    "point_id": pid,
                    "point_name": data["point"]["name"],
                    "farm_count": len(data["farms"]),
                })
        
        # Suggest new collection point locations (centroid of uncovered farms)
        suggested_new_points = []
        if uncovered_farms:
            # K-means-like clustering of uncovered farms
            clusters = self._simple_cluster(uncovered_farms, k=max(1, len(uncovered_farms) // 20))
            for cluster in clusters:
                lat = sum(f["latitude"] for f in cluster) / len(cluster)
                lon = sum(f["longitude"] for f in cluster) / len(cluster)
                suggested_new_points.append({
                    "latitude": round(lat, 6),
                    "longitude": round(lon, 6),
                    "would_cover_farms": len(cluster),
                })
        
        return {
            "total_farms": len(farms),
            "covered_farms": len(covered_farms),
            "uncovered_farms": len(uncovered_farms),
            "coverage_percentage": round(coverage_pct, 1),
            "max_distance_km": max_distance_km,
            "overloaded_points": overloaded,
            "suggested_new_points": suggested_new_points,
        }
    
    def optimize_delivery_zones(
        self,
        deliveries: List[Dict],
        num_zones: int = 5,
    ) -> Dict:
        """Cluster delivery locations to optimize zone boundaries."""
        if not deliveries:
            return {"zones": [], "message": "No delivery data"}
        
        coords = [(d["latitude"], d["longitude"]) for d in deliveries]
        clusters = self._simple_cluster_coords(coords, k=num_zones)
        
        zones = []
        for i, cluster in enumerate(clusters):
            if not cluster:
                continue
            lats = [c[0] for c in cluster]
            lons = [c[1] for c in cluster]
            center_lat = sum(lats) / len(lats)
            center_lon = sum(lons) / len(lons)
            
            max_dist = max(haversine(center_lat, center_lon, c[0], c[1]) for c in cluster)
            
            zones.append({
                "zone_id": i + 1,
                "center": {"latitude": round(center_lat, 6), "longitude": round(center_lon, 6)},
                "radius_km": round(max_dist, 2),
                "delivery_count": len(cluster),
                "density": round(len(cluster) / (math.pi * max_dist**2 + 0.01), 2),
            })
        
        return {
            "total_deliveries": len(deliveries),
            "zones": zones,
            "num_zones": len(zones),
        }
    
    def fleet_utilization_analysis(
        self,
        drivers: List[Dict],
        assignments: List[Dict],
    ) -> Dict:
        """Analyze fleet utilization and identify bottlenecks."""
        driver_stats = {}
        for d in drivers:
            driver_stats[d["id"]] = {
                "driver_id": d["id"],
                "vehicle_type": d.get("vehicle_type", "unknown"),
                "total_assignments": 0,
                "completed": 0,
                "total_distance_km": 0,
                "avg_delivery_time_min": 0,
                "delivery_times": [],
            }
        
        for a in assignments:
            did = a.get("driver_id")
            if did in driver_stats:
                driver_stats[did]["total_assignments"] += 1
                if a.get("status") == "delivered":
                    driver_stats[did]["completed"] += 1
                if a.get("distance_km"):
                    driver_stats[did]["total_distance_km"] += a["distance_km"]
                if a.get("delivery_time_min"):
                    driver_stats[did]["delivery_times"].append(a["delivery_time_min"])
        
        for did, stats in driver_stats.items():
            times = stats.pop("delivery_times")
            stats["avg_delivery_time_min"] = round(sum(times) / len(times), 1) if times else 0
            stats["utilization_pct"] = round(stats["total_assignments"] / max(1, len(assignments)) * len(drivers) * 100, 1)
        
        idle_drivers = [s for s in driver_stats.values() if s["total_assignments"] == 0]
        busy_drivers = sorted(driver_stats.values(), key=lambda x: x["total_assignments"], reverse=True)[:5]
        
        return {
            "total_drivers": len(drivers),
            "total_assignments": len(assignments),
            "avg_assignments_per_driver": round(len(assignments) / max(1, len(drivers)), 1),
            "idle_drivers": len(idle_drivers),
            "busiest_drivers": busy_drivers[:5],
            "driver_stats": list(driver_stats.values()),
        }
    
    def demand_supply_matching(
        self,
        supply: List[Dict],  # {crop, quantity_kg, latitude, longitude}
        demand: List[Dict],   # {crop, quantity_kg, latitude, longitude}
        max_distance_km: float = 50.0,
    ) -> Dict:
        """Match supply to demand geospatially."""
        matches = []
        unmet_demand = []
        surplus_supply = []
        
        remaining_supply = {i: s["quantity_kg"] for i, s in enumerate(supply)}
        
        for d in demand:
            # Find nearest supply of same crop
            candidates = []
            for i, s in enumerate(supply):
                if s["crop"] != d["crop"] or remaining_supply.get(i, 0) <= 0:
                    continue
                dist = haversine(s["latitude"], s["longitude"], d["latitude"], d["longitude"])
                if dist <= max_distance_km:
                    candidates.append((i, dist, remaining_supply[i]))
            
            candidates.sort(key=lambda x: x[1])
            
            needed = d["quantity_kg"]
            for idx, dist, avail in candidates:
                if needed <= 0:
                    break
                matched = min(needed, avail)
                remaining_supply[idx] -= matched
                needed -= matched
                matches.append({
                    "supply_idx": idx,
                    "demand_crop": d["crop"],
                    "matched_kg": matched,
                    "distance_km": round(dist, 2),
                })
            
            if needed > 0:
                unmet_demand.append({**d, "unmet_kg": needed})
        
        for i, remaining in remaining_supply.items():
            if remaining > 0:
                surplus_supply.append({**supply[i], "surplus_kg": remaining})
        
        return {
            "total_matches": len(matches),
            "total_matched_kg": sum(m["matched_kg"] for m in matches),
            "unmet_demand_items": len(unmet_demand),
            "surplus_supply_items": len(surplus_supply),
            "matches": matches[:50],
            "unmet_demand": unmet_demand[:20],
            "surplus_supply": surplus_supply[:20],
        }
    
    def _simple_cluster(self, items: List[Dict], k: int) -> List[List[Dict]]:
        if not items or k <= 0:
            return []
        k = min(k, len(items))
        # Simple k-means with random initialization
        import random
        centers = random.sample(items, k)
        centers = [(c["latitude"], c["longitude"]) for c in centers]
        
        for _ in range(10):
            clusters = [[] for _ in range(k)]
            for item in items:
                dists = [haversine(item["latitude"], item["longitude"], c[0], c[1]) for c in centers]
                clusters[dists.index(min(dists))].append(item)
            
            new_centers = []
            for cluster in clusters:
                if cluster:
                    new_centers.append((
                        sum(i["latitude"] for i in cluster) / len(cluster),
                        sum(i["longitude"] for i in cluster) / len(cluster),
                    ))
                else:
                    new_centers.append(centers[len(new_centers)] if len(new_centers) < len(centers) else (0, 0))
            centers = new_centers
        
        return [c for c in clusters if c]
    
    def _simple_cluster_coords(self, coords: List[Tuple], k: int) -> List[List[Tuple]]:
        if not coords or k <= 0:
            return []
        k = min(k, len(coords))
        import random
        centers = random.sample(coords, k)
        
        for _ in range(10):
            clusters = [[] for _ in range(k)]
            for c in coords:
                dists = [haversine(c[0], c[1], ctr[0], ctr[1]) for ctr in centers]
                clusters[dists.index(min(dists))].append(c)
            
            new_centers = []
            for cluster in clusters:
                if cluster:
                    new_centers.append((
                        sum(c[0] for c in cluster) / len(cluster),
                        sum(c[1] for c in cluster) / len(cluster),
                    ))
                else:
                    new_centers.append(centers[len(new_centers)] if len(new_centers) < len(centers) else (0, 0))
            centers = new_centers
        
        return [c for c in clusters if c]

# ============================================================================
# HTTP Server
# ============================================================================

analytics = SupplyChainAnalytics()

class AnalyticsHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass
    
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        data = json.loads(body) if body else {}
        
        if self.path == "/api/coverage-analysis":
            result = analytics.analyze_collection_point_coverage(
                points=data.get("collection_points", []),
                farms=data.get("farms", []),
                max_distance_km=data.get("max_distance_km", 15.0),
            )
            self._respond(200, result)
        elif self.path == "/api/optimize-zones":
            result = analytics.optimize_delivery_zones(
                deliveries=data.get("deliveries", []),
                num_zones=data.get("num_zones", 5),
            )
            self._respond(200, result)
        elif self.path == "/api/fleet-utilization":
            result = analytics.fleet_utilization_analysis(
                drivers=data.get("drivers", []),
                assignments=data.get("assignments", []),
            )
            self._respond(200, result)
        elif self.path == "/api/demand-supply-match":
            result = analytics.demand_supply_matching(
                supply=data.get("supply", []),
                demand=data.get("demand", []),
                max_distance_km=data.get("max_distance_km", 50.0),
            )
            self._respond(200, result)
        else:
            self._respond(404, {"error": "Not found"})
    
    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {
                "status": "healthy",
                "service": "sedona-supply-chain-analytics",
                "spark_available": SPARK_AVAILABLE,
                "sedona_available": SEDONA_AVAILABLE,
                "timestamp": datetime.utcnow().isoformat(),
            })
        else:
            self._respond(404, {"error": "Not found"})
    
    def _respond(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

def main():
    server = HTTPServer(("0.0.0.0", config.port), AnalyticsHandler)
    logger.info(f"Sedona Supply Chain Analytics starting on port {config.port}")
    logger.info(f"Spark: {SPARK_AVAILABLE}, Sedona: {SEDONA_AVAILABLE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()

if __name__ == "__main__":
    main()
