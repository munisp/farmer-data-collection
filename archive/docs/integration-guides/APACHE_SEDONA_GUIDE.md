# Apache Sedona Integration Guide

Complete guide to integrating Apache Sedona for distributed spatial analytics at enterprise scale.

---

## Table of Contents

1. [Overview](#overview)
2. [Why Apache Sedona](#why-apache-sedona)
3. [Architecture](#architecture)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Spatial Operations](#spatial-operations)
7. [Performance Optimization](#performance-optimization)
8. [Use Cases](#use-cases)
9. [Integration with Data Lake](#integration-with-data-lake)
10. [Troubleshooting](#troubleshooting)

---

## Overview

**Apache Sedona** (formerly GeoSpark) is a cluster computing system for processing large-scale spatial data. It extends Apache Spark with spatial data types, indexes, and operations.

### Key Capabilities

✅ **Distributed spatial processing** - Handle billions of spatial objects  
✅ **Spatial SQL** - Query spatial data with SQL  
✅ **Spatial joins** - Join datasets based on spatial relationships  
✅ **Spatial indexing** - R-Tree, Quad-Tree for fast queries  
✅ **Spatial analytics** - KNN, range queries, clustering  
✅ **Visualization** - Generate heatmaps and spatial visualizations  
✅ **Multi-language support** - Scala, Java, Python, R  

---

## Why Apache Sedona?

### PostGIS vs Apache Sedona

| Feature | PostGIS | Apache Sedona |
|---------|---------|---------------|
| **Scale** | Single server (millions of records) | Distributed cluster (billions of records) |
| **Processing** | Single-threaded | Parallel across cluster |
| **Data Source** | PostgreSQL only | HDFS, S3, Parquet, CSV, GeoJSON, Shapefile |
| **Use Case** | Operational queries | Batch analytics, ML pipelines |
| **Latency** | Low (milliseconds) | Higher (seconds to minutes) |
| **Cost** | Lower for small data | Cost-effective at scale |

### When to Use Sedona

- **Large datasets** (>10M spatial records)
- **Batch analytics** (daily/weekly reports)
- **Spatial joins** (e.g., join 1M farms with 100K markets)
- **Machine learning** with spatial features
- **Historical analysis** over years of data
- **Data lake integration** (Parquet, Delta Lake)

### When to Use PostGIS

- **Real-time queries** (<100ms latency)
- **Small to medium datasets** (<10M records)
- **Transactional workloads** (CRUD operations)
- **Simple spatial queries** (distance, containment)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
│              (Web UI, APIs, Jupyter Notebooks)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Apache Sedona Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Spatial SQL │  │ Spatial RDD  │  │ Visualization│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Apache Spark Cluster                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Master  │  │  Worker  │  │  Worker  │  │  Worker  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Storage Layer                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   HDFS   │  │  MinIO   │  │  Delta   │  │PostgreSQL│   │
│  │          │  │   (S3)   │  │   Lake   │  │ (PostGIS)│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

```bash
# Java 11 or higher
java -version

# Scala 2.12 (for Spark 3.x)
scala -version

# Python 3.8+ (for PySpark)
python3 --version
```

### Install Apache Spark

```bash
# Download Spark 3.5.0 (or latest)
wget https://archive.apache.org/dist/spark/spark-3.5.0/spark-3.5.0-bin-hadoop3.tgz

# Extract
tar -xzf spark-3.5.0-bin-hadoop3.tgz
sudo mv spark-3.5.0-bin-hadoop3 /opt/spark

# Set environment variables
echo 'export SPARK_HOME=/opt/spark' >> ~/.bashrc
echo 'export PATH=$PATH:$SPARK_HOME/bin:$SPARK_HOME/sbin' >> ~/.bashrc
source ~/.bashrc

# Verify installation
spark-shell --version
```

### Install Apache Sedona

**Option 1: Maven/SBT (Scala/Java)**

```scala
// build.sbt
libraryDependencies ++= Seq(
  "org.apache.sedona" % "sedona-spark-3.5_2.12" % "1.5.1",
  "org.apache.sedona" % "sedona-sql-3.5_2.12" % "1.5.1",
  "org.apache.sedona" % "sedona-viz-3.5_2.12" % "1.5.1"
)
```

**Option 2: PySpark (Python)**

```bash
# Install Apache Sedona Python package
pip install apache-sedona==1.5.1

# Install PySpark
pip install pyspark==3.5.0
```

**Option 3: Spark Shell (Interactive)**

```bash
# Start Spark shell with Sedona
spark-shell --packages org.apache.sedona:sedona-spark-3.5_2.12:1.5.1,org.apache.sedona:sedona-sql-3.5_2.12:1.5.1
```

---

## Configuration

### Spark Configuration

```python
# sedona_config.py
from pyspark.sql import SparkSession
from sedona.register import SedonaRegistrator
from sedona.utils import SedonaKryoRegistrator, KryoSerializer

def create_sedona_session():
    spark = SparkSession.builder \
        .appName("FarmerDataSedona") \
        .master("spark://localhost:7077")  # Or "local[*]" for local mode \
        .config("spark.serializer", KryoSerializer.getName) \
        .config("spark.kryo.registrator", SedonaKryoRegistrator.getName) \
        .config("spark.sql.extensions", "org.apache.sedona.sql.SedonaSqlExtensions") \
        .config("spark.executor.memory", "4g") \
        .config("spark.driver.memory", "2g") \
        .config("spark.sql.adaptive.enabled", "true") \
        .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \
        .getOrCreate()
    
    # Register Sedona functions
    SedonaRegistrator.registerAll(spark)
    
    return spark

# Usage
spark = create_sedona_session()
```

### PostgreSQL Connection

```python
# Connect to PostgreSQL with PostGIS data
jdbc_url = "jdbc:postgresql://localhost:5432/farmer_data"
connection_properties = {
    "user": "your_user",
    "password": "your_password",
    "driver": "org.postgresql.Driver"
}

# Read farms table
farms_df = spark.read.jdbc(
    url=jdbc_url,
    table="farms",
    properties=connection_properties
)
```

---

## Spatial Operations

### 1. Loading Spatial Data

**From PostgreSQL (with PostGIS):**

```python
from sedona.sql.types import GeometryType

# Read farms with geometry
farms_df = spark.read.jdbc(
    url=jdbc_url,
    table="(SELECT id, name, ST_AsText(location) as location_wkt FROM farms WHERE location IS NOT NULL) as farms",
    properties=connection_properties
)

# Convert WKT to Sedona geometry
farms_df = farms_df.selectExpr(
    "id",
    "name",
    "ST_GeomFromWKT(location_wkt) as location"
)

farms_df.show(5)
```

**From GeoJSON:**

```python
# Read GeoJSON file
geojson_df = spark.read.format("json").load("s3://bucket/farm-boundaries.geojson")

# Extract geometry
geojson_df = geojson_df.selectExpr(
    "properties.id as id",
    "properties.name as name",
    "ST_GeomFromGeoJSON(to_json(geometry)) as boundary"
)
```

**From Shapefile:**

```python
from sedona.core.formatMapper.shapefileParser import ShapefileReader

# Read shapefile
shapefile_rdd = ShapefileReader.readToGeometryRDD(
    spark.sparkContext,
    "hdfs://path/to/farms.shp"
)

# Convert to DataFrame
shapefile_df = Adapter.toDf(shapefile_rdd, spark)
```

### 2. Spatial Queries

**Range Query (Find farms within radius):**

```python
# Create query point
query_point = "POINT(3.3792 6.5244)"

# Find farms within 5km (5000 meters)
nearby_farms = farms_df.selectExpr(
    "*",
    f"ST_Distance(ST_Transform(location, 'epsg:4326', 'epsg:3857'), ST_Transform(ST_GeomFromWKT('{query_point}'), 'epsg:4326', 'epsg:3857')) as distance_meters"
).filter("distance_meters <= 5000")

nearby_farms.show()
```

**KNN Query (Find K nearest farms):**

```python
from sedona.core.spatialOperator import KNNQuery
from sedona.core.geom.envelope import Envelope

# Create query point
query_point = Point(3.3792, 6.5244)

# Find 10 nearest farms
knn_result = KNNQuery.SpatialKnnQuery(
    farms_rdd,  # Spatial RDD
    query_point,
    10,  # K = 10
    True  # Use index
)

# Convert to DataFrame
knn_df = Adapter.toDf(knn_result, spark)
```

**Spatial Join (Join farms with markets):**

```python
# Load markets data
markets_df = spark.read.jdbc(
    url=jdbc_url,
    table="(SELECT id, name, ST_AsText(location) as location_wkt FROM markets) as markets",
    properties=connection_properties
).selectExpr(
    "id as market_id",
    "name as market_name",
    "ST_GeomFromWKT(location_wkt) as market_location"
)

# Spatial join: Find nearest market for each farm
farm_market_join = farms_df.alias("f").join(
    markets_df.alias("m"),
    expr("ST_Distance(f.location, m.market_location) <= 50000")  # Within 50km
).selectExpr(
    "f.id as farm_id",
    "f.name as farm_name",
    "m.market_id",
    "m.market_name",
    "ST_Distance(f.location, m.market_location) / 1000 as distance_km"
)

farm_market_join.show()
```

### 3. Spatial Aggregations

**Farm Density by Grid Cell:**

```python
# Create grid cells (0.01 degree ≈ 1km)
farm_density = farms_df.selectExpr(
    "FLOOR(ST_X(location) / 0.01) * 0.01 as grid_lon",
    "FLOOR(ST_Y(location) / 0.01) * 0.01 as grid_lat"
).groupBy("grid_lon", "grid_lat").count()

farm_density.orderBy("count", ascending=False).show()
```

**Crop Distribution by Region:**

```python
# Join farms with crops
crops_df = spark.read.jdbc(
    url=jdbc_url,
    table="crops",
    properties=connection_properties
)

crop_distribution = farms_df.join(crops_df, "farm_id") \
    .selectExpr(
        "crop_name",
        "ST_X(location) as longitude",
        "ST_Y(location) as latitude"
    ).groupBy("crop_name").agg(
        count("*").alias("farm_count"),
        avg("latitude").alias("avg_latitude"),
        avg("longitude").alias("avg_longitude")
    )

crop_distribution.show()
```

### 4. Spatial Indexing

**Create Spatial Index:**

```python
from sedona.core.spatialOperator import JoinQuery
from sedona.core.enums import IndexType

# Convert DataFrame to Spatial RDD
farms_rdd = Adapter.toSpatialRdd(farms_df, "location")

# Build R-Tree index
farms_rdd.buildIndex(IndexType.RTREE, True)

# Now spatial queries will use the index automatically
```

---

## Performance Optimization

### 1. Partitioning

```python
# Spatial partitioning for better performance
from sedona.core.enums import GridType

# Partition by grid
farms_rdd.spatialPartitioning(GridType.KDBTREE)

# Or use custom partitions
farms_rdd.spatialPartitioning(GridType.QUADTREE, 100)  # 100 partitions
```

### 2. Caching

```python
# Cache frequently used datasets
farms_df.cache()
farms_df.count()  # Trigger caching

# Persist to disk if dataset is large
farms_df.persist(StorageLevel.DISK_ONLY)
```

### 3. Broadcast Joins

```python
from pyspark.sql.functions import broadcast

# Broadcast small dataset (e.g., markets) for faster joins
farm_market_join = farms_df.join(
    broadcast(markets_df),
    expr("ST_Distance(f.location, m.market_location) <= 50000")
)
```

### 4. Adaptive Query Execution

```python
# Enable AQE for automatic optimization
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
```

---

## Use Cases

### 1. Large-Scale Spatial Joins

**Problem:** Join 1 million farms with 100,000 markets to find nearest market for each farm.

```python
# This would be slow in PostGIS, but fast in Sedona
farm_market_pairs = farms_df.alias("f").join(
    markets_df.alias("m")
).selectExpr(
    "f.farm_id",
    "f.farm_name",
    "m.market_id",
    "m.market_name",
    "ST_Distance(f.location, m.market_location) as distance"
).groupBy("f.farm_id", "f.farm_name").agg(
    min_by(struct("m.market_id", "m.market_name", "distance"), "distance").alias("nearest_market")
)

# Save results to Delta Lake
farm_market_pairs.write.format("delta").mode("overwrite").save("s3://bucket/farm-market-pairs")
```

### 2. Historical Spatial Analysis

**Problem:** Analyze 5 years of harvest data (50M records) to find optimal planting zones.

```python
# Read historical harvest data from Data Lake
harvests_df = spark.read.format("delta").load("s3://bucket/silver/harvests")

# Join with farm locations
harvest_analysis = harvests_df.join(farms_df, "farm_id") \
    .selectExpr(
        "crop_name",
        "yield_per_hectare",
        "FLOOR(ST_X(location) / 0.1) * 0.1 as region_lon",
        "FLOOR(ST_Y(location) / 0.1) * 0.1 as region_lat"
    ).groupBy("crop_name", "region_lon", "region_lat").agg(
        avg("yield_per_hectare").alias("avg_yield"),
        count("*").alias("sample_count")
    ).filter("sample_count >= 10")

# Find optimal zones for each crop
optimal_zones = harvest_analysis.groupBy("crop_name").agg(
    max("avg_yield").alias("max_yield")
).join(harvest_analysis, ["crop_name", "avg_yield"])

optimal_zones.write.format("delta").mode("overwrite").save("s3://bucket/gold/optimal-zones")
```

### 3. Spatial Clustering

**Problem:** Identify farming clusters for targeted interventions.

```python
from sedona.sql.st_functions import ST_ClusterDBSCAN

# Cluster farms by location (DBSCAN)
farm_clusters = farms_df.selectExpr(
    "*",
    "ST_ClusterDBSCAN(location, 0.01, 5) OVER () as cluster_id"  # 0.01 degree ≈ 1km, min 5 farms
)

# Analyze clusters
cluster_stats = farm_clusters.groupBy("cluster_id").agg(
    count("*").alias("farm_count"),
    avg("size").alias("avg_farm_size"),
    ST_Centroid(ST_Union_Aggr("location")).alias("cluster_center")
)

cluster_stats.show()
```

---

## Integration with Data Lake

### Architecture

```
PostgreSQL (PostGIS) → Bronze Layer (Raw GeoJSON/Parquet)
                          ↓
                    Apache Sedona Processing
                          ↓
                    Silver Layer (Cleaned Parquet)
                          ↓
                    Apache Sedona Analytics
                          ↓
                    Gold Layer (Aggregated Parquet/Delta)
```

### ETL Pipeline Example

```python
# Bronze Layer: Extract from PostgreSQL
def extract_to_bronze(spark, jdbc_url, table_name, s3_path):
    df = spark.read.jdbc(
        url=jdbc_url,
        table=f"(SELECT *, ST_AsText(location) as location_wkt FROM {table_name}) as t",
        properties=connection_properties
    )
    
    # Save as Parquet with partitioning
    df.write.mode("overwrite").partitionBy("created_at").parquet(s3_path)

# Silver Layer: Clean and enrich
def transform_to_silver(spark, bronze_path, silver_path):
    df = spark.read.parquet(bronze_path)
    
    # Convert WKT to geometry
    df = df.selectExpr(
        "*",
        "ST_GeomFromWKT(location_wkt) as location_geom"
    ).drop("location_wkt")
    
    # Add spatial features
    df = df.selectExpr(
        "*",
        "ST_X(location_geom) as longitude",
        "ST_Y(location_geom) as latitude",
        "FLOOR(ST_X(location_geom) / 0.1) * 0.1 as region_lon",
        "FLOOR(ST_Y(location_geom) / 0.1) * 0.1 as region_lat"
    )
    
    # Save as Delta Lake
    df.write.format("delta").mode("overwrite").save(silver_path)

# Gold Layer: Aggregate analytics
def aggregate_to_gold(spark, silver_path, gold_path):
    df = spark.read.format("delta").load(silver_path)
    
    # Regional aggregations
    regional_stats = df.groupBy("region_lon", "region_lat").agg(
        count("*").alias("farm_count"),
        avg("size").alias("avg_farm_size"),
        sum("size").alias("total_area")
    )
    
    regional_stats.write.format("delta").mode("overwrite").save(gold_path)
```

---

## Troubleshooting

### Common Issues

**1. Out of Memory Errors:**

```python
# Increase executor memory
spark.conf.set("spark.executor.memory", "8g")
spark.conf.set("spark.driver.memory", "4g")

# Increase partitions
df = df.repartition(200)
```

**2. Slow Spatial Joins:**

```python
# Use spatial partitioning
farms_rdd.spatialPartitioning(GridType.KDBTREE)
markets_rdd.spatialPartitioning(farms_rdd.getPartitioner())

# Build indexes
farms_rdd.buildIndex(IndexType.RTREE, True)
```

**3. Kryo Serialization Errors:**

```python
# Ensure Sedona Kryo registrator is configured
spark.conf.set("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
spark.conf.set("spark.kryo.registrator", "org.apache.sedona.core.serde.SedonaKryoRegistrator")
```

---

## Next Steps

1. **Set up Spark cluster** (standalone or Kubernetes)
2. **Integrate with MinIO** for S3-compatible storage
3. **Implement ETL pipelines** with Apache Airflow
4. **Create Sedona service** (REST API for spatial queries)
5. **Build spatial ML models** (crop yield prediction)

---

## References

- [Apache Sedona Documentation](https://sedona.apache.org/)
- [Apache Spark Documentation](https://spark.apache.org/docs/latest/)
- [Sedona Python API](https://sedona.apache.org/latest-snapshot/api/python/)
- [Spatial SQL Functions](https://sedona.apache.org/latest-snapshot/api/sql/Overview/)
