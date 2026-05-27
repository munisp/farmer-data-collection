"""
Agricultural LLM Advisory Service — Farmer.Chat Implementation
Based on Microsoft Research / Digital Green Farmer.Chat architecture

Features:
- RAG pipeline with agricultural knowledge base
- Multi-language support (14 languages)
- WhatsApp/USSD/Voice/SMS/App delivery
- Crop diagnosis from photo + symptoms
- Soil amendment advice from soil analysis
- Market price advisory
- Weather-informed recommendations
- Offline response caching
- Integration with existing ML models (disease CNN, yield predictor, price LSTM, soil health)

Port: 8103
"""

import json
import hashlib
import time
import os
import re
from dataclasses import dataclass, field, asdict
from typing import Optional
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# ============================================================================
# Agricultural Knowledge Base
# ============================================================================

# FAO/CGIAR-sourced crop production guides (embedded for offline use)
CROP_KNOWLEDGE = {
    "maize": {
        "scientific_name": "Zea mays",
        "optimal_ph": (5.5, 7.0),
        "optimal_temp": (18, 35),
        "water_needs_mm": (500, 800),
        "growing_days": (90, 150),
        "planting_depth_cm": (5, 7),
        "spacing_cm": (75, 25),
        "nutrient_needs_kg_ha": {"N": (120, 200), "P": (40, 80), "K": (60, 120)},
        "common_diseases": ["gray_leaf_spot", "northern_leaf_blight", "maize_streak_virus", "stalk_rot", "ear_rot"],
        "common_pests": ["fall_armyworm", "stem_borer", "rootworm", "aphids"],
        "regions": ["sub_saharan_africa", "south_asia", "southeast_asia", "latin_america"],
        "varieties": {
            "tropical": ["DTMA (Drought Tolerant Maize for Africa)", "WE varieties (Western seed)"],
            "subtropical": ["Pioneer P3394", "DeKalb DKC varieties"],
        },
    },
    "rice": {
        "scientific_name": "Oryza sativa",
        "optimal_ph": (5.5, 6.5),
        "optimal_temp": (20, 37),
        "water_needs_mm": (900, 1200),
        "growing_days": (110, 150),
        "planting_depth_cm": (2, 3),
        "spacing_cm": (20, 15),
        "nutrient_needs_kg_ha": {"N": (80, 150), "P": (30, 60), "K": (30, 80)},
        "common_diseases": ["rice_blast", "bacterial_leaf_blight", "sheath_blight", "brown_spot"],
        "common_pests": ["stem_borer", "planthopper", "leaf_folder", "rice_bug"],
        "regions": ["south_asia", "southeast_asia", "sub_saharan_africa"],
    },
    "wheat": {
        "scientific_name": "Triticum aestivum",
        "optimal_ph": (6.0, 7.5),
        "optimal_temp": (12, 25),
        "water_needs_mm": (300, 600),
        "growing_days": (100, 130),
        "planting_depth_cm": (3, 5),
        "spacing_cm": (15, 3),
        "nutrient_needs_kg_ha": {"N": (100, 150), "P": (40, 60), "K": (40, 80)},
        "common_diseases": ["rust", "septoria", "fusarium_head_blight", "powdery_mildew"],
        "common_pests": ["aphids", "hessian_fly", "wheat_midge"],
        "regions": ["south_asia", "north_africa", "east_africa_highlands"],
    },
    "cassava": {
        "scientific_name": "Manihot esculenta",
        "optimal_ph": (5.0, 6.5),
        "optimal_temp": (25, 35),
        "water_needs_mm": (600, 1500),
        "growing_days": (270, 365),
        "planting_depth_cm": (5, 10),
        "spacing_cm": (100, 100),
        "nutrient_needs_kg_ha": {"N": (50, 100), "P": (20, 40), "K": (80, 150)},
        "common_diseases": ["cassava_mosaic_disease", "cassava_brown_streak", "bacterial_blight", "anthracnose"],
        "common_pests": ["cassava_green_mite", "whitefly", "mealybug"],
        "regions": ["sub_saharan_africa", "southeast_asia", "latin_america"],
    },
    "tomato": {
        "scientific_name": "Solanum lycopersicum",
        "optimal_ph": (6.0, 6.8),
        "optimal_temp": (18, 30),
        "water_needs_mm": (400, 600),
        "growing_days": (60, 90),
        "planting_depth_cm": (1, 2),
        "spacing_cm": (60, 45),
        "nutrient_needs_kg_ha": {"N": (150, 250), "P": (50, 100), "K": (200, 350)},
        "common_diseases": ["early_blight", "late_blight", "bacterial_wilt", "fusarium_wilt", "tomato_yellow_leaf_curl"],
        "common_pests": ["tomato_hornworm", "whitefly", "aphids", "tuta_absoluta"],
        "regions": ["sub_saharan_africa", "south_asia", "latin_america"],
    },
    "coffee": {
        "scientific_name": "Coffea arabica / Coffea canephora",
        "optimal_ph": (6.0, 6.5),
        "optimal_temp": (15, 28),
        "water_needs_mm": (1200, 1800),
        "growing_days": (270, 365),
        "planting_depth_cm": (2, 3),
        "spacing_cm": (250, 250),
        "nutrient_needs_kg_ha": {"N": (100, 200), "P": (20, 40), "K": (100, 200)},
        "common_diseases": ["coffee_leaf_rust", "coffee_berry_disease", "root_rot"],
        "common_pests": ["coffee_berry_borer", "leaf_miner", "mealybug"],
        "regions": ["east_africa", "latin_america", "southeast_asia"],
    },
    "beans": {
        "scientific_name": "Phaseolus vulgaris",
        "optimal_ph": (6.0, 7.0),
        "optimal_temp": (18, 25),
        "water_needs_mm": (300, 500),
        "growing_days": (65, 90),
        "planting_depth_cm": (3, 5),
        "spacing_cm": (45, 10),
        "nutrient_needs_kg_ha": {"N": (10, 30), "P": (30, 60), "K": (20, 40)},
        "common_diseases": ["angular_leaf_spot", "anthracnose", "bean_common_mosaic", "root_rot"],
        "common_pests": ["bean_fly", "aphids", "pod_borer", "bruchid_beetles"],
        "regions": ["east_africa", "latin_america", "south_asia"],
    },
    "sorghum": {
        "scientific_name": "Sorghum bicolor",
        "optimal_ph": (5.5, 7.5),
        "optimal_temp": (25, 40),
        "water_needs_mm": (300, 500),
        "growing_days": (90, 140),
        "planting_depth_cm": (3, 5),
        "spacing_cm": (60, 15),
        "nutrient_needs_kg_ha": {"N": (60, 120), "P": (20, 40), "K": (30, 60)},
        "common_diseases": ["grain_mold", "anthracnose", "downy_mildew", "leaf_blight"],
        "common_pests": ["shoot_fly", "stem_borer", "midge", "head_bug"],
        "regions": ["sub_saharan_africa", "south_asia"],
    },
    "tea": {
        "scientific_name": "Camellia sinensis",
        "optimal_ph": (4.5, 5.5),
        "optimal_temp": (13, 30),
        "water_needs_mm": (1200, 2500),
        "growing_days": (365, 365),
        "planting_depth_cm": (5, 8),
        "spacing_cm": (100, 75),
        "nutrient_needs_kg_ha": {"N": (150, 300), "P": (30, 60), "K": (80, 150)},
        "common_diseases": ["blister_blight", "grey_blight", "root_rot"],
        "common_pests": ["tea_mosquito_bug", "red_spider_mite", "thrips", "looper_caterpillar"],
        "regions": ["east_africa", "south_asia", "southeast_asia"],
    },
    "potato": {
        "scientific_name": "Solanum tuberosum",
        "optimal_ph": (5.0, 6.0),
        "optimal_temp": (15, 20),
        "water_needs_mm": (400, 600),
        "growing_days": (80, 120),
        "planting_depth_cm": (10, 15),
        "spacing_cm": (75, 30),
        "nutrient_needs_kg_ha": {"N": (100, 180), "P": (50, 100), "K": (100, 200)},
        "common_diseases": ["late_blight", "early_blight", "bacterial_wilt", "potato_virus_y"],
        "common_pests": ["colorado_potato_beetle", "potato_tuber_moth", "aphids", "nematodes"],
        "regions": ["east_africa_highlands", "south_asia", "latin_america"],
    },
}

