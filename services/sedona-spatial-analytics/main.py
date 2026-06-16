"""
Apache Sedona Spatial Analytics Service

Provides distributed spatial analytics for the FarmConnect distributor network:
- Coverage gap analysis at scale
- Distributor clustering and optimization
- Route planning between farms and distributors
- Heatmap generation for demand/supply zones
- Spatial join of farms ↔ distributors ↔ markets

Runs as a FastAPI service that connects to PostGIS and uses Apache Sedona
(via PySpark + Sedona) for large-scale spatial computations.
"""

import os
import json
import signal
import sys
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
import psycopg2
from psycopg2.extras import RealDictCursor

# --- Graceful shutdown ---
def handle_sigterm(signum, frame):
    sys.exit(0)

signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGINT, handle_sigterm)


# --- Configuration ---
DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/farmconnect")
SEDONA_MASTER = os.environ.get("SEDONA_SPARK_MASTER", "local[*]")
SERVICE_PORT = int(os.environ.get("SEDONA_SERVICE_PORT", "8098"))


# --- Database connection ---
def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)


# --- Pydantic Models ---
class PointInput(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class NearbyRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    radius_km: float = Field(default=50, ge=1, le=500)
    status_filter: Optional[str] = None


class CoverageAnalysisRequest(BaseModel):
    region_wkt: Optional[str] = None
    include_gaps: bool = True


class ClusterRequest(BaseModel):
    min_cluster_size: int = Field(default=3, ge=2)
    max_distance_km: float = Field(default=30, ge=1)


class RouteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    destination_lat: float
    destination_lng: float


class HeatmapRequest(BaseModel):
    grid_size_degrees: float = Field(default=0.25, ge=0.01, le=5.0)
    metric: str = Field(default="count")  # count, capacity, sales


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: dict
    properties: dict


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[GeoJSONFeature]


# --- App lifecycle ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify DB connection and PostGIS
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT PostGIS_Version();")
        version = cur.fetchone()
        print(f"Connected to PostGIS: {version}")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Warning: PostGIS not available: {e}")
    yield
    # Shutdown
    print("Sedona Spatial Analytics shutting down")


app = FastAPI(
    title="FarmConnect Sedona Spatial Analytics",
    description="Distributed geospatial analytics for the distributor network using PostGIS + Apache Sedona",
    version="1.0.0",
    lifespan=lifespan,
)


# --- Health ---
@app.get("/health")
async def health():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        return {"status": "healthy", "service": "sedona-spatial-analytics"}
    except Exception:
        return {"status": "degraded", "service": "sedona-spatial-analytics", "db": "unavailable"}


# --- Endpoints ---

@app.post("/api/distributors/nearby", response_model=GeoJSONFeatureCollection)
async def find_nearby_distributors(req: NearbyRequest):
    """Find distributors within radius using PostGIS ST_DWithin (geography-aware)."""
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                d.id, d.business_name, d.warehouse_address,
                d.phone_number, d.contact_person, d.status,
                d.warehouse_capacity_kg, d.total_sales_count,
                d.average_rating, d.coverage_regions,
                ST_X(d.location) AS lng, ST_Y(d.location) AS lat,
                ST_Distance(
                    d.location::geography,
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                ) / 1000 AS distance_km
            FROM distributors d
            WHERE d.location IS NOT NULL
              AND ST_DWithin(
                  d.location::geography,
                  ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                  %s
              )
              AND (%s IS NULL OR d.status = %s)
            ORDER BY distance_km ASC
        """, (req.lng, req.lat, req.lng, req.lat, req.radius_km * 1000,
              req.status_filter, req.status_filter))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        features = []
        for row in rows:
            features.append(GeoJSONFeature(
                geometry={"type": "Point", "coordinates": [row["lng"], row["lat"]]},
                properties={
                    "id": row["id"],
                    "businessName": row["business_name"],
                    "warehouseAddress": row["warehouse_address"],
                    "contactPerson": row["contact_person"],
                    "phoneNumber": row["phone_number"],
                    "status": row["status"],
                    "capacityKg": float(row["warehouse_capacity_kg"]) if row["warehouse_capacity_kg"] else None,
                    "totalSales": row["total_sales_count"],
                    "rating": float(row["average_rating"]) if row["average_rating"] else None,
                    "coverageRegions": row["coverage_regions"],
                    "distanceKm": round(row["distance_km"], 2),
                }
            ))

        return GeoJSONFeatureCollection(features=features)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/distributors/geojson", response_model=GeoJSONFeatureCollection)
async def get_all_distributors_geojson(status: Optional[str] = None):
    """Get all distributors as GeoJSON FeatureCollection for MapLibre GL rendering."""
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                d.id, d.business_name, d.warehouse_address,
                d.phone_number, d.contact_person, d.status,
                d.warehouse_capacity_kg, d.total_sales_count,
                d.average_rating, d.coverage_regions,
                ST_X(d.location) AS lng, ST_Y(d.location) AS lat,
                ST_AsGeoJSON(d.coverage_area)::json AS coverage_geojson
            FROM distributors d
            WHERE d.location IS NOT NULL
              AND (%s IS NULL OR d.status = %s)
            ORDER BY d.business_name
        """, (status, status))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        features = []
        for row in rows:
            # Point feature for marker
            features.append(GeoJSONFeature(
                geometry={"type": "Point", "coordinates": [row["lng"], row["lat"]]},
                properties={
                    "id": row["id"],
                    "businessName": row["business_name"],
                    "warehouseAddress": row["warehouse_address"],
                    "status": row["status"],
                    "capacityKg": float(row["warehouse_capacity_kg"]) if row["warehouse_capacity_kg"] else None,
                    "totalSales": row["total_sales_count"],
                    "rating": float(row["average_rating"]) if row["average_rating"] else None,
                    "coverageRegions": row["coverage_regions"],
                    "featureType": "warehouse",
                }
            ))

            # Coverage polygon if exists
            if row["coverage_geojson"]:
                features.append(GeoJSONFeature(
                    geometry=row["coverage_geojson"],
                    properties={
                        "id": row["id"],
                        "businessName": row["business_name"],
                        "status": row["status"],
                        "featureType": "coverage",
                    }
                ))

        return GeoJSONFeatureCollection(features=features)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/distributors/coverage-analysis")
