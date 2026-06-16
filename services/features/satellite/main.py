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

# Health endpoint for container orchestration
import http.server
import threading
import json

class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            response = json.dumps({
                "status": "healthy",
                "service": self.server.service_name,
                "timestamp": datetime.now().isoformat()
            })
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(response.encode())
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, format, *args):
        pass  # Suppress access logs

def start_health_server(service_name: str, port: int = 8080):
    server = http.server.HTTPServer(('0.0.0.0', port), HealthHandler)
    server.service_name = service_name
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"Health endpoint available at http://0.0.0.0:{port}/health")