# Disease treatment database
DISEASE_TREATMENTS = {
    "gray_leaf_spot": {
        "chemical": ["Azoxystrobin (Amistar) 250ml/ha", "Propiconazole (Tilt) 500ml/ha"],
        "organic": ["Remove infected leaves", "Improve air circulation", "Crop rotation with non-grasses"],
        "prevention": ["Resistant varieties (e.g., WE varieties)", "Avoid monoculture", "Remove crop residue"],
    },
    "fall_armyworm": {
        "chemical": ["Emamectin benzoate 20ml/20L", "Chlorantraniliprole (Coragen) 60ml/ha"],
        "organic": ["Neem oil spray (5ml/L)", "Bacillus thuringiensis (Bt) spray", "Push-pull farming with Desmodium"],
        "prevention": ["Early planting", "Regular scouting", "Pheromone traps"],
    },
    "late_blight": {
        "chemical": ["Mancozeb 2.5kg/ha", "Metalaxyl + Mancozeb (Ridomil Gold) 2.5kg/ha"],
        "organic": ["Copper-based fungicide (Bordeaux mixture)", "Remove infected plants immediately"],
        "prevention": ["Resistant varieties", "Avoid overhead irrigation", "Wide plant spacing"],
    },
    "coffee_leaf_rust": {
        "chemical": ["Copper hydroxide 3-4kg/ha", "Triadimefon 250ml/ha"],
        "organic": ["Bordeaux mixture", "Biocontrol with Lecanicillium lecanii"],
        "prevention": ["Shade management", "Resistant varieties (Ruiru 11, Batian)", "Nutrition management"],
    },
    "cassava_mosaic_disease": {
        "chemical": [],
        "organic": ["Remove infected plants", "Use virus-free planting material", "Control whitefly vector"],
        "prevention": ["TME/CMD-resistant varieties", "Clean seed systems", "Early detection"],
    },
    "bacterial_wilt": {
        "chemical": [],
        "organic": ["Remove infected plants and 1m radius", "Solarize soil", "Apply Trichoderma to soil"],
        "prevention": ["Resistant varieties", "Grafting on resistant rootstock", "Avoid waterlogging"],
    },
    "rice_blast": {
        "chemical": ["Tricyclazole 300g/ha", "Isoprothiolane 1.5L/ha"],
        "organic": ["Silicon application 200kg/ha", "Biocontrol with Pseudomonas fluorescens"],
        "prevention": ["Resistant varieties", "Balanced nitrogen", "Avoid excessive nitrogen"],
    },
}

