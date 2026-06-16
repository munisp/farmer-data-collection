"""Cold Storage Tracking Service"""
from datetime import datetime

class ColdStorageManager:
    def __init__(self):
        self.storage_facilities = {
            "Lagos": {"capacity": 1000, "occupied": 650, "temp": 4},
            "Kano": {"capacity": 800, "occupied": 500, "temp": 2},
            "Ibadan": {"capacity": 600, "occupied": 400, "temp": 5},
        }
    
    def check_availability(self, location, quantity):
        """Check cold storage availability"""
        if location in self.storage_facilities:
            facility = self.storage_facilities[location]
            available = facility['capacity'] - facility['occupied']
            
            if available >= quantity:
                return {
                    "location": location,
                    "available": available,
                    "temperature": facility['temp'],
                    "can_accommodate": True
                }
        return {"can_accommodate": False}
    
    def reserve_storage(self, farmer_id, location, quantity, duration_days):
        """Reserve cold storage space"""
        reservation_id = f"COLD-{farmer_id}-{location}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Update occupied capacity
        self.storage_facilities[location]['occupied'] += quantity
        
        # Calculate cost (₦500 per ton per day)
        cost = quantity * 500 * duration_days
        
        print(f"Cold storage reserved: {reservation_id}, Cost: ₦{cost}")
        return {"reservation_id": reservation_id, "cost": cost}

if __name__ == "__main__":
    print("Cold Storage Tracking Service running...")

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

