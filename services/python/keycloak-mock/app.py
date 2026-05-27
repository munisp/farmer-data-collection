"""
Mock Keycloak Authentication Service
Provides JWT token generation and validation
"""
from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional, Dict, Any
import jwt
import hashlib
from datetime import datetime, timedelta
import uvicorn
import os

app = FastAPI(title="Mock Keycloak Service")

# Secret key for JWT
SECRET_KEY = "farmer-platform-secret-key-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# In-memory user database
users_db: Dict[str, Dict[str, Any]] = {
    "admin": {
        "user_id": 1,
        "username": "admin",
        "password_hash": hashlib.sha256("admin123".encode()).hexdigest(),
        "roles": ["admin", "user"],
        "phone_number": "+2348000000000",
    },
    "farmer1": {
        "user_id": 1001,
        "username": "farmer1",
        "password_hash": hashlib.sha256("farmer123".encode()).hexdigest(),
        "roles": ["farmer", "user"],
        "phone_number": "+2348012345678",
    },
}


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user_id: int
    roles: list


class UserCreate(BaseModel):
    username: str
    password: str
    phone_number: str
    roles: Optional[list] = ["user"]


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt


def verify_token(token: str) -> Dict[str, Any]:
    """Verify JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "keycloak-mock",
        "users_count": len(users_db),
    }


@app.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """Authenticate user and return JWT token"""
    
    # Check if user exists
    if request.username not in users_db:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = users_db[request.username]
    
    # Verify password
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    if password_hash != user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": request.username,
            "user_id": user["user_id"],
            "roles": user["roles"],
        },
        expires_delta=access_token_expires,
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user_id": user["user_id"],
        "roles": user["roles"],
    }


@app.post("/auth/verify")
async def verify(authorization: str = Header(...)):
    """Verify JWT token"""
    
    # Extract token from Authorization header
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = authorization.replace("Bearer ", "")
    payload = verify_token(token)
    
    return {
        "valid": True,
        "username": payload.get("sub"),
        "user_id": payload.get("user_id"),
        "roles": payload.get("roles"),
        "exp": payload.get("exp"),
    }


@app.post("/auth/register")
async def register(request: UserCreate):
    """Register new user"""
    
    # Check if username already exists
    if request.username in users_db:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Create new user
    user_id = max([u["user_id"] for u in users_db.values()]) + 1
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    
    users_db[request.username] = {
        "user_id": user_id,
        "username": request.username,
        "password_hash": password_hash,
        "roles": request.roles,
        "phone_number": request.phone_number,
    }
    
    return {
        "success": True,
        "user_id": user_id,
        "username": request.username,
        "roles": request.roles,
    }


@app.get("/users")
async def list_users():
    """List all users (admin only)"""
    return {
        "users": [
            {
                "user_id": user["user_id"],
                "username": username,
                "roles": user["roles"],
                "phone_number": user["phone_number"],
            }
            for username, user in users_db.items()
        ],
        "count": len(users_db),
    }


@app.get("/users/{username}")
async def get_user(username: str):
    """Get user details"""
    if username not in users_db:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = users_db[username]
    
    return {
        "user_id": user["user_id"],
        "username": username,
        "roles": user["roles"],
        "phone_number": user["phone_number"],
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8180))
    uvicorn.run(app, host="0.0.0.0", port=port)