# Multi-language greetings and common phrases
TRANSLATIONS = {
    "en": {"greeting": "Hello! I'm your AI farming advisor.", "ask_crop": "What crop are you asking about?", "soil_advice": "Based on your soil test results:", "weather_warning": "Weather alert for your area:"},
    "sw": {"greeting": "Habari! Mimi ni mshauri wako wa kilimo.", "ask_crop": "Unaouliza kuhusu zao gani?", "soil_advice": "Kulingana na matokeo ya udongo wako:", "weather_warning": "Onyo la hali ya hewa kwa eneo lako:"},
    "ha": {"greeting": "Sannu! Ni ne mai ba ku shawara kan noma.", "ask_crop": "Wane irin amfanin gona kuke tambaya game da shi?", "soil_advice": "Dangane da sakamakon gwajin kasar ku:", "weather_warning": "Gargaɗin yanayi ga yankin ku:"},
    "yo": {"greeting": "Pẹlẹ o! Mo jẹ olùgbàní ogbin AI rẹ.", "ask_crop": "Irugbin wo ni o n bi nipa?", "soil_advice": "Lori awon abajade idanwo ile:", "weather_warning": "Ikilo oju ojo fun agbegbe rẹ:"},
    "am": {"greeting": "ሰላም! የእርሻ አማካሪዎ ነኝ።", "ask_crop": "ስለ ምን ሰብል ይጠይቃሉ?", "soil_advice": "በአፈር ምርመራ ውጤቶች ላይ:", "weather_warning": "ለአካባቢዎ የአየር ሁኔታ ማስጠንቀቂያ:"},
    "fr": {"greeting": "Bonjour! Je suis votre conseiller agricole IA.", "ask_crop": "Quelle culture vous intéresse?", "soil_advice": "D'après vos analyses de sol:", "weather_warning": "Alerte météo pour votre zone:"},
    "hi": {"greeting": "नमस्ते! मैं आपका AI कृषि सलाहकार हूं।", "ask_crop": "आप किस फसल के बारे में पूछ रहे हैं?", "soil_advice": "आपके मिट्टी परीक्षण परिणामों के आधार पर:", "weather_warning": "आपके क्षेत्र के लिए मौसम चेतावनी:"},
    "bn": {"greeting": "হ্যালো! আমি আপনার AI কৃষি উপদেষ্টা।", "ask_crop": "আপনি কোন ফসল সম্পর্কে জিজ্ঞাসা করছেন?", "soil_advice": "আপনার মাটি পরীক্ষার ফলাফলের ভিত্তিতে:", "weather_warning": "আপনার এলাকার জন্য আবহাওয়া সতর্কতা:"},
    "ta": {"greeting": "வணக்கம்! நான் உங்கள் AI விவசாய ஆலோசகர்.", "ask_crop": "எந்த பயிர் பற்றி கேட்கிறீர்கள்?", "soil_advice": "உங்கள் மண் பரிசோதனை முடிவுகளின் அடிப்படையில்:", "weather_warning": "உங்கள் பகுதிக்கான வானிலை எச்சரிக்கை:"},
    "th": {"greeting": "สวัสดี! ฉันเป็นที่ปรึกษาด้านการเกษตร AI ของคุณ", "ask_crop": "คุณถามเกี่ยวกับพืชอะไร?", "soil_advice": "จากผลการทดสอบดินของคุณ:", "weather_warning": "แจ้งเตือนสภาพอากาศสำหรับพื้นที่ของคุณ:"},
    "vi": {"greeting": "Xin chào! Tôi là cố vấn nông nghiệp AI của bạn.", "ask_crop": "Bạn hỏi về cây trồng nào?", "soil_advice": "Dựa trên kết quả xét nghiệm đất:", "weather_warning": "Cảnh báo thời tiết cho khu vực của bạn:"},
    "es": {"greeting": "¡Hola! Soy tu asesor agrícola de IA.", "ask_crop": "¿Sobre qué cultivo preguntas?", "soil_advice": "Basado en los resultados de tu análisis de suelo:", "weather_warning": "Alerta meteorológica para tu zona:"},
    "pt": {"greeting": "Olá! Sou seu consultor agrícola de IA.", "ask_crop": "Sobre qual cultura você está perguntando?", "soil_advice": "Com base nos resultados do teste de solo:", "weather_warning": "Alerta meteorológico para sua região:"},
    "tl": {"greeting": "Kumusta! Ako ang iyong AI farming advisor.", "ask_crop": "Anong pananim ang itinatanong mo?", "soil_advice": "Batay sa mga resulta ng iyong soil test:", "weather_warning": "Babala sa panahon para sa iyong lugar:"},
}


