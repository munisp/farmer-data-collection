"""
AgriLLM Fine-Tuning Script
Fine-tunes Llama 3 / TinyLlama on agricultural Q&A data using LoRA (Low-Rank Adaptation).

Data Sources:
- FAO AGRIS (13M+ agricultural records)
- CGIAR crop production guides
- Extension service manuals (Kenya KALRO, Nigeria ARCN, Uganda NARO)
- PlantVillage disease database
- Custom agricultural Q&A pairs

This script generates synthetic agricultural Q&A training data and demonstrates
the LoRA fine-tuning pipeline. In production, replace with real data from the sources above.

Requirements: pip install torch transformers peft datasets
"""

import json
import os
import random

# ============================================================================
# Synthetic Agricultural Q&A Dataset Generator
# ============================================================================

def generate_agri_qa_dataset(n_samples=5000, output_path="agri_qa_dataset.jsonl"):
    """Generate agricultural Q&A pairs for fine-tuning."""
    random.seed(42)

    crops = {
        "maize": {"ph": "5.5-7.0", "temp": "18-35°C", "water": "500-800mm", "n": "120-200", "p": "40-80", "k": "60-120",
                  "diseases": ["gray leaf spot", "northern leaf blight", "maize streak virus", "fall armyworm"],
                  "regions": ["Kenya", "Nigeria", "Tanzania", "Uganda", "Malawi", "Ghana"]},
        "rice": {"ph": "5.5-6.5", "temp": "20-37°C", "water": "900-1200mm", "n": "80-150", "p": "30-60", "k": "30-80",
                 "diseases": ["rice blast", "bacterial leaf blight", "brown planthopper"],
                 "regions": ["Nigeria", "Tanzania", "Senegal", "India", "Thailand", "Vietnam"]},
        "cassava": {"ph": "5.0-6.5", "temp": "25-35°C", "water": "600-1500mm", "n": "50-100", "p": "20-40", "k": "80-150",
                    "diseases": ["cassava mosaic disease", "brown streak", "bacterial blight"],
                    "regions": ["Nigeria", "DRC", "Tanzania", "Mozambique", "Ghana"]},
        "tomato": {"ph": "6.0-6.8", "temp": "18-30°C", "water": "400-600mm", "n": "150-250", "p": "50-100", "k": "200-350",
                   "diseases": ["late blight", "early blight", "bacterial wilt", "tuta absoluta"],
                   "regions": ["Kenya", "Nigeria", "Tanzania", "India", "Ethiopia"]},
        "coffee": {"ph": "6.0-6.5", "temp": "15-28°C", "water": "1200-1800mm", "n": "100-200", "p": "20-40", "k": "100-200",
                   "diseases": ["coffee leaf rust", "coffee berry disease", "root rot"],
                   "regions": ["Kenya", "Ethiopia", "Uganda", "Tanzania", "Colombia"]},
        "wheat": {"ph": "6.0-7.5", "temp": "12-25°C", "water": "300-600mm", "n": "100-150", "p": "40-60", "k": "40-80",
                  "diseases": ["wheat rust", "septoria", "fusarium head blight"],
                  "regions": ["Kenya highlands", "Ethiopia", "India", "Pakistan"]},
        "beans": {"ph": "6.0-7.0", "temp": "18-25°C", "water": "300-500mm", "n": "10-30", "p": "30-60", "k": "20-40",
                  "diseases": ["angular leaf spot", "anthracnose", "bean fly"],
                  "regions": ["Kenya", "Tanzania", "Uganda", "Rwanda", "Ethiopia"]},
        "sorghum": {"ph": "5.5-7.5", "temp": "25-40°C", "water": "300-500mm", "n": "60-120", "p": "20-40", "k": "30-60",
                    "diseases": ["grain mold", "anthracnose", "shoot fly"],
                    "regions": ["Nigeria", "Sudan", "Ethiopia", "India", "Burkina Faso"]},
    }

    qa_templates = [
        # Soil & Fertilizer
        ("What is the best pH for {crop}?",
         "The optimal soil pH for {crop} is {ph}. If your soil is too acidic (pH below {ph_low}), apply agricultural lime at 2-4 tons/ha. If too alkaline (above {ph_high}), add sulfur or organic matter."),
        ("How much fertilizer does {crop} need?",
         "{crop} requires {n} kg/ha Nitrogen, {p} kg/ha Phosphorus, and {k} kg/ha Potassium per season. Apply nitrogen in 2-3 split doses: at planting, 3 weeks after, and at flowering. Apply P and K at planting."),
        ("My soil pH is {user_ph}, is that OK for {crop}?",
         "For {crop}, the optimal pH is {ph}. Your pH of {user_ph} is {ph_status}. {ph_action}"),

        # Disease
        ("My {crop} has {disease}, what should I do?",
         "For {disease} in {crop}: {treatment}. For prevention next season: {prevention}. Always remove and destroy infected plant material."),
        ("What diseases affect {crop} in {region}?",
         "Common {crop} diseases in {region}: {disease_list}. Regular scouting every 7-10 days helps detect problems early. Contact your local extension officer for variety recommendations resistant to these diseases."),

        # Planting
        ("When should I plant {crop} in {region}?",
         "In {region}, {crop} should be planted at the start of the long rains (typically March-April) or short rains (October-November). Optimal temperature is {temp}. Ensure soil moisture is adequate before planting."),
        ("What spacing should I use for {crop}?",
         "Recommended spacing for {crop}: 75cm between rows, 25cm between plants (53,333 plants/ha). For intercropping with beans, increase row spacing to 90cm."),

        # Water
        ("How much water does {crop} need?",
         "{crop} needs {water} of water per growing season. Critical periods for water: germination (first 2 weeks), vegetative growth (4-6 weeks), and flowering/grain filling. Supplement rainfall with irrigation during dry spells."),
        ("My {crop} is wilting, is it drought stress?",
         "Wilting in {crop} can be caused by: 1) Drought stress — check soil moisture, irrigate if below 35%. 2) Bacterial wilt disease — check for brown discoloration in stems. 3) Root damage — check for nematodes or root rot. If leaves recover at night but wilt during the day, it's likely drought stress."),

        # Market
        ("What price should I sell {crop} at?",
         "Current market prices vary by region. Check: 1) Your local market for baseline prices. 2) Use the platform's Price Alerts to track trends. 3) Consider collective selling through your cooperative for 15-30% better prices. 4) Grade your produce — Grade A can fetch 20-40% premium."),

        # General advice
        ("How do I improve my soil for {crop}?",
         "To improve soil for {crop}: 1) Add compost/manure (5-10 tons/ha) for organic matter. 2) Adjust pH to {ph} with lime or sulfur. 3) Rotate crops — alternate {crop} with legumes (beans/groundnuts) to fix nitrogen. 4) Use cover crops during fallow. 5) Minimize tillage to preserve soil structure. 6) Test soil every season to track improvements."),
    ]

    qa_pairs = []
    for _ in range(n_samples):
        crop = random.choice(list(crops.keys()))
        crop_data = crops[crop]
        template_q, template_a = random.choice(qa_templates)

        disease = random.choice(crop_data["diseases"])
        region = random.choice(crop_data["regions"])
        ph_range = crop_data["ph"].split("-")
        user_ph = round(random.uniform(4.0, 8.5), 1)
        ph_low = float(ph_range[0])
        ph_high = float(ph_range[1])

        ph_status = "within optimal range" if ph_low <= user_ph <= ph_high else "too low" if user_ph < ph_low else "too high"
        ph_action = ("No pH adjustment needed." if ph_status == "within optimal range"
                     else f"Apply agricultural lime at {round((ph_low - user_ph) * 1.5, 1)} tons/ha to raise pH." if ph_status == "too low"
                     else "Add sulfur (200-400 kg/ha) or increase organic matter to lower pH.")

        question = template_q.format(crop=crop, disease=disease, region=region, user_ph=user_ph)
        answer = template_a.format(
            crop=crop, ph=crop_data["ph"], ph_low=ph_low, ph_high=ph_high,
            temp=crop_data["temp"], water=crop_data["water"],
            n=crop_data["n"], p=crop_data["p"], k=crop_data["k"],
            disease=disease, region=region, user_ph=user_ph,
            ph_status=ph_status, ph_action=ph_action,
            disease_list=", ".join(crop_data["diseases"]),
            treatment="Apply recommended fungicide/pesticide, remove infected material",
            prevention="Use resistant varieties, practice crop rotation, maintain field hygiene",
        )

        qa_pairs.append({
            "instruction": question,
            "input": "",
            "output": answer,
            "crop": crop,
            "region": region,
            "category": "agriculture",
        })

    with open(output_path, "w") as f:
        for pair in qa_pairs:
            f.write(json.dumps(pair) + "\n")

    print(f"Generated {len(qa_pairs)} agricultural Q&A pairs → {output_path}")
    return qa_pairs


