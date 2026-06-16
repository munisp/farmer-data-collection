"""
Synthetic Training Image Generator for Nigerian Agricultural Produce.

Uses Stable Diffusion XL (SDXL) via diffusers library to generate
photorealistic training images for all Nigerian market produce across
quality grades (A/B/C/D/reject).

Generated images are labeled with:
- Crop type
- Quality grade
- Defect annotations (for YOLOv8 training)
- COCO-format bounding box annotations

Usage:
    python training/synthetic_generator.py --crops all --grades all --count 50
    python training/synthetic_generator.py --crops cassava,rice,cocoa --grades A,B --count 100
    python training/synthetic_generator.py --crops yam --count 200 --resolution 1024
"""

import argparse
import json
import os
import random
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── Nigerian Produce Catalog ─────────────────────────────────────────────

NIGERIAN_PRODUCE = {
    # Staple Crops
    "cassava": {
        "category": "tuber",
        "aliases": ["garri", "fufu", "tapioca"],
        "colors": {"A": "white/cream flesh, brown skin", "B": "off-white flesh", "C": "yellowish, some spots", "D": "grey spots, soft areas", "reject": "black rot, mushy"},
        "defects": ["rot", "bruising", "insect_holes", "discoloration", "soft_spots", "mold"],
        "market_forms": ["fresh tuber", "peeled", "dried chips", "garri granules"],
    },
    "rice": {
        "category": "grain",
        "aliases": ["ofada rice", "abakaliki rice", "jollof rice grain"],
        "colors": {"A": "uniform white/golden", "B": "mostly uniform, slight variation", "C": "mixed colors, some broken", "D": "many broken, discolored", "reject": "heavily discolored, infested"},
        "defects": ["broken_grains", "foreign_matter", "discoloration", "chalky_grains", "insect_damage", "stones"],
        "market_forms": ["paddy", "milled white", "parboiled", "brown rice", "ofada"],
    },
    "cocoa": {
        "category": "tree_crop",
        "aliases": ["cocoa beans", "cacao"],
        "colors": {"A": "deep dark brown, uniform", "B": "brown, mostly uniform", "C": "light brown, some variation", "D": "pale, moldy spots", "reject": "heavily molded, flat beans"},
        "defects": ["mold", "flat_beans", "insect_damage", "germinated", "slaty", "over_fermented"],
        "market_forms": ["dried beans", "wet beans", "nibs", "pods"],
    },
    "yam": {
        "category": "tuber",
        "aliases": ["pounded yam", "iyan"],
        "colors": {"A": "white flesh, intact brown skin", "B": "cream flesh, minor skin damage", "C": "yellowish flesh, cuts", "D": "browning flesh, soft spots", "reject": "rotten, pest-eaten"},
        "defects": ["rot", "cuts", "bruising", "pest_damage", "sprouting", "soft_spots"],
        "market_forms": ["fresh tuber", "sliced", "dried", "flour"],
    },
    "groundnut": {
        "category": "legume",
        "aliases": ["peanut", "groundnut oil"],
        "colors": {"A": "uniform tan/light brown shells", "B": "mostly uniform, some variation", "C": "mixed colors, some damaged", "D": "dark spots, shriveled", "reject": "moldy, aflatoxin risk"},
        "defects": ["mold", "shriveled", "broken_shells", "discoloration", "insect_holes", "aflatoxin"],
        "market_forms": ["in-shell", "shelled", "roasted", "paste"],
    },
    "maize": {
        "category": "grain",
        "aliases": ["corn", "agbado"],
        "colors": {"A": "bright yellow/white, plump kernels", "B": "good color, minor variation", "C": "dull color, some damaged", "D": "many damaged kernels", "reject": "heavily infested, moldy"},
        "defects": ["insect_damage", "mold", "broken_kernels", "discoloration", "weevil_holes", "aflatoxin"],
        "market_forms": ["dried cob", "shelled kernels", "flour", "wet corn"],
    },
    "millet": {
        "category": "grain",
        "aliases": ["pearl millet", "fonio"],
        "colors": {"A": "uniform golden/pearl", "B": "mostly uniform", "C": "mixed, some foreign matter", "D": "dull, debris present", "reject": "heavily contaminated"},
        "defects": ["foreign_matter", "stones", "discoloration", "insect_damage", "broken_grains"],
        "market_forms": ["whole grain", "flour", "malt"],
    },
    "sorghum": {
        "category": "grain",
        "aliases": ["guinea corn", "dawa"],
        "colors": {"A": "uniform red/brown/white", "B": "mostly uniform color", "C": "mixed varieties, some debris", "D": "discolored, moldy", "reject": "infested, rotten"},
        "defects": ["mold", "insect_damage", "broken_grains", "foreign_matter", "bird_damage"],
        "market_forms": ["whole grain", "flour", "malt"],
    },
    "plantain": {
        "category": "fruit",
        "aliases": ["cooking banana", "dodo", "boli"],
        "colors": {"A": "bright green/yellow, firm, no blemishes", "B": "good color, minor spots", "C": "some browning, soft spots", "D": "heavily spotted, overripe", "reject": "black, rotten, pest-eaten"},
        "defects": ["bruising", "black_spots", "pest_damage", "crown_rot", "finger_drop", "scarring"],
        "market_forms": ["fresh bunch", "individual fingers", "chips", "flour"],
    },
    "tomato": {
        "category": "vegetable",
        "aliases": ["tomatoes", "tatashe"],
        "colors": {"A": "deep red, firm, uniform size", "B": "red, minor blemishes", "C": "uneven ripening, some soft", "D": "overripe, cracked", "reject": "rotten, moldy, infested"},
        "defects": ["cracking", "blossom_end_rot", "sunscald", "pest_damage", "mold", "soft_rot"],
        "market_forms": ["fresh", "paste", "dried", "canned"],
    },
    "pepper": {
        "category": "vegetable",
        "aliases": ["ata rodo", "scotch bonnet", "habanero", "shombo", "tatase"],
        "colors": {"A": "vibrant red/green/yellow, glossy", "B": "good color, minor wrinkles", "C": "dulling color, soft spots", "D": "heavily wrinkled, discolored", "reject": "rotten, moldy"},
        "defects": ["wrinkling", "soft_rot", "sunscald", "pest_damage", "mold", "discoloration"],
        "market_forms": ["fresh", "dried", "ground", "paste"],
    },
    "oil_palm": {
        "category": "tree_crop",
        "aliases": ["palm fruit", "palm oil", "palm kernel"],
        "colors": {"A": "deep red/orange, ripe bunches", "B": "mostly ripe, some unripe", "C": "mixed ripeness", "D": "overripe, bruised", "reject": "rotten, heavily bruised"},
        "defects": ["bruising", "over_ripeness", "under_ripeness", "insect_damage", "mold"],
        "market_forms": ["fresh fruit bunches", "loose fruits", "crude palm oil", "palm kernel"],
    },
    # Additional Nigerian market produce
    "cowpea": {
        "category": "legume",
        "aliases": ["beans", "black-eyed peas", "ewa"],
        "colors": {"A": "uniform color, no blemishes", "B": "mostly clean", "C": "some discoloration", "D": "many damaged", "reject": "heavily infested"},
        "defects": ["weevil_holes", "discoloration", "broken", "stones", "mold"],
        "market_forms": ["dried", "fresh"],
    },
    "soybean": {
        "category": "legume",
        "aliases": ["soya"],
        "colors": {"A": "uniform yellow/cream", "B": "mostly uniform", "C": "some green/dark beans", "D": "mixed quality", "reject": "moldy, infested"},
        "defects": ["green_beans", "wrinkled", "mold", "foreign_matter", "splits"],
        "market_forms": ["dried beans", "oil", "meal", "milk"],
    },
    "ginger": {
        "category": "spice",
        "aliases": ["ginger root"],
        "colors": {"A": "firm, smooth skin, aromatic", "B": "good quality, minor blemishes", "C": "some soft spots", "D": "shriveled, dry", "reject": "rotten, moldy"},
        "defects": ["soft_rot", "mold", "shriveling", "insect_damage", "bruising"],
        "market_forms": ["fresh root", "dried", "ground", "oleoresin"],
    },
    "sesame": {
        "category": "oilseed",
        "aliases": ["benne seeds"],
        "colors": {"A": "clean white/cream seeds", "B": "mostly clean", "C": "some discolored", "D": "mixed debris", "reject": "heavily contaminated"},
        "defects": ["foreign_matter", "discoloration", "broken_seeds", "stones", "mold"],
        "market_forms": ["raw seeds", "hulled", "oil", "paste"],
    },
    "cashew": {
        "category": "tree_crop",
        "aliases": ["cashew nut"],
        "colors": {"A": "whole white kernels, no spots", "B": "slight scorching", "C": "broken pieces, some spots", "D": "heavily scorched/broken", "reject": "rancid, infested"},
        "defects": ["scorching", "broken", "insect_damage", "rancidity", "discoloration"],
        "market_forms": ["raw nut in shell", "kernels", "roasted"],
    },
    "shea_nut": {
        "category": "tree_crop",
        "aliases": ["shea butter", "ori"],
        "colors": {"A": "clean, uniform brown", "B": "mostly clean", "C": "some mold/cracks", "D": "mixed quality", "reject": "rotten, heavily molded"},
        "defects": ["mold", "cracking", "discoloration", "insect_damage"],
        "market_forms": ["raw nuts", "butter", "oil"],
    },
    "watermelon": {
        "category": "fruit",
        "aliases": ["melon"],
        "colors": {"A": "deep green skin, red flesh", "B": "good color, minor blemishes", "C": "pale flesh, soft spots", "D": "overripe, cracked", "reject": "rotten, hollow"},
        "defects": ["hollow_heart", "sunscald", "cracking", "rot", "pest_damage"],
        "market_forms": ["whole fruit", "sliced"],
    },
    "okra": {
        "category": "vegetable",
        "aliases": ["lady finger", "ila"],
        "colors": {"A": "bright green, tender, small", "B": "good color, medium size", "C": "tough, some browning", "D": "fibrous, large, discolored", "reject": "rotten, slimy"},
        "defects": ["browning", "pest_damage", "oversized", "wilt", "mold"],
        "market_forms": ["fresh", "dried", "frozen"],
    },
    "onion": {
        "category": "vegetable",
        "aliases": ["alubosa"],
        "colors": {"A": "firm, dry skin, no sprouting", "B": "mostly firm, minor soft spots", "C": "some sprouting, soft", "D": "heavily sprouted, soft", "reject": "rotten, moldy"},
        "defects": ["sprouting", "soft_rot", "mold", "neck_rot", "black_mold"],
        "market_forms": ["fresh bulb", "dried", "sliced"],
    },
}

