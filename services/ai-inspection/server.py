"""
AI Inspection Service for FarmConnect Aggregation Hub.

Combines PaddleOCR, VLM, Docling, and Ollama-Qwen to provide
AI-powered produce inspection, grading, and document processing.

Port: 8110
"""

import asyncio
import logging
import os
import sys
import json
import time
import base64
import uuid
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from modules.ocr_engine import OCREngine
from modules.vlm_analyzer import VLMAnalyzer
from modules.document_parser import DocumentParser
from modules.llm_grader import LLMGrader
from modules.produce_detector import ProduceInspectionPipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ai-inspection")

app = FastAPI(
    title="FarmConnect AI Inspection Service",
    description="AI-powered produce inspection using PaddleOCR, VLM, Docling, Ollama-Qwen, YOLOv8, SAM2, DINOv2",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Models ────────────────────────────────────────────────────────────────

class InspectionRequest(BaseModel):
    batch_id: str
    crop_type: str
    quantity_kg: float
    farmer_name: str
    image_base64: Optional[str] = None
    moisture_reading: Optional[float] = None
    foreign_matter_reading: Optional[float] = None

class InspectionResult(BaseModel):
    batch_id: str
    inspection_id: str
    timestamp: str
    crop_type: str
    farmer_name: str

    # OCR results
    ocr_labels: list[dict] = Field(default_factory=list)
    ocr_certificates: list[dict] = Field(default_factory=list)

    # VLM visual analysis
    visual_quality: dict = Field(default_factory=dict)
    defects_detected: list[dict] = Field(default_factory=list)
    color_analysis: dict = Field(default_factory=dict)
    ripeness_score: Optional[float] = None

    # CV pipeline results (YOLOv8 + SAM2 + DINOv2)
    cv_detections: list[dict] = Field(default_factory=list)
    cv_segmentation: dict = Field(default_factory=dict)
    cv_grade_classification: dict = Field(default_factory=dict)
    cv_summary: dict = Field(default_factory=dict)

    # Sensor readings
    moisture_content: Optional[float] = None
    foreign_matter: Optional[float] = None

    # LLM grade recommendation
    recommended_grade: str = ""
    grade_confidence: float = 0.0
    grade_reasoning: str = ""
    grade_factors: list[dict] = Field(default_factory=list)

    # Processing metadata
    processing_time_ms: float = 0
    models_used: list[str] = Field(default_factory=list)

class DocumentParseRequest(BaseModel):
    document_base64: str
    document_type: str = "farm_certificate"

class DocumentParseResult(BaseModel):
    document_id: str
    document_type: str
    extracted_fields: dict = Field(default_factory=dict)
    tables: list[dict] = Field(default_factory=list)
    raw_text: str = ""
    confidence: float = 0.0
    processing_time_ms: float = 0

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    models: dict
    uptime_seconds: float

# ─── Service instances ─────────────────────────────────────────────────────

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")
VLM_MODEL = os.environ.get("VLM_MODEL", "qwen2-vl:7b")

start_time = time.time()
ocr_engine = OCREngine()
vlm_analyzer = VLMAnalyzer(ollama_url=OLLAMA_URL, model=VLM_MODEL)
doc_parser = DocumentParser()
llm_grader = LLMGrader(ollama_url=OLLAMA_URL, model=OLLAMA_MODEL)
cv_pipeline = ProduceInspectionPipeline()

# ─── Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="healthy",
        service="ai-inspection",
        version="2.0.0",
        models={
            "paddleocr": ocr_engine.get_status(),
            "vlm": vlm_analyzer.get_status(),
            "docling": doc_parser.get_status(),
            "ollama_qwen": llm_grader.get_status(),
            **{f"cv_{k}": v for k, v in cv_pipeline.get_status().items()},
        },
        uptime_seconds=round(time.time() - start_time, 1),
    )


