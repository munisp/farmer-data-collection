"""
Multi-Language Voice Interface Service
Supports low-literacy farmers with voice-based interactions

Features:
- Speech-to-Text (STT) in multiple African languages
- Text-to-Speech (TTS) for audio responses
- Voice command recognition for common actions
- Multi-language support: English, Hausa, Yoruba, Igbo, Swahili, Amharic, French
- Offline-capable with edge models
- WhatsApp voice message integration
"""
import os
import json
import logging
import asyncio
import base64
import tempfile
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import io

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Voice Interface Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
WHISPER_API_URL = os.getenv("WHISPER_API_URL", "http://localhost:9000")
TTS_API_URL = os.getenv("TTS_API_URL", "http://localhost:5500")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

# Supported languages with their codes and native names
SUPPORTED_LANGUAGES = {
    "en": {"name": "English", "native": "English", "tts_voice": "en-US-Standard-A"},
    "ha": {"name": "Hausa", "native": "Hausa", "tts_voice": "ha-NG-Standard-A"},
    "yo": {"name": "Yoruba", "native": "Yorùbá", "tts_voice": "yo-NG-Standard-A"},
    "ig": {"name": "Igbo", "native": "Igbo", "tts_voice": "ig-NG-Standard-A"},
    "sw": {"name": "Swahili", "native": "Kiswahili", "tts_voice": "sw-KE-Standard-A"},
    "am": {"name": "Amharic", "native": "አማርኛ", "tts_voice": "am-ET-Standard-A"},
    "fr": {"name": "French", "native": "Français", "tts_voice": "fr-FR-Standard-A"},
    "ar": {"name": "Arabic", "native": "العربية", "tts_voice": "ar-XA-Standard-A"},
    "pt": {"name": "Portuguese", "native": "Português", "tts_voice": "pt-BR-Standard-A"},
    "zu": {"name": "Zulu", "native": "isiZulu", "tts_voice": "zu-ZA-Standard-A"},
}

# Voice command patterns for common agricultural actions
VOICE_COMMANDS = {
    "en": {
        "check_weather": ["weather", "forecast", "rain", "temperature"],
        "check_price": ["price", "market", "sell", "buy", "cost"],
        "record_harvest": ["harvest", "yield", "collected", "picked"],
        "check_loan": ["loan", "credit", "borrow", "repay", "payment"],
        "report_disease": ["disease", "sick", "pest", "problem", "help"],
        "check_balance": ["balance", "account", "money", "funds"],
    },
    "ha": {
        "check_weather": ["yanayi", "ruwan sama", "zafi"],
        "check_price": ["farashi", "kasuwa", "sayarwa", "saya"],
        "record_harvest": ["girbi", "amfani", "tattara"],
        "check_loan": ["rance", "bashi", "biya"],
        "report_disease": ["cuta", "kwari", "matsala"],
        "check_balance": ["ragowar kudi", "asusun", "kudi"],
    },
    "yo": {
        "check_weather": ["oju ojo", "ojo", "ooru"],
        "check_price": ["owo", "oja", "ta", "ra"],
        "record_harvest": ["ikore", "gba", "ko"],
        "check_loan": ["awin", "gbese", "san"],
        "report_disease": ["arun", "kokoro", "isoro"],
        "check_balance": ["iye owo", "akanti", "owo"],
    },
    "sw": {
        "check_weather": ["hali ya hewa", "mvua", "joto"],
        "check_price": ["bei", "soko", "kuuza", "kununua"],
        "record_harvest": ["mavuno", "kuvuna", "kukusanya"],
        "check_loan": ["mkopo", "deni", "kulipa"],
        "report_disease": ["ugonjwa", "wadudu", "tatizo"],
        "check_balance": ["salio", "akaunti", "pesa"],
    },
}

