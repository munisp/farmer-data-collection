"""Equipment Rental Marketplace Service"""
from datetime import datetime, timedelta

class EquipmentRental:
    def __init__(self):
        self.equipment_catalog = {
            "tractor": {"rate_per_day": 15000, "available": 5},
            "harvester": {"rate_per_day": 25000, "available": 3},
            "planter": {"rate_per_day": 10000, "available": 4},
            "sprayer": {"rate_per_day": 5000, "available": 8},
        }
    
    def search_equipment(self, equipment_type, location, start_date, end_date):
        """Search available equipment"""
        if equipment_type in self.equipment_catalog:
            equipment = self.equipment_catalog[equipment_type]
            days = (end_date - start_date).days
            total_cost = equipment['rate_per_day'] * days
            
            return {
                "equipment_type": equipment_type,
                "available": equipment['available'],
                "rate_per_day": equipment['rate_per_day'],
                "total_cost": total_cost,
                "days": days
            }
        return None
    
    def book_equipment(self, farmer_id, equipment_type, start_date, end_date):
        """Book equipment rental"""
        booking_id = f"RENT-{farmer_id}-{equipment_type}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Reduce availability
        self.equipment_catalog[equipment_type]['available'] -= 1
        
        print(f"Equipment booked: {booking_id}")
        return booking_id

if __name__ == "__main__":
    print("Equipment Rental Marketplace Service running...")

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