GRADES = ["A", "B", "C", "D", "reject"]

# ── Prompt Templates ─────────────────────────────────────────────────────

def build_sdxl_prompt(crop: str, grade: str, form: str, context: str) -> tuple[str, str]:
    """Build positive and negative prompts for SDXL image generation."""
    info = NIGERIAN_PRODUCE[crop]
    color_desc = info["colors"].get(grade, "standard appearance")

    quality_terms = {
        "A": "premium quality, pristine, perfect condition, fresh harvested, export grade",
        "B": "standard quality, good condition, market ready, minor imperfections",
        "C": "fair quality, visible wear, acceptable for local market, some defects",
        "D": "low quality, significant defects, damaged, old stock, poor storage",
        "reject": "rejected, heavily damaged, rotten, infested, contaminated, unfit for sale",
    }

    contexts = {
        "market": "displayed at a Nigerian open-air market stall, woven basket, market trader",
        "warehouse": "inside an agricultural warehouse on pallets, fluorescent lighting, concrete floor",
        "inspection": "on a clean inspection table, well-lit laboratory setting, quality control",
        "field": "freshly harvested at a Nigerian farm, rural agricultural setting, farmland background",
        "closeup": "extreme close-up macro photography, detailed texture visible, studio lighting",
        "bulk": "large bulk quantity in sacks or crates, wholesale market, commercial storage",
    }

    positive = (
        f"Professional photograph of Nigerian {crop.replace('_', ' ')} ({form}), "
        f"{color_desc}, {quality_terms[grade]}, "
        f"{contexts.get(context, contexts['inspection'])}, "
        f"high resolution, sharp focus, natural lighting, 8k, photorealistic, "
        f"agricultural commodity, West African produce, detailed texture"
    )

    negative = (
        "cartoon, illustration, drawing, painting, sketch, anime, CGI, 3D render, "
        "watermark, text overlay, blurry, out of focus, low resolution, "
        "unrealistic colors, artificial, plastic, toy"
    )

    if grade in ("A", "B"):
        negative += ", damaged, rotten, moldy, infested, discolored"

    return positive, negative


