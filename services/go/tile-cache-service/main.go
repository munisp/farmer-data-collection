package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/gorilla/mux"
)

// Offline Map Tile Cache Service
//
// Caches OpenStreetMap and satellite tiles for offline use in low-connectivity
// areas common in rural West African farming regions. Two-tier caching:
// L1 = on-disk LRU file cache, L2 = Redis for metadata/coordination.
//
// Endpoints:
//   GET /tiles/{provider}/{z}/{x}/{y}.png  — serve cached tile or fetch upstream
//   POST /tiles/prefetch                   — prefetch tiles for a bounding box
//   GET /tiles/stats                       — cache statistics
//   DELETE /tiles/evict                    — evict tiles older than threshold
//   GET /health                            — health check

const (
	defaultPort      = "8097"
	maxCacheSizeMB   = 500
	defaultTTLHours  = 720 // 30 days
	maxPrefetchTiles = 5000
	fetchTimeout     = 10 * time.Second
)

var tileProviders = map[string]string{
	"osm":       "https://tile.openstreetmap.org/%d/%d/%d.png",
	"satellite": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%d/%d/%d",
	"terrain":   "https://stamen-tiles.a.ssl.fastly.net/terrain/%d/%d/%d.png",
}

type TileCacheService struct {
	cacheDir    string
	redis       *redis.Client
	redisOK     bool
	mu          sync.RWMutex
	stats       CacheStats
	httpClient  *http.Client
}

type CacheStats struct {
	Hits       int64  `json:"hits"`
	Misses     int64  `json:"misses"`
	Fetches    int64  `json:"fetches"`
	Errors     int64  `json:"errors"`
	DiskUseMB  float64 `json:"disk_use_mb"`
	TileCount  int64  `json:"tile_count"`
	StartedAt  string `json:"started_at"`
}

type PrefetchRequest struct {
	Provider string  `json:"provider"`
	MinLat   float64 `json:"min_lat"`
	MaxLat   float64 `json:"max_lat"`
	MinLng   float64 `json:"min_lng"`
	MaxLng   float64 `json:"max_lng"`
	MinZoom  int     `json:"min_zoom"`
	MaxZoom  int     `json:"max_zoom"`
}

type PrefetchResponse struct {
	TilesQueued   int    `json:"tiles_queued"`
	TilesCached   int    `json:"tiles_cached"`
	TilesFetched  int    `json:"tiles_fetched"`
	TilesErrored  int    `json:"tiles_errored"`
	EstSizeMB     float64 `json:"estimated_size_mb"`
	Duration      string `json:"duration"`
}