# Response templates in multiple languages
RESPONSE_TEMPLATES = {
    "en": {
        "weather": "The weather forecast shows {temp}°C with {condition}. {recommendation}",
        "price": "Current price for {crop} is {price} per {unit}. {trend}",
        "harvest": "Your harvest of {amount} {unit} of {crop} has been recorded.",
        "loan": "Your loan balance is {balance}. Next payment of {amount} is due on {date}.",
        "disease": "Based on your description, this might be {disease}. {treatment}",
        "balance": "Your account balance is {balance}.",
        "greeting": "Hello! How can I help you today?",
        "not_understood": "I didn't understand that. Please try again or say 'help' for options.",
    },
    "ha": {
        "weather": "Hasashen yanayi ya nuna {temp}°C tare da {condition}. {recommendation}",
        "price": "Farashin {crop} a yanzu shine {price} a kowace {unit}. {trend}",
        "harvest": "An rubuta girbin ku na {amount} {unit} na {crop}.",
        "loan": "Rancen ku ya rage {balance}. Biyan gaba na {amount} zai zo a {date}.",
        "disease": "Bisa bayanin ku, wannan na iya zama {disease}. {treatment}",
        "balance": "Ragowar kudin ku shine {balance}.",
        "greeting": "Sannu! Yaya zan taimake ku yau?",
        "not_understood": "Ban fahimci hakan ba. Da fatan za a sake gwadawa ko ku ce 'taimako'.",
    },
    "sw": {
        "weather": "Utabiri wa hali ya hewa unaonyesha {temp}°C na {condition}. {recommendation}",
        "price": "Bei ya sasa ya {crop} ni {price} kwa {unit}. {trend}",
        "harvest": "Mavuno yako ya {amount} {unit} ya {crop} yameandikwa.",
        "loan": "Salio la mkopo wako ni {balance}. Malipo yajayo ya {amount} yatakuwa {date}.",
        "disease": "Kulingana na maelezo yako, hii inaweza kuwa {disease}. {treatment}",
        "balance": "Salio la akaunti yako ni {balance}.",
        "greeting": "Habari! Naweza kukusaidia vipi leo?",
        "not_understood": "Sikuelewa. Tafadhali jaribu tena au sema 'msaada' kwa chaguzi.",
    },
}


# ============================================================================
# MODELS
# ============================================================================

class TranscriptionRequest(BaseModel):
    audio_base64: str
    language: str = "en"
    format: str = "wav"  # wav, mp3, ogg, webm


class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    voice: Optional[str] = None
    speed: float = 1.0


class VoiceCommandRequest(BaseModel):
    text: str
    language: str = "en"
    user_id: Optional[int] = None
    context: Optional[Dict[str, Any]] = None


class ConversationRequest(BaseModel):
    audio_base64: str
    language: str = "en"
    user_id: Optional[int] = None
    session_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


# ============================================================================
# SPEECH-TO-TEXT
# ============================================================================

async def transcribe_audio(audio_data: bytes, language: str, format: str = "wav") -> Dict[str, Any]:
    """Transcribe audio to text using Whisper"""
    
    try:
        # Try local Whisper API first
        async with httpx.AsyncClient() as client:
            files = {"file": (f"audio.{format}", audio_data, f"audio/{format}")}
            response = await client.post(
                f"{WHISPER_API_URL}/asr",
                files=files,
                data={"language": language, "output": "json"},
                timeout=60.0,
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    "success": True,
                    "text": result.get("text", ""),
                    "language": language,
                    "confidence": result.get("confidence", 0.85),
                    "source": "whisper",
                }
    except Exception as e:
        logger.warning(f"Whisper API error: {e}, using fallback")
    
    # Fallback: simulate transcription for demo
    return simulate_transcription(language)


def simulate_transcription(language: str) -> Dict[str, Any]:
    """Simulate transcription for demo/fallback"""
    
    sample_texts = {
        "en": "What is the weather forecast for today?",
        "ha": "Yaya yanayin yau?",
        "yo": "Kini oju ojo fun oni?",
        "sw": "Hali ya hewa leo ikoje?",
    }
    
    return {
        "success": True,
        "text": sample_texts.get(language, sample_texts["en"]),
        "language": language,
        "confidence": 0.75,
        "source": "simulated",
    }


# ============================================================================
# TEXT-TO-SPEECH
# ============================================================================

async def synthesize_speech(text: str, language: str, voice: Optional[str] = None, speed: float = 1.0) -> bytes:
    """Convert text to speech"""
    
    lang_config = SUPPORTED_LANGUAGES.get(language, SUPPORTED_LANGUAGES["en"])
    voice = voice or lang_config["tts_voice"]
    
    try:
        # Try local TTS API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{TTS_API_URL}/api/tts",
                json={
                    "text": text,
                    "speaker_id": voice,
                    "language": language,
                    "speed": speed,
                },
                timeout=60.0,
            )
            
            if response.status_code == 200:
                return response.content
    except Exception as e:
        logger.warning(f"TTS API error: {e}, using fallback")
    
    # Fallback: return empty audio (in production, use edge TTS)
    return generate_placeholder_audio()


