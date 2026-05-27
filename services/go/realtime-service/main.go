package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ============================================================================
// Types
// ============================================================================

type MessageType string

const (
	MarketplaceUpdate MessageType = "marketplace_update"
	OrderUpdate       MessageType = "order_update"
	MessageUpdate     MessageType = "message_update"
	PriceAlert        MessageType = "price_alert"
	SystemNotification MessageType = "system_notification"
)

type WebSocketMessage struct {
	Type      MessageType     `json:"type"`
	Timestamp int64           `json:"timestamp"`
	Data      json.RawMessage `json:"data"`
}

type Client struct {
	ID         string
	Conn       *websocket.Conn
	Send       chan WebSocketMessage
	Hub        *Hub
	Channels   map[string]bool // Subscribed channels
	mu         sync.RWMutex
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan WebSocketMessage
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

// ============================================================================
// WebSocket Upgrader
// ============================================================================

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Get allowed origins from environment variable
		allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
		if allowedOrigins == "" {
			// Development mode: allow all origins
			log.Println("[WebSocket] ALLOWED_ORIGINS not set, allowing all origins (development mode)")
			return true
		}

		// Production mode: check against whitelist
		origin := r.Header.Get("Origin")
		if origin == "" {
			// No origin header (same-origin request)
			return true
		}

		// Split allowed origins by comma and check
		origins := strings.Split(allowedOrigins, ",")
		for _, allowed := range origins {
			if strings.TrimSpace(allowed) == origin {
				return true
			}
		}

		log.Printf("[WebSocket] Rejected connection from unauthorized origin: %s", origin)
		return false
	},
}

// ============================================================================
// Hub Implementation
// ============================================================================

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan WebSocketMessage, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("[Hub] Client registered: %s (Total: %d)", client.ID, len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
				log.Printf("[Hub] Client unregistered: %s (Total: %d)", client.ID, len(h.clients))
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					// Client buffer full, close connection
					close(client.Send)
					delete(h.clients, client)
					log.Printf("[Hub] Client removed due to full buffer: %s", client.ID)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) BroadcastToChannel(channel string, message WebSocketMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		client.mu.RLock()
		subscribed := client.Channels[channel]
		client.mu.RUnlock()

		if subscribed {
			select {
			case client.Send <- message:
			default:
				log.Printf("[Hub] Failed to send to client %s", client.ID)
			}
		}
	}
}

func (h *Hub) GetStats() map[string]interface{} {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return map[string]interface{}{
		"total_clients": len(h.clients),
		"timestamp":     time.Now().Unix(),
	}
}

// ============================================================================
// Client Implementation
// ============================================================================

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Client] Read error: %v", err)
			}
			break
		}

		// Handle client messages (subscribe, unsubscribe, etc.)
		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("[Client] JSON unmarshal error: %v", err)
			continue
		}

		action, ok := msg["action"].(string)
		if !ok {
			continue
		}

		switch action {
		case "subscribe":
			if channel, ok := msg["channel"].(string); ok {
				c.mu.Lock()
				c.Channels[channel] = true
				c.mu.Unlock()
				log.Printf("[Client] %s subscribed to channel: %s", c.ID, channel)
			}

		case "unsubscribe":
			if channel, ok := msg["channel"].(string); ok {
				c.mu.Lock()
				delete(c.Channels, channel)
				c.mu.Unlock()
				log.Printf("[Client] %s unsubscribed from channel: %s", c.ID, channel)
			}

		case "ping":
			// Respond with pong
			pongMsg := WebSocketMessage{
				Type:      SystemNotification,
				Timestamp: time.Now().Unix(),
				Data:      json.RawMessage(`{"message":"pong"}`),
			}
			c.Send <- pongMsg
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				// Hub closed the channel
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteJSON(message); err != nil {
				log.Printf("[Client] Write error: %v", err)
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ============================================================================
// HTTP Handlers
// ============================================================================

var hub = NewHub()

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade error: %v", err)
		return
	}

	// Generate client ID from query params or use timestamp
	clientID := r.URL.Query().Get("clientId")
	if clientID == "" {
		clientID = time.Now().Format("20060102150405")
	}

	client := &Client{
		ID:       clientID,
		Conn:     conn,
		Send:     make(chan WebSocketMessage, 256),
		Hub:      hub,
		Channels: make(map[string]bool),
	}

	hub.register <- client

	// Start client goroutines
	go client.WritePump()
	go client.ReadPump()
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	stats := hub.GetStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "healthy",
		"service": "realtime-service",
		"version": "1.0.0",
		"stats":   stats,
	})
}

func handleBroadcast(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Channel string          `json:"channel"`
		Type    MessageType     `json:"type"`
		Data    json.RawMessage `json:"data"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	message := WebSocketMessage{
		Type:      req.Type,
		Timestamp: time.Now().Unix(),
		Data:      req.Data,
	}

	if req.Channel != "" {
		hub.BroadcastToChannel(req.Channel, message)
	} else {
		hub.broadcast <- message
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Broadcast sent",
	})
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	stats := hub.GetStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// ============================================================================
// Main
// ============================================================================

func main() {
	// Start hub
	go hub.Run()

	// Setup routes
	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/api/broadcast", handleBroadcast)
	http.HandleFunc("/api/stats", handleStats)

	// Start server
	port := ":8081"
	log.Printf("[Server] Starting WebSocket server on port %s", port)
	log.Printf("[Server] WebSocket endpoint: ws://localhost%s/ws", port)
	log.Printf("[Server] Health check: http://localhost%s/health", port)
	log.Printf("[Server] Broadcast API: http://localhost%s/api/broadcast", port)

	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal("[Server] Failed to start:", err)
	}
}
