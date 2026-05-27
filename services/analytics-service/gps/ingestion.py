"""
GPS Lakehouse Ingestion Pipeline

Ingests GPS tracks from PostgreSQL to the Lakehouse Bronze layer.
Supports incremental ingestion using high-watermark tracking.
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

import psycopg2
from psycopg2.extras import RealDictCursor
import boto3
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class GPSTrackRecord:
    """Bronze layer GPS track record"""
    track_id: int
    user_id: int
    device_id: int
    farm_id: Optional[int]
    latitude: float
    longitude: float
    altitude: Optional[float]
    accuracy: Optional[float]
    speed: Optional[float]
    heading: Optional[float]
    timestamp: str
    activity: Optional[str]
    metadata: Optional[str]
    created_at: str
    # Lakehouse metadata
    ingest_timestamp: str
    ingest_date: str
    source: str = "postgres"


class GPSLakehouseIngestion:
    """
    GPS data ingestion from PostgreSQL to Lakehouse Bronze layer.
    
    Supports:
    - Incremental ingestion using high-watermark
    - Batch processing with configurable batch size
    - S3/MinIO storage with partitioning by date
    - Fallback to local file storage for development
    """
    
    def __init__(
        self,
        database_url: Optional[str] = None,
        s3_endpoint: Optional[str] = None,
        s3_bucket: Optional[str] = None,
        s3_access_key: Optional[str] = None,
        s3_secret_key: Optional[str] = None,
        batch_size: int = 1000,
    ):
        self.database_url = database_url or os.getenv(
            "DATABASE_URL", 
            "postgresql://postgres:postgres@localhost:5432/farmer_db"
        )
        self.s3_endpoint = s3_endpoint or os.getenv("S3_ENDPOINT", "http://localhost:9000")
        self.s3_bucket = s3_bucket or os.getenv("LAKEHOUSE_BUCKET", "lakehouse")
        self.s3_access_key = s3_access_key or os.getenv("S3_ACCESS_KEY", "")
        self.s3_secret_key = s3_secret_key or os.getenv("S3_SECRET_KEY", "")
        self.batch_size = batch_size
        
        self.conn = None
        self.s3_client = None
        self.use_local_storage = False
        
    def connect(self):
        """Connect to PostgreSQL and S3/MinIO"""
        # Connect to PostgreSQL
        try:
            self.conn = psycopg2.connect(self.database_url)
            logger.info(f"[GPS Ingestion] Connected to PostgreSQL")
        except Exception as e:
            logger.error(f"[GPS Ingestion] Failed to connect to PostgreSQL: {e}")
            raise
        
        # Connect to S3/MinIO
        try:
            self.s3_client = boto3.client(
                's3',
                endpoint_url=self.s3_endpoint,
                aws_access_key_id=self.s3_access_key,
                aws_secret_access_key=self.s3_secret_key,
            )
            # Verify bucket exists
            self.s3_client.head_bucket(Bucket=self.s3_bucket)
            logger.info(f"[GPS Ingestion] Connected to S3/MinIO bucket: {self.s3_bucket}")
        except ClientError as e:
            logger.warning(f"[GPS Ingestion] S3/MinIO not available, using local storage: {e}")
            self.use_local_storage = True
        except Exception as e:
            logger.warning(f"[GPS Ingestion] S3/MinIO connection failed, using local storage: {e}")
            self.use_local_storage = True
    
    def close(self):
        """Close connections"""
        if self.conn:
            self.conn.close()
    
    def get_high_watermark(self) -> Optional[datetime]:
        """Get the last ingested timestamp from watermark table"""
        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                SELECT last_timestamp 
                FROM lakehouse_watermarks 
                WHERE table_name = 'gps_tracks'
            """)
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return result[0]
            return None
        except psycopg2.errors.UndefinedTable:
            # Create watermark table if it doesn't exist
            self._create_watermark_table()
            return None
        except Exception as e:
            logger.warning(f"[GPS Ingestion] Error getting watermark: {e}")
            return None
    
    def _create_watermark_table(self):
        """Create the watermark tracking table"""
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lakehouse_watermarks (
                table_name VARCHAR(255) PRIMARY KEY,
                last_timestamp TIMESTAMP,
                last_id BIGINT,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)
        self.conn.commit()
        cursor.close()
        logger.info("[GPS Ingestion] Created lakehouse_watermarks table")
    
    def update_high_watermark(self, timestamp: datetime, last_id: int):
        """Update the high watermark after successful ingestion"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO lakehouse_watermarks (table_name, last_timestamp, last_id, updated_at)
            VALUES ('gps_tracks', %s, %s, NOW())
            ON CONFLICT (table_name) 
            DO UPDATE SET last_timestamp = %s, last_id = %s, updated_at = NOW()
        """, (timestamp, last_id, timestamp, last_id))
        self.conn.commit()
        cursor.close()
    
    def fetch_gps_tracks(
        self, 
        since: Optional[datetime] = None,
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Fetch GPS tracks from PostgreSQL"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
            SELECT 
                t.id as track_id,
                t.user_id,
                t.device_id,
                t.farm_id,
                t.latitude,
                t.longitude,
                t.altitude,
                t.accuracy,
                t.speed,
                t.heading,
                t.timestamp,
                t.activity,
                t.metadata::text as metadata,
                t.created_at
            FROM gps_tracks t
        """
        
        params = []
        if since:
            query += " WHERE t.created_at > %s"
            params.append(since)
        
        query += " ORDER BY t.created_at ASC"
        
        if limit:
            query += " LIMIT %s"
            params.append(limit)
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        cursor.close()
        
        return [dict(row) for row in results]
    
    def transform_to_bronze(self, records: List[Dict[str, Any]]) -> List[GPSTrackRecord]:
        """Transform raw records to Bronze layer format"""
        now = datetime.utcnow()
        ingest_timestamp = now.isoformat()
        ingest_date = now.strftime("%Y-%m-%d")
        
        bronze_records = []
        for record in records:
            bronze_record = GPSTrackRecord(
                track_id=record['track_id'],
                user_id=record['user_id'],
                device_id=record['device_id'],
                farm_id=record.get('farm_id'),
                latitude=float(record['latitude']),
                longitude=float(record['longitude']),
                altitude=float(record['altitude']) if record.get('altitude') else None,
                accuracy=float(record['accuracy']) if record.get('accuracy') else None,
                speed=float(record['speed']) if record.get('speed') else None,
                heading=float(record['heading']) if record.get('heading') else None,
                timestamp=record['timestamp'].isoformat() if record.get('timestamp') else None,
                activity=record.get('activity'),
                metadata=record.get('metadata'),
                created_at=record['created_at'].isoformat() if record.get('created_at') else None,
                ingest_timestamp=ingest_timestamp,
                ingest_date=ingest_date,
            )
            bronze_records.append(bronze_record)
        
        return bronze_records
    
    def write_to_lakehouse(self, records: List[GPSTrackRecord]) -> str:
        """Write records to lakehouse Bronze layer"""
        if not records:
            return ""
        
        # Group by ingest_date for partitioning
        partitions: Dict[str, List[GPSTrackRecord]] = {}
        for record in records:
            date = record.ingest_date
            if date not in partitions:
                partitions[date] = []
            partitions[date].append(record)
        
        paths = []
        for date, partition_records in partitions.items():
            path = self._write_partition(date, partition_records)
            paths.append(path)
        
        return ", ".join(paths)
    
    def _write_partition(self, date: str, records: List[GPSTrackRecord]) -> str:
        """Write a single partition to storage"""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"gps_tracks_{timestamp}.json"
        
        # Convert records to JSON
        data = [asdict(r) for r in records]
        json_data = json.dumps(data, indent=2, default=str)
        
        if self.use_local_storage:
            return self._write_local(date, filename, json_data)
        else:
            return self._write_s3(date, filename, json_data)
    
    def _write_local(self, date: str, filename: str, data: str) -> str:
        """Write to local filesystem"""
        base_path = "/tmp/lakehouse/bronze/gps_tracks"
        partition_path = f"{base_path}/ingest_date={date}"
        os.makedirs(partition_path, exist_ok=True)
        
        file_path = f"{partition_path}/{filename}"
        with open(file_path, 'w') as f:
            f.write(data)
        
        logger.info(f"[GPS Ingestion] Written to local: {file_path}")
        return f"local://{file_path}"
    
    def _write_s3(self, date: str, filename: str, data: str) -> str:
        """Write to S3/MinIO"""
        key = f"bronze/gps_tracks/ingest_date={date}/{filename}"
        
        self.s3_client.put_object(
            Bucket=self.s3_bucket,
            Key=key,
            Body=data.encode('utf-8'),
            ContentType='application/json',
        )
        
        path = f"s3://{self.s3_bucket}/{key}"
        logger.info(f"[GPS Ingestion] Written to S3: {path}")
        return path
    
    def run_incremental_ingestion(self) -> Dict[str, Any]:
        """Run incremental ingestion from PostgreSQL to Lakehouse"""
        logger.info("[GPS Ingestion] Starting incremental ingestion...")
        
        # Get high watermark
        watermark = self.get_high_watermark()
        logger.info(f"[GPS Ingestion] High watermark: {watermark}")
        
        # Fetch new records
        records = self.fetch_gps_tracks(since=watermark, limit=self.batch_size)
        logger.info(f"[GPS Ingestion] Fetched {len(records)} records")
        
        if not records:
            return {
                "status": "success",
                "records_ingested": 0,
                "message": "No new records to ingest",
            }
        
        # Transform to Bronze format
        bronze_records = self.transform_to_bronze(records)
        
        # Write to lakehouse
        paths = self.write_to_lakehouse(bronze_records)
        
        # Update watermark
        last_record = records[-1]
        self.update_high_watermark(
            last_record['created_at'],
            last_record['track_id']
        )
        
        return {
            "status": "success",
            "records_ingested": len(records),
            "paths": paths,
            "watermark": last_record['created_at'].isoformat(),
        }
    
    def run_full_ingestion(self) -> Dict[str, Any]:
        """Run full ingestion (all records) from PostgreSQL to Lakehouse"""
        logger.info("[GPS Ingestion] Starting full ingestion...")
        
        total_ingested = 0
        all_paths = []
        
        offset = 0
        while True:
            # Fetch batch
            cursor = self.conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT 
                    t.id as track_id,
                    t.user_id,
                    t.device_id,
                    t.farm_id,
                    t.latitude,
                    t.longitude,
                    t.altitude,
                    t.accuracy,
                    t.speed,
                    t.heading,
                    t.timestamp,
                    t.activity,
                    t.metadata::text as metadata,
                    t.created_at
                FROM gps_tracks t
                ORDER BY t.created_at ASC
                LIMIT %s OFFSET %s
            """, (self.batch_size, offset))
            
            records = [dict(row) for row in cursor.fetchall()]
            cursor.close()
            
            if not records:
                break
            
            # Transform and write
            bronze_records = self.transform_to_bronze(records)
            paths = self.write_to_lakehouse(bronze_records)
            
            total_ingested += len(records)
            all_paths.append(paths)
            offset += self.batch_size
            
            logger.info(f"[GPS Ingestion] Ingested batch: {len(records)} records (total: {total_ingested})")
        
        # Update watermark to latest
        if total_ingested > 0:
            cursor = self.conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT MAX(created_at) as max_ts, MAX(id) as max_id FROM gps_tracks")
            result = cursor.fetchone()
            cursor.close()
            
            if result and result['max_ts']:
                self.update_high_watermark(result['max_ts'], result['max_id'])
        
        return {
            "status": "success",
            "records_ingested": total_ingested,
            "paths": all_paths,
        }


def ingest_gps_to_lakehouse(
    mode: str = "incremental",
    batch_size: int = 1000,
) -> Dict[str, Any]:
    """
    Convenience function to run GPS ingestion.
    
    Args:
        mode: "incremental" or "full"
        batch_size: Number of records per batch
    
    Returns:
        Ingestion result dictionary
    """
    ingestion = GPSLakehouseIngestion(batch_size=batch_size)
    
    try:
        ingestion.connect()
        
        if mode == "full":
            return ingestion.run_full_ingestion()
        else:
            return ingestion.run_incremental_ingestion()
    finally:
        ingestion.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="GPS Lakehouse Ingestion")
    parser.add_argument("--mode", choices=["incremental", "full"], default="incremental")
    parser.add_argument("--batch-size", type=int, default=1000)
    
    args = parser.parse_args()
    
    result = ingest_gps_to_lakehouse(mode=args.mode, batch_size=args.batch_size)
    print(json.dumps(result, indent=2, default=str))
