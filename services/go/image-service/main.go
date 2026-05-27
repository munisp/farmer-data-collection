package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"log"
	"net/http"
	"os"

	"strings"

	"github.com/disintegration/imaging"
	"github.com/nfnt/resize"
)

type ImageProcessRequest struct {
	ImageURL    string `json:"imageUrl"`
	ImageData   string `json:"imageData"` // Base64 encoded
	Operation   string `json:"operation"` // compress, resize, thumbnail, watermark
	Width       int    `json:"width,omitempty"`
	Height      int    `json:"height,omitempty"`
	Quality     int    `json:"quality,omitempty"`
	WatermarkText string `json:"watermarkText,omitempty"`
}

type ImageProcessResponse struct {
	Success   bool   `json:"success"`
	ImageData string `json:"imageData"` // Base64 encoded
	Message   string `json:"message,omitempty"`
	Error     string `json:"error,omitempty"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/api/image/process", processImageHandler)
	http.HandleFunc("/api/image/compress", compressImageHandler)
	http.HandleFunc("/api/image/resize", resizeImageHandler)
	http.HandleFunc("/api/image/thumbnail", thumbnailHandler)
	http.HandleFunc("/api/image/watermark", watermarkHandler)
	http.HandleFunc("/api/image/batch", batchProcessHandler)

	log.Printf("Image Processing Service starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "healthy",
		"service": "image-processing",
		"version": "1.0.0",
	})
}

func processImageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ImageProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Load image
	img, format, err := loadImage(req)
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to load image: %v", err), http.StatusBadRequest)
		return
	}

	// Process based on operation
	var processedImg image.Image
	switch req.Operation {
	case "compress":
		processedImg = img
	case "resize":
		if req.Width == 0 {
			req.Width = 800
		}
		if req.Height == 0 {
			req.Height = 600
		}
		processedImg = imaging.Resize(img, req.Width, req.Height, imaging.Lanczos)
	case "thumbnail":
		processedImg = imaging.Thumbnail(img, 200, 200, imaging.Lanczos)
	case "watermark":
		processedImg = addWatermark(img, req.WatermarkText)
	default:
		respondError(w, "Unknown operation", http.StatusBadRequest)
		return
	}

	// Encode and respond
	quality := req.Quality
	if quality == 0 {
		quality = 85
	}
	imageData, err := encodeImage(processedImg, format, quality)
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to encode image: %v", err), http.StatusInternalServerError)
		return
	}

	respondSuccess(w, imageData, "Image processed successfully")
}

func compressImageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ImageProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	img, format, err := loadImage(req)
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to load image: %v", err), http.StatusBadRequest)
		return
	}

	quality := req.Quality
	if quality == 0 {
		quality = 75
	}

	imageData, err := encodeImage(img, format, quality)
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to compress image: %v", err), http.StatusInternalServerError)
		return
	}

	respondSuccess(w, imageData, "Image compressed successfully")
}

func resizeImageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ImageProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	img, format, err := loadImage(req)
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to load image: %v", err), http.StatusBadRequest)
		return
	}

	width := req.Width
	height := req.Height
	if width == 0 && height == 0 {
		width = 800
		height = 600
	}

	resizedImg := resize.Resize(uint(width), uint(height), img, resize.Lanczos3)

	quality := req.Quality
	if quality == 0 {
		quality = 85
	}

	imageData, err := encodeImage(resizedImg, format, quality)
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to encode resized image: %v", err), http.StatusInternalServerError)
		return
	}

	respondSuccess(w, imageData, "Image resized successfully")
}

func thumbnailHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ImageProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	img, format, err := loadImage(req)
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to load image: %v", err), http.StatusBadRequest)
		return
	}

	width := req.Width
	height := req.Height
	if width == 0 {
		width = 200
	}
	if height == 0 {
		height = 200
	}

	thumbnail := imaging.Thumbnail(img, width, height, imaging.Lanczos)

	imageData, err := encodeImage(thumbnail, format, 85)
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to create thumbnail: %v", err), http.StatusInternalServerError)
		return
	}

	respondSuccess(w, imageData, "Thumbnail created successfully")
}

func watermarkHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ImageProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	img, format, err := loadImage(req)
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to load image: %v", err), http.StatusBadRequest)
		return
	}

	watermarkedImg := addWatermark(img, req.WatermarkText)

	imageData, err := encodeImage(watermarkedImg, format, 90)
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to add watermark: %v", err), http.StatusInternalServerError)
		return
	}

	respondSuccess(w, imageData, "Watermark added successfully")
}

func batchProcessHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var requests []ImageProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&requests); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	responses := make([]ImageProcessResponse, len(requests))
	for i, req := range requests {
		img, format, err := loadImage(req)
		if err != nil {
			responses[i] = ImageProcessResponse{
				Success: false,
				Error:   fmt.Sprintf("Failed to load image: %v", err),
			}
			continue
		}

		var processedImg image.Image
		switch req.Operation {
		case "compress":
			processedImg = img
		case "resize":
			processedImg = imaging.Resize(img, req.Width, req.Height, imaging.Lanczos)
		case "thumbnail":
			processedImg = imaging.Thumbnail(img, 200, 200, imaging.Lanczos)
		default:
			processedImg = img
		}

		quality := req.Quality
		if quality == 0 {
			quality = 85
		}

		imageData, err := encodeImage(processedImg, format, quality)
		if err != nil {
			responses[i] = ImageProcessResponse{
				Success: false,
				Error:   fmt.Sprintf("Failed to encode image: %v", err),
			}
			continue
		}

		responses[i] = ImageProcessResponse{
			Success:   true,
			ImageData: imageData,
			Message:   "Processed successfully",
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(responses)
}

// Helper functions

func loadImage(req ImageProcessRequest) (image.Image, string, error) {
	if req.ImageURL != "" {
		return loadImageFromURL(req.ImageURL)
	}
	if req.ImageData != "" {
		return loadImageFromBase64(req.ImageData)
	}
	return nil, "", fmt.Errorf("no image source provided")
}

func loadImageFromURL(url string) (image.Image, string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	return image.Decode(resp.Body)
}

func loadImageFromBase64(data string) (image.Image, string, error) {
	// Remove data URL prefix if present
	if strings.Contains(data, ",") {
		parts := strings.Split(data, ",")
		if len(parts) > 1 {
			data = parts[1]
		}
	}

	// Decode base64
	decoded, err := io.ReadAll(strings.NewReader(data))
	if err != nil {
		return nil, "", err
	}

	return image.Decode(bytes.NewReader(decoded))
}

func encodeImage(img image.Image, format string, quality int) (string, error) {
	var buf bytes.Buffer

	switch format {
	case "jpeg", "jpg":
		err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality})
		if err != nil {
			return "", err
		}
	case "png":
		err := png.Encode(&buf, img)
		if err != nil {
			return "", err
		}
	default:
		err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality})
		if err != nil {
			return "", err
		}
	}

	// Return base64 encoded data
	return fmt.Sprintf("data:image/%s;base64,%s", format, buf.String()), nil
}

func addWatermark(img image.Image, text string) image.Image {
	// Simple watermark implementation
	// In production, use a proper text rendering library
	bounds := img.Bounds()
	watermarked := imaging.Clone(img)
	
	// Add semi-transparent overlay at bottom-right
	watermarked = imaging.Overlay(watermarked, img, image.Pt(bounds.Max.X-100, bounds.Max.Y-30), 0.5)
	
	return watermarked
}

func respondSuccess(w http.ResponseWriter, imageData, message string) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ImageProcessResponse{
		Success:   true,
		ImageData: imageData,
		Message:   message,
	})
}

func respondError(w http.ResponseWriter, error string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(ImageProcessResponse{
		Success: false,
		Error:   error,
	})
}