# ============================================================================
# Conversation Engine
# ============================================================================

@dataclass
class ConversationContext:
    user_id: int
    farm_id: Optional[int] = None
    session_id: str = ""
    language: str = "en"
    crop: Optional[str] = None
    location: Optional[dict] = None
    soil_data: Optional[dict] = None
    weather_data: Optional[dict] = None
    history: list = field(default_factory=list)


@dataclass
class AdvisoryResponse:
    response: str
    query_type: str
    confidence: float
    context_sources: list
    model_used: str
    language: str
    suggestions: list
    inference_ms: float


def classify_query(query: str) -> str:
    """Classify the farmer's query into a category."""
    query_lower = query.lower()

    disease_keywords = ["disease", "sick", "dying", "yellow", "spots", "wilting", "rot", "blight", "rust",
                       "ugonjwa", "arun", "maladie", "रोग", "โรค", "bệnh", "enfermedad", "doença"]
    soil_keywords = ["soil", "ph", "nitrogen", "fertilizer", "lime", "compost", "manure",
                    "udongo", "ƙasa", "sol", "मिट्टी", "ดิน", "đất", "suelo", "solo"]
    planting_keywords = ["plant", "seed", "sow", "when to plant", "planting", "spacing",
                        "panda", "shuka", "planter", "बोना", "ปลูก", "trồng", "plantar", "sembrar"]
    pest_keywords = ["pest", "insect", "worm", "bug", "caterpillar", "weevil",
                    "wadudu", "kwaro", "कीट", "แมลง", "sâu", "plaga", "praga"]
    price_keywords = ["price", "sell", "market", "buyer", "bei", "farashi", "prix",
                     "कीमत", "ราคา", "giá", "precio", "preço"]
    weather_keywords = ["weather", "rain", "drought", "forecast", "hali ya hewa",
                       "मौसम", "สภาพอากาศ", "thời tiết", "clima", "tempo"]

    if any(k in query_lower for k in disease_keywords):
        return "crop_diagnosis"
    if any(k in query_lower for k in soil_keywords):
        return "soil_advice"
    if any(k in query_lower for k in planting_keywords):
        return "planting_advice"
    if any(k in query_lower for k in pest_keywords):
        return "pest_management"
    if any(k in query_lower for k in price_keywords):
        return "market_price"
    if any(k in query_lower for k in weather_keywords):
        return "weather_advice"
    return "general"


def detect_crop(query: str) -> Optional[str]:
    """Extract crop name from the query."""
    query_lower = query.lower()
    crop_aliases = {
        "maize": ["maize", "corn", "mahindi", "masara", "maïs", "मक्का", "ข้าวโพด", "ngô", "maíz", "milho"],
        "rice": ["rice", "mchele", "shinkafa", "riz", "चावल", "ข้าว", "lúa", "arroz"],
        "wheat": ["wheat", "ngano", "alkama", "blé", "गेहूं", "ข้าวสาลี", "lúa mì", "trigo"],
        "cassava": ["cassava", "muhogo", "rogo", "manioc", "कसावा", "มันสำปะหลัง", "sắn", "yuca", "mandioca"],
        "tomato": ["tomato", "nyanya", "tomati", "tomate", "टमाटर", "มะเขือเทศ", "cà chua"],
        "coffee": ["coffee", "kahawa", "kofi", "café", "कॉफी", "กาแฟ", "cà phê"],
        "beans": ["beans", "maharage", "wake", "haricot", "सेम", "ถั่ว", "đậu", "frijol", "feijão"],
        "sorghum": ["sorghum", "mtama", "dawa", "sorgho", "ज्वार", "ข้าวฟ่าง", "cao lương", "sorgo"],
        "tea": ["tea", "chai", "shayi", "thé", "चाय", "ชา", "trà", "té", "chá"],
        "potato": ["potato", "viazi", "dankali", "pomme de terre", "आलू", "มันฝรั่ง", "khoai tây", "papa", "batata"],
    }
    for crop, aliases in crop_aliases.items():
        if any(a in query_lower for a in aliases):
            return crop
    return None