async def analyze_coverage(req: CoverageAnalysisRequest):
    """Analyze distributor coverage: overlap, gaps, density using PostGIS spatial operations."""
    try:
        conn = get_db()
        cur = conn.cursor()

        # Coverage statistics
        cur.execute("""
            SELECT
                COUNT(*) AS total_distributors,
                COUNT(CASE WHEN location IS NOT NULL THEN 1 END) AS with_location,
                COUNT(CASE WHEN coverage_area IS NOT NULL THEN 1 END) AS with_coverage,
                COALESCE(SUM(ST_Area(ST_Transform(coverage_area, 3857)) / 1000000), 0) AS total_coverage_km2,
                COALESCE(
                    ST_Area(ST_Transform(ST_Union(coverage_area), 3857)) / 1000000,
                    0
                ) AS unique_coverage_km2
            FROM distributors
            WHERE status = 'approved'
        """)
        stats = cur.fetchone()

        # Overlap analysis
        cur.execute("""
            SELECT
                d1.id, d1.business_name,
                COUNT(d2.id) AS overlap_count,
                COALESCE(SUM(
                    ST_Area(ST_Transform(ST_Intersection(d1.coverage_area, d2.coverage_area), 3857)) / 1000000
                ), 0) AS overlap_area_km2
            FROM distributors d1
            LEFT JOIN distributors d2 ON d1.id != d2.id
                AND ST_Intersects(d1.coverage_area, d2.coverage_area)
            WHERE d1.coverage_area IS NOT NULL AND d1.status = 'approved'
            GROUP BY d1.id, d1.business_name
            ORDER BY overlap_area_km2 DESC
            LIMIT 20
        """)
        overlaps = cur.fetchall()

        result = {
            "statistics": {
                "totalDistributors": stats["total_distributors"],
                "withLocation": stats["with_location"],
                "withCoverage": stats["with_coverage"],
                "totalCoverageKm2": round(float(stats["total_coverage_km2"]), 2),
                "uniqueCoverageKm2": round(float(stats["unique_coverage_km2"]), 2),
                "overlapKm2": round(float(stats["total_coverage_km2"]) - float(stats["unique_coverage_km2"]), 2),
            },
            "overlaps": [
                {
                    "id": o["id"],
                    "name": o["business_name"],
                    "overlapCount": o["overlap_count"],
                    "overlapAreaKm2": round(float(o["overlap_area_km2"]), 2),
                }
                for o in overlaps
            ],
        }

        # Coverage gaps if requested
        if req.include_gaps:
            cur.execute("""
                SELECT ST_AsGeoJSON(
                    ST_Difference(
                        ST_Envelope(ST_Union(coverage_area)),
                        ST_Union(coverage_area)
                    )
                )::json AS gap_geojson,
                ST_Area(ST_Transform(
                    ST_Difference(
                        ST_Envelope(ST_Union(coverage_area)),
                        ST_Union(coverage_area)
                    ),
                    3857
                )) / 1000000 AS gap_area_km2
                FROM distributors
                WHERE coverage_area IS NOT NULL AND status = 'approved'
            """)
            gap_row = cur.fetchone()
            if gap_row and gap_row["gap_geojson"]:
                result["gaps"] = {
                    "geometry": gap_row["gap_geojson"],
                    "areaKm2": round(float(gap_row["gap_area_km2"]), 2),
                }

        cur.close()
        conn.close()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/distributors/heatmap")
