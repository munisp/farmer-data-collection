"""
Ollama AI Service
Replaces GPT-4 and GPT-4 Vision with local Ollama models

Models:
- llama3.2-vision: Image analysis (crop disease, product quality, damage assessment)
- llama3.2: Text processing (loan requests, message parsing)
"""
import os
import json
import logging
import base64
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Ollama AI Service")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

# ============================================================================
# MODELS
# ============================================================================

class TextAnalysisRequest(BaseModel):
    text: str
    task: str  # parse_loan_request, parse_whatsapp_message, etc.
    context: Optional[Dict[str, Any]] = None


class ImageAnalysisRequest(BaseModel):
    image_url: str
    task: str  # analyze_product, diagnose_disease, assess_damage
    context: Optional[Dict[str, Any]] = None


class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    model: str = "llama3.2"
    temperature: float = 0.7


# ============================================================================
# ROUTES
# ============================================================================

@app.get("/health")
async def health():
    # Check Ollama service
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags", timeout=5.0)
            models = response.json().get("models", [])
            
        return {
            "status": "healthy",
            "service": "ollama-ai",
            "ollama_url": OLLAMA_URL,
            "models_available": [m["name"] for m in models],
        }
    except Exception as e:
        return {
            "status": "degraded",
            "service": "ollama-ai",
            "error": str(e),
        }


@app.post("/analyze/text")
async def analyze_text(request: TextAnalysisRequest):
    """Analyze text using Ollama llama3.2"""
    
    try:
        # Build prompt based on task
        if request.task == "parse_loan_request":
            prompt = f"""Extract loan details from this farmer's message:
"{request.text}"

Extract:
- Amount requested (in Naira)
- Purpose of loan
- Repayment period (if mentioned)

Respond in JSON format:
{{"amount": <number>, "purpose": "<string>", "period_months": <number or null>}}"""
        
        elif request.task == "parse_whatsapp_message":
            prompt = f"""Parse this WhatsApp marketplace listing:
"{request.text}"

Extract:
- Product name
- Quantity
- Unit (kg, bags, etc.)
- Price per unit
- Description

Respond in JSON format:
{{"product": "<string>", "quantity": <number>, "unit": "<string>", "price": <number>, "description": "<string>"}}"""
        
        else:
            prompt = request.text
        
        # Call Ollama API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "llama3.2",
                    "prompt": prompt,
                    "stream": False,
                    "temperature": 0.3,  # Lower for structured output
                },
                timeout=60.0,
            )
        
        result = response.json()
        generated_text = result.get("response", "")
        
        # Try to parse JSON response
        try:
            parsed_data = json.loads(generated_text)
            return {
                "success": True,
                "task": request.task,
                "parsed_data": parsed_data,
                "raw_response": generated_text,
            }
        except json.JSONDecodeError:
            # Return raw text if not JSON
            return {
                "success": True,
                "task": request.task,
                "text": generated_text,
                "raw_response": generated_text,
            }
    
    except Exception as e:
        logger.error(f"Text analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/image")