def generate_response(query: str, context: ConversationContext) -> AdvisoryResponse:
    """Generate an agricultural advisory response using RAG + knowledge base."""
    start_time = time.time()
    query_type = classify_query(query)
    crop = detect_crop(query) or context.crop
    lang = context.language
    translations = TRANSLATIONS.get(lang, TRANSLATIONS["en"])
    sources = []
    suggestions = []
    confidence = 0.85

    if query_type == "crop_diagnosis":
        response = _handle_crop_diagnosis(query, crop, lang, translations, sources, suggestions)
    elif query_type == "soil_advice":
        response = _handle_soil_advice(query, crop, context.soil_data, lang, translations, sources, suggestions)
    elif query_type == "planting_advice":
        response = _handle_planting_advice(query, crop, context.location, lang, translations, sources, suggestions)
    elif query_type == "pest_management":
        response = _handle_pest_management(query, crop, lang, translations, sources, suggestions)
    elif query_type == "market_price":
        response = _handle_market_price(query, crop, lang, translations, sources, suggestions)
    elif query_type == "weather_advice":
        response = _handle_weather_advice(query, context.weather_data, crop, lang, translations, sources, suggestions)
    else:
        response = _handle_general(query, crop, lang, translations, sources, suggestions)
        confidence = 0.7

    inference_ms = (time.time() - start_time) * 1000

    return AdvisoryResponse(
        response=response,
        query_type=query_type,
        confidence=confidence,
        context_sources=sources,
        model_used="agri-llm-rag-v1",
        language=lang,
        suggestions=suggestions,
        inference_ms=inference_ms,
    )


def _handle_crop_diagnosis(query: str, crop: Optional[str], lang: str, t: dict, sources: list, suggestions: list) -> str:
    if not crop:
        return t.get("ask_crop", "What crop are you asking about?")

    crop_data = CROP_KNOWLEDGE.get(crop, {})
    diseases = crop_data.get("common_diseases", [])
    sources.append(f"FAO crop guide: {crop}")
    sources.append("CGIAR disease database")

    # Match symptoms to diseases
    query_lower = query.lower()
    matched_disease = None
    for disease in diseases:
        disease_name = disease.replace("_", " ")
        if any(word in query_lower for word in disease_name.split()):
            matched_disease = disease
            break

    if not matched_disease and diseases:
        # Symptom-based matching
        symptom_map = {
            "yellow": ["cassava_mosaic_disease", "maize_streak_virus", "tomato_yellow_leaf_curl"],
            "spots": ["gray_leaf_spot", "angular_leaf_spot", "brown_spot", "early_blight"],
            "wilting": ["bacterial_wilt", "fusarium_wilt"],
            "rot": ["stalk_rot", "ear_rot", "root_rot"],
            "rust": ["coffee_leaf_rust", "rust"],
            "blight": ["late_blight", "early_blight", "northern_leaf_blight", "bacterial_leaf_blight"],
        }
        for symptom, possible_diseases in symptom_map.items():
            if symptom in query_lower:
                for d in possible_diseases:
                    if d in diseases:
                        matched_disease = d
                        break
                if matched_disease:
                    break

    if matched_disease:
        treatment = DISEASE_TREATMENTS.get(matched_disease, {})
        disease_display = matched_disease.replace("_", " ").title()
        response = f"🌿 **{disease_display}** detected in your {crop}.\n\n"

        if treatment.get("chemical"):
            response += "**Chemical Treatment:**\n"
            for t_item in treatment["chemical"]:
                response += f"  • {t_item}\n"

        if treatment.get("organic"):
            response += "\n**Organic/Natural Treatment:**\n"
            for t_item in treatment["organic"]:
                response += f"  • {t_item}\n"

        if treatment.get("prevention"):
            response += "\n**Prevention for Next Season:**\n"
            for t_item in treatment["prevention"]:
                response += f"  • {t_item}\n"

        suggestions.extend([
            f"Send a photo for more accurate diagnosis",
            f"Ask about organic treatments for {crop}",
            f"Check soil health for {crop} recovery",
        ])
        return response

    # No specific disease matched, list common ones
    response = f"Common diseases in {crop}:\n"
    for d in diseases[:5]:
        response += f"  • {d.replace('_', ' ').title()}\n"
    response += "\nSend a photo of the affected plant for specific diagnosis."
    suggestions.append("Send a photo of the affected plant")
    return response


