"""Carbon Credit Tracking Service"""
from datetime import datetime

class CarbonCreditCalculator:
    # Emission factors (kg CO2e per kg input)
    FERTILIZER_FACTOR = 5.5
    PESTICIDE_FACTOR = 3.2
    DIESEL_FACTOR = 2.68
    
    # Sequestration rates (kg CO2e per hectare per year)
    AGROFORESTRY_RATE = 5000
    COVER_CROP_RATE = 2000
    NO_TILL_RATE = 1500
    
    def calculate_emissions(self, farm_id, fertilizer_kg, pesticide_kg, diesel_liters):
        """Calculate total emissions"""
        emissions = (
            fertilizer_kg * self.FERTILIZER_FACTOR +
            pesticide_kg * self.PESTICIDE_FACTOR +
            diesel_liters * self.DIESEL_FACTOR
        )
        return emissions
    
    def calculate_sequestration(self, farm_id, hectares, practices):
        """Calculate carbon sequestration"""
        sequestration = 0
        if 'agroforestry' in practices:
            sequestration += hectares * self.AGROFORESTRY_RATE
        if 'cover_crops' in practices:
            sequestration += hectares * self.COVER_CROP_RATE
        if 'no_till' in practices:
            sequestration += hectares * self.NO_TILL_RATE
        return sequestration
    
    def calculate_net_credits(self, farm_id, emissions, sequestration):
        """Calculate net carbon credits"""
        net = sequestration - emissions
        credits = net / 1000  # Convert to tons CO2e
        return max(0, credits)  # Only positive credits count

if __name__ == "__main__":
    print("Carbon Credit Tracking Service running...")

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

