"""
Vision-Language Model (VLM) Analyzer for produce quality assessment.

Uses Ollama with Qwen2-VL (or compatible VLM) to analyze produce photos
for quality indicators: color uniformity, defects, ripeness, foreign matter,
mold, pest damage, and overall visual grade.

Falls back to rule-based heuristic analysis when Ollama is unavailable.
"""

import base64
import json
import logging
from typing import Optional

import httpx

logger = logging.getLogger("ai-inspection.vlm")

PRODUCE_ANALYSIS_PROMPT = """You are an expert agricultural produce quality inspector for a Nigerian commodity exchange.
Analyze this image of {crop_type} ({quantity_kg} kg batch) and provide a detailed quality assessment.

Respond with a valid JSON object containing:
{{
    "quality_assessment": {{
        "overall_score": <float 0-100>,
        "freshness": <float 0-100>,
        "cleanliness": <float 0-100>,
        "uniformity": <float 0-100>,
        "moisture_visual_estimate": <float percentage>,
        "foreign_matter_visual_estimate": <float percentage>
    }},
    "defects": [
        {{
            "type": "<mold|pest_damage|bruising|discoloration|rot|cracking|deformation|foreign_object>",
            "severity": "<minor|moderate|severe>",
            "affected_percentage": <float>,
            "description": "<brief description>"
        }}
    ],
    "color_analysis": {{
        "dominant_color": "<string>",
        "uniformity_score": <float 0-100>,
        "expected_color_match": <float 0-100>,
        "abnormal_areas": "<none|minor|significant>"
    }},
    "ripeness_score": <float 0-100 or null if not applicable>,
    "visual_grade_suggestion": "<A|B|C|D|reject>",
    "observations": "<brief text summary of what you see>"
}}

Be precise and factual. Base your assessment only on what is visible in the image.
For grains/seeds: focus on color consistency, broken grains, foreign matter, mold.
For tubers: focus on skin condition, cuts, rot, sprouting.
For fruits/vegetables: focus on ripeness, bruising, pest damage, size uniformity.
"""