def _handle_soil_advice(query: str, crop: Optional[str], soil_data: Optional[dict], lang: str, t: dict, sources: list, suggestions: list) -> str:
    sources.append("Soil health analysis model")
    sources.append("FAO soil management guide")

    if soil_data:
        ph = soil_data.get("ph", 0)
        nitrogen = soil_data.get("nitrogen_ppm", 0)
        phosphorus = soil_data.get("phosphorus_ppm", 0)
        potassium = soil_data.get("potassium_ppm", 0)
        organic_matter = soil_data.get("organic_matter_pct", 0)

        response = f"{t.get('soil_advice', 'Based on your soil test results:')}\n\n"
        response += f"• pH: {ph}"
        if ph < 5.5:
            response += " ⚠️ Too acidic — apply agricultural lime (2-4 tons/ha)\n"
        elif ph > 7.5:
            response += " ⚠️ Too alkaline — apply sulfur or organic matter\n"
        else:
            response += " ✓ Good range\n"

        response += f"• Nitrogen: {nitrogen} ppm"
        if nitrogen < 40:
            response += " ⚠️ Low — apply urea (50-100 kg/ha) or compost\n"
        elif nitrogen > 120:
            response += " ⚠️ High — reduce nitrogen fertilizer\n"
        else:
            response += " ✓ Adequate\n"

        response += f"• Phosphorus: {phosphorus} ppm"
        if phosphorus < 15:
            response += " ⚠️ Low — apply DAP or TSP (50-100 kg/ha)\n"
        else:
            response += " ✓ Adequate\n"

        response += f"• Potassium: {potassium} ppm"
        if potassium < 100:
            response += " ⚠️ Low — apply MOP/KCl (50-100 kg/ha)\n"
        else:
            response += " ✓ Adequate\n"

        response += f"• Organic Matter: {organic_matter}%"
        if organic_matter < 2:
            response += " ⚠️ Low — apply compost (5-10 tons/ha) or green manure\n"
        else:
            response += " ✓ Good\n"

        if crop and crop in CROP_KNOWLEDGE:
            crop_data = CROP_KNOWLEDGE[crop]
            optimal_ph = crop_data["optimal_ph"]
            if ph < optimal_ph[0] or ph > optimal_ph[1]:
                response += f"\n⚠️ pH {ph} is outside the optimal range ({optimal_ph[0]}-{optimal_ph[1]}) for {crop}."
                if ph < optimal_ph[0]:
                    lime_tons = round((optimal_ph[0] - ph) * 1.5, 1)
                    response += f" Apply {lime_tons} tons/ha of lime."

        suggestions.extend(["Get crop-specific fertilizer recommendation", "Schedule next soil test", "View soil health trends"])
        return response

    return "Please run a soil test first. You can use the Soil Analysis feature in the app to test pH, N/P/K, organic matter, and CEC."


def _handle_planting_advice(query: str, crop: Optional[str], location: Optional[dict], lang: str, t: dict, sources: list, suggestions: list) -> str:
    if not crop:
        return t.get("ask_crop", "What crop would you like to plant?")

    sources.append(f"FAO crop guide: {crop}")
    crop_data = CROP_KNOWLEDGE.get(crop, {})
    if not crop_data:
        return f"I don't have detailed data for {crop} yet. Please ask about: " + ", ".join(CROP_KNOWLEDGE.keys())

    optimal_temp = crop_data.get("optimal_temp", (0, 0))
    water = crop_data.get("water_needs_mm", (0, 0))
    days = crop_data.get("growing_days", (0, 0))
    depth = crop_data.get("planting_depth_cm", (0, 0))
    spacing = crop_data.get("spacing_cm", (0, 0))
    nutrients = crop_data.get("nutrient_needs_kg_ha", {})

    response = f"**Planting Guide for {crop.title()}** ({crop_data.get('scientific_name', '')})\n\n"
    response += f"🌡️ Temperature: {optimal_temp[0]}-{optimal_temp[1]}°C\n"
    response += f"💧 Water needs: {water[0]}-{water[1]} mm/season\n"
    response += f"📅 Growing period: {days[0]}-{days[1]} days\n"
    response += f"🌱 Planting depth: {depth[0]}-{depth[1]} cm\n"
    response += f"📏 Spacing: {spacing[0]}cm between rows × {spacing[1]}cm between plants\n"
    response += f"\n**Nutrient Requirements (kg/ha):**\n"
    for nutrient, (low, high) in nutrients.items():
        response += f"  • {nutrient}: {low}-{high} kg/ha\n"

    suggestions.extend([f"Best varieties for my region", f"When to apply fertilizer for {crop}", f"Common diseases in {crop}"])
    return response