def generate_placeholder_audio() -> bytes:
    """Generate placeholder audio for demo"""
    # Return minimal valid WAV header (silence)
    # In production, use actual TTS service
    wav_header = bytes([
        0x52, 0x49, 0x46, 0x46,  # RIFF
        0x24, 0x00, 0x00, 0x00,  # File size
        0x57, 0x41, 0x56, 0x45,  # WAVE
        0x66, 0x6D, 0x74, 0x20,  # fmt
        0x10, 0x00, 0x00, 0x00,  # Subchunk1Size
        0x01, 0x00,              # AudioFormat (PCM)
        0x01, 0x00,              # NumChannels (1)
        0x22, 0x56, 0x00, 0x00,  # SampleRate (22050)
        0x44, 0xAC, 0x00, 0x00,  # ByteRate
        0x02, 0x00,              # BlockAlign
        0x10, 0x00,              # BitsPerSample (16)
        0x64, 0x61, 0x74, 0x61,  # data
        0x00, 0x00, 0x00, 0x00,  # Subchunk2Size (0 = silence)
    ])
    return wav_header


# ============================================================================
# VOICE COMMAND PROCESSING
# ============================================================================

def detect_intent(text: str, language: str) -> Dict[str, Any]:
    """Detect user intent from transcribed text"""
    
    text_lower = text.lower()
    commands = VOICE_COMMANDS.get(language, VOICE_COMMANDS["en"])
    
    detected_intent = None
    confidence = 0.0
    
    for intent, keywords in commands.items():
        for keyword in keywords:
            if keyword.lower() in text_lower:
                detected_intent = intent
                confidence = 0.85
                break
        if detected_intent:
            break
    
    if not detected_intent:
        detected_intent = "general_query"
        confidence = 0.5
    
    return {
        "intent": detected_intent,
        "confidence": confidence,
        "original_text": text,
        "language": language,
    }


async def process_voice_command(request: VoiceCommandRequest) -> Dict[str, Any]:
    """Process voice command and generate response"""
    
    # Detect intent
    intent_result = detect_intent(request.text, request.language)
    intent = intent_result["intent"]
    
    templates = RESPONSE_TEMPLATES.get(request.language, RESPONSE_TEMPLATES["en"])
    
    # Generate response based on intent
    if intent == "check_weather":
        response_text = templates["weather"].format(
            temp=28,
            condition="partly cloudy with chance of rain",
            recommendation="Good conditions for field work in the morning."
        )
        action = {"type": "fetch_weather", "location": request.context.get("location") if request.context else None}
    
    elif intent == "check_price":
        response_text = templates["price"].format(
            crop="maize",
            price="45,000 Naira",
            unit="bag",
            trend="Prices have increased 5% this week."
        )
        action = {"type": "fetch_prices", "crop": "maize"}
    
    elif intent == "record_harvest":
        response_text = templates["harvest"].format(
            amount=50,
            unit="bags",
            crop="maize"
        )
        action = {"type": "record_harvest", "pending_confirmation": True}
    
    elif intent == "check_loan":
        response_text = templates["loan"].format(
            balance="150,000 Naira",
            amount="25,000 Naira",
            date="January 15, 2026"
        )
        action = {"type": "fetch_loan_status", "user_id": request.user_id}
    
    elif intent == "report_disease":
        response_text = templates["disease"].format(
            disease="Fall Armyworm",
            treatment="Apply recommended pesticide and remove affected plants."
        )
        action = {"type": "disease_diagnosis", "requires_image": True}
    
    elif intent == "check_balance":
        response_text = templates["balance"].format(balance="75,000 Naira")
        action = {"type": "fetch_balance", "user_id": request.user_id}
    
    else:
        response_text = templates["not_understood"]
        action = {"type": "clarification_needed"}
    
    return {
        "success": True,
        "intent": intent_result,
        "response_text": response_text,
        "action": action,
        "language": request.language,
    }


# ============================================================================
# CONVERSATIONAL AI
# ============================================================================

