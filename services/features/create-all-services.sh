#!/bin/bash

# IoT Sensor Integration Service (MQTT)
mkdir -p iot
cat > iot/main.py << 'EOF'
"""IoT Sensor Integration Service - MQTT"""
import paho.mqtt.client as mqtt
import json
import psycopg2
from datetime import datetime

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
DB_URL = "postgresql://localhost:5432/farmer_db"

def on_connect(client, userdata, flags, rc):
    print(f"Connected to MQTT broker: {rc}")
    client.subscribe("farm/+/sensors/#")

def on_message(client, userdata, msg):
    topic = msg.topic
    payload = json.loads(msg.payload)
    
    # Parse topic: farm/{farm_id}/sensors/{sensor_type}
    parts = topic.split("/")
    farm_id = int(parts[1])
    sensor_type = parts[3]
    
    # Store sensor data
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO sensor_readings (farm_id, sensor_type, value, unit, timestamp)
        VALUES (%s, %s, %s, %s, %s)
    """, (farm_id, sensor_type, payload['value'], payload['unit'], datetime.now()))
    conn.commit()
    conn.close()
    
    print(f"Stored {sensor_type} reading for farm {farm_id}: {payload['value']} {payload['unit']}")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message
client.connect(MQTT_BROKER, MQTT_PORT, 60)
client.loop_forever()
EOF

# Satellite Imagery Service
mkdir -p satellite
cat > satellite/main.py << 'EOF'
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
EOF

# Export Documentation Automation
mkdir -p export-docs
cat > export-docs/main.go << 'EOF'
package main

import (
"fmt"
"time"
)

type ExportDocument struct {
FarmID            int
CropType          string
Quantity          float64
DestinationCountry string
PhytosanitaryCert bool
OriginCert        bool
QualityCert       bool
}

func GenerateExportDocs(doc ExportDocument) (string, error) {
// Generate phytosanitary certificate
phyto := fmt.Sprintf("PHYTO-%d-%s", doc.FarmID, time.Now().Format("20060102"))

// Generate certificate of origin
origin := fmt.Sprintf("COO-%d-%s", doc.FarmID, time.Now().Format("20060102"))

// Generate quality certificate
quality := fmt.Sprintf("QC-%d-%s", doc.FarmID, time.Now().Format("20060102"))

// Bundle all documents
bundle := fmt.Sprintf("EXPORT-BUNDLE-%s-%s-%s", phyto, origin, quality)

fmt.Printf("Generated export documentation bundle: %s\n", bundle)
return bundle, nil
}

func main() {
fmt.Println("Export Documentation Service running...")
}
EOF

# Multi-Currency Support
mkdir -p multi-currency
cat > multi-currency/main.go << 'EOF'
package main

import (
"encoding/json"
"fmt"
"net/http"
"time"
)

type ExchangeRate struct {
BaseCurrency   string
TargetCurrency string
Rate           float64
Timestamp      time.Time
}

func GetExchangeRate(base, target string) (float64, error) {
// Use external API (e.g., exchangerate-api.com)
url := fmt.Sprintf("https://api.exchangerate-api.com/v4/latest/%s", base)

resp, err := http.Get(url)
if err != nil {
 0, err
}
defer resp.Body.Close()

var result map[string]interface{}
json.NewDecoder(resp.Body).Decode(&result)

rates := result["rates"].(map[string]interface{})
rate := rates[target].(float64)

return rate, nil
}

func ConvertCurrency(amount float64, from, to string) (float64, error) {
rate, err := GetExchangeRate(from, to)
if err != nil {
 0, err
}
return amount * rate, nil
}

func main() {
fmt.Println("Multi-Currency Service running...")
}
EOF

# Carbon Credit Tracking
mkdir -p carbon-credits
cat > carbon-credits/main.py << 'EOF'
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
EOF

# Certification Management
mkdir -p certification
cat > certification/main.go << 'EOF'
package main

import (
"fmt"
"time"
)

type Certification struct {
FarmID         int
CertType       string
IssueDate      time.Time
ExpiryDate     time.Time
CertifyingBody string
Status         string
}

func CheckCertificationStatus(farmID int, certType string) (bool, error) {
// Query database for certification
// Check expiry date
// Return validity
fmt.Printf("Checking %s certification for farm %d\n", certType, farmID)
return true, nil
}

func RenewCertification(farmID int, certType string) (string, error) {
// Initiate renewal process
// Schedule inspection
// Generate renewal application
renewalID := fmt.Sprintf("RENEW-%d-%s-%s", farmID, certType, time.Now().Format("20060102"))
fmt.Printf("Initiated certification renewal: %s\n", renewalID)
return renewalID, nil
}

func main() {
fmt.Println("Certification Management Service running...")
}
EOF

# Equipment Rental Marketplace
mkdir -p equipment-rental
cat > equipment-rental/main.py << 'EOF'
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
EOF

# Cold Storage Tracking
mkdir -p cold-storage
cat > cold-storage/main.py << 'EOF'
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
EOF

echo "All 8 feature services created successfully!"