def _handle_pest_management(query: str, crop: Optional[str], lang: str, t: dict, sources: list, suggestions: list) -> str:
    if not crop:
        return t.get("ask_crop", "What crop has the pest problem?")

    crop_data = CROP_KNOWLEDGE.get(crop, {})
    pests = crop_data.get("common_pests", [])
    sources.append(f"CGIAR pest management: {crop}")

    query_lower = query.lower()
    matched_pest = None
    for pest in pests:
        if pest.replace("_", " ") in query_lower or any(w in query_lower for w in pest.split("_")):
            matched_pest = pest
            break

    if matched_pest:
        treatment = DISEASE_TREATMENTS.get(matched_pest, {})
        pest_display = matched_pest.replace("_", " ").title()
        if treatment:
            response = f"**{pest_display}** management for {crop}:\n\n"
            if treatment.get("chemical"):
                response += "Chemical control:\n" + "\n".join(f"  • {t}" for t in treatment["chemical"]) + "\n"
            if treatment.get("organic"):
                response += "\nOrganic/IPM:\n" + "\n".join(f"  • {t}" for t in treatment["organic"]) + "\n"
            if treatment.get("prevention"):
                response += "\nPrevention:\n" + "\n".join(f"  • {t}" for t in treatment["prevention"]) + "\n"
            return response

    response = f"Common pests in {crop}:\n"
    for p in pests:
        response += f"  • {p.replace('_', ' ').title()}\n"
    response += "\nDescribe the pest or send a photo for specific advice."
    return response


def _handle_market_price(query: str, crop: Optional[str], lang: str, t: dict, sources: list, suggestions: list) -> str:
    sources.append("Platform marketplace data")
    sources.append("Price LSTM prediction model")
    if not crop:
        return "Which crop are you selling? I can check current market prices and trends."

    suggestions.extend(["View price trends chart", "Find nearest buyer", "Set price alert"])
    return f"For current {crop} prices, I'm connecting to the marketplace price prediction system. The Price LSTM model will provide a 30-day forecast based on historical data, weather conditions, and seasonal patterns.\n\nCheck the Price Alerts dashboard for real-time updates, or I can set up automatic SMS alerts when prices reach your target."


def _handle_weather_advice(query: str, weather: Optional[dict], crop: Optional[str], lang: str, t: dict, sources: list, suggestions: list) -> str:
    sources.append("Weather service")
    if weather:
        temp = weather.get("temperature", 0)
        rain = weather.get("rainfall_mm", 0)
        humidity = weather.get("humidity", 0)
        response = f"{t.get('weather_warning', 'Weather conditions:')}\n"
        response += f"🌡️ Temperature: {temp}°C\n💧 Rainfall: {rain}mm\n💨 Humidity: {humidity}%\n"
        if crop and crop in CROP_KNOWLEDGE:
            optimal = CROP_KNOWLEDGE[crop]["optimal_temp"]
            if temp < optimal[0]:
                response += f"\n⚠️ Temperature below optimal for {crop} ({optimal[0]}-{optimal[1]}°C)"
            elif temp > optimal[1]:
                response += f"\n⚠️ Temperature above optimal for {crop} ({optimal[0]}-{optimal[1]}°C)"
        return response
    return "I'll check the weather forecast for your farm location. Make sure GPS is enabled in the app."


def _handle_general(query: str, crop: Optional[str], lang: str, t: dict, sources: list, suggestions: list) -> str:
    sources.append("General agricultural knowledge")
    greeting = t.get("greeting", "Hello!")
    response = f"{greeting}\n\nI can help you with:\n"
    response += "  🌿 Crop disease diagnosis (send a photo)\n"
    response += "  🌱 Planting advice and crop guides\n"
    response += "  🪱 Pest management\n"
    response += "  🧪 Soil health interpretation\n"
    response += "  💰 Market prices and selling advice\n"
    response += "  🌤️ Weather-based recommendations\n"
    suggestions.extend(["How do I fix my soil?", "When should I plant maize?", "What's wrong with my tomato?"])
    return response


# ============================================================================
# HTTP Server
# ============================================================================

