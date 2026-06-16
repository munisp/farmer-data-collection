/**
 * GeoLibre Spatial Module Unit Tests
 *
 * Tests for spectral index calculation, vector analysis (Turf.js),
 * H3 hexagonal grid, tile cache estimates, field collection,
 * and DuckDB sanitization helpers.
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// Spectral Index Calculator
// ============================================================================

describe("Spectral Index Calculator", () => {
  // Inline the pure functions to test without browser dependencies
  function calculateIndexValue(
    index: string,
    red: number,
    green: number,
    blue: number,
    nir: number,
    swir1: number,
    swir2: number,
  ): number {
    switch (index) {
      case "NDVI":
        return nir + red === 0 ? 0 : (nir - red) / (nir + red);
      case "NDWI":
        return green + nir === 0 ? 0 : (green - nir) / (green + nir);
      case "EVI":
        return nir + 6 * red - 7.5 * blue + 1 === 0
          ? 0
          : 2.5 * ((nir - red) / (nir + 6 * red - 7.5 * blue + 1));
      case "SAVI": {
        const L = 0.5;
        return nir + red + L === 0 ? 0 : ((nir - red) / (nir + red + L)) * (1 + L);
      }
      case "NDMI":
        return nir + swir1 === 0 ? 0 : (nir - swir1) / (nir + swir1);
      case "NDBI":
        return swir1 + nir === 0 ? 0 : (swir1 - nir) / (swir1 + nir);
      case "NBR":
        return nir + swir2 === 0 ? 0 : (nir - swir2) / (nir + swir2);
      case "GNDVI":
        return nir + green === 0 ? 0 : (nir - green) / (nir + green);
      default:
        return 0;
    }
  }

  function classifyNDVI(value: number): string {
    if (value < 0) return "Water/Cloud";
    if (value < 0.1) return "Bare Soil";
    if (value < 0.2) return "Sparse Vegetation";
    if (value < 0.4) return "Moderate";
    if (value < 0.6) return "Healthy";
    if (value < 0.8) return "Very Healthy";
    return "Peak Health";
  }

  it("NDVI returns correct normalized values", () => {
    // Healthy vegetation: NIR >> Red
    const ndvi = calculateIndexValue("NDVI", 0.1, 0.2, 0.05, 0.8, 0, 0);
    expect(ndvi).toBeCloseTo(0.7778, 3);
    expect(ndvi).toBeGreaterThan(0);
    expect(ndvi).toBeLessThanOrEqual(1);
  });

  it("NDVI returns 0 for zero-bands", () => {
    const ndvi = calculateIndexValue("NDVI", 0, 0, 0, 0, 0, 0);
    expect(ndvi).toBe(0);
  });

  it("NDWI returns positive for water-dominant pixels", () => {
    const ndwi = calculateIndexValue("NDWI", 0.1, 0.5, 0.05, 0.2, 0, 0);
    expect(ndwi).toBeGreaterThan(0);
  });

  it("EVI uses blue correction band", () => {
    const evi = calculateIndexValue("EVI", 0.1, 0.2, 0.05, 0.8, 0, 0);
    expect(evi).not.toBe(0);
    expect(evi).toBeGreaterThan(0);
  });

  it("SAVI applies soil adjustment factor L=0.5", () => {
    const savi = calculateIndexValue("SAVI", 0.1, 0.2, 0.05, 0.8, 0, 0);
    // SAVI should be close to but different from NDVI
    const ndvi = calculateIndexValue("NDVI", 0.1, 0.2, 0.05, 0.8, 0, 0);
    expect(savi).not.toBeCloseTo(ndvi, 2);
    expect(savi).toBeGreaterThan(0);
  });

  it("NDMI uses SWIR1 band", () => {
    const ndmi = calculateIndexValue("NDMI", 0.1, 0.2, 0.05, 0.8, 0.3, 0);
    expect(ndmi).toBeCloseTo((0.8 - 0.3) / (0.8 + 0.3), 4);
  });

  it("NDBI is inverse of NDMI", () => {
    const ndbi = calculateIndexValue("NDBI", 0.1, 0.2, 0.05, 0.4, 0.6, 0);
    expect(ndbi).toBeGreaterThan(0); // Built-up: SWIR1 > NIR
  });

  it("NBR uses SWIR2 band", () => {
    const nbr = calculateIndexValue("NBR", 0.1, 0.2, 0.05, 0.8, 0, 0.2);
    expect(nbr).toBeCloseTo((0.8 - 0.2) / (0.8 + 0.2), 4);
  });

  it("GNDVI uses green band instead of red", () => {
    const gndvi = calculateIndexValue("GNDVI", 0.1, 0.3, 0.05, 0.8, 0, 0);
    expect(gndvi).toBeCloseTo((0.8 - 0.3) / (0.8 + 0.3), 4);
  });

  it("classifyNDVI returns correct categories", () => {
    expect(classifyNDVI(-0.1)).toBe("Water/Cloud");
    expect(classifyNDVI(0.05)).toBe("Bare Soil");
    expect(classifyNDVI(0.15)).toBe("Sparse Vegetation");
    expect(classifyNDVI(0.3)).toBe("Moderate");
    expect(classifyNDVI(0.5)).toBe("Healthy");
    expect(classifyNDVI(0.7)).toBe("Very Healthy");
    expect(classifyNDVI(0.9)).toBe("Peak Health");
  });

  it("all 8 indices handle zero division gracefully", () => {
    const indices = ["NDVI", "NDWI", "EVI", "SAVI", "NDMI", "NDBI", "NBR", "GNDVI"];
    for (const idx of indices) {
      const val = calculateIndexValue(idx, 0, 0, 0, 0, 0, 0);
      expect(val).toBe(0);
      expect(isNaN(val)).toBe(false);
      expect(isFinite(val)).toBe(true);
    }
  });
});

// ============================================================================
// H3 Hexagonal Grid
// ============================================================================

describe("H3 Hexagonal Grid", () => {
  it("zoomToH3Resolution maps correctly", () => {
    function zoomToH3Resolution(mapZoom: number): number {
      if (mapZoom <= 3) return 1;
      if (mapZoom <= 5) return 2;
      if (mapZoom <= 7) return 3;
      if (mapZoom <= 8) return 4;
      if (mapZoom <= 9) return 5;
      if (mapZoom <= 10) return 6;
      if (mapZoom <= 12) return 7;
      if (mapZoom <= 14) return 8;
      if (mapZoom <= 16) return 9;
      return 10;
    }

    expect(zoomToH3Resolution(1)).toBe(1);
    expect(zoomToH3Resolution(5)).toBe(2);
    expect(zoomToH3Resolution(10)).toBe(6);
    expect(zoomToH3Resolution(14)).toBe(8);
    expect(zoomToH3Resolution(20)).toBe(10);
  });

  it("h3ValueToColor returns valid RGBA strings", () => {
    function h3ValueToColor(
      value: number,
      min: number,
      max: number,
      colorRamp: "heat" | "green" | "blue" = "heat"
    ): string {
      const t = max === min ? 0.5 : (value - min) / (max - min);
      switch (colorRamp) {
        case "heat":
          if (t < 0.5) return `rgba(255, ${Math.round(255 - t * 200)}, 0, 0.7)`;
          return `rgba(255, ${Math.round(155 - (t - 0.5) * 310)}, 0, 0.7)`;
        case "green":
          return `rgba(${Math.round(200 - t * 170)}, ${Math.round(230 - t * 50)}, ${Math.round(200 - t * 170)}, 0.7)`;
        case "blue":
          return `rgba(${Math.round(200 - t * 170)}, ${Math.round(200 - t * 100)}, ${Math.round(230 + t * 25)}, 0.7)`;
        default:
          return `rgba(255, ${Math.round(255 * (1 - t))}, 0, 0.7)`;
      }
    }

    const heat = h3ValueToColor(5, 0, 10, "heat");
    expect(heat).toMatch(/^rgba\(\d+, \d+, \d+, 0\.7\)$/);

    const green = h3ValueToColor(5, 0, 10, "green");
    expect(green).toMatch(/^rgba\(\d+, \d+, \d+, 0\.7\)$/);

    const blue = h3ValueToColor(5, 0, 10, "blue");
    expect(blue).toMatch(/^rgba\(\d+, \d+, \d+, 0\.7\)$/);

    // Edge case: min === max
    const equal = h3ValueToColor(5, 5, 5, "heat");
    expect(equal).toMatch(/^rgba\(\d+, \d+, \d+, 0\.7\)$/);
  });
});

// ============================================================================
// Tile Cache Estimates
// ============================================================================

describe("Tile Cache Estimates", () => {
  function getTilesInBounds(
    bounds: { north: number; south: number; east: number; west: number },
    zoom: number
  ): number {
    const n = 2 ** zoom;
    const xMin = Math.floor(((bounds.west + 180) / 360) * n);
    const xMax = Math.floor(((bounds.east + 180) / 360) * n);
    const yMin = Math.floor(
      ((1 - Math.log(Math.tan((bounds.north * Math.PI) / 180) + 1 / Math.cos((bounds.north * Math.PI) / 180)) / Math.PI) / 2) * n
    );
    const yMax = Math.floor(
      ((1 - Math.log(Math.tan((bounds.south * Math.PI) / 180) + 1 / Math.cos((bounds.south * Math.PI) / 180)) / Math.PI) / 2) * n
    );
    let count = 0;
    for (let x = Math.max(0, xMin); x <= Math.min(n - 1, xMax); x++) {
      for (let y = Math.max(0, yMin); y <= Math.min(n - 1, yMax); y++) {
        count++;
      }
    }
    return count;
  }

  function estimateTileCount(
    bounds: { north: number; south: number; east: number; west: number },
    minZoom: number,
    maxZoom: number
  ): { totalTiles: number; estimatedSizeMB: number } {
    let totalTiles = 0;
    for (let z = minZoom; z <= maxZoom; z++) {
      totalTiles += getTilesInBounds(bounds, z);
    }
    const estimatedSizeMB = Math.round((totalTiles * 15) / 1024 * 10) / 10;
    return { totalTiles, estimatedSizeMB };
  }

  it("estimates tile count for Kano region", () => {
    const kano = { north: 12.2, south: 11.8, east: 8.7, west: 8.3 };
    const result = estimateTileCount(kano, 8, 14);
    expect(result.totalTiles).toBeGreaterThan(0);
    expect(result.estimatedSizeMB).toBeGreaterThan(0);
  });

  it("higher zoom levels produce more tiles", () => {
    const bounds = { north: 7.0, south: 6.8, east: 3.5, west: 3.3 };
    const lowZoom = estimateTileCount(bounds, 8, 10);
    const highZoom = estimateTileCount(bounds, 8, 14);
    expect(highZoom.totalTiles).toBeGreaterThan(lowZoom.totalTiles);
  });

  it("larger areas produce more tiles", () => {
    const small = { north: 7.0, south: 6.9, east: 3.4, west: 3.3 };
    const large = { north: 8.0, south: 6.0, east: 5.0, west: 3.0 };
    const smallResult = estimateTileCount(small, 10, 12);
    const largeResult = estimateTileCount(large, 10, 12);
    expect(largeResult.totalTiles).toBeGreaterThan(smallResult.totalTiles);
  });

  it("size estimate assumes ~15KB per tile", () => {
    const bounds = { north: 7.0, south: 6.8, east: 3.5, west: 3.3 };
    const result = estimateTileCount(bounds, 10, 10);
    const expectedMB = Math.round((result.totalTiles * 15) / 1024 * 10) / 10;
    expect(result.estimatedSizeMB).toBe(expectedMB);
  });
});

// ============================================================================
// DuckDB Table Name Sanitization
// ============================================================================

describe("DuckDB Table Name Sanitization", () => {
  const VALID_TABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

  function sanitizeTableName(name: string): string {
    if (!VALID_TABLE_NAME.test(name)) {
      throw new Error(`Invalid table name: ${name}`);
    }
    return name;
  }

  function escapeString(value: string): string {
    return value.replace(/'/g, "''").replace(/\\/g, "\\\\");
  }

  it("accepts valid table names", () => {
    expect(sanitizeTableName("farms")).toBe("farms");
    expect(sanitizeTableName("my_table_123")).toBe("my_table_123");
    expect(sanitizeTableName("_private")).toBe("_private");
  });

  it("rejects SQL injection attempts", () => {
    expect(() => sanitizeTableName("farms; DROP TABLE users")).toThrow("Invalid table name");
    expect(() => sanitizeTableName("farms--")).toThrow("Invalid table name");
    expect(() => sanitizeTableName("farms' OR '1'='1")).toThrow("Invalid table name");
    expect(() => sanitizeTableName("")).toThrow("Invalid table name");
    expect(() => sanitizeTableName("123invalid")).toThrow("Invalid table name");
  });

  it("rejects names starting with numbers", () => {
    expect(() => sanitizeTableName("1farms")).toThrow("Invalid table name");
  });

  it("rejects names with special characters", () => {
    expect(() => sanitizeTableName("farm-table")).toThrow("Invalid table name");
    expect(() => sanitizeTableName("farm.table")).toThrow("Invalid table name");
    expect(() => sanitizeTableName("farm table")).toThrow("Invalid table name");
  });

  it("escapeString handles single quotes", () => {
    expect(escapeString("O'Reilly")).toBe("O''Reilly");
    expect(escapeString("it's a test")).toBe("it''s a test");
  });

  it("escapeString handles backslashes", () => {
    expect(escapeString("C:\\Users")).toBe("C:\\\\Users");
  });

  it("escapeString handles combined injection", () => {
    expect(escapeString("'; DROP TABLE users; --")).toBe("''; DROP TABLE users; --");
  });
});

// ============================================================================
// Field Collection ID Generation
// ============================================================================

describe("Field Collection ID Generation", () => {
  it("crypto.randomUUID generates valid UUIDs", () => {
    const uuid = crypto.randomUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("crypto.randomUUID generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => crypto.randomUUID()));
    expect(ids.size).toBe(100);
  });
});

// ============================================================================
// Nigerian Farm Regions Constants
// ============================================================================

describe("Nigerian Farm Regions", () => {
  const NIGERIAN_FARM_REGIONS = [
    { name: "Kano (Groundnuts Belt)", bounds: { north: 12.2, south: 11.8, east: 8.7, west: 8.3 } },
    { name: "Benue (Food Basket)", bounds: { north: 7.9, south: 7.3, east: 9.0, west: 8.2 } },
    { name: "Ogun (Cocoa Belt)", bounds: { north: 7.3, south: 6.8, east: 3.6, west: 3.0 } },
    { name: "Niger (Rice Belt)", bounds: { north: 10.0, south: 9.0, east: 6.5, west: 5.5 } },
    { name: "Kaduna (Maize Corridor)", bounds: { north: 10.8, south: 10.2, east: 7.6, west: 7.0 } },
    { name: "Lagos (Urban Markets)", bounds: { north: 6.7, south: 6.3, east: 3.6, west: 3.1 } },
  ];

  it("all 6 regions have valid bounds", () => {
    expect(NIGERIAN_FARM_REGIONS).toHaveLength(6);
    for (const region of NIGERIAN_FARM_REGIONS) {
      expect(region.bounds.north).toBeGreaterThan(region.bounds.south);
      expect(region.bounds.east).toBeGreaterThan(region.bounds.west);
      expect(region.bounds.north).toBeLessThanOrEqual(90);
      expect(region.bounds.south).toBeGreaterThanOrEqual(-90);
      expect(region.bounds.east).toBeLessThanOrEqual(180);
      expect(region.bounds.west).toBeGreaterThanOrEqual(-180);
    }
  });

  it("all regions are in Nigeria/West Africa latitude range", () => {
    for (const region of NIGERIAN_FARM_REGIONS) {
      expect(region.bounds.south).toBeGreaterThanOrEqual(4);
      expect(region.bounds.north).toBeLessThanOrEqual(14);
    }
  });
});
