"""Satellite Imagery Integration Service"""
import requests
from datetime import datetime, timedelta

SENTINEL_API = "https://scihub.copernicus.eu/dhus"
PLANET_API = "https://api.planet.com/data/v1"

def get_ndvi_for_farm(farm_id, lat, lon, start_date, end_date):
    """Get NDVI (vegetation health) from Sentinel-2"""
    response = requests.get(f"{SENTINEL_API}/search", params={
        "lat": lat,
        "lon": lon,
        "start": start_date,
        "end": end_date,
        "producttype": "S2MSI2A"
    })
    
    if response.status_code == 200:
        data = response.json()
        # Process NDVI calculation
        ndvi_values = []
        for scene in data['features']:
            ndvi = calculate_ndvi(scene)
            ndvi_values.append(ndvi)
        return {"farm_id": farm_id, "ndvi_average": sum(ndvi_values)/len(ndvi_values)}
    return None

def calculate_ndvi(scene):
    """Calculate NDVI from satellite bands"""
    nir = scene['properties']['B8']
    red = scene['properties']['B4']
    return (nir - red) / (nir + red)

if __name__ == "__main__":
    print("Satellite Imagery Service running...")