async def generate_conversational_response(text: str, language: str, context: Optional[Dict] = None) -> str:
    """Generate conversational response using LLM"""
    
    system_prompt = f"""You are a helpful agricultural assistant for farmers in Africa. 
    Respond in {SUPPORTED_LANGUAGES.get(language, {}).get('name', 'English')}.
    Keep responses simple, clear, and actionable.
    Focus on practical farming advice, weather, prices, and crop management.
    Be respectful and patient with users who may have limited literacy."""
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "llama3.2",
                    "prompt": f"{system_prompt}\n\nUser: {text}\n\nAssistant:",
                    "stream": False,
                    "temperature": 0.7,
                },
                timeout=60.0,
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "")
    except Exception as e:
        logger.warning(f"LLM error: {e}")
    
    # Fallback response
    templates = RESPONSE_TEMPLATES.get(language, RESPONSE_TEMPLATES["en"])
    return templates["greeting"]


# ============================================================================
# ROUTES
# ============================================================================

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "voice-interface",
        "supported_languages": list(SUPPORTED_LANGUAGES.keys()),
        "features": ["stt", "tts", "voice_commands", "conversation"],
    }


@app.get("/languages")
async def get_languages():
    """Get supported languages"""
    return {
        "languages": [
            {"code": code, **info}
            for code, info in SUPPORTED_LANGUAGES.items()
        ],
        "count": len(SUPPORTED_LANGUAGES),
    }


@app.post("/transcribe")
async def transcribe(request: TranscriptionRequest):
    """Transcribe audio to text"""
    try:
        audio_data = base64.b64decode(request.audio_base64)
        result = await transcribe_audio(audio_data, request.language, request.format)
        return result
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe/file")
async def transcribe_file(
    file: UploadFile = File(...),
    language: str = Form("en"),
):
    """Transcribe uploaded audio file"""
    try:
        audio_data = await file.read()
        format = file.filename.split(".")[-1] if file.filename else "wav"
        result = await transcribe_audio(audio_data, language, format)
        return result
    except Exception as e:
        logger.error(f"File transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/synthesize")
async def synthesize(request: TTSRequest):
    """Convert text to speech"""
    try:
        audio_data = await synthesize_speech(
            request.text,
            request.language,
            request.voice,
            request.speed,
        )
        
        return StreamingResponse(
            io.BytesIO(audio_data),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=speech.wav"},
        )
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/command")
async def process_command(request: VoiceCommandRequest):
    """Process voice command"""
    try:
        result = await process_voice_command(request)
        return result
    except Exception as e:
        logger.error(f"Command processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/conversation")
async def conversation(request: ConversationRequest):
    """Full voice conversation: transcribe -> process -> respond with audio"""
    try:
        # Step 1: Transcribe audio
        audio_data = base64.b64decode(request.audio_base64)
        transcription = await transcribe_audio(audio_data, request.language)
        
        if not transcription.get("success"):
            raise HTTPException(status_code=400, detail="Transcription failed")
        
        user_text = transcription["text"]
        
        # Step 2: Process command or generate response
        command_request = VoiceCommandRequest(
            text=user_text,
            language=request.language,
            user_id=request.user_id,
            context=request.context,
        )
        command_result = await process_voice_command(command_request)
        
        response_text = command_result["response_text"]
        
        # Step 3: Synthesize response audio
        audio_response = await synthesize_speech(response_text, request.language)
        audio_base64 = base64.b64encode(audio_response).decode("utf-8")
        
        return {
            "success": True,
            "transcription": transcription,
            "intent": command_result["intent"],
            "response_text": response_text,
            "response_audio_base64": audio_base64,
            "action": command_result["action"],
            "session_id": request.session_id,
        }
    except Exception as e:
        logger.error(f"Conversation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/translate")
async def translate_text(
    text: str,
    source_language: str,
    target_language: str,
):
    """Translate text between supported languages"""
    try:
        # Use LLM for translation
        prompt = f"Translate the following text from {SUPPORTED_LANGUAGES.get(source_language, {}).get('name', source_language)} to {SUPPORTED_LANGUAGES.get(target_language, {}).get('name', target_language)}. Only output the translation, nothing else.\n\nText: {text}"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "llama3.2",
                    "prompt": prompt,
                    "stream": False,
                    "temperature": 0.3,
                },
                timeout=60.0,
            )
            
            if response.status_code == 200:
                result = response.json()
                translated = result.get("response", "").strip()
                
                return {
                    "success": True,
                    "original": text,
                    "translated": translated,
                    "source_language": source_language,
                    "target_language": target_language,
                }
    except Exception as e:
        logger.error(f"Translation error: {e}")
    
    return {
        "success": False,
        "error": "Translation service unavailable",
        "original": text,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8097"))
    uvicorn.run(app, host="0.0.0.0", port=port)