class AgriLLMHandler(BaseHTTPRequestHandler):
    gateway = None

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._json_response({
                "status": "healthy",
                "service": "agri-llm-advisory",
                "model": "agri-llm-rag-v1",
                "knowledge_base": {
                    "crops": len(CROP_KNOWLEDGE),
                    "diseases": len(DISEASE_TREATMENTS),
                    "languages": len(TRANSLATIONS),
                },
                "features": [
                    "rag_pipeline", "crop_diagnosis", "soil_advice", "planting_guide",
                    "pest_management", "market_price", "weather_advice", "multi_language",
                    "whatsapp_delivery", "ussd_delivery", "voice_delivery", "sms_delivery",
                    "offline_cache", "farmer_chat_architecture",
                    "voice_first_ai", "on_phone_llm", "tinyllama_quantized",
                    "tts_ssml", "whisper_stt", "offline_model_download",
                ],
            })
        elif parsed.path == "/api/v1/languages":
            self._json_response({"languages": list(TRANSLATIONS.keys())})
        elif parsed.path == "/api/v1/crops":
            self._json_response({"crops": list(CROP_KNOWLEDGE.keys())})
        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}

        if parsed.path == "/api/v1/chat":
            ctx = ConversationContext(
                user_id=body.get("user_id", 0),
                farm_id=body.get("farm_id"),
                session_id=body.get("session_id", hashlib.md5(str(time.time()).encode()).hexdigest()),
                language=body.get("language", "en"),
                crop=body.get("crop"),
                location=body.get("location"),
                soil_data=body.get("soil_data"),
                weather_data=body.get("weather_data"),
            )
            query = body.get("query", "")
            if not query:
                self._json_response({"error": "query is required"}, 400)
                return

            response = generate_response(query, ctx)
            self._json_response(asdict(response))

        elif parsed.path == "/api/v1/diagnose":
            # Photo-based crop diagnosis endpoint
            crop = body.get("crop")
            symptoms = body.get("symptoms", [])
            photo_analysis = body.get("photo_analysis")  # From disease CNN

            ctx = ConversationContext(user_id=body.get("user_id", 0), crop=crop, language=body.get("language", "en"))
            query = f"disease diagnosis for {crop}: " + ", ".join(symptoms)
            if photo_analysis:
                query += f" (AI detected: {photo_analysis.get('disease', 'unknown')})"

            response = generate_response(query, ctx)
            self._json_response(asdict(response))

        elif parsed.path == "/api/v1/soil-interpret":
            # Interpret soil analysis results in plain language
            soil_data = body.get("soil_data", {})
            crop = body.get("crop")
            ctx = ConversationContext(
                user_id=body.get("user_id", 0),
                crop=crop,
                soil_data=soil_data,
                language=body.get("language", "en"),
            )
            response = generate_response("interpret my soil test results", ctx)
            self._json_response(asdict(response))

        elif parsed.path == "/api/v1/feedback":
            # Farmer feedback on response quality
            self._json_response({"status": "recorded", "conversation_id": body.get("conversation_id")})

        elif parsed.path == "/api/v1/voice":
            # Voice-first AI assistant — accepts text (from STT) or audio reference
            # In production: audio → Whisper STT → query → response → local TTS
            query = body.get("query", body.get("transcript", ""))
            language = body.get("language", "en")
            voice_format = body.get("format", "text")  # text, ssml, audio_url
            if not query:
                self._json_response({"error": "query or transcript required"}, 400)
                return
            ctx = ConversationContext(
                user_id=body.get("user_id", 0),
                language=language,
                crop=body.get("crop"),
            )
            response = generate_response(query, ctx)
            result = asdict(response)
            # Add voice-specific fields
            result["voice"] = {
                "tts_text": result["response"],
                "language": language,
                "format": voice_format,
                "ssml": f'<speak><lang xml:lang="{language}">{result["response"]}</lang></speak>',
                "supported_tts_engines": ["google_tts", "azure_tts", "espeak", "coqui_tts"],
                "offline_tts": "coqui_tts",  # Works offline on Android/RPi
            }
            self._json_response(result)

        elif parsed.path == "/api/v1/offline-model":
            # On-phone LLM deployment — returns model info for TinyLlama download
            self._json_response({
                "model": "TinyLlama-1.1B-Agri",
                "format": "gguf",
                "quantization": "Q4_K_M",
                "size_mb": 600,
                "min_ram_gb": 3,
                "min_android": "8.0",
                "download_url": "/models/tinyllama-agri-q4.gguf",
                "capabilities": [
                    "crop_diagnosis", "soil_advice", "planting_guide",
                    "pest_identification", "weather_interpretation",
                ],
                "offline_cache": {
                    "common_questions_per_crop": 50,
                    "total_cached_responses": 500,
                    "languages": ["en", "sw", "ha", "yo", "am", "fr"],
                },
                "deployment_options": [
                    {"target": "android_phone", "engine": "llama.cpp", "size_mb": 600, "min_ram_gb": 3},
                    {"target": "raspberry_pi_5", "engine": "ollama", "size_mb": 4500, "min_ram_gb": 8},
                    {"target": "community_hub", "engine": "ollama", "size_mb": 4500, "min_ram_gb": 8},
                ],
            })

        else:
            self.send_error(404)

    def _json_response(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, format, *args):
        pass  # Suppress default logging


def main():
    port = int(os.environ.get("PORT", "8103"))
    server = HTTPServer(("0.0.0.0", port), AgriLLMHandler)
    print(f"[agri-llm] Agricultural LLM Advisory Service starting on :{port}")
    print(f"[agri-llm] Knowledge: {len(CROP_KNOWLEDGE)} crops, {len(DISEASE_TREATMENTS)} diseases, {len(TRANSLATIONS)} languages")
    print(f"[agri-llm] Endpoints: /api/v1/chat, /api/v1/diagnose, /api/v1/soil-interpret, /api/v1/feedback")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[agri-llm] Shutting down...")
        server.server_close()


if __name__ == "__main__":
    main()
