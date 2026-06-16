// WhatsApp Business API Service — Go
// Handles template-based messaging, order notifications, price alerts, and bot commands
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

const defaultPort = "8102"

type WhatsAppService struct {
	accessToken   string
	phoneNumberID string
	verifyToken   string
	apiURL        string
	kafkaBrokers  string
	mu            sync.RWMutex
	messageLog    []MessageRecord
}

type MessageRecord struct {
	ID        string    `json:"id"`
	To        string    `json:"to"`
	Type      string    `json:"type"`
	Template  string    `json:"template,omitempty"`
	Body      string    `json:"body,omitempty"`
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
}

type SendTemplateRequest struct {
	To         string            `json:"to"`
	Template   string            `json:"template"`
	Language   string            `json:"language"`
	Parameters map[string]string `json:"parameters,omitempty"`
}

type SendTextRequest struct {
	To   string `json:"to"`
	Body string `json:"body"`
}

type WebhookPayload struct {
	Object string `json:"object"`
	Entry  []struct {
		Changes []struct {
			Value struct {
				Messages []struct {
					From string `json:"from"`
					Type string `json:"type"`
					Text struct {
						Body string `json:"body"`
					} `json:"text"`
				} `json:"messages"`
				Statuses []struct {
					ID     string `json:"id"`
					Status string `json:"status"`
				} `json:"statuses"`
			} `json:"value"`
		} `json:"changes"`
	} `json:"entry"`
}

func NewWhatsAppService() *WhatsAppService {
	return &WhatsAppService{
		accessToken:   os.Getenv("META_WHATSAPP_ACCESS_TOKEN"),
		phoneNumberID: os.Getenv("META_WHATSAPP_PHONE_NUMBER_ID"),
		verifyToken:   os.Getenv("META_WHATSAPP_VERIFY_TOKEN"),
		apiURL:        "https://graph.facebook.com/v18.0",
		kafkaBrokers:  os.Getenv("KAFKA_BROKERS"),
		messageLog:    make([]MessageRecord, 0),
	}
}

func (ws *WhatsAppService) sendTemplate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SendTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Language == "" {
		req.Language = "en"
	}

	// Build WhatsApp Cloud API payload
	components := make([]map[string]interface{}, 0)
	if len(req.Parameters) > 0 {
		params := make([]map[string]interface{}, 0)
		for _, v := range req.Parameters {
			params = append(params, map[string]interface{}{
				"type": "text",
				"text": v,
			})
		}
		components = append(components, map[string]interface{}{
			"type":       "body",
			"parameters": params,
		})
	}

	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                req.To,
		"type":              "template",
		"template": map[string]interface{}{
			"name":       req.Template,
			"language":   map[string]string{"code": req.Language},
			"components": components,
		},
	}

	msgID, err := ws.callAPI(payload)
	if err != nil {
		log.Printf("ERROR sending template: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	record := MessageRecord{
		ID: msgID, To: req.To, Type: "template",
		Template: req.Template, Status: "sent", Timestamp: time.Now(),
	}
	ws.mu.Lock()
	ws.messageLog = append(ws.messageLog, record)
	ws.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(record)
}

func (ws *WhatsAppService) sendText(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SendTextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                req.To,
		"type":              "text",
		"text":              map[string]string{"body": req.Body},
	}

	msgID, err := ws.callAPI(payload)
	if err != nil {
		log.Printf("ERROR sending text: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	record := MessageRecord{
		ID: msgID, To: req.To, Type: "text",
		Body: req.Body, Status: "sent", Timestamp: time.Now(),
	}
	ws.mu.Lock()
	ws.messageLog = append(ws.messageLog, record)
	ws.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(record)
}

