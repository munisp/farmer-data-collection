package main

import (
"encoding/json"
"fmt"
"net/http"
"time"
)

type ExchangeRate struct {
BaseCurrency   string
TargetCurrency string
Rate           float64
Timestamp      time.Time
}

func GetExchangeRate(base, target string) (float64, error) {
// Use external API (e.g., exchangerate-api.com)
url := fmt.Sprintf("https://api.exchangerate-api.com/v4/latest/%s", base)

resp, err := http.Get(url)
if err != nil {
 0, err
}
defer resp.Body.Close()

var result map[string]interface{}
json.NewDecoder(resp.Body).Decode(&result)

rates := result["rates"].(map[string]interface{})
rate := rates[target].(float64)

return rate, nil
}

func ConvertCurrency(amount float64, from, to string) (float64, error) {
rate, err := GetExchangeRate(from, to)
if err != nil {
 0, err
}
return amount * rate, nil
}

func main() {
fmt.Println("Multi-Currency Service running...")
}

// Health endpoint for container orchestration
func startHealthServer(serviceName string, port string) {
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		fmt.Fprintf(w, `{"status":"healthy","service":"%s","timestamp":"%s"}`, serviceName, time.Now().Format(time.RFC3339))
	})
	go func() {
		fmt.Printf("Health endpoint available at http://0.0.0.0:%s/health\n", port)
		http.ListenAndServe(":"+port, nil)
	}()
}
