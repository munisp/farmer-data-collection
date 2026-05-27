# Data Lake Architecture Guide

Complete guide to implementing a modern data lake architecture for agricultural data at scale.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Design](#architecture-design)
3. [Technology Stack](#technology-stack)
4. [Bronze-Silver-Gold Layers](#bronze-silver-gold-layers)
5. [MinIO Setup](#minio-setup)
6. [Delta Lake Integration](#delta-lake-integration)
7. [ETL Pipelines](#etl-pipelines)
8. [Data Governance](#data-governance)
9. [Performance Optimization](#performance-optimization)
10. [Monitoring & Operations](#monitoring--operations)

---

## Overview

A **data lake** is a centralized repository that stores all structured and unstructured data at any scale. Unlike traditional databases, data lakes store raw data in its native format until needed.

### Why Data Lake for Agricultural Data?

✅ **Handle diverse data types** - GPS tracks, satellite imagery, sensor data, transactions  
✅ **Scale to petabytes** - Store years of historical data  
✅ **Cost-effective** - Store data cheaply, process only what you need  
✅ **Time travel** - Query data as it existed at any point in time  
✅ **Schema evolution** - Add columns without breaking existing queries  
✅ **Batch & streaming** - Support both real-time and batch processing  
✅ **ML-ready** - Direct integration with Spark MLlib, TensorFlow  

---

## Architecture Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Data Sources                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │PostgreSQL│  │  Mobile  │  │  IoT     │  │ External │       │
│  │(PostGIS) │  │   Apps   │  │ Sensors  │  │   APIs   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Ingestion Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Airflow    │  │    Kafka     │  │    Fluvio    │         │
│  │  (Batch ETL) │  │  (Streaming) │  │  (Real-time) │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Bronze Layer (Raw Data)                       │
│              MinIO / S3 - Parquet / JSON / CSV                   │
│  s3://bronze/farms/year=2024/month=11/day=26/*.parquet          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Silver Layer (Cleaned Data)                     │
│                    Delta Lake - Parquet                          │
│  s3://silver/farms/ (with Delta transaction log)                │
│  - Deduplicated, validated, enriched                            │
│  - Schema enforcement, ACID transactions                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Gold Layer (Curated Data)                       │
│                    Delta Lake - Parquet                          │
│  s3://gold/farm_analytics/ (aggregated, business-ready)         │
│  - Pre-aggregated metrics, ML features                          │
│  - Optimized for BI tools and dashboards                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Consumption Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Spark   │  │  Presto  │  │  Jupyter │  │   APIs   │       │
│  │Analytics │  │   SQL    │  │Notebooks │  │ (REST)   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Ingestion** - Extract data from sources (PostgreSQL, APIs, IoT)
2. **Bronze** - Store raw data as-is (immutable, append-only)
3. **Silver** - Clean, validate, deduplicate, enrich
4. **Gold** - Aggregate, join, create business metrics
5. **Consumption** - Query, analyze, visualize, ML

---

## Technology Stack

### Core Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Object Storage** | MinIO (S3-compatible) | Store all data files |
| **Table Format** | Delta Lake / Apache Iceberg | ACID transactions, time travel |
| **Processing** | Apache Spark + Sedona | Distributed data processing |
| **Orchestration** | Apache Airflow | Schedule and monitor ETL jobs |
| **Catalog** | AWS Glue / Hive Metastore | Metadata management |
| **Query Engine** | Presto / Trino | Interactive SQL queries |
| **Monitoring** | Prometheus + Grafana | Metrics and alerting |

### Why These Technologies?

**MinIO:**
- S3-compatible API (easy migration to AWS/GCP/Azure)
- Self-hosted (data sovereignty)
- High performance (100+ GB/s throughput)
- Multi-tenancy support

**Delta Lake:**
- ACID transactions (no partial writes)
- Time travel (query historical data)
- Schema evolution (add columns safely)
- Upserts and deletes (MERGE operations)
- Audit history (who changed what, when)

**Apache Spark:**
- Distributed processing (scale to 1000s of nodes)
- Unified batch & streaming
- Rich ecosystem (SQL, ML, Graph, Streaming)
- Language support (Python, Scala, Java, R)

---

## Bronze-Silver-Gold Layers

### Bronze Layer (Raw Zone)

**Purpose:** Store raw data exactly as received from sources.

**Characteristics:**
- Immutable (never modified)
- Append-only (never deleted)
- Full history (all versions)
- Minimal transformations (only format conversion)
- Schema-on-read (flexible schema)

**Data Format:** Parquet, JSON, CSV, Avro

**Example Structure:**
```
s3://bronze/
├── farms/
│   ├── year=2024/
│   │   ├── month=11/
│   │   │   ├── day=26/
│   │   │   │   ├── farms_20241126_000000.parquet
│   │   │   │   ├── farms_20241126_060000.parquet
│   │   │   │   └── farms_20241126_120000.parquet
├── crops/
│   ├── year=2024/
│   │   ├── month=11/
├── harvests/
│   ├── year=2024/
│   │   ├── month=11/
```

**ETL Logic:**
```python
# Bronze ingestion (PostgreSQL → MinIO)
def ingest_to_bronze(table_name, s3_path):
    df = spark.read.jdbc(
        url=jdbc_url,
        table=table_name,
        properties=connection_properties
    )
    
    # Add metadata columns
    df = df.withColumn("ingestion_timestamp", current_timestamp()) \
           .withColumn("source_system", lit("postgresql"))
    
    # Write as Parquet with partitioning
    df.write.mode("append") \
        .partitionBy("year", "month", "day") \
        .parquet(s3_path)
```

### Silver Layer (Cleaned Zone)

**Purpose:** Clean, validate, deduplicate, and enrich data.

**Characteristics:**
- Delta Lake format (ACID transactions)
- Deduplicated (no duplicates)
- Validated (schema enforcement)
- Enriched (joined with reference data)
- Conformed (standardized formats)

**Data Format:** Delta Lake (Parquet + transaction log)

**Example Structure:**
```
s3://silver/
├── farms/
│   ├── _delta_log/
│   │   ├── 00000000000000000000.json
│   │   ├── 00000000000000000001.json
│   ├── part-00000-xxx.snappy.parquet
│   ├── part-00001-xxx.snappy.parquet
├── crops/
│   ├── _delta_log/
│   ├── part-00000-xxx.snappy.parquet
```

**ETL Logic:**
```python
# Silver transformation (Bronze → Silver)
def transform_to_silver(bronze_path, silver_path):
    # Read from Bronze
    df = spark.read.parquet(bronze_path)
    
    # Deduplicate
    df = df.dropDuplicates(["id"])
    
    # Validate
    df = df.filter(col("latitude").between(-90, 90)) \
           .filter(col("longitude").between(-180, 180)) \
           .filter(col("size") > 0)
    
    # Enrich (add spatial features)
    df = df.withColumn("region", 
                       when(col("latitude") > 7, "North")
                       .when(col("latitude") < 5, "South")
                       .otherwise("Central"))
    
    # Write as Delta Lake with MERGE (upsert)
    from delta.tables import DeltaTable
    
    if DeltaTable.isDeltaTable(spark, silver_path):
        delta_table = DeltaTable.forPath(spark, silver_path)
        delta_table.alias("target").merge(
            df.alias("source"),
            "target.id = source.id"
        ).whenMatchedUpdateAll() \
         .whenNotMatchedInsertAll() \
         .execute()
    else:
        df.write.format("delta").mode("overwrite").save(silver_path)
```

### Gold Layer (Curated Zone)

**Purpose:** Create business-ready, aggregated datasets.

**Characteristics:**
- Delta Lake format
- Pre-aggregated (fast queries)
- Business metrics (KPIs, features)
- Optimized (Z-ordering, compaction)
- Documented (data dictionary)

**Data Format:** Delta Lake (Parquet + transaction log)

**Example Structure:**
```
s3://gold/
├── farm_analytics/
│   ├── daily_stats/
│   ├── monthly_stats/
│   ├── regional_stats/
├── crop_yield_predictions/
├── farmer_segmentation/
```

**ETL Logic:**
```python
# Gold aggregation (Silver → Gold)
def aggregate_to_gold(silver_path, gold_path):
    df = spark.read.format("delta").load(silver_path)
    
    # Daily farm statistics
    daily_stats = df.groupBy("region", "date").agg(
        count("id").alias("farm_count"),
        sum("size").alias("total_area_hectares"),
        avg("size").alias("avg_farm_size"),
        countDistinct("farmer_id").alias("unique_farmers")
    )
    
    # Write as Delta Lake
    daily_stats.write.format("delta") \
        .mode("overwrite") \
        .option("overwriteSchema", "true") \
        .save(f"{gold_path}/daily_stats")
    
    # Optimize (Z-ordering for fast queries)
    spark.sql(f"""
        OPTIMIZE delta.`{gold_path}/daily_stats`
        ZORDER BY (region, date)
    """)
```

---

## MinIO Setup

### Installation (Docker)

```yaml
# docker-compose.yml
version: '3.8'

services:
  minio:
    image: minio/minio:latest
    container_name: minio
    ports:
      - "9000:9000"  # API
      - "9001:9001"  # Console
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: password123
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

volumes:
  minio_data:
```

```bash
# Start MinIO
docker-compose up -d

# Access console at http://localhost:9001
# Login: admin / password123
```

### Create Buckets

```bash
# Install MinIO client
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

# Configure MinIO client
mc alias set myminio http://localhost:9000 admin password123

# Create buckets
mc mb myminio/bronze
mc mb myminio/silver
mc mb myminio/gold

# Set bucket policies (optional)
mc policy set download myminio/gold  # Public read for gold layer
```

### Spark Configuration

```python
# Configure Spark to use MinIO
spark = SparkSession.builder \
    .appName("DataLake") \
    .config("spark.hadoop.fs.s3a.endpoint", "http://localhost:9000") \
    .config("spark.hadoop.fs.s3a.access.key", "admin") \
    .config("spark.hadoop.fs.s3a.secret.key", "password123") \
    .config("spark.hadoop.fs.s3a.path.style.access", "true") \
    .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem") \
    .getOrCreate()

# Read from MinIO
df = spark.read.parquet("s3a://bronze/farms/")
```

---

## Delta Lake Integration

### Installation

```bash
# Install Delta Lake
pip install delta-spark==3.0.0

# Or add to Spark
spark-shell --packages io.delta:delta-core_2.12:3.0.0
```

### Basic Operations

**Create Delta Table:**

```python
from delta import *

# Write DataFrame as Delta table
df.write.format("delta").mode("overwrite").save("s3a://silver/farms")

# Or create managed table
df.write.format("delta").saveAsTable("farms")
```

**Read Delta Table:**

```python
# Read latest version
df = spark.read.format("delta").load("s3a://silver/farms")

# Read specific version (time travel)
df = spark.read.format("delta").option("versionAsOf", 5).load("s3a://silver/farms")

# Read as of timestamp
df = spark.read.format("delta").option("timestampAsOf", "2024-11-26").load("s3a://silver/farms")
```

**Update Delta Table:**

```python
from delta.tables import DeltaTable

# Load Delta table
delta_table = DeltaTable.forPath(spark, "s3a://silver/farms")

# Update rows
delta_table.update(
    condition = "region = 'North'",
    set = {"irrigation_type": "'drip'"}
)

# Delete rows
delta_table.delete("size < 0.1")

# Merge (upsert)
delta_table.alias("target").merge(
    new_data.alias("source"),
    "target.id = source.id"
).whenMatchedUpdateAll() \
 .whenNotMatchedInsertAll() \
 .execute()
```

**Time Travel:**

```python
# View history
delta_table.history().show()

# Restore to previous version
delta_table.restoreToVersion(5)

# Vacuum old files (delete files older than 7 days)
delta_table.vacuum(168)  # 168 hours = 7 days
```

**Optimize:**

```python
# Compact small files
delta_table.optimize().executeCompaction()

# Z-ordering (co-locate related data)
delta_table.optimize().executeZOrderBy("region", "date")
```

---

## ETL Pipelines

### Airflow DAG Example

```python
# dags/farm_data_etl.py
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator
from datetime import datetime, timedelta

default_args = {
    'owner': 'data-team',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 3,
    'retry_delay': timedelta(minutes=5),
}

dag = DAG(
    'farm_data_etl',
    default_args=default_args,
    description='Daily ETL pipeline for farm data',
    schedule_interval='0 2 * * *',  # Run at 2 AM daily
    catchup=False,
)

# Task 1: Ingest from PostgreSQL to Bronze
ingest_to_bronze = SparkSubmitOperator(
    task_id='ingest_to_bronze',
    application='/opt/airflow/jobs/ingest_to_bronze.py',
    conn_id='spark_default',
    dag=dag,
)

# Task 2: Transform Bronze to Silver
transform_to_silver = SparkSubmitOperator(
    task_id='transform_to_silver',
    application='/opt/airflow/jobs/transform_to_silver.py',
    conn_id='spark_default',
    dag=dag,
)

# Task 3: Aggregate Silver to Gold
aggregate_to_gold = SparkSubmitOperator(
    task_id='aggregate_to_gold',
    application='/opt/airflow/jobs/aggregate_to_gold.py',
    conn_id='spark_default',
    dag=dag,
)

# Task 4: Data quality checks
def check_data_quality(**context):
    # Implement data quality checks
    pass

quality_check = PythonOperator(
    task_id='quality_check',
    python_callable=check_data_quality,
    dag=dag,
)

# Define task dependencies
ingest_to_bronze >> transform_to_silver >> aggregate_to_gold >> quality_check
```

---

## Data Governance

### Schema Management

```python
# Define schema explicitly
from pyspark.sql.types import *

farms_schema = StructType([
    StructField("id", IntegerType(), False),
    StructField("name", StringType(), False),
    StructField("latitude", DoubleType(), True),
    StructField("longitude", DoubleType(), True),
    StructField("size", DoubleType(), True),
    StructField("created_at", TimestampType(), False),
])

# Enforce schema on write
df.write.format("delta") \
    .mode("append") \
    .option("mergeSchema", "false") \
    .save("s3a://silver/farms")
```

### Data Quality Checks

```python
from pyspark.sql.functions import col, count, when, isnan

def check_data_quality(df):
    total_rows = df.count()
    
    # Check for nulls
    null_counts = df.select([
        count(when(col(c).isNull(), c)).alias(c)
        for c in df.columns
    ])
    
    # Check for invalid coordinates
    invalid_coords = df.filter(
        (col("latitude") < -90) | (col("latitude") > 90) |
        (col("longitude") < -180) | (col("longitude") > 180)
    ).count()
    
    # Check for duplicates
    duplicate_count = df.count() - df.dropDuplicates(["id"]).count()
    
    return {
        "total_rows": total_rows,
        "null_counts": null_counts.collect()[0].asDict(),
        "invalid_coords": invalid_coords,
        "duplicates": duplicate_count,
    }
```

### Audit Logging

```python
# Delta Lake automatically tracks changes
delta_table.history().select("version", "timestamp", "operation", "operationMetrics").show()

# Custom audit log
audit_df = spark.createDataFrame([
    (datetime.now(), "user123", "UPDATE", "farms", "Updated irrigation_type")
], ["timestamp", "user", "operation", "table", "description"])

audit_df.write.format("delta").mode("append").save("s3a://audit/logs")
```

---

## Performance Optimization

### 1. Partitioning

```python
# Partition by date for time-series data
df.write.format("delta") \
    .partitionBy("year", "month", "day") \
    .save("s3a://bronze/farms")

# Partition by region for spatial data
df.write.format("delta") \
    .partitionBy("region") \
    .save("s3a://silver/farms")
```

### 2. Z-Ordering

```python
# Co-locate related data for faster queries
spark.sql("""
    OPTIMIZE delta.`s3a://gold/farm_analytics`
    ZORDER BY (region, date)
""")
```

### 3. Caching

```python
# Cache frequently accessed data
df.cache()
df.count()  # Trigger caching
```

### 4. File Compaction

```python
# Compact small files
spark.sql("""
    OPTIMIZE delta.`s3a://silver/farms`
""")
```

---

## Monitoring & Operations

### Metrics to Track

- **Ingestion lag** - Time between data creation and availability in Bronze
- **ETL duration** - Time taken for each pipeline stage
- **Data volume** - GB processed per day
- **Data quality** - % of records passing validation
- **Storage costs** - GB stored per layer
- **Query performance** - P50, P95, P99 latency

### Alerting Rules

```yaml
# Prometheus alerting rules
groups:
  - name: data_lake
    rules:
      - alert: HighIngestionLag
        expr: ingestion_lag_seconds > 3600
        for: 10m
        annotations:
          summary: "Ingestion lag > 1 hour"
      
      - alert: ETLFailure
        expr: etl_job_failures_total > 3
        for: 5m
        annotations:
          summary: "ETL job failed 3+ times"
```

---

## Next Steps

1. **Deploy MinIO cluster** (3+ nodes for HA)
2. **Set up Apache Airflow** for ETL orchestration
3. **Implement Bronze layer** (PostgreSQL → MinIO)
4. **Implement Silver layer** (cleaning + Delta Lake)
5. **Implement Gold layer** (aggregations + analytics)
6. **Set up monitoring** (Prometheus + Grafana)
7. **Create data catalog** (AWS Glue or Hive Metastore)

---

## References

- [Delta Lake Documentation](https://docs.delta.io/)
- [MinIO Documentation](https://min.io/docs/)
- [Apache Spark Documentation](https://spark.apache.org/docs/latest/)
- [Apache Airflow Documentation](https://airflow.apache.org/docs/)
- [Data Lake Best Practices](https://aws.amazon.com/big-data/datalakes-and-analytics/)
