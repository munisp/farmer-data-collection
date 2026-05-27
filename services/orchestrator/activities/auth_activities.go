package activities

import (
"context"
"encoding/json"
"fmt"
"orchestrator/middleware"
)

type AuthActivities struct {
mm *middleware.Manager
}

func NewAuthActivities(mm *middleware.Manager) *AuthActivities {
return &AuthActivities{mm: mm}
}

type AuthenticateUserInput struct {
Email    string
Password string
}

type AuthenticateUserOutput struct {
UserID      int
AccessToken string
Role        string
}

func (a *AuthActivities) AuthenticateUser(ctx context.Context, input AuthenticateUserInput) (*AuthenticateUserOutput, error) {
// Query database for user
query := "SELECT id, role FROM users WHERE email = $1 AND password = crypt($2, password) AND is_active = true"
rows, err := a.mm.QueryDB(ctx, query, input.Email, input.Password)
if err != nil {
return nil, fmt.Errorf("database query failed: %w", err)
}
defer rows.Close()

if !rows.Next() {
return nil, fmt.Errorf("invalid credentials")
}

var userID int
var role string
if err := rows.Scan(&userID, &role); err != nil {
return nil, err
}

// Publish authentication event to Kafka
event := map[string]interface{}{
"event_type": "USER_AUTHENTICATED",
"user_id":    userID,
"email":      input.Email,
"role":       role,
}
eventJSON, _ := json.Marshal(event)
a.mm.PublishEvent(ctx, fmt.Sprintf("user:%d", userID), eventJSON)

// Cache user session in Redis
sessionKey := fmt.Sprintf("session:user:%d", userID)
a.mm.CacheSet(ctx, sessionKey, fmt.Sprintf(`{"user_id":%d,"role":"%s"}`, userID, role))

return &AuthenticateUserOutput{
UserID:      userID,
AccessToken: fmt.Sprintf("token_%d", userID), // Simplified
Role:        role,
}, nil
}

type CheckPermissionInput struct {
UserID   int
Resource string
Action   string
}

func (a *AuthActivities) CheckPermission(ctx context.Context, input CheckPermissionInput) (bool, error) {
// Check permission via Permify (simplified - would use actual Permify API)
// For now, check role-based permissions from database
query := "SELECT role FROM users WHERE id = $1"
rows, err := a.mm.QueryDB(ctx, query, input.UserID)
if err != nil {
return false, err
}
defer rows.Close()

if !rows.Next() {
return false, fmt.Errorf("user not found")
}

var role string
rows.Scan(&role)

// Simple role-based check (admin can do everything)
if role == "admin" {
return true, nil
}

// Farmers can manage their own resources
if role == "farmer" && (input.Action == "read" || input.Action == "create" || input.Action == "update") {
return true, nil
}

return false, nil
}