def create_lora_config():
    """Create LoRA configuration for fine-tuning (requires peft library)."""
    config = {
        "r": 16,
        "lora_alpha": 32,
        "target_modules": ["q_proj", "v_proj", "k_proj", "o_proj"],
        "lora_dropout": 0.05,
        "bias": "none",
        "task_type": "CAUSAL_LM",
        "base_model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",  # 1.1B params, runs on CPU
        "training": {
            "epochs": 3,
            "batch_size": 4,
            "learning_rate": 2e-4,
            "warmup_steps": 100,
            "max_seq_length": 512,
            "gradient_accumulation_steps": 4,
        },
        "quantization": {
            "load_in_4bit": True,
            "bnb_4bit_quant_type": "nf4",
            "bnb_4bit_compute_dtype": "float16",
        },
    }
    return config


def estimate_training_resources(n_samples, model_size_b=1.1):
    """Estimate training time and resources."""
    return {
        "model": f"TinyLlama-{model_size_b}B",
        "training_samples": n_samples,
        "estimated_vram_gb": round(model_size_b * 1.2 + 2, 1),  # 4-bit + LoRA overhead
        "estimated_ram_gb": round(model_size_b * 4 + 4, 1),
        "estimated_time_cpu_hours": round(n_samples / 100, 1),
        "estimated_time_gpu_hours": round(n_samples / 2000, 1),
        "output_adapter_size_mb": round(16 * 0.5, 1),  # LoRA adapter is tiny
        "quantized_model_size_gb": round(model_size_b * 0.55, 2),  # 4-bit GGUF
        "inference_ram_gb": round(model_size_b * 0.55 + 1, 1),
    }


if __name__ == "__main__":
    output_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(output_dir, exist_ok=True)

    # Generate training data
    qa_pairs = generate_agri_qa_dataset(
        n_samples=5000,
        output_path=os.path.join(output_dir, "agri_qa_dataset.jsonl"),
    )

    # Show LoRA config
    config = create_lora_config()
    config_path = os.path.join(output_dir, "lora_config.json")
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
    print(f"\nLoRA config → {config_path}")

    # Resource estimation
    resources = estimate_training_resources(len(qa_pairs))
    print(f"\nTraining Resources Estimate:")
    for k, v in resources.items():
        print(f"  {k}: {v}")

    print(f"\n✓ Fine-tuning data and config generated. To fine-tune:")
    print(f"  1. Install: pip install transformers peft bitsandbytes datasets")
    print(f"  2. Download base model: TinyLlama/TinyLlama-1.1B-Chat-v1.0")
    print(f"  3. Run: python -m peft.train --config {config_path} --data {os.path.join(output_dir, 'agri_qa_dataset.jsonl')}")
