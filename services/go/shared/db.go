package shared

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"sync"

	_ "github.com/lib/pq"
)

var (
	dbOnce sync.Once
	dbPool *sql.DB
)

func GetDB() *sql.DB {
	dbOnce.Do(func() {
		dsn := os.Getenv("DATABASE_URL")
		if dsn == "" {
			dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
				getEnv("DB_HOST", "localhost"),
				getEnv("DB_PORT", "5432"),
				getEnv("DB_USER", "farmconnect"),
				getEnv("DB_PASSWORD", "farmconnect"),
				getEnv("DB_NAME", "farmconnect"),
			)
		}
		var err error
		dbPool, err = sql.Open("postgres", dsn)
		if err != nil {
			log.Printf("[DB] Failed to open connection: %v", err)
			return
		}
		dbPool.SetMaxOpenConns(10)
		dbPool.SetMaxIdleConns(5)
		if err = dbPool.Ping(); err != nil {
			log.Printf("[DB] Failed to ping: %v (will use in-memory fallback)", err)
			dbPool = nil
			return
		}
		log.Println("[DB] PostgreSQL connected")
	})
	return dbPool
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