func (ws *WhatsAppService) callAPI(payload interface{}) (string, error) {
	if ws.accessToken == "" {
		return fmt.Sprintf("sim_%d", time.Now().UnixNano()), nil // Simulation mode
	}

	data, _ := json.Marshal(payload)
	url := fmt.Sprintf("%s/%s/messages", ws.apiURL, ws.phoneNumberID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+ws.accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("API call failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	json.Unmarshal(body, &result)

	if len(result.Messages) > 0 {
		return result.Messages[0].ID, nil
	}
	return fmt.Sprintf("msg_%d", time.Now().UnixNano()), nil
}

func (ws *WhatsAppService) webhook(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// Verification challenge
		mode := r.URL.Query().Get("hub.mode")
		token := r.URL.Query().Get("hub.verify_token")
		challenge := r.URL.Query().Get("hub.challenge")

		if mode == "subscribe" && token == ws.verifyToken {
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, challenge)
			return
		}
		http.Error(w, "Forbidden", http.StatusForbidden)

	case http.MethodPost:
		var payload WebhookPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		// Process incoming messages (bot commands)
		for _, entry := range payload.Entry {
			for _, change := range entry.Changes {
				for _, msg := range change.Value.Messages {
					ws.handleIncomingMessage(msg.From, msg.Text.Body)
				}
			}
		}

		w.WriteHeader(http.StatusOK)
	}
}

func (ws *WhatsAppService) handleIncomingMessage(from, text string) {
	log.Printf("Incoming message from %s: %s", from, text)

	// Simple bot command handler
	var reply string
	switch text {
	case "1", "prices", "bei":
		reply = "Current market prices:\n- Cassava: ₦85,000/ton\n- Rice (FARO 44): ₦120,000/bag\n- Yam: ₦45,000/tuber\n- Cocoa: ₦950,000/ton\nReply with crop name for details."
	case "2", "orders", "order":
		reply = "To check your orders, please log in to the FarmConnect app or dial *384*FARM#"
	case "3", "weather", "ojo":
		reply = "Weather alerts are active for your region. You'll receive alerts for severe weather, rainfall, and drought conditions."
	case "4", "help", "iranlowo":
		reply = "FarmConnect Bot:\n1. Prices - Market prices\n2. Orders - Check orders\n3. Weather - Weather alerts\n4. Help - This menu\nReply with a number or keyword."
	default:
		reply = "Welcome to FarmConnect! Reply with:\n1. Prices\n2. Orders\n3. Weather\n4. Help"
	}

	// Send reply (fire and forget)
	go func() {
		payload := map[string]interface{}{
			"messaging_product": "whatsapp",
			"to":                from,
			"type":              "text",
			"text":              map[string]string{"body": reply},
		}
		ws.callAPI(payload)
	}()
}

// Notification templates for FarmConnect events
func (ws *WhatsAppService) handleOrderNotification(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Phone       string `json:"phone"`
		OrderID     string `json:"order_id"`
		Status      string `json:"status"`
		ProductName string `json:"product_name"`
		Amount      string `json:"amount"`
		Currency    string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Map order status to message
	messages := map[string]string{
		"confirmed":  fmt.Sprintf("Your order #%s for %s (%s %s) has been confirmed! The seller is preparing your order.", req.OrderID, req.ProductName, req.Currency, req.Amount),
		"preparing":  fmt.Sprintf("Order #%s: Your %s is being prepared for shipment.", req.OrderID, req.ProductName),
		"shipped":    fmt.Sprintf("Order #%s: Your %s has been shipped! Track your delivery in the FarmConnect app.", req.OrderID, req.ProductName),
		"delivered":  fmt.Sprintf("Order #%s: Your %s has been delivered! Please confirm receipt in the app to release payment to the seller.", req.OrderID, req.ProductName),
	}

	msg, ok := messages[req.Status]
	if !ok {
		msg = fmt.Sprintf("Order #%s update: Status changed to %s", req.OrderID, req.Status)
	}

	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                req.Phone,
		"type":              "text",
		"text":              map[string]string{"body": msg},
	}

	msgID, err := ws.callAPI(payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message_id": msgID, "status": "sent"})
}

func (ws *WhatsAppService) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "ok",
		"service":     "whatsapp-business",
		"configured":  ws.accessToken != "",
		"messages":    len(ws.messageLog),
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	})
}

func main() {
	port := os.Getenv("WHATSAPP_SERVICE_PORT")
	if port == "" {
		port = defaultPort
	}

	svc := NewWhatsAppService()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", svc.handleHealth)
	mux.HandleFunc("/send/template", svc.sendTemplate)
	mux.HandleFunc("/send/text", svc.sendText)
	mux.HandleFunc("/webhook", svc.webhook)
	mux.HandleFunc("/notify/order", svc.handleOrderNotification)

	log.Printf("WhatsApp Business service starting on :%s (configured=%v)", port, svc.accessToken != "")

	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