def build_defect_prompt(crop: str, defect: str) -> tuple[str, str]:
    """Build prompt specifically for generating defect training images."""
    info = NIGERIAN_PRODUCE[crop]

    defect_descriptions = {
        "rot": "visible rot, decaying tissue, soft brown/black patches",
        "mold": "white/green/black mold growth on surface, fuzzy patches",
        "bruising": "dark bruise marks, impact damage, crushed areas",
        "insect_damage": "small holes from insect boring, larval tunnels, weevil damage",
        "insect_holes": "circular bore holes from insects, powder around holes",
        "discoloration": "abnormal color patches, yellowing, dark spots",
        "soft_spots": "soft depressed areas, beginning of rot",
        "broken_grains": "cracked and broken grain kernels mixed with whole ones",
        "foreign_matter": "stones, sticks, husks, dirt mixed with the produce",
        "chalky_grains": "opaque white chalky rice grains among translucent ones",
        "stones": "small stones and pebbles mixed in with grain produce",
        "flat_beans": "flat underdeveloped cocoa beans",
        "germinated": "sprouted seeds/beans showing root growth",
        "slaty": "slate-colored cocoa beans from poor fermentation",
        "over_fermented": "very dark, acidic-smelling fermented produce",
        "black_spots": "dark spots on fruit skin",
        "crown_rot": "rot at the crown/stem end of fruit",
        "finger_drop": "individual fruits falling off bunch prematurely",
        "scarring": "surface scars from handling or pest damage",
        "cracking": "splits and cracks in produce surface",
        "blossom_end_rot": "dark sunken area at blossom end of fruit",
        "sunscald": "bleached/white patches from sun exposure",
        "soft_rot": "mushy decomposing tissue",
        "wrinkling": "shriveled wrinkled skin from dehydration",
        "weevil_holes": "characteristic round holes from weevil infestation",
        "aflatoxin": "greenish mold suggesting aflatoxin contamination",
        "shriveling": "dried out, shrunken produce",
        "hollow_heart": "hollow cavity inside fruit",
        "neck_rot": "rot starting from neck/stem area",
        "black_mold": "black Aspergillus mold growth",
        "scorching": "burn marks from processing",
        "rancidity": "darkened, off-color from fat oxidation",
        "bird_damage": "pecked and torn areas from bird feeding",
        "under_ripeness": "green/immature coloring, hard texture",
        "over_ripeness": "too soft, fermented smell, dark color",
        "splits": "seeds split into halves",
        "green_beans": "immature green-colored beans mixed in",
        "wilt": "limp, wilted, dehydrated appearance",
        "sprouting": "visible sprouts growing from produce",
    }

    desc = defect_descriptions.get(defect, f"visible {defect.replace('_', ' ')} damage")

    positive = (
        f"Close-up photograph of Nigerian {crop.replace('_', ' ')} showing {defect.replace('_', ' ')} defect, "
        f"{desc}, "
        f"on inspection table, laboratory lighting, quality control setting, "
        f"high resolution, sharp focus, detailed defect visible, photorealistic, 8k"
    )

    negative = (
        "cartoon, illustration, drawing, blurry, low resolution, "
        "watermark, text, artificial, perfect produce, no defects"
    )

    return positive, negative


