"""
Agricultural Models Service (Python)
Provides endpoints for biomass estimation, canopy height analysis, and LST processing
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import numpy as np
import math

app = Flask(__name__)
CORS(app)

# ============================================================================
# Health Check
# ============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'Agricultural Models Service (Python)',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })

# ============================================================================
# Biomass Estimation
# ============================================================================

@app.route('/api/models/biomass/estimate', methods=['POST'])
def estimate_biomass():
    """
    Estimate biomass using NDVI-based regression model
    """
    data = request.json
    ndvi = data.get('ndvi')
    crop_type = data.get('crop_type', 'maize')
    growth_stage = data.get('growth_stage', 'vegetative')
    
    if ndvi is None:
        return jsonify({'error': 'NDVI value required'}), 400
    
    # NDVI-based biomass estimation (simplified model)
    # Real implementation would use crop-specific calibration curves
    if crop_type == 'maize':
        # Maize-specific model: Biomass (kg/ha) = a * NDVI^b
        a, b = 15000, 2.5
    elif crop_type == 'rice':
        a, b = 12000, 2.3
    elif crop_type == 'wheat':
        a, b = 10000, 2.2
    else:
        a, b = 13000, 2.4  # Default
    
    # Apply growth stage multiplier
    stage_multipliers = {
        'vegetative': 0.6,
        'flowering': 1.0,
        'fruiting': 1.2,
        'maturity': 0.9
    }
    multiplier = stage_multipliers.get(growth_stage, 1.0)
    
    # Calculate biomass
    biomass_kg_ha = a * (ndvi ** b) * multiplier
    
    # Calculate confidence based on NDVI value
    # Higher confidence for NDVI in optimal range (0.4-0.8)
    if 0.4 <= ndvi <= 0.8:
        confidence = 90 + (10 * (1 - abs(ndvi - 0.6) / 0.2))
    elif 0.2 <= ndvi < 0.4 or 0.8 < ndvi <= 0.9:
        confidence = 70
    else:
        confidence = 50
    
    return jsonify({
        'biomass_kg_ha': round(biomass_kg_ha, 2),
        'biomass_tons_ha': round(biomass_kg_ha / 1000, 3),
        'confidence': round(confidence, 1),
        'ndvi': ndvi,
        'crop_type': crop_type,
        'growth_stage': growth_stage,
        'method': 'ndvi_regression',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/models/biomass/time-series', methods=['POST'])
def biomass_time_series():
    """
    Analyze biomass trends over time
    """
    data = request.json
    measurements = data.get('measurements', [])
    
    if not measurements:
        return jsonify({'error': 'Measurements required'}), 400
    
    # Calculate statistics
    biomass_values = [m['biomass_kg_ha'] for m in measurements]
    
    trend_analysis = {
        'mean_biomass': round(np.mean(biomass_values), 2),
        'max_biomass': round(np.max(biomass_values), 2),
        'min_biomass': round(np.min(biomass_values), 2),
        'std_dev': round(np.std(biomass_values), 2),
        'growth_rate_kg_ha_day': calculate_growth_rate(measurements),
        'trend': 'increasing' if biomass_values[-1] > biomass_values[0] else 'decreasing',
        'measurement_count': len(measurements)
    }
    
    return jsonify(trend_analysis)

# ============================================================================
# Canopy Height Estimation
# ============================================================================

@app.route('/api/models/canopy-height/estimate', methods=['POST'])
def estimate_canopy_height():
    """
    Estimate canopy height using various methods
    """
    data = request.json
    method = data.get('method', 'photogrammetry')
    crop_type = data.get('crop_type', 'maize')
    days_after_planting = data.get('days_after_planting', 60)
    
    # Crop-specific growth models (simplified logistic growth)
    crop_params = {
        'maize': {'max_height': 2.5, 'growth_rate': 0.08, 'inflection': 50},
        'rice': {'max_height': 1.2, 'growth_rate': 0.10, 'inflection': 40},
        'wheat': {'max_height': 1.0, 'growth_rate': 0.09, 'inflection': 45},
        'sorghum': {'max_height': 3.0, 'growth_rate': 0.07, 'inflection': 55},
    }
    
    params = crop_params.get(crop_type, crop_params['maize'])
    
    # Logistic growth model: H = H_max / (1 + exp(-k * (t - t0)))
    height = params['max_height'] / (
        1 + math.exp(-params['growth_rate'] * (days_after_planting - params['inflection']))
    )
    
    # Add method-specific noise/confidence
    method_confidence = {
        'lidar': 95,
        'photogrammetry': 85,
        'drone_photogrammetry': 88,
        'manual_measurement': 92
    }
    
    confidence = method_confidence.get(method, 80)
    
    # Calculate statistics
    avg_height = height
    max_height = height * 1.15  # Assume 15% variation
    min_height = height * 0.85
    
    return jsonify({
        'height_meters': round(height, 2),
        'average_height': round(avg_height, 2),
        'max_height': round(max_height, 2),
        'min_height': round(min_height, 2),
        'confidence': confidence,
        'method': method,
        'crop_type': crop_type,
        'days_after_planting': days_after_planting,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/models/canopy-height/growth-curve', methods=['POST'])
def canopy_growth_curve():
    """
    Generate expected growth curve for a crop
    """
    data = request.json
    crop_type = data.get('crop_type', 'maize')
    days = data.get('days', 120)
    
    crop_params = {
        'maize': {'max_height': 2.5, 'growth_rate': 0.08, 'inflection': 50},
        'rice': {'max_height': 1.2, 'growth_rate': 0.10, 'inflection': 40},
        'wheat': {'max_height': 1.0, 'growth_rate': 0.09, 'inflection': 45},
    }
    
    params = crop_params.get(crop_type, crop_params['maize'])
    
    # Generate curve
    curve = []
    for day in range(0, days + 1, 5):
        height = params['max_height'] / (
            1 + math.exp(-params['growth_rate'] * (day - params['inflection']))
        )
        curve.append({
            'day': day,
            'height_meters': round(height, 3)
        })
    
    return jsonify({
        'crop_type': crop_type,
        'max_height': params['max_height'],
        'curve': curve
    })

# ============================================================================
# Land Surface Temperature (LST) Analysis
# ============================================================================

@app.route('/api/models/lst/analyze', methods=['POST'])
def analyze_lst():
    """
    Analyze Land Surface Temperature data
    """
    data = request.json
    temperature = data.get('temperature')
    air_temperature = data.get('air_temperature')
    ndvi = data.get('ndvi', 0.5)
    
    if temperature is None:
        return jsonify({'error': 'Temperature required'}), 400
    
    # Calculate Crop Water Stress Index (CWSI)
    if air_temperature:
        cwsi = (temperature - air_temperature) / (temperature + air_temperature)
    else:
        cwsi = None
    
    # Estimate soil moisture based on LST and NDVI
    # Higher LST and lower NDVI indicate lower soil moisture
    soil_moisture_index = (1 - (temperature / 50)) * ndvi * 100
    
    # Determine stress level
    if cwsi is not None:
        if cwsi < 0.2:
            stress_level = 'low'
        elif cwsi < 0.4:
            stress_level = 'moderate'
        else:
            stress_level = 'high'
    else:
        stress_level = 'unknown'
    
    # Irrigation recommendation
    if soil_moisture_index < 30:
        irrigation_recommendation = 'Immediate irrigation needed'
    elif soil_moisture_index < 50:
        irrigation_recommendation = 'Plan irrigation within 2-3 days'
    elif soil_moisture_index < 70:
        irrigation_recommendation = 'Monitor closely'
    else:
        irrigation_recommendation = 'No irrigation needed'
    
    return jsonify({
        'lst_celsius': temperature,
        'air_temperature': air_temperature,
        'cwsi': round(cwsi, 3) if cwsi else None,
        'soil_moisture_index': round(soil_moisture_index, 1),
        'stress_level': stress_level,
        'irrigation_recommendation': irrigation_recommendation,
        'ndvi': ndvi,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/models/lst/thermal-anomaly', methods=['POST'])
def detect_thermal_anomaly():
    """
    Detect thermal anomalies in LST data
    """
    data = request.json
    temperatures = data.get('temperatures', [])
    
    if not temperatures:
        return jsonify({'error': 'Temperature data required'}), 400
    
    # Calculate statistics
    mean_temp = np.mean(temperatures)
    std_temp = np.std(temperatures)
    
    # Detect anomalies (values > 2 std dev from mean)
    anomalies = []
    for i, temp in enumerate(temperatures):
        z_score = (temp - mean_temp) / std_temp if std_temp > 0 else 0
        if abs(z_score) > 2:
            anomalies.append({
                'index': i,
                'temperature': temp,
                'z_score': round(z_score, 2),
                'severity': 'high' if abs(z_score) > 3 else 'moderate'
            })
    
    return jsonify({
        'mean_temperature': round(mean_temp, 2),
        'std_deviation': round(std_temp, 2),
        'min_temperature': round(np.min(temperatures), 2),
        'max_temperature': round(np.max(temperatures), 2),
        'anomaly_count': len(anomalies),
        'anomalies': anomalies
    })

# ============================================================================
# NDVI Calculation and Analysis
# ============================================================================

@app.route('/api/models/ndvi/calculate', methods=['POST'])
def calculate_ndvi():
    """
    Calculate NDVI from NIR and Red band values
    """
    data = request.json
    nir = data.get('nir')  # Near-infrared
    red = data.get('red')  # Red band
    
    if nir is None or red is None:
        return jsonify({'error': 'NIR and Red band values required'}), 400
    
    # NDVI = (NIR - Red) / (NIR + Red)
    if (nir + red) == 0:
        ndvi = 0
    else:
        ndvi = (nir - red) / (nir + red)
    
    # Interpret NDVI value
    if ndvi < 0:
        interpretation = 'Water or bare soil'
        health = 'poor'
    elif ndvi < 0.2:
        interpretation = 'Bare soil or sparse vegetation'
        health = 'poor'
    elif ndvi < 0.4:
        interpretation = 'Sparse vegetation'
        health = 'moderate'
    elif ndvi < 0.6:
        interpretation = 'Moderate vegetation'
        health = 'good'
    elif ndvi < 0.8:
        interpretation = 'Dense vegetation'
        health = 'excellent'
    else:
        interpretation = 'Very dense vegetation'
        health = 'excellent'
    
    return jsonify({
        'ndvi': round(ndvi, 4),
        'nir': nir,
        'red': red,
        'interpretation': interpretation,
        'vegetation_health': health,
        'timestamp': datetime.now().isoformat()
    })

# ============================================================================
# Helper Functions
# ============================================================================

def calculate_growth_rate(measurements):
    """Calculate biomass growth rate from time series data"""
    if len(measurements) < 2:
        return 0
    
    # Sort by date
    sorted_measurements = sorted(measurements, key=lambda x: x.get('date', ''))
    
    # Calculate rate between first and last measurement
    first = sorted_measurements[0]
    last = sorted_measurements[-1]
    
    biomass_diff = last['biomass_kg_ha'] - first['biomass_kg_ha']
    
    # Calculate days difference (simplified)
    days_diff = len(sorted_measurements) * 7  # Assume weekly measurements
    
    if days_diff > 0:
        return round(biomass_diff / days_diff, 2)
    return 0

# ============================================================================
# Main
# ============================================================================

if __name__ == '__main__':
    print("🌾 Agricultural Models Service (Python) starting on port 8086")
    app.run(host='0.0.0.0', port=8086, debug=True)