@app.post("/inspect", response_model=InspectionResult)
async def inspect_produce(req: InspectionRequest):
    """
    Full AI inspection pipeline:
    1. PaddleOCR — extract text from produce labels/certificates in the image
    2. YOLOv8 — detect and classify produce items and defects
    3. SAM2 — segment detections for precise area measurement
    4. DINOv2 — classify produce grade from visual features
    5. VLM — analyze produce quality (color, defects, ripeness) from the photo
    6. Ollama-Qwen — reason about grade based on all evidence (visual + sensor + CV)
    """
    t0 = time.time()
    inspection_id = f"INS-{uuid.uuid4().hex[:8].upper()}"
    models_used: list[str] = []

    image_bytes: Optional[bytes] = None
    if req.image_base64:
        try:
            image_bytes = base64.b64decode(req.image_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 image")

    # 1. PaddleOCR — label/certificate text extraction
    ocr_labels: list[dict] = []
    ocr_certificates: list[dict] = []
    if image_bytes:
        ocr_result = await asyncio.to_thread(ocr_engine.extract_text, image_bytes)
        ocr_labels = ocr_result.get("labels", [])
        ocr_certificates = ocr_result.get("certificates", [])
        models_used.append("PaddleOCR")

    # 2-4. YOLOv8 + SAM2 + DINOv2 — detection, segmentation, classification
    cv_result: dict = {"detection": {}, "segmentation": {}, "grade_classification": {}, "summary": {}}
    if image_bytes:
        cv_result = await asyncio.to_thread(cv_pipeline.inspect, image_bytes, req.crop_type)
        for m in cv_result.get("summary", {}).get("models_used", []):
            models_used.append(m)

    # 5. VLM — visual quality analysis
    visual_quality: dict = {}
    defects_detected: list[dict] = []
    color_analysis: dict = {}
    ripeness_score: Optional[float] = None
    if image_bytes:
        vlm_result = await vlm_analyzer.analyze_produce(
            image_bytes=image_bytes,
            crop_type=req.crop_type,
            quantity_kg=req.quantity_kg,
        )
        visual_quality = vlm_result.get("quality_assessment", {})
        defects_detected = vlm_result.get("defects", [])
        color_analysis = vlm_result.get("color_analysis", {})
        ripeness_score = vlm_result.get("ripeness_score")
        models_used.append(f"VLM ({VLM_MODEL})")

    # Merge CV defect detections with VLM defects
    cv_detections_list = cv_result.get("detection", {}).get("detections", [])
    for det in cv_detections_list:
        if any(w in det.get("class", "").lower() for w in ["rot", "mold", "damage", "defect", "pest"]):
            defects_detected.append({
                "type": det["class"],
                "severity": "moderate" if det.get("confidence", 0) > 0.5 else "minor",
                "affected_percentage": round(det.get("confidence", 0) * 10, 1),
                "description": f"Detected by YOLOv8 ({det.get('confidence', 0):.0%} confidence)",
            })

    # 6. Ollama-Qwen — grade reasoning (with CV results)
    grade_result = await llm_grader.recommend_grade(
        crop_type=req.crop_type,
        quantity_kg=req.quantity_kg,
        moisture=req.moisture_reading,
        foreign_matter=req.foreign_matter_reading,
        visual_quality=visual_quality,
        defects=defects_detected,
        color_analysis=color_analysis,
        ripeness_score=ripeness_score,
        ocr_labels=ocr_labels,
    )
    models_used.append(f"Ollama-Qwen ({OLLAMA_MODEL})")

    # Reconcile grade: DINOv2 classifier + LLM ensemble
    cv_grade = cv_result.get("grade_classification", {}).get("predicted_grade", "")
    llm_grade = grade_result["grade"]
    final_grade = llm_grade
    final_confidence = grade_result["confidence"]

    if cv_grade and cv_grade != llm_grade:
        cv_conf = cv_result.get("grade_classification", {}).get("confidence", 0)
        if cv_conf > grade_result["confidence"]:
            final_grade = cv_grade
            final_confidence = (cv_conf + grade_result["confidence"]) / 2
            grade_result["reasoning"] += f" (DINOv2 suggested {cv_grade} at {cv_conf:.0%}; weighted ensemble)"
        else:
            grade_result["reasoning"] += f" (DINOv2 also analyzed: {cv_grade} at {cv_conf:.0%})"

    elapsed = (time.time() - t0) * 1000

    return InspectionResult(
        batch_id=req.batch_id,
        inspection_id=inspection_id,
        timestamp=datetime.utcnow().isoformat() + "Z",
        crop_type=req.crop_type,
        farmer_name=req.farmer_name,
        ocr_labels=ocr_labels,
        ocr_certificates=ocr_certificates,
        visual_quality=visual_quality,
        defects_detected=defects_detected,
        color_analysis=color_analysis,
        ripeness_score=ripeness_score,
        cv_detections=cv_detections_list,
        cv_segmentation=cv_result.get("segmentation", {}),
        cv_grade_classification=cv_result.get("grade_classification", {}),
        cv_summary=cv_result.get("summary", {}),
        moisture_content=req.moisture_reading,
        foreign_matter=req.foreign_matter_reading,
        recommended_grade=final_grade,
        grade_confidence=final_confidence,
        grade_reasoning=grade_result["reasoning"],
        grade_factors=grade_result["factors"],
        processing_time_ms=round(elapsed, 1),
        models_used=models_used,
    )


@app.post("/inspect/image", response_model=InspectionResult)
async def inspect_produce_multipart(
    batch_id: str = Form(...),
    crop_type: str = Form(...),
    quantity_kg: float = Form(...),
    farmer_name: str = Form(...),
    moisture_reading: Optional[float] = Form(None),
    foreign_matter_reading: Optional[float] = Form(None),
    image: UploadFile = File(...),
):
    """Multipart form upload variant of /inspect for direct image uploads."""
    image_bytes = await image.read()
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    req = InspectionRequest(
        batch_id=batch_id,
        crop_type=crop_type,
        quantity_kg=quantity_kg,
        farmer_name=farmer_name,
        image_base64=image_b64,
        moisture_reading=moisture_reading,
        foreign_matter_reading=foreign_matter_reading,
    )
    return await inspect_produce(req)


@app.post("/ocr/extract", response_model=dict)
async def ocr_extract(image: UploadFile = File(...)):
    """Standalone PaddleOCR text extraction from an image."""
    image_bytes = await image.read()
    result = await asyncio.to_thread(ocr_engine.extract_text, image_bytes)
    return {"status": "ok", "result": result}


@app.post("/vlm/analyze", response_model=dict)
async def vlm_analyze(
    crop_type: str = Form("unknown"),
    quantity_kg: float = Form(0),
    image: UploadFile = File(...),
):
    """Standalone VLM visual quality analysis."""
    image_bytes = await image.read()
    result = await vlm_analyzer.analyze_produce(
        image_bytes=image_bytes,
        crop_type=crop_type,
        quantity_kg=quantity_kg,
    )
    return {"status": "ok", "result": result}


@app.post("/document/parse", response_model=DocumentParseResult)
async def parse_document(req: DocumentParseRequest):
    """Parse farm documents (certificates, receipts, invoices) using Docling."""
    try:
        doc_bytes = base64.b64decode(req.document_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 document")

    t0 = time.time()
    result = await asyncio.to_thread(doc_parser.parse, doc_bytes, req.document_type)
    elapsed = (time.time() - t0) * 1000

    return DocumentParseResult(
        document_id=f"DOC-{uuid.uuid4().hex[:8].upper()}",
        document_type=req.document_type,
        extracted_fields=result.get("fields", {}),
        tables=result.get("tables", []),
        raw_text=result.get("raw_text", ""),
        confidence=result.get("confidence", 0.0),
        processing_time_ms=round(elapsed, 1),
    )


@app.post("/document/parse/upload", response_model=DocumentParseResult)
async def parse_document_upload(
    document_type: str = Form("farm_certificate"),
    document: UploadFile = File(...),
):
    """Multipart upload variant of /document/parse."""
    doc_bytes = await document.read()
    doc_b64 = base64.b64encode(doc_bytes).decode("utf-8")
    return await parse_document(DocumentParseRequest(
        document_base64=doc_b64,
        document_type=document_type,
    ))


@app.post("/grade/recommend", response_model=dict)
async def recommend_grade(
    crop_type: str = Form(...),
    moisture: Optional[float] = Form(None),
    foreign_matter: Optional[float] = Form(None),
    notes: Optional[str] = Form(None),
):
    """Standalone LLM grade recommendation from sensor readings only (no image)."""
    result = await llm_grader.recommend_grade(
        crop_type=crop_type,
        quantity_kg=0,
        moisture=moisture,
        foreign_matter=foreign_matter,
        visual_quality={},
        defects=[],
        color_analysis={},
        ripeness_score=None,
        ocr_labels=[],
    )
    return {"status": "ok", "result": result}


if __name__ == "__main__":
    port = int(os.environ.get("AI_INSPECTION_PORT", "8110"))
    logger.info(f"Starting AI Inspection Service on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
