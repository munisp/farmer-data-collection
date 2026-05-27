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