async def generate_heatmap(req: HeatmapRequest):
    """Generate spatial heatmap data for distributor density/capacity/sales."""
    try:
        conn = get_db()
        cur = conn.cursor()

        metric_col = {
            "count": "COUNT(*)",
            "capacity": "COALESCE(SUM(CAST(warehouse_capacity_kg AS NUMERIC)), 0)",
            "sales": "COALESCE(SUM(total_sales_count), 0)",
        }.get(req.metric, "COUNT(*)")

        cur.execute(f"""
            SELECT
                ST_X(ST_SnapToGrid(location, %s)) AS grid_lng,
                ST_Y(ST_SnapToGrid(location, %s)) AS grid_lat,
                {metric_col} AS value,
                COUNT(*) AS count
            FROM distributors
            WHERE location IS NOT NULL AND status = 'approved'
            GROUP BY ST_SnapToGrid(location, %s)
            ORDER BY value DESC
        """, (req.grid_size_degrees, req.grid_size_degrees, req.grid_size_degrees))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        features = []
        max_value = max((r["value"] for r in rows), default=1)

        for row in rows:
            features.append(GeoJSONFeature(
                geometry={"type": "Point", "coordinates": [row["grid_lng"], row["grid_lat"]]},
                properties={
                    "value": float(row["value"]),
                    "count": row["count"],
                    "intensity": float(row["value"]) / float(max_value) if max_value else 0,
                    "metric": req.metric,
                }
            ))

        return {
            "type": "FeatureCollection",
            "features": [f.dict() for f in features],
            "metadata": {
                "metric": req.metric,
                "gridSizeDegrees": req.grid_size_degrees,
                "totalCells": len(features),
                "maxValue": float(max_value),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/distributors/clusters")
async def compute_clusters(req: ClusterRequest):
    """
    Compute spatial clusters of distributors using ST_ClusterDBSCAN.
    Identifies natural groupings for logistics optimization.
    """
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                id, business_name, status,
                ST_X(location) AS lng, ST_Y(location) AS lat,
                warehouse_capacity_kg, total_sales_count,
                ST_ClusterDBSCAN(location, eps := %s, minpoints := %s)
                  OVER() AS cluster_id
            FROM distributors
            WHERE location IS NOT NULL AND status = 'approved'
        """, (req.max_distance_km / 111.0, req.min_cluster_size))  # Convert km to approximate degrees
        rows = cur.fetchall()
        cur.close()
        conn.close()

        # Group by cluster
        clusters: dict = {}
        noise = []
        for row in rows:
            cid = row["cluster_id"]
            item = {
                "id": row["id"],
                "businessName": row["business_name"],
                "lng": row["lng"],
                "lat": row["lat"],
                "capacityKg": float(row["warehouse_capacity_kg"]) if row["warehouse_capacity_kg"] else None,
                "totalSales": row["total_sales_count"],
            }
            if cid is None:
                noise.append(item)
            else:
                if cid not in clusters:
                    clusters[cid] = {"id": cid, "members": [], "centroid": None}
                clusters[cid]["members"].append(item)

        # Compute centroids
        for cluster in clusters.values():
            members = cluster["members"]
            cluster["centroid"] = {
                "lat": sum(m["lat"] for m in members) / len(members),
                "lng": sum(m["lng"] for m in members) / len(members),
            }
            cluster["totalCapacityKg"] = sum(m["capacityKg"] or 0 for m in members)
            cluster["totalSales"] = sum(m["totalSales"] or 0 for m in members)
            cluster["memberCount"] = len(members)

        return {
            "clusters": list(clusters.values()),
            "noise": noise,
            "statistics": {
                "totalDistributors": len(rows),
                "clusteredCount": sum(c["memberCount"] for c in clusters.values()),
                "noiseCount": len(noise),
                "clusterCount": len(clusters),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/distributors/optimal-match")
async def find_optimal_match(point: PointInput, commodity: Optional[str] = None, quantity_kg: float = 0):
    """Find optimal distributor for a farm location considering distance, capacity, and rating."""
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM find_optimal_distributor(%s, %s, %s, %s)
        """, (point.lat, point.lng, commodity, quantity_kg))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        return {
            "recommendations": [
                {
                    "distributorId": row["distributor_id"],
                    "businessName": row["business_name"],
                    "distanceKm": round(float(row["distance_km"]), 2),
                    "availableCapacityKg": float(row["available_capacity_kg"]) if row["available_capacity_kg"] else None,
                    "rating": float(row["average_rating"]) if row["average_rating"] else None,
                    "score": round(float(row["score"]), 4),
                }
                for row in rows
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/consignments/tracking-geojson")
async def get_consignment_routes():
    """Get active consignment routes as GeoJSON for map visualization."""
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                c.id, c.tracking_reference, c.commodity, c.status,
                c.quantity_kg, c.remaining_kg,
                ST_X(c.origin_location) AS origin_lng, ST_Y(c.origin_location) AS origin_lat,
                ST_X(c.destination_location) AS dest_lng, ST_Y(c.destination_location) AS dest_lat,
                ST_X(c.current_location) AS current_lng, ST_Y(c.current_location) AS current_lat,
                ST_AsGeoJSON(c.route_geometry)::json AS route_geojson
            FROM consignments c
            WHERE c.status IN ('shipped', 'in_transit')
              AND c.origin_location IS NOT NULL
              AND c.destination_location IS NOT NULL
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        features = []
        for row in rows:
            # Route line
            if row["route_geojson"]:
                features.append(GeoJSONFeature(
                    geometry=row["route_geojson"],
                    properties={
                        "id": row["id"],
                        "trackingRef": row["tracking_reference"],
                        "commodity": row["commodity"],
                        "status": row["status"],
                        "featureType": "route",
                    }
                ))

            # Current position marker
            if row["current_lng"] and row["current_lat"]:
                features.append(GeoJSONFeature(
                    geometry={"type": "Point", "coordinates": [row["current_lng"], row["current_lat"]]},
                    properties={
                        "id": row["id"],
                        "trackingRef": row["tracking_reference"],
                        "commodity": row["commodity"],
                        "status": row["status"],
                        "quantityKg": float(row["quantity_kg"]),
                        "featureType": "currentPosition",
                    }
                ))

            # Origin point
            if row["origin_lng"] and row["origin_lat"]:
                features.append(GeoJSONFeature(
                    geometry={"type": "Point", "coordinates": [row["origin_lng"], row["origin_lat"]]},
                    properties={
                        "id": row["id"],
                        "featureType": "origin",
                    }
                ))

            # Destination point
            if row["dest_lng"] and row["dest_lat"]:
                features.append(GeoJSONFeature(
                    geometry={"type": "Point", "coordinates": [row["dest_lng"], row["dest_lat"]]},
                    properties={
                        "id": row["id"],
                        "featureType": "destination",
                    }
                ))

        return GeoJSONFeatureCollection(features=features)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Apache Sedona Batch Processing ---
# These endpoints trigger Spark/Sedona jobs for large-scale spatial analytics

@app.post("/api/sedona/coverage-optimization")
async def run_coverage_optimization():
    """
    Trigger Apache Sedona job to optimize distributor coverage.
    Uses spatial partitioning + range join for efficient computation at scale.
    
    In production, this would submit a PySpark job to a Spark cluster.
    Here we provide the job definition that can be submitted to spark-submit.
    """
    sedona_job = {
        "job_type": "coverage_optimization",
        "spark_config": {
            "master": SEDONA_MASTER,
            "app_name": "FarmConnect_Coverage_Optimization",
            "packages": [
                "org.apache.sedona:sedona-spark-3.5_2.12:1.5.1",
                "org.datasource:geotools-wrapper:1.5.1-28.2",
            ],
        },
        "steps": [
            {
                "name": "load_distributors",
                "query": """
                    SELECT id, business_name, ST_AsText(location) as wkt_location,
                           ST_AsText(coverage_area) as wkt_coverage,
                           warehouse_capacity_kg, total_sales_count
                    FROM distributors WHERE location IS NOT NULL
                """,
            },
            {
                "name": "load_farms",
                "query": """
                    SELECT id, name, ST_AsText(location) as wkt_location,
                           latitude, longitude
                    FROM farms WHERE location IS NOT NULL
                """,
            },
            {
                "name": "spatial_join",
                "description": "Range join farms to distributor coverage areas",
                "sedona_sql": """
                    SELECT f.id as farm_id, f.name as farm_name,
                           d.id as distributor_id, d.business_name,
                           ST_Distance(f.geometry, d.geometry) as distance
                    FROM farms_geo f, distributors_geo d
                    WHERE ST_Within(f.geometry, d.coverage_geometry)
                """,
            },
            {
                "name": "gap_analysis",
                "description": "Identify farms not covered by any distributor",
                "sedona_sql": """
                    SELECT f.id, f.name, f.geometry
                    FROM farms_geo f
                    LEFT JOIN distributors_geo d
                      ON ST_Within(f.geometry, d.coverage_geometry)
                    WHERE d.id IS NULL
                """,
            },
            {
                "name": "optimal_placement",
                "description": "K-means clustering of uncovered farms for new distributor placement",
                "sedona_sql": """
                    SELECT ST_Centroid(ST_Union(geometry)) as suggested_location,
                           COUNT(*) as farms_served
                    FROM uncovered_farms
                    GROUP BY ST_ClusterDBSCAN(geometry, eps := 0.3, minpoints := 5) OVER()
                """,
            },
        ],
        "output": {
            "format": "geojson",
            "destination": "s3://farmconnect-analytics/sedona/coverage-optimization/",
        },
    }

    return {
        "status": "job_defined",
        "message": "Apache Sedona coverage optimization job ready for submission",
        "job": sedona_job,
        "submit_command": f"spark-submit --master {SEDONA_MASTER} --packages org.apache.sedona:sedona-spark-3.5_2.12:1.5.1 coverage_optimization.py",
    }


@app.post("/api/sedona/demand-supply-mapping")
async def run_demand_supply_mapping():
    """
    Apache Sedona job for mapping supply (farms) to demand (markets/buyers)
    through the distributor network, finding optimal routing.
    """
    sedona_job = {
        "job_type": "demand_supply_mapping",
        "spark_config": {
            "master": SEDONA_MASTER,
            "app_name": "FarmConnect_Demand_Supply_Spatial",
            "packages": [
                "org.apache.sedona:sedona-spark-3.5_2.12:1.5.1",
                "org.datasource:geotools-wrapper:1.5.1-28.2",
            ],
        },
        "steps": [
            {
                "name": "knn_join",
                "description": "K-nearest distributors for each farm using Sedona KNN",
                "sedona_sql": """
                    SELECT f.id as farm_id,
                           d.id as distributor_id,
                           d.business_name,
                           ST_Distance(f.geometry, d.geometry) * 111 as distance_km
                    FROM farms_geo f
                    JOIN distributors_geo d
                    ON ST_KNN(f.geometry, d.geometry, 3)
                    WHERE d.status = 'approved'
                """,
            },
            {
                "name": "voronoi_partition",
                "description": "Create Voronoi polygons partitioning service areas",
                "sedona_sql": """
                    SELECT d.id, d.business_name,
                           ST_VoronoiPolygons(ST_Collect(d.geometry)) as service_area
                    FROM distributors_geo d
                    WHERE d.status = 'approved'
                    GROUP BY d.id, d.business_name
                """,
            },
            {
                "name": "isochrone_analysis",
                "description": "Estimate travel time zones from each distributor",
                "sedona_sql": """
                    SELECT d.id,
                           ST_Buffer(d.geometry, 0.25) as zone_30min,
                           ST_Buffer(d.geometry, 0.5) as zone_1hr,
                           ST_Buffer(d.geometry, 1.0) as zone_2hr
                    FROM distributors_geo d
                """,
            },
        ],
    }

    return {
        "status": "job_defined",
        "message": "Sedona demand-supply spatial mapping job ready",
        "job": sedona_job,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORT)
