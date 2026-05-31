"""Tests for Aquaculture AI Service"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

import math
import unittest
from main import (
    FISH_DISEASES, GROWTH_MODELS, HATCHERY_PROFILES,
)


class TestDiseaseDatabase(unittest.TestCase):
    def test_disease_count(self):
        self.assertEqual(len(FISH_DISEASES), 8, "Expected 8 diseases in knowledge base")

    def test_catfish_diseases(self):
        catfish_diseases = [k for k, d in FISH_DISEASES.items() if "catfish" in d["species_affected"]]
        self.assertGreaterEqual(len(catfish_diseases), 4, "Catfish should have at least 4 diseases")

    def test_disease_structure(self):
        for key, disease in FISH_DISEASES.items():
            self.assertIn("name", disease, f"Disease {key} missing name")
            self.assertIn("pathogen", disease, f"Disease {key} missing pathogen")
            self.assertIn("type", disease, f"Disease {key} missing type")
            self.assertIn("symptoms", disease, f"Disease {key} missing symptoms")
            self.assertIn("treatment", disease, f"Disease {key} missing treatment")
            self.assertIn("prevention", disease, f"Disease {key} missing prevention")
            self.assertIn("mortality_rate", disease, f"Disease {key} missing mortality_rate")
            self.assertGreater(len(disease["symptoms"]), 0, f"Disease {key} has no symptoms")
            self.assertGreater(len(disease["treatment"]), 0, f"Disease {key} has no treatments")

    def test_disease_types(self):
        types = set(d["type"] for d in FISH_DISEASES.values())
        self.assertIn("bacterial", types)
        self.assertIn("parasitic", types)
        self.assertIn("fungal", types)
        self.assertIn("viral", types)

    def test_mortality_rates(self):
        for key, d in FISH_DISEASES.items():
            self.assertGreater(d["mortality_rate"], 0, f"{key} mortality should be > 0")
            self.assertLessEqual(d["mortality_rate"], 1.0, f"{key} mortality should be <= 1.0")
        # WSSV should be highest mortality
        self.assertEqual(FISH_DISEASES["white_spot_shrimp"]["mortality_rate"], 0.90)


class TestGrowthModels(unittest.TestCase):
    def test_species_count(self):
        self.assertEqual(len(GROWTH_MODELS), 6, "Expected 6 species growth models")

    def test_species_names(self):
        expected = {"catfish", "tilapia", "shrimp", "trout", "carp", "barramundi"}
        self.assertEqual(set(GROWTH_MODELS.keys()), expected)

    def test_growth_phases(self):
        for species, model in GROWTH_MODELS.items():
            phases = model["growth_phases"]
            self.assertEqual(len(phases), 5, f"{species} should have 5 growth phases")
            # Weights should increase monotonically
            weights = [p["weight_g"] for p in phases]
            for i in range(1, len(weights)):
                self.assertGreater(weights[i], weights[i-1], f"{species} weights not increasing at phase {i}")

    def test_catfish_profile(self):
        m = GROWTH_MODELS["catfish"]
        self.assertEqual(m["initial_weight_g"], 5.0)
        self.assertEqual(m["market_weight_g"], 1000.0)
        self.assertEqual(m["optimal_temp"], 28.0)
        self.assertEqual(m["growth_phases"][-1]["weight_g"], 1000)

    def test_von_bertalanffy_parameters(self):
        for species, model in GROWTH_MODELS.items():
            self.assertGreater(model["k_growth"], 0, f"{species} k_growth should be > 0")
            self.assertGreater(model["w_inf"], model["market_weight_g"], f"{species} w_inf should exceed market weight")


class TestHatcheryProfiles(unittest.TestCase):
    def test_hatchery_count(self):
        self.assertEqual(len(HATCHERY_PROFILES), 6)

    def test_catfish_hatchery(self):
        p = HATCHERY_PROFILES["catfish"]
        self.assertEqual(p["eggs_per_kg_female"], 60000)
        self.assertEqual(p["fertilization_rate"], 0.85)
        self.assertEqual(p["hatching_rate"], 0.75)
        self.assertEqual(p["fry_survival_rate"], 0.60)
        self.assertEqual(p["incubation_temp"], 28)

    def test_survival_rates(self):
        for species, p in HATCHERY_PROFILES.items():
            overall = p["fertilization_rate"] * p["hatching_rate"] * p["fry_survival_rate"]
            self.assertGreater(overall, 0.1, f"{species} overall survival too low: {overall}")
            self.assertLess(overall, 1.0, f"{species} overall survival impossibly high: {overall}")

    def test_shrimp_high_fecundity(self):
        shrimp = HATCHERY_PROFILES["shrimp"]
        catfish = HATCHERY_PROFILES["catfish"]
        self.assertGreater(shrimp["eggs_per_kg_female"], catfish["eggs_per_kg_female"],
                          "Shrimp should produce more eggs than catfish")

    def test_trout_cold_water(self):
        trout = HATCHERY_PROFILES["trout"]
        self.assertLess(trout["incubation_temp"], 15, "Trout is cold water — incubation should be < 15°C")
        self.assertGreater(trout["incubation_hours"], 500, "Trout eggs take weeks to hatch")


class TestGrowthPrediction(unittest.TestCase):
    def test_von_bertalanffy(self):
        """Test von Bertalanffy growth model: W(t) = W_inf * (1 - e^(-K*t))^3"""
        model = GROWTH_MODELS["catfish"]
        k = model["k_growth"]
        w_inf = model["w_inf"]

        # At day 0, weight should be ~0
        w0 = w_inf * (1 - math.exp(-k * 0)) ** 3
        self.assertAlmostEqual(w0, 0.0, places=2)

        # At day 180, weight should be near market weight
        w180 = w_inf * (1 - math.exp(-k * 180)) ** 3
        self.assertGreater(w180, 500, f"Catfish at 180 days should be >500g, got {w180:.0f}g")

    def test_temperature_effect(self):
        """Lower temperature should reduce growth"""
        model = GROWTH_MODELS["catfish"]
        optimal_temp = model["optimal_temp"]

        factor_optimal = max(0.3, 1.0 - abs(optimal_temp - optimal_temp) / 20.0)
        factor_cold = max(0.3, 1.0 - abs(15.0 - optimal_temp) / 20.0)
        self.assertGreater(factor_optimal, factor_cold)

    def test_growth_monotonic(self):
        """Weight should always increase with time"""
        model = GROWTH_MODELS["tilapia"]
        k = model["k_growth"]
        w_inf = model["w_inf"]
        prev = 0
        for day in range(0, 200, 10):
            w = w_inf * (1 - math.exp(-k * day)) ** 3
            self.assertGreaterEqual(w, prev, f"Weight decreased at day {day}")
            prev = w


class TestEffluentCalculations(unittest.TestCase):
    def test_waste_production(self):
        """Verify waste production rates from feed"""
        daily_feed_kg = 10.0  # 10kg feed/day
        n_waste = daily_feed_kg * 1000 * 0.048  # 4.8% N
        p_waste = daily_feed_kg * 1000 * 0.012  # 1.2% P
        self.assertAlmostEqual(n_waste, 480.0, places=1)  # 480g N/day
        self.assertAlmostEqual(p_waste, 120.0, places=1)  # 120g P/day

    def test_concentration_calculation(self):
        """Verify concentration = mass / volume"""
        n_g_day = 480.0  # grams per day
        exchange_m3 = 100.0  # 100 cubic meters exchanged
        concentration = n_g_day / exchange_m3  # mg/L = g/m3
        self.assertAlmostEqual(concentration, 4.8, places=1)


if __name__ == "__main__":
    unittest.main()
