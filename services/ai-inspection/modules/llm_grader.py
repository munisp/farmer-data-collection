"""
LLM-powered Grade Recommender using Ollama with Qwen.

Combines evidence from OCR, VLM, and sensor readings to produce
a reasoned grade recommendation with confidence score and justification.

Uses Ollama's Qwen model for structured reasoning about agricultural
produce quality, following Nigerian commodity exchange grading standards.
"""

import json
import logging
from typing import Optional

import httpx

logger = logging.getLogger("ai-inspection.llm_grader")

GRADING_SYSTEM_PROMPT = """You are an expert agricultural produce grader for Nigerian commodity exchanges.
You follow the Nigerian Commodity Exchange (NCX) grading standards.

Grading criteria:
- Grade A (Premium): Moisture <12%, Foreign matter <1%, No defects, Excellent color uniformity
- Grade B (Standard): Moisture 12-14%, Foreign matter 1-3%, Minimal defects, Good color
- Grade C (Fair): Moisture 14-16%, Foreign matter 3-5%, Some defects, Acceptable color
- Grade D (Low): Moisture >16%, Foreign matter >5%, Significant defects, Poor quality
- Reject: Contaminated, infested, moldy, or unfit for trade

You must respond with ONLY a valid JSON object (no markdown, no code blocks).
"""

GRADING_USER_PROMPT = """Grade the following produce batch:

Crop Type: {crop_type}
Quantity: {quantity_kg} kg
Moisture Content: {moisture}
Foreign Matter: {foreign_matter}

Visual Analysis:
{visual_summary}

Defects Found:
{defects_summary}

Color Analysis:
{color_summary}

Ripeness Score: {ripeness}

OCR Labels Detected:
{ocr_summary}

Based on ALL evidence above, provide your grade recommendation as JSON:
{{
    "grade": "<A|B|C|D|reject>",
    "confidence": <float 0.0-1.0>,
    "reasoning": "<2-3 sentence explanation>",
    "factors": [
        {{"factor": "<name>", "value": "<value>", "impact": "<positive|neutral|negative>", "weight": <float 0-1>}}
    ]
}}
"""


