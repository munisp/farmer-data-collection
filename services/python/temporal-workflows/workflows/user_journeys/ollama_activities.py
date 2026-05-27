"""
Ollama Activity Functions for Temporal Workflows
Replaces GPT-4 and GPT-4 Vision with local Ollama models
"""
import httpx
from typing import Dict, Any, List

OLLAMA_SERVICE_URL = "http://localhost:8087"

# ============================================================================
# TEXT ANALYSIS ACTIVITIES
# ============================================================================

async def parse_loan_request_ollama(message: str) -> Dict[str, Any]:
    """
    Journey 5: Parse loan application from WhatsApp message using Ollama
    Replaces: GPT-4 text parsing
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_SERVICE_URL}/journey/loan/parse-request",
            params={"message": message},
            timeout=60.0,
        )
    
    result = response.json()
    
    if result.get("success"):
        parsed_data = result.get("parsed_data", {})
        return {
            "amount": parsed_data.get("amount", 0),
            "purpose": parsed_data.get("purpose", ""),
            "period_months": parsed_data.get("period_months"),
        }
    
    # Fallback if parsing fails
    return {
        "amount": 0,
        "purpose": message,
        "period_months": None,
    }


async def parse_whatsapp_listing_ollama(message: str) -> Dict[str, Any]:
    """
    Journey 3: Parse WhatsApp marketplace listing using Ollama
    Replaces: GPT-4 text parsing
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_SERVICE_URL}/analyze/text",
            json={
                "text": message,
                "task": "parse_whatsapp_message",
            },
            timeout=60.0,
        )
    
    result = response.json()
    
    if result.get("success") and "parsed_data" in result:
        parsed_data = result["parsed_data"]
        return {
            "product": parsed_data.get("product", ""),
            "quantity": parsed_data.get("quantity", 0),
            "unit": parsed_data.get("unit", "kg"),
            "price": parsed_data.get("price", 0),
            "description": parsed_data.get("description", ""),
        }
    
    # Fallback
    return {
        "product": "Unknown",
        "quantity": 0,
        "unit": "kg",
        "price": 0,
        "description": message,
    }


# ============================================================================
# IMAGE ANALYSIS ACTIVITIES
# ============================================================================

async def analyze_product_quality_ollama(image_url: str, product_name: str) -> Dict[str, Any]:
    """
    Journey 3: Analyze product quality for marketplace listing using Ollama Vision
    Replaces: GPT-4 Vision
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_SERVICE_URL}/journey/marketplace/analyze-product",
            params={
                "image_url": image_url,
                "product_name": product_name,
            },
            timeout=120.0,
        )
    
    result = response.json()
    
    if result.get("success"):
        analysis = result.get("analysis", {})
        if "analysis" in analysis:
            data = analysis["analysis"]
            return {
                "quality_score": data.get("quality_score", 5),
                "freshness": data.get("freshness", "moderate"),
                "defects": data.get("defects", ""),
                "grade": data.get("grade", "B"),
                "recommendation": data.get("recommendation", "accept"),
            }
    
    # Fallback - accept with moderate quality
    return {
        "quality_score": 5,
        "freshness": "moderate",
        "defects": "",
        "grade": "B",
        "recommendation": "accept",
    }


async def diagnose_crop_disease_ollama(image_url: str, crop_type: str, description: str) -> Dict[str, Any]:
    """
    Journey 6: Diagnose crop disease from image using Ollama Vision
    Replaces: GPT-4 Vision + ML service
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_SERVICE_URL}/journey/disease/diagnose",
            params={
                "image_url": image_url,
                "crop_type": crop_type,
                "description": description,
            },
            timeout=120.0,
        )
    
    result = response.json()
    
    if result.get("success"):
        diagnosis = result.get("diagnosis", {})
        return {
            "disease_name": diagnosis.get("disease_name", "Unknown"),
            "severity": diagnosis.get("severity", "moderate"),
            "affected_percentage": diagnosis.get("affected_percentage", 0),
            "treatment": diagnosis.get("treatment", "Consult agricultural extension officer"),
            "urgency": diagnosis.get("urgency", "medium"),
        }
    
    # Fallback
    return {
        "disease_name": "Unknown - requires expert inspection",
        "severity": "moderate",
        "affected_percentage": 0,
        "treatment": "Please consult with an agricultural extension officer for proper diagnosis",
        "urgency": "medium",
    }


async def assess_crop_damage_ollama(image_urls: List[str]) -> Dict[str, Any]:
    """
    Journey 8: Assess crop damage for insurance claim using Ollama Vision
    Replaces: GPT-4 Vision
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_SERVICE_URL}/journey/insurance/assess-damage",
            json={"image_urls": image_urls},
            timeout=120.0,
        )
    
    result = response.json()
    
    if result.get("success"):
        assessment = result.get("damage_assessment", {})
        return {
            "damage_type": assessment.get("damage_type", "Unknown"),
            "severity": assessment.get("severity", 5),
            "affected_percentage": assessment.get("affected_percentage", 0),
            "verifiable": assessment.get("verifiable", True),
            "notes": assessment.get("notes", ""),
        }
    
    # Fallback
    return {
        "damage_type": "Requires manual inspection",
        "severity": 5,
        "affected_percentage": 0,
        "verifiable": True,
        "notes": "Please have an insurance agent inspect the damage",
    }


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def check_ollama_health() -> bool:
    """Check if Ollama service is healthy"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{OLLAMA_SERVICE_URL}/health",
                timeout=5.0,
            )
        
        result = response.json()
        return result.get("status") == "healthy"
    
    except Exception:
        return False


async def list_available_models() -> List[str]:
    """List available Ollama models"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{OLLAMA_SERVICE_URL}/models",
                timeout=5.0,
            )
        
        result = response.json()
        return [m["name"] for m in result.get("models", [])]
    
    except Exception:
        return []