func NewTileCacheService() *TileCacheService {
	cacheDir := os.Getenv("TILE_CACHE_DIR")
	if cacheDir == "" {
		cacheDir = "/tmp/farmconnect-tile-cache"
	}
	os.MkdirAll(cacheDir, 0755)

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	opts, err := redis.ParseURL(redisURL)
	var rdb *redis.Client
	redisOK := false
	if err == nil {
		rdb = redis.NewClient(opts)
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if rdb.Ping(ctx).Err() == nil {
			redisOK = true
			log.Printf("[TileCache] Redis connected at %s", redisURL)
		} else {
			log.Printf("[TileCache] Redis not available, running with disk-only cache")
		}
	}

	return &TileCacheService{
		cacheDir: cacheDir,
		redis:    rdb,
		redisOK:  redisOK,
		stats: CacheStats{
			StartedAt: time.Now().UTC().Format(time.RFC3339),
		},
		httpClient: &http.Client{
			Timeout: fetchTimeout,
			Transport: &http.Transport{
				MaxIdleConns:        50,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

func (s *TileCacheService) tilePath(provider string, z, x, y int) string {
	return filepath.Join(s.cacheDir, provider, fmt.Sprintf("%d", z), fmt.Sprintf("%d", x), fmt.Sprintf("%d.png", y))
}

func (s *TileCacheService) tileKey(provider string, z, x, y int) string {
	return fmt.Sprintf("tile:%s:%d:%d:%d", provider, z, x, y)
}

func (s *TileCacheService) fetchUpstream(provider string, z, x, y int) ([]byte, error) {
	urlTemplate, ok := tileProviders[provider]
	if !ok {
		return nil, fmt.Errorf("unknown provider: %s", provider)
	}

	url := fmt.Sprintf(urlTemplate, z, x, y)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "FarmConnect-TileCache/1.0 (agricultural-platform)")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("upstream fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("upstream returned %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read upstream response: %w", err)
	}

	return data, nil
}

func (s *TileCacheService) saveToDisk(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func (s *TileCacheService) saveToRedis(key string, data []byte) {
	if !s.redisOK {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	hash := fmt.Sprintf("%x", sha256.Sum256(data))
	meta := map[string]interface{}{
		"size":      len(data),
		"hash":      hash,
		"cached_at": time.Now().UTC().Format(time.RFC3339),
	}
	metaJSON, _ := json.Marshal(meta)
	s.redis.Set(ctx, key+":meta", metaJSON, time.Duration(defaultTTLHours)*time.Hour)
}

// HandleGetTile serves a tile from cache or fetches upstream
func (s *TileCacheService) HandleGetTile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	provider := vars["provider"]
	z, _ := strconv.Atoi(vars["z"])
	x, _ := strconv.Atoi(vars["x"])
	yStr := strings.TrimSuffix(vars["y"], ".png")
	y, _ := strconv.Atoi(yStr)

	if _, ok := tileProviders[provider]; !ok {
		http.Error(w, `{"error":"unknown provider"}`, http.StatusBadRequest)
		return
	}

	path := s.tilePath(provider, z, x, y)

	// Check disk cache
	if data, err := os.ReadFile(path); err == nil {
		s.mu.Lock()
		s.stats.Hits++
		s.mu.Unlock()

		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("X-Cache", "HIT")
		w.Write(data)
		return
	}

	// Cache miss — fetch upstream
	s.mu.Lock()
	s.stats.Misses++
	s.mu.Unlock()

	data, err := s.fetchUpstream(provider, z, x, y)
	if err != nil {
		s.mu.Lock()
		s.stats.Errors++
		s.mu.Unlock()
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadGateway)
		return
	}

	// Save to cache asynchronously
	go func() {
		s.saveToDisk(path, data)
		s.saveToRedis(s.tileKey(provider, z, x, y), data)
		s.mu.Lock()
		s.stats.Fetches++
		s.stats.TileCount++
		s.mu.Unlock()
	}()

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("X-Cache", "MISS")
	w.Write(data)
}

// lat/lng to tile coordinates (Slippy map standard)
func latLngToTile(lat, lng float64, zoom int) (int, int) {
	n := math.Pow(2, float64(zoom))
	x := int((lng + 180.0) / 360.0 * n)
	latRad := lat * math.Pi / 180.0
	y := int((1.0 - math.Log(math.Tan(latRad)+1.0/math.Cos(latRad))/math.Pi) / 2.0 * n)
	return x, y
}

// HandlePrefetch prefetches tiles for a bounding box
func (s *TileCacheService) HandlePrefetch(w http.ResponseWriter, r *http.Request) {
	var req PrefetchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	if req.Provider == "" {
		req.Provider = "osm"
	}
	if req.MinZoom < 1 { req.MinZoom = 10 }
	if req.MaxZoom < req.MinZoom { req.MaxZoom = req.MinZoom + 3 }
	if req.MaxZoom > 18 { req.MaxZoom = 18 }

	start := time.Now()
	resp := PrefetchResponse{}

	for z := req.MinZoom; z <= req.MaxZoom; z++ {
		minX, maxY := latLngToTile(req.MinLat, req.MinLng, z)
		maxX, minY := latLngToTile(req.MaxLat, req.MaxLng, z)

		for x := minX; x <= maxX; x++ {
			for y := minY; y <= maxY; y++ {
				if resp.TilesQueued >= maxPrefetchTiles {
					break
				}
				resp.TilesQueued++

				path := s.tilePath(req.Provider, z, x, y)
				if _, err := os.Stat(path); err == nil {
					resp.TilesCached++
					continue
				}

				data, err := s.fetchUpstream(req.Provider, z, x, y)
				if err != nil {
					resp.TilesErrored++
					continue
				}

				s.saveToDisk(path, data)
				s.saveToRedis(s.tileKey(req.Provider, z, x, y), data)
				resp.TilesFetched++
				resp.EstSizeMB += float64(len(data)) / (1024 * 1024)

				s.mu.Lock()
				s.stats.Fetches++
				s.stats.TileCount++
				s.mu.Unlock()
			}
		}
	}

	resp.Duration = time.Since(start).String()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleStats returns cache statistics
func (s *TileCacheService) HandleStats(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	stats := s.stats
	s.mu.RUnlock()

	// Calculate disk usage
	var totalSize int64
	filepath.Walk(s.cacheDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			totalSize += info.Size()
		}
		return nil
	})
	stats.DiskUseMB = float64(totalSize) / (1024 * 1024)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// HandleEvict removes old tiles
func (s *TileCacheService) HandleEvict(w http.ResponseWriter, r *http.Request) {
	maxAgeStr := r.URL.Query().Get("max_age_hours")
	maxAge := defaultTTLHours
	if maxAgeStr != "" {
		if v, err := strconv.Atoi(maxAgeStr); err == nil {
			maxAge = v
		}
	}

	cutoff := time.Now().Add(-time.Duration(maxAge) * time.Hour)
	evicted := 0

	filepath.Walk(s.cacheDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if info.ModTime().Before(cutoff) {
			os.Remove(path)
			evicted++
		}
		return nil
	})

	s.mu.Lock()
	s.stats.TileCount -= int64(evicted)
	if s.stats.TileCount < 0 { s.stats.TileCount = 0 }
	s.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"evicted":       evicted,
		"cutoff":        cutoff.Format(time.RFC3339),
		"max_age_hours": maxAge,
	})
}

func (s *TileCacheService) HandleHealth(w http.ResponseWriter, r *http.Request) {
	status := map[string]interface{}{
		"status":    "healthy",
		"service":   "tile-cache-service",
		"redis":     s.redisOK,
		"cache_dir": s.cacheDir,
		"providers": []string{"osm", "satellite", "terrain"},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	port := os.Getenv("TILE_CACHE_PORT")
	if port == "" {
		port = defaultPort
	}

	svc := NewTileCacheService()

	r := mux.NewRouter()
	r.Use(corsMiddleware)
	r.HandleFunc("/tiles/{provider}/{z}/{x}/{y}", svc.HandleGetTile).Methods("GET")
	r.HandleFunc("/tiles/prefetch", svc.HandlePrefetch).Methods("POST")
	r.HandleFunc("/tiles/stats", svc.HandleStats).Methods("GET")
	r.HandleFunc("/tiles/evict", svc.HandleEvict).Methods("DELETE")
	r.HandleFunc("/health", svc.HandleHealth).Methods("GET")

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("[TileCache] Starting on :%s (cache: %s)", port, svc.cacheDir)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[TileCache] Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[TileCache] Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
	log.Println("[TileCache] Stopped")
}