class LLMGrader:
    """Ollama-Qwen based grade recommender for agricultural produce."""

    def __init__(self, ollama_url: str = "http://localhost:11434", model: str = "qwen2.5:7b"):
        self.ollama_url = ollama_url.rstrip("/")
        self.model = model
        self._available: Optional[bool] = None
        self._client = httpx.AsyncClient(timeout=60.0)

    def get_status(self) -> str:
        if self._available is True:
            return "loaded"
        if self._available is False:
            return "unavailable"
        return "not_checked"

    async def _check_availability(self) -> bool:
        """Check if Ollama is running with the Qwen model."""
        try:
            resp = await self._client.get(f"{self.ollama_url}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                model_base = self.model.split(":")[0]
                self._available = any(model_base in m for m in models)
                if not self._available:
                    logger.warning(f"LLM model '{self.model}' not found. Available: {models}")
                return self._available
        except Exception as e:
            logger.warning(f"Ollama not reachable: {e}")
        self._available = False
        return False

    async def recommend_grade(
        self,
        crop_type: str,
        quantity_kg: float,
        moisture: Optional[float],
        foreign_matter: Optional[float],
        visual_quality: dict,
        defects: list[dict],
        color_analysis: dict,
        ripeness_score: Optional[float],
        ocr_labels: list[dict],
    ) -> dict:
        """
        Recommend a grade based on all available evidence.

        Combines sensor data, visual analysis, and OCR findings
        into a structured grade recommendation with reasoning.
        """
        if self._available is None:
            await self._check_availability()

        if self._available:
            return await self._llm_grade(
                crop_type, quantity_kg, moisture, foreign_matter,
                visual_quality, defects, color_analysis, ripeness_score, ocr_labels,
            )
        return self._rule_based_grade(
            crop_type, moisture, foreign_matter,
            visual_quality, defects, ripeness_score,
        )

    async def _llm_grade(
        self,
        crop_type: str,
        quantity_kg: float,
        moisture: Optional[float],
        foreign_matter: Optional[float],
        visual_quality: dict,
        defects: list[dict],
        color_analysis: dict,
        ripeness_score: Optional[float],
        ocr_labels: list[dict],
    ) -> dict:
        """Grade recommendation via Ollama-Qwen LLM."""
        try:
            # Format evidence summaries
            visual_summary = json.dumps(visual_quality, indent=2) if visual_quality else "No visual analysis available"
            defects_summary = json.dumps(defects, indent=2) if defects else "No defects detected"
            color_summary = json.dumps(color_analysis, indent=2) if color_analysis else "No color analysis"
            ocr_summary = json.dumps(ocr_labels, indent=2) if ocr_labels else "No OCR labels detected"

            prompt = GRADING_USER_PROMPT.format(
                crop_type=crop_type,
                quantity_kg=quantity_kg,
                moisture=f"{moisture}%" if moisture is not None else "Not measured",
                foreign_matter=f"{foreign_matter}%" if foreign_matter is not None else "Not measured",
                visual_summary=visual_summary,
                defects_summary=defects_summary,
                color_summary=color_summary,
                ripeness=f"{ripeness_score}/100" if ripeness_score is not None else "N/A",
                ocr_summary=ocr_summary,
            )

            payload = {
                "model": self.model,
                "system": GRADING_SYSTEM_PROMPT,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 512,
                },
            }

            resp = await self._client.post(
                f"{self.ollama_url}/api/generate",
                json=payload,
            )

            if resp.status_code != 200:
                logger.error(f"Ollama LLM request failed: {resp.status_code}")
                return self._rule_based_grade(
                    crop_type, moisture, foreign_matter,
                    visual_quality, defects, ripeness_score,
                )

            data = resp.json()
            response_text = data.get("response", "")

            # Parse JSON from response
            try:
                json_start = response_text.find("{")
                json_end = response_text.rfind("}") + 1
                if json_start >= 0 and json_end > json_start:
                    parsed = json.loads(response_text[json_start:json_end])
                    # Validate required fields
                    if "grade" in parsed and parsed["grade"] in ("A", "B", "C", "D", "reject"):
                        return {
                            "grade": parsed["grade"],
                            "confidence": float(parsed.get("confidence", 0.7)),
                            "reasoning": parsed.get("reasoning", "LLM grade recommendation"),
                            "factors": parsed.get("factors", []),
                        }
            except json.JSONDecodeError:
                logger.warning("LLM response not valid JSON")

            return self._rule_based_grade(
                crop_type, moisture, foreign_matter,
                visual_quality, defects, ripeness_score,
            )

        except Exception as e:
            logger.error(f"LLM grading error: {e}")
            return self._rule_based_grade(
                crop_type, moisture, foreign_matter,
                visual_quality, defects, ripeness_score,
            )

    def _rule_based_grade(
        self,
        crop_type: str,
        moisture: Optional[float],
        foreign_matter: Optional[float],
        visual_quality: dict,
        defects: list[dict],
        ripeness_score: Optional[float],
    ) -> dict:
        """
        Deterministic rule-based grading when Ollama is unavailable.
        Follows Nigerian commodity exchange grading standards.
        """
        factors = []
        score = 100.0  # Start at perfect, deduct for issues

        # Moisture scoring
        if moisture is not None:
            if moisture < 12:
                factors.append({"factor": "moisture_content", "value": f"{moisture}%", "impact": "positive", "weight": 0.3})
            elif moisture <= 14:
                score -= 10
                factors.append({"factor": "moisture_content", "value": f"{moisture}%", "impact": "neutral", "weight": 0.3})
            elif moisture <= 16:
                score -= 25
                factors.append({"factor": "moisture_content", "value": f"{moisture}%", "impact": "negative", "weight": 0.3})
            else:
                score -= 40
                factors.append({"factor": "moisture_content", "value": f"{moisture}%", "impact": "negative", "weight": 0.3})
        else:
            factors.append({"factor": "moisture_content", "value": "not measured", "impact": "neutral", "weight": 0.15})

        # Foreign matter scoring
        if foreign_matter is not None:
            if foreign_matter < 1:
                factors.append({"factor": "foreign_matter", "value": f"{foreign_matter}%", "impact": "positive", "weight": 0.25})
            elif foreign_matter <= 3:
                score -= 10
                factors.append({"factor": "foreign_matter", "value": f"{foreign_matter}%", "impact": "neutral", "weight": 0.25})
            elif foreign_matter <= 5:
                score -= 25
                factors.append({"factor": "foreign_matter", "value": f"{foreign_matter}%", "impact": "negative", "weight": 0.25})
            else:
                score -= 45
                factors.append({"factor": "foreign_matter", "value": f"{foreign_matter}%", "impact": "negative", "weight": 0.25})
        else:
            factors.append({"factor": "foreign_matter", "value": "not measured", "impact": "neutral", "weight": 0.1})

        # Visual quality scoring
        visual_score = visual_quality.get("overall_score")
        if visual_score is not None:
            if visual_score >= 80:
                factors.append({"factor": "visual_quality", "value": f"{visual_score}/100", "impact": "positive", "weight": 0.25})
            elif visual_score >= 65:
                score -= 10
                factors.append({"factor": "visual_quality", "value": f"{visual_score}/100", "impact": "neutral", "weight": 0.25})
            else:
                score -= 25
                factors.append({"factor": "visual_quality", "value": f"{visual_score}/100", "impact": "negative", "weight": 0.25})

        # Defects scoring
        if defects:
            severe = sum(1 for d in defects if d.get("severity") == "severe")
            moderate = sum(1 for d in defects if d.get("severity") == "moderate")
            if severe > 0:
                score -= 35
                factors.append({"factor": "defects", "value": f"{severe} severe, {moderate} moderate", "impact": "negative", "weight": 0.2})
            elif moderate > 0:
                score -= 15
                factors.append({"factor": "defects", "value": f"{moderate} moderate", "impact": "negative", "weight": 0.15})
            else:
                score -= 5
                factors.append({"factor": "defects", "value": f"{len(defects)} minor", "impact": "neutral", "weight": 0.1})
        else:
            factors.append({"factor": "defects", "value": "none detected", "impact": "positive", "weight": 0.15})

        # Determine grade
        score = max(0, score)
        if score >= 85:
            grade = "A"
        elif score >= 70:
            grade = "B"
        elif score >= 55:
            grade = "C"
        elif score >= 35:
            grade = "D"
        else:
            grade = "reject"

        # Confidence based on data completeness
        data_points = sum([
            moisture is not None,
            foreign_matter is not None,
            bool(visual_quality),
            bool(defects) or True,  # No defects is also data
        ])
        confidence = min(0.95, 0.5 + (data_points * 0.12))

        # Build reasoning
        reasoning_parts = []
        if moisture is not None:
            reasoning_parts.append(f"Moisture at {moisture}% is {'within' if moisture <= 14 else 'above'} acceptable range")
        if foreign_matter is not None:
            reasoning_parts.append(f"foreign matter at {foreign_matter}% {'meets' if foreign_matter <= 3 else 'exceeds'} standards")
        if visual_score is not None:
            reasoning_parts.append(f"visual quality scored {visual_score}/100")
        if defects:
            reasoning_parts.append(f"{len(defects)} defect(s) detected")
        else:
            reasoning_parts.append("no defects detected")

        reasoning = f"Grade {grade} recommended for {crop_type}: " + ", ".join(reasoning_parts) + "."

        return {
            "grade": grade,
            "confidence": round(confidence, 2),
            "reasoning": reasoning,
            "factors": factors,
        }