# ── Generation Pipeline ──────────────────────────────────────────────────

class SyntheticProduceGenerator:
    """Generate synthetic training images using Stable Diffusion XL."""

    def __init__(self, output_dir: str = "data/synthetic", model_id: str = "stabilityai/stable-diffusion-xl-base-1.0"):
        self.output_dir = Path(output_dir)
        self.model_id = model_id
        self.pipeline = None
        self._initialized = False

    def initialize(self):
        """Load SDXL pipeline. Requires ~7GB VRAM for fp16 or ~12GB for fp32."""
        try:
            import torch
            from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler

            dtype = torch.float16 if torch.cuda.is_available() else torch.float32
            device = "cuda" if torch.cuda.is_available() else "cpu"

            print(f"Loading SDXL pipeline on {device} ({dtype})...")
            self.pipeline = StableDiffusionXLPipeline.from_pretrained(
                self.model_id,
                torch_dtype=dtype,
                use_safetensors=True,
                variant="fp16" if torch.cuda.is_available() else None,
            )
            self.pipeline.scheduler = DPMSolverMultistepScheduler.from_config(
                self.pipeline.scheduler.config
            )
            self.pipeline = self.pipeline.to(device)

            if device == "cuda":
                self.pipeline.enable_xformers_memory_efficient_attention()

            self._initialized = True
            print("SDXL pipeline loaded successfully")

        except ImportError:
            print("diffusers/torch not installed. Using placeholder mode.")
            print("Install with: pip install diffusers torch transformers accelerate xformers")
            self._initialized = False

        except Exception as e:
            print(f"Failed to load SDXL: {e}")
            print("Will generate placeholder metadata only (no images)")
            self._initialized = False

    def generate_dataset(
        self,
        crops: list[str],
        grades: list[str],
        images_per_combo: int = 50,
        resolution: int = 1024,
        include_defects: bool = True,
        seed: Optional[int] = None,
    ) -> dict:
        """
        Generate a full labeled dataset for training.

        Returns COCO-format annotations dict.
        """
        if not self._initialized:
            self.initialize()

        annotations = {
            "info": {
                "description": "FarmConnect Nigerian Produce Synthetic Training Dataset",
                "version": "1.0",
                "year": datetime.now().year,
                "contributor": "FarmConnect AI Inspection",
                "date_created": datetime.now().isoformat(),
                "generator": "SDXL" if self._initialized else "placeholder",
            },
            "licenses": [{"id": 1, "name": "Internal Use", "url": ""}],
            "categories": [],
            "images": [],
            "annotations": [],
        }

        # Build categories
        cat_id = 1
        category_map = {}
        for crop in crops:
            if crop not in NIGERIAN_PRODUCE:
                print(f"Warning: Unknown crop '{crop}', skipping")
                continue
            category_map[crop] = cat_id
            annotations["categories"].append({
                "id": cat_id,
                "name": crop,
                "supercategory": NIGERIAN_PRODUCE[crop]["category"],
            })
            cat_id += 1

        # Add defect categories
        if include_defects:
            all_defects = set()
            for crop in crops:
                if crop in NIGERIAN_PRODUCE:
                    all_defects.update(NIGERIAN_PRODUCE[crop]["defects"])
            for defect in sorted(all_defects):
                category_map[f"defect_{defect}"] = cat_id
                annotations["categories"].append({
                    "id": cat_id,
                    "name": f"defect_{defect}",
                    "supercategory": "defect",
                })
                cat_id += 1

        img_id = 1
        ann_id = 1
        total = len(crops) * len(grades) * images_per_combo
        count = 0

        contexts = ["market", "warehouse", "inspection", "field", "closeup", "bulk"]

        for crop in crops:
            if crop not in NIGERIAN_PRODUCE:
                continue
            info = NIGERIAN_PRODUCE[crop]
            forms = info["market_forms"]

            for grade in grades:
                for i in range(images_per_combo):
                    count += 1
                    form = random.choice(forms)
                    context = random.choice(contexts)
                    gen_seed = (seed + count) if seed else random.randint(0, 2**32)

                    positive, negative = build_sdxl_prompt(crop, grade, form, context)

                    # Generate image
                    filename = f"{crop}_{grade}_{i:04d}.png"
                    grade_dir = self.output_dir / crop / grade
                    grade_dir.mkdir(parents=True, exist_ok=True)
                    filepath = grade_dir / filename

                    if self._initialized and self.pipeline:
                        import torch
                        generator = torch.Generator(device=self.pipeline.device).manual_seed(gen_seed)
                        image = self.pipeline(
                            prompt=positive,
                            negative_prompt=negative,
                            num_inference_steps=30,
                            guidance_scale=7.5,
                            width=resolution,
                            height=resolution,
                            generator=generator,
                        ).images[0]
                        image.save(str(filepath))
                    else:
                        # Placeholder — create metadata without actual image
                        filepath = grade_dir / filename.replace(".png", ".json")
                        filepath.write_text(json.dumps({
                            "prompt": positive,
                            "negative": negative,
                            "seed": gen_seed,
                            "resolution": resolution,
                            "status": "pending_generation",
                        }, indent=2))

                    # COCO annotation
                    annotations["images"].append({
                        "id": img_id,
                        "file_name": f"{crop}/{grade}/{filename}",
                        "width": resolution,
                        "height": resolution,
                        "crop_type": crop,
                        "grade": grade,
                        "market_form": form,
                        "context": context,
                        "prompt": positive,
                    })

                    # Full-image classification annotation
                    annotations["annotations"].append({
                        "id": ann_id,
                        "image_id": img_id,
                        "category_id": category_map[crop],
                        "bbox": [0, 0, resolution, resolution],
                        "area": resolution * resolution,
                        "iscrowd": 0,
                        "attributes": {
                            "grade": grade,
                            "form": form,
                        },
                    })
                    ann_id += 1

                    img_id += 1
                    if count % 10 == 0:
                        print(f"  [{count}/{total}] Generated {crop} grade {grade}")

        # Generate defect-specific images
        if include_defects:
            print("\nGenerating defect-specific training images...")
            for crop in crops:
                if crop not in NIGERIAN_PRODUCE:
                    continue
                for defect in NIGERIAN_PRODUCE[crop]["defects"]:
                    for i in range(max(5, images_per_combo // 5)):
                        count += 1
                        positive, negative = build_defect_prompt(crop, defect)
                        gen_seed = (seed + count + 100000) if seed else random.randint(0, 2**32)

                        filename = f"{crop}_defect_{defect}_{i:04d}.png"
                        defect_dir = self.output_dir / crop / "defects" / defect
                        defect_dir.mkdir(parents=True, exist_ok=True)
                        filepath = defect_dir / filename

                        if self._initialized and self.pipeline:
                            import torch
                            generator = torch.Generator(device=self.pipeline.device).manual_seed(gen_seed)
                            image = self.pipeline(
                                prompt=positive,
                                negative_prompt=negative,
                                num_inference_steps=30,
                                guidance_scale=7.5,
                                width=resolution,
                                height=resolution,
                                generator=generator,
                            ).images[0]
                            image.save(str(filepath))
                        else:
                            filepath = defect_dir / filename.replace(".png", ".json")
                            filepath.write_text(json.dumps({
                                "prompt": positive,
                                "negative": negative,
                                "seed": gen_seed,
                                "resolution": resolution,
                                "defect_type": defect,
                                "status": "pending_generation",
                            }, indent=2))

                        defect_cat_id = category_map.get(f"defect_{defect}", 0)
                        annotations["images"].append({
                            "id": img_id,
                            "file_name": f"{crop}/defects/{defect}/{filename}",
                            "width": resolution,
                            "height": resolution,
                            "crop_type": crop,
                            "grade": "reject",
                            "defect_type": defect,
                            "prompt": positive,
                        })
                        annotations["annotations"].append({
                            "id": ann_id,
                            "image_id": img_id,
                            "category_id": defect_cat_id,
                            "bbox": [
                                random.randint(100, 300),
                                random.randint(100, 300),
                                random.randint(200, 600),
                                random.randint(200, 600),
                            ],
                            "area": 0,
                            "iscrowd": 0,
                            "attributes": {"defect": defect, "crop": crop},
                        })
                        ann_id += 1
                        img_id += 1

        # Save annotations
        ann_path = self.output_dir / "annotations.json"
        ann_path.write_text(json.dumps(annotations, indent=2))
        print(f"\nDataset complete: {img_id - 1} images, {ann_id - 1} annotations")
        print(f"Annotations saved to: {ann_path}")
        return annotations

    def generate_augmentation_config(self) -> dict:
        """Generate Albumentations augmentation config for training."""
        return {
            "description": "Augmentation pipeline for Nigerian produce images",
            "transforms": [
                {"type": "HorizontalFlip", "p": 0.5},
                {"type": "VerticalFlip", "p": 0.2},
                {"type": "RandomRotate90", "p": 0.3},
                {"type": "RandomBrightnessContrast", "brightness_limit": 0.3, "contrast_limit": 0.3, "p": 0.5},
                {"type": "HueSaturationValue", "hue_shift_limit": 15, "sat_shift_limit": 30, "val_shift_limit": 20, "p": 0.4},
                {"type": "GaussNoise", "var_limit": (10.0, 50.0), "p": 0.3},
                {"type": "GaussianBlur", "blur_limit": (3, 7), "p": 0.2},
                {"type": "RandomShadow", "p": 0.3},
                {"type": "RandomRain", "p": 0.1, "note": "Simulate outdoor market conditions"},
                {"type": "CLAHE", "clip_limit": 4.0, "p": 0.3},
                {"type": "CoarseDropout", "max_holes": 8, "max_height": 32, "max_width": 32, "p": 0.2, "note": "Simulate occlusion"},
                {"type": "Resize", "height": 640, "width": 640, "p": 1.0},
            ],
        }


def get_all_crops() -> list[str]:
    return list(NIGERIAN_PRODUCE.keys())


def get_crop_info(crop: str) -> dict:
    return NIGERIAN_PRODUCE.get(crop, {})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic Nigerian produce training images")
    parser.add_argument("--crops", type=str, default="all", help="Comma-separated crop names or 'all'")
    parser.add_argument("--grades", type=str, default="all", help="Comma-separated grades (A,B,C,D,reject) or 'all'")
    parser.add_argument("--count", type=int, default=50, help="Images per crop-grade combination")
    parser.add_argument("--resolution", type=int, default=1024, help="Image resolution (default 1024)")
    parser.add_argument("--output", type=str, default="data/synthetic", help="Output directory")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducibility")
    parser.add_argument("--no-defects", action="store_true", help="Skip defect-specific images")
    parser.add_argument("--model", type=str, default="stabilityai/stable-diffusion-xl-base-1.0", help="SDXL model ID")
    args = parser.parse_args()

    crops = get_all_crops() if args.crops == "all" else [c.strip() for c in args.crops.split(",")]
    grades = GRADES if args.grades == "all" else [g.strip() for g in args.grades.split(",")]

    print(f"Generating synthetic dataset:")
    print(f"  Crops: {len(crops)} ({', '.join(crops[:5])}{'...' if len(crops) > 5 else ''})")
    print(f"  Grades: {grades}")
    print(f"  Images per combo: {args.count}")
    print(f"  Resolution: {args.resolution}x{args.resolution}")
    print(f"  Include defects: {not args.no_defects}")
    print(f"  Output: {args.output}")
    print()

    generator = SyntheticProduceGenerator(output_dir=args.output, model_id=args.model)
    annotations = generator.generate_dataset(
        crops=crops,
        grades=grades,
        images_per_combo=args.count,
        resolution=args.resolution,
        include_defects=not args.no_defects,
        seed=args.seed,
    )

    # Save augmentation config
    aug_config = generator.generate_augmentation_config()
    aug_path = Path(args.output) / "augmentation_config.json"
    aug_path.write_text(json.dumps(aug_config, indent=2))
    print(f"Augmentation config saved to: {aug_path}")
