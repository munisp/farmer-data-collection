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
