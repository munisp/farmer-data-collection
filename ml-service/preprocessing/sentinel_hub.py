"""
Sentinel Hub API Client for fetching satellite imagery
Supports Sentinel-2 (multispectral) and Sentinel-1 (SAR) data
"""
import os
from datetime import datetime, timedelta
from typing import Tuple, Optional
import numpy as np
from sentinelhub import (
    SHConfig,
    BBox,
    CRS,
    DataCollection,
    SentinelHubRequest,
    MimeType,
    bbox_to_dimensions
)


class SentinelHubClient:
    """Client for interacting with Sentinel Hub API"""
    
    def __init__(self, client_id: Optional[str] = None, 
                 client_secret: Optional[str] = None,
                 instance_id: Optional[str] = None):
        """
        Initialize Sentinel Hub client
        
        Args:
            client_id: Sentinel Hub OAuth client ID
            client_secret: Sentinel Hub OAuth client secret
            instance_id: Sentinel Hub instance ID
        """
        self.config = SHConfig()
        self.config.sh_client_id = client_id or os.getenv("SENTINEL_HUB_CLIENT_ID")
        self.config.sh_client_secret = client_secret or os.getenv("SENTINEL_HUB_CLIENT_SECRET")
        self.config.instance_id = instance_id or os.getenv("SENTINEL_HUB_INSTANCE_ID")
        
        if not all([self.config.sh_client_id, self.config.sh_client_secret]):
            raise ValueError("Sentinel Hub credentials not provided")
    
    def create_bbox(self, lat: float, lon: float, size_km: float = 5.0) -> BBox:
        """
        Create a bounding box around a center point
        
        Args:
            lat: Latitude of center point
            lon: Longitude of center point
            size_km: Size of bounding box in kilometers
            
        Returns:
            BBox object for Sentinel Hub requests
        """
        # Approximate degrees per km (varies by latitude)
        km_to_deg = 1 / 111.0
        half_size = (size_km / 2) * km_to_deg
        
        return BBox(
            bbox=[
                lon - half_size,
                lat - half_size,
                lon + half_size,
                lat + half_size
            ],
            crs=CRS.WGS84
        )
    
    def get_sentinel2_imagery(self, 
                             bbox: BBox,
                             time_range: Tuple[datetime, datetime],
                             resolution: int = 10) -> np.ndarray:
        """
        Fetch Sentinel-2 L2A multispectral imagery
        
        Args:
            bbox: Bounding box for the area of interest
            time_range: Tuple of (start_date, end_date)
            resolution: Spatial resolution in meters (default: 10m)
            
        Returns:
            numpy array with shape (height, width, 7) containing:
            - Band 0: Blue (B02)
            - Band 1: Green (B03)
            - Band 2: Red (B04)
            - Band 3: NIR (B08)
            - Band 4: SWIR1 (B11)
            - Band 5: SWIR2 (B12)
            - Band 6: Cloud Mask (from SCL)
        """
        evalscript = '''
        //VERSION=3
        function setup() {
            return {
                input: [{
                    bands: ["B02", "B03", "B04", "B08", "B11", "B12", "SCL"],
                    units: "DN"
                }],
                output: {
                    bands: 7,
                    sampleType: "FLOAT32"
                }
            };
        }
        
        function evaluatePixel(sample) {
            // Return bands: Blue, Green, Red, NIR, SWIR1, SWIR2, Cloud Mask
            // Cloud mask: 1 for clouds (SCL 8,9,10), 0 otherwise
            let cloud_mask = (sample.SCL == 8 || sample.SCL == 9 || sample.SCL == 10) ? 1 : 0;
            
            return [
                sample.B02 / 10000,  // Blue
                sample.B03 / 10000,  // Green
                sample.B04 / 10000,  // Red
                sample.B08 / 10000,  // NIR
                sample.B11 / 10000,  // SWIR1
                sample.B12 / 10000,  // SWIR2
                cloud_mask           // Cloud mask
            ];
        }
        '''
        
        request = SentinelHubRequest(
            evalscript=evalscript,
            input_data=[
                SentinelHubRequest.input_data(
                    data_collection=DataCollection.SENTINEL2_L2A,
                    time_interval=time_range,
                    maxcc=0.8  # Maximum cloud coverage 80%
                )
            ],
            responses=[
                SentinelHubRequest.output_response('default', MimeType.TIFF)
            ],
            bbox=bbox,
            size=bbox_to_dimensions(bbox, resolution=resolution),
            config=self.config
        )
        
        data = request.get_data()
        if not data:
            raise ValueError("No Sentinel-2 data available for the specified time range")
        
        return data[0]
    
    def get_sentinel1_sar(self,
                         bbox: BBox,
                         time_range: Tuple[datetime, datetime],
                         resolution: int = 10) -> np.ndarray:
        """
        Fetch Sentinel-1 SAR imagery
        
        Args:
            bbox: Bounding box for the area of interest
            time_range: Tuple of (start_date, end_date)
            resolution: Spatial resolution in meters (default: 10m)
            
        Returns:
            numpy array with shape (height, width, 2) containing:
            - Band 0: VV backscatter (normalized to dB, clipped -35 to 10)
            - Band 1: VH backscatter (normalized to dB, clipped -35 to 10)
        """
        evalscript = '''
        //VERSION=3
        function setup() {
            return {
                input: [{
                    bands: ["VV", "VH"]
                }],
                output: {
                    bands: 2,
                    sampleType: "FLOAT32"
                }
            };
        }
        
        function evaluatePixel(sample) {
            // Normalize SAR backscatter: 10*log10(sigma0)
            // Avoid log(0) by adding small epsilon
            let vv_db = sample.VV > 0 ? 10 * Math.log10(sample.VV) : -35;
            let vh_db = sample.VH > 0 ? 10 * Math.log10(sample.VH) : -35;
            
            // Clip values between -35 and 10 dB
            vv_db = Math.max(-35, Math.min(10, vv_db));
            vh_db = Math.max(-35, Math.min(10, vh_db));
            
            return [vv_db, vh_db];
        }
        '''
        
        request = SentinelHubRequest(
            evalscript=evalscript,
            input_data=[
                SentinelHubRequest.input_data(
                    data_collection=DataCollection.SENTINEL1_IW,
                    time_interval=time_range
                )
            ],
            responses=[
                SentinelHubRequest.output_response('default', MimeType.TIFF)
            ],
            bbox=bbox,
            size=bbox_to_dimensions(bbox, resolution=resolution),
            config=self.config
        )
        
        data = request.get_data()
        if not data:
            raise ValueError("No Sentinel-1 data available for the specified time range")
        
        return data[0]
    
    def calculate_ndvi(self, sentinel2_data: np.ndarray) -> np.ndarray:
        """
        Calculate NDVI from Sentinel-2 data
        
        Args:
            sentinel2_data: Sentinel-2 imagery array
            
        Returns:
            NDVI array with values from -1 to 1
        """
        red = sentinel2_data[:, :, 2]  # Band 2 (Red)
        nir = sentinel2_data[:, :, 3]  # Band 3 (NIR)
        
        # Avoid division by zero
        denominator = nir + red
        ndvi = np.where(
            denominator != 0,
            (nir - red) / denominator,
            0
        )
        
        return ndvi
    
    def calculate_evi(self, sentinel2_data: np.ndarray) -> np.ndarray:
        """
        Calculate Enhanced Vegetation Index (EVI) from Sentinel-2 data
        
        Args:
            sentinel2_data: Sentinel-2 imagery array
            
        Returns:
            EVI array
        """
        blue = sentinel2_data[:, :, 0]  # Band 0 (Blue)
        red = sentinel2_data[:, :, 2]   # Band 2 (Red)
        nir = sentinel2_data[:, :, 3]   # Band 3 (NIR)
        
        # EVI = 2.5 * ((NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1))
        denominator = nir + 6 * red - 7.5 * blue + 1
        evi = np.where(
            denominator != 0,
            2.5 * ((nir - red) / denominator),
            0
        )
        
        return evi
    
    def calculate_savi(self, sentinel2_data: np.ndarray, L: float = 0.5) -> np.ndarray:
        """
        Calculate Soil Adjusted Vegetation Index (SAVI) from Sentinel-2 data
        
        Args:
            sentinel2_data: Sentinel-2 imagery array
            L: Soil brightness correction factor (0.5 for moderate vegetation)
            
        Returns:
            SAVI array
        """
        red = sentinel2_data[:, :, 2]  # Band 2 (Red)
        nir = sentinel2_data[:, :, 3]  # Band 3 (NIR)
        
        # SAVI = ((NIR - Red) / (NIR + Red + L)) * (1 + L)
        denominator = nir + red + L
        savi = np.where(
            denominator != 0,
            ((nir - red) / denominator) * (1 + L),
            0
        )
        
        return savi


def create_time_range(days_back: int = 7) -> Tuple[datetime, datetime]:
    """
    Create a time range for satellite imagery requests
    
    Args:
        days_back: Number of days to look back from today
        
    Returns:
        Tuple of (start_date, end_date)
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    return (start_date, end_date)