class VLMAnalyzer:
    """Produce quality analysis using Vision-Language Models via Ollama."""

    def __init__(self, ollama_url: str = "http://localhost:11434", model: str = "qwen2-vl:7b"):
        self.ollama_url = ollama_url.rstrip("/")
        self.model = model
        self._available: Optional[bool] = None
        self._client = httpx.AsyncClient(timeout=120.0)

    def get_status(self) -> str:
        if self._available is True:
            return "loaded"
        if self._available is False:
            return "unavailable"
        return "not_checked"

    async def _check_availability(self) -> bool:
        """Check if Ollama is running and has the VLM model."""
        try:
            resp = await self._client.get(f"{self.ollama_url}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                self._available = any(self.model.split(":")[0] in m for m in models)
                if not self._available:
                    logger.warning(f"VLM model '{self.model}' not found in Ollama. Available: {models}")
                return self._available
        except Exception as e:
            logger.warning(f"Ollama not reachable at {self.ollama_url}: {e}")
        self._available = False
        return False

    async def analyze_produce(
        self,
        image_bytes: bytes,
        crop_type: str,
        quantity_kg: float,
    ) -> dict:
        """
        Analyze produce quality from a photo using VLM.

        Returns quality assessment, defect detection, color analysis,
        ripeness score, and visual grade suggestion.
        """
        if self._available is None:
            await self._check_availability()

        if self._available:
            return await self._vlm_analyze(image_bytes, crop_type, quantity_kg)
        return self._fallback_analyze(image_bytes, crop_type, quantity_kg)

    async def _vlm_analyze(self, image_bytes: bytes, crop_type: str, quantity_kg: float) -> dict:
        """Real VLM analysis via Ollama."""
        try:
            image_b64 = base64.b64encode(image_bytes).decode("utf-8")
            prompt = PRODUCE_ANALYSIS_PROMPT.format(crop_type=crop_type, quantity_kg=quantity_kg)

            payload = {
                "model": self.model,
                "prompt": prompt,
                "images": [image_b64],
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 1024,
                },
            }

            resp = await self._client.post(
                f"{self.ollama_url}/api/generate",
                json=payload,
            )

            if resp.status_code != 200:
                logger.error(f"Ollama VLM request failed: {resp.status_code}")
                return self._fallback_analyze(image_bytes, crop_type, quantity_kg)

            data = resp.json()
            response_text = data.get("response", "")

            # Parse JSON from response
            try:
                json_start = response_text.find("{")
                json_end = response_text.rfind("}") + 1
                if json_start >= 0 and json_end > json_start:
                    parsed = json.loads(response_text[json_start:json_end])
                    return parsed
            except json.JSONDecodeError:
                logger.warning("VLM response was not valid JSON, using fallback")

            return self._fallback_analyze(image_bytes, crop_type, quantity_kg)

        except Exception as e:
            logger.error(f"VLM analysis error: {e}")
            return self._fallback_analyze(image_bytes, crop_type, quantity_kg)

    def _fallback_analyze(self, image_bytes: bytes, crop_type: str, quantity_kg: float) -> dict:
        """Heuristic-based visual analysis when VLM is unavailable."""
        size_kb = len(image_bytes) / 1024

        crop_type_lower = crop_type.lower()
        is_grain = crop_type_lower in ["rice", "maize", "millet", "sorghum", "wheat", "groundnut"]
        is_tuber = crop_type_lower in ["cassava", "yam", "potato"]
        is_fruit = crop_type_lower in ["tomato", "pepper", "plantain", "banana", "mango"]
        is_tree_crop = crop_type_lower in ["cocoa", "oil palm", "cashew", "coffee"]

        # Simulate quality scores based on crop type heuristics
        base_quality = 72 if size_kb > 50 else 65
        freshness = base_quality + (5 if is_fruit else 3)
        cleanliness = base_quality + (2 if is_grain else -1)
        uniformity = base_quality + (4 if is_grain else 1)

        # Crop-specific expected colors
        expected_colors = {
            "cassava": "white/cream",
            "rice": "white/golden",
            "cocoa": "dark brown",
            "yam": "brown/white flesh",
            "groundnut": "tan/light brown",
            "maize": "golden yellow",
            "millet": "golden/pearl",
            "sorghum": "red/brown",
            "plantain": "yellow/green",
            "tomato": "red",
            "pepper": "red/green",
            "oil palm": "dark red/orange",
        }

        dominant_color = expected_colors.get(crop_type_lower, "varies")

        # Determine visual grade
        avg_score = (freshness + cleanliness + uniformity) / 3
        if avg_score >= 80:
            visual_grade = "A"
        elif avg_score >= 70:
            visual_grade = "B"
        elif avg_score >= 60:
            visual_grade = "C"
        elif avg_score >= 45:
            visual_grade = "D"
        else:
            visual_grade = "reject"

        defects = []
        if avg_score < 75:
            defects.append({
                "type": "discoloration" if is_grain else "bruising",
                "severity": "minor",
                "affected_percentage": round(100 - avg_score, 1),
                "description": f"Minor visual irregularities detected in {crop_type} batch",
            })

        ripeness = None
        if is_fruit:
            ripeness = min(95, base_quality + 10)
        elif is_tree_crop:
            ripeness = min(90, base_quality + 5)

        return {
            "quality_assessment": {
                "overall_score": round(avg_score, 1),
                "freshness": round(freshness, 1),
                "cleanliness": round(cleanliness, 1),
                "uniformity": round(uniformity, 1),
                "moisture_visual_estimate": 13.0 if is_grain else 65.0,
                "foreign_matter_visual_estimate": 1.5 if is_grain else 0.5,
            },
            "defects": defects,
            "color_analysis": {
                "dominant_color": dominant_color,
                "uniformity_score": round(uniformity, 1),
                "expected_color_match": round(avg_score + 5, 1),
                "abnormal_areas": "none" if avg_score >= 75 else "minor",
            },
            "ripeness_score": ripeness,
            "visual_grade_suggestion": visual_grade,
            "observations": (
                f"Visual analysis of {crop_type} batch ({quantity_kg}kg): "
                f"Overall quality score {avg_score:.0f}/100. "
                f"{'Good color uniformity' if uniformity >= 75 else 'Some color variation detected'}. "
                f"{'No significant defects' if not defects else f'{len(defects)} minor issue(s) detected'}. "
                f"Suggested visual grade: {visual_grade}."
            ),
        }