async def analyze_image(request: ImageAnalysisRequest):
    """Analyze image using Ollama llama3.2-vision"""
    
    try:
        # Download image
        async with httpx.AsyncClient() as client:
            img_response = await client.get(request.image_url, timeout=30.0)
            image_data = img_response.content
        
        # Convert to base64
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Build prompt based on task
        if request.task == "analyze_product":
            prompt = """Analyze this product image for marketplace listing.

Assess:
1. Product quality (1-10 scale)
2. Freshness (for produce)
3. Visible defects or damage
4. Estimated grade (A, B, C)

Respond in JSON format:
{"quality_score": <1-10>, "freshness": "<fresh/moderate/poor>", "defects": "<description>", "grade": "<A/B/C>", "recommendation": "<accept/reject>"}"""
        
        elif request.task == "diagnose_disease":
            crop_type = request.context.get("crop_type", "crop") if request.context else "crop"
            prompt = f"""You are an agricultural expert. Analyze this {crop_type} plant image for diseases.

Identify:
1. Disease name (if any)
2. Severity (mild/moderate/severe)
3. Affected area percentage
4. Recommended treatment
5. Urgency (low/medium/high)

Respond in JSON format:
{{"disease_name": "<name or 'healthy'>", "severity": "<mild/moderate/severe>", "affected_percentage": <0-100>, "treatment": "<description>", "urgency": "<low/medium/high>"}}"""
        
        elif request.task == "assess_damage":
            prompt = """Analyze this image for crop damage (for insurance claim).

Assess:
1. Type of damage (flood, drought, pest, disease, storm, etc.)
2. Damage severity (1-10 scale)
3. Estimated percentage of crop affected
4. Is damage visible and verifiable? (yes/no)

Respond in JSON format:
{"damage_type": "<type>", "severity": <1-10>, "affected_percentage": <0-100>, "verifiable": <true/false>, "notes": "<description>"}"""
        
        else:
            prompt = "Describe this image in detail."
        
        # Call Ollama Vision API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "llama3.2-vision",
                    "prompt": prompt,
                    "images": [image_base64],
                    "stream": False,
                    "temperature": 0.3,
                },
                timeout=120.0,
            )
        
        result = response.json()
        generated_text = result.get("response", "")
        
        # Try to parse JSON response
        try:
            parsed_data = json.loads(generated_text)
            return {
                "success": True,
                "task": request.task,
                "analysis": parsed_data,
                "raw_response": generated_text,
            }
        except json.JSONDecodeError:
            # Return raw text if not JSON
            return {
                "success": True,
                "task": request.task,
                "description": generated_text,
                "raw_response": generated_text,
            }
    
    except Exception as e:
        logger.error(f"Image analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat(request: ChatRequest):
    """General chat endpoint for conversational AI"""
    
    try:
        # Build prompt from messages
        prompt = "\n".join([f"{msg['role']}: {msg['content']}" for msg in request.messages])
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": request.model,
                    "prompt": prompt,
                    "stream": False,
                    "temperature": request.temperature,
                },
                timeout=60.0,
            )
        
        result = response.json()
        generated_text = result.get("response", "")
        
        return {
            "success": True,
            "response": generated_text,
            "model": request.model,
        }
    
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models")
async def list_models():
    """List available Ollama models"""
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags", timeout=5.0)
        
        models = response.json().get("models", [])
        
        return {
            "models": [
                {
                    "name": m["name"],
                    "size": m.get("size", 0),
                    "modified": m.get("modified_at", ""),
                }
                for m in models
            ]
        }
    
    except Exception as e:
        logger.error(f"List models error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# HELPER FUNCTIONS FOR SPECIFIC USE CASES
# ============================================================================

@app.post("/journey/marketplace/analyze-product")
async def analyze_marketplace_product(image_url: str, product_name: str):
    """Journey 3: Analyze product quality for marketplace listing"""
    
    request = ImageAnalysisRequest(
        image_url=image_url,
        task="analyze_product",
        context={"product_name": product_name},
    )
    
    result = await analyze_image(request)
    
    # Extract quality score
    if "analysis" in result:
        quality_score = result["analysis"].get("quality_score", 5)
    else:
        quality_score = 5  # Default
    
    return {
        "success": True,
        "quality_score": quality_score,
        "analysis": result,
    }


@app.post("/journey/loan/parse-request")
async def parse_loan_request(message: str):
    """Journey 5: Parse loan application from WhatsApp message"""
    
    request = TextAnalysisRequest(
        text=message,
        task="parse_loan_request",
    )
    
    result = await analyze_text(request)
    
    return {
        "success": True,
        "parsed_data": result.get("parsed_data", {}),
    }


@app.post("/journey/disease/diagnose")
async def diagnose_crop_disease(image_url: str, crop_type: str, description: str):
    """Journey 6: Diagnose crop disease from image"""
    
    request = ImageAnalysisRequest(
        image_url=image_url,
        task="diagnose_disease",
        context={"crop_type": crop_type, "description": description},
    )
    
    result = await analyze_image(request)
    
    return {
        "success": True,
        "diagnosis": result.get("analysis", {}),
    }


@app.post("/journey/insurance/assess-damage")
async def assess_insurance_damage(image_urls: List[str]):
    """Journey 8: Assess crop damage for insurance claim"""
    
    # Analyze first image (can be extended to analyze multiple)
    if not image_urls:
        raise HTTPException(status_code=400, detail="No images provided")
    
    request = ImageAnalysisRequest(
        image_url=image_urls[0],
        task="assess_damage",
    )
    
    result = await analyze_image(request)
    
    return {
        "success": True,
        "damage_assessment": result.get("analysis", {}),
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8087"))
    uvicorn.run(app, host="0.0.0.0", port=port)
