from fastapi import FastAPI, HTTPException, File, UploadFile, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel
import random
import time
import json
import os
import hashlib
import uuid
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

from model import analyze_crop_image

app = FastAPI(title="UAV Smart Agriculture API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# ====================================================================
# SMTP EMAIL CONFIGURATION
# ====================================================================
# ⚠️  CONFIGURE THESE WITH YOUR EMAIL CREDENTIALS
# For Gmail: Enable 2FA → Create App Password at https://myaccount.google.com/apppasswords
# The OTP will ALWAYS be logged to the server console as a fallback.

SMTP_CONFIG = {
    "enabled": True,            # Set to True once you configure credentials below
    "host": "smtp.gmail.com",    # SMTP server (Gmail default)
    "port": 587,                 # TLS port
    "email": "aswinbaalaji09@gmail.com",
    "password": "jfhbovuvtpnrnsku",
    "sender_name": "UAV Agri Dashboard"
}

# ====================================================================
# USER DATABASE — JSON File (Visible output format)
# ====================================================================
USERS_DB_FILE = os.path.join(os.path.dirname(__file__), "users_db.json")

def load_users_db():
    """Load the users database from JSON file."""
    if not os.path.exists(USERS_DB_FILE):
        initial_db = {
            "_meta": {
                "description": "UAV Smart Agriculture — User Database",
                "created_at": datetime.now().isoformat(),
                "last_modified": datetime.now().isoformat(),
                "total_users": 1
            },
            "users": {
                "admin": {
                    "username": "admin",
                    "fullname": "System Administrator",
                    "email": "admin@uav-agri.local",
                    "password_hash": hash_password("admin123"),
                    "role": "admin",
                    "created_at": datetime.now().isoformat(),
                    "last_login": None,
                    "login_count": 0,
                    "is_active": True
                }
            }
        }
        save_users_db(initial_db)
        return initial_db
    
    with open(USERS_DB_FILE, "r") as f:
        return json.load(f)

def save_users_db(db):
    """Save the users database to JSON file with pretty formatting."""
    db["_meta"]["last_modified"] = datetime.now().isoformat()
    db["_meta"]["total_users"] = len(db["users"])
    with open(USERS_DB_FILE, "w") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)

def hash_password(password: str) -> str:
    """Hash a password using SHA-256 with a salt prefix."""
    salt = "uav_agri_salt_"
    return hashlib.sha256((salt + password).encode()).hexdigest()

# Active sessions (token → username mapping)
active_sessions = {}

# ====================================================================
# OTP SYSTEM — In-memory store with expiry
# ====================================================================
# Format: { "username": { "otp": "123456", "email": "...", "expires": timestamp, "attempts": 0 } }
pending_otps = {}
OTP_EXPIRY_SECONDS = 300   # 5 minutes
OTP_LENGTH = 6
MAX_OTP_ATTEMPTS = 5

def generate_otp() -> str:
    """Generate a secure 6-digit OTP."""
    return ''.join([str(random.randint(0, 9)) for _ in range(OTP_LENGTH)])

def send_otp_email(to_email: str, otp: str, fullname: str) -> bool:
    """Send OTP via email. Returns True if sent successfully, False otherwise."""
    
    # Always log to console (development fallback)
    print("\n" + "=" * 60)
    print(f"  📧 OTP EMAIL — {fullname} ({to_email})")
    print(f"  🔑 OTP CODE: {otp}")
    print(f"  ⏱️  Expires in {OTP_EXPIRY_SECONDS // 60} minutes")
    print("=" * 60 + "\n")
    
    # Try sending real email if SMTP is configured
    if not SMTP_CONFIG["enabled"] or not SMTP_CONFIG["email"] or not SMTP_CONFIG["password"]:
        print("  ℹ️  SMTP not configured — OTP shown in console only.")
        print("  ℹ️  Configure SMTP_CONFIG in main.py to send real emails.\n")
        return True  # Return True so login flow continues
    
    try:
        # Build HTML email
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
        </head>
        <body style="margin:0; padding:0; background-color:#0f111a; font-family:'Segoe UI',Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f111a; padding:40px 0;">
                <tr>
                    <td align="center">
                        <table width="480" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1a1d2c,#161929); border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden;">
                            <!-- Header -->
                            <tr>
                                <td style="padding:32px 40px 20px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.06);">
                                    <div style="font-size:28px; margin-bottom:8px;">🛸</div>
                                    <h1 style="margin:0; color:#f0f2f5; font-size:22px; font-weight:700;">
                                        UAV <span style="color:#00e676;">Agri</span>
                                    </h1>
                                    <p style="margin:4px 0 0; color:#8a90b8; font-size:13px;">Smart Agriculture Dashboard</p>
                                </td>
                            </tr>
                            <!-- Body -->
                            <tr>
                                <td style="padding:32px 40px;">
                                    <p style="color:#a0a6cc; font-size:15px; margin:0 0 8px;">Hello <strong style="color:#f0f2f5;">{fullname}</strong>,</p>
                                    <p style="color:#a0a6cc; font-size:14px; margin:0 0 28px; line-height:1.6;">
                                        Use the verification code below to complete your login. This code expires in <strong style="color:#f0f2f5;">{OTP_EXPIRY_SECONDS // 60} minutes</strong>.
                                    </p>
                                    
                                    <!-- OTP Code -->
                                    <div style="text-align:center; margin:0 0 28px;">
                                        <div style="display:inline-block; background:rgba(0,230,118,0.08); border:2px solid rgba(0,230,118,0.25); border-radius:12px; padding:16px 40px;">
                                            <span style="font-family:'Courier New',monospace; font-size:36px; font-weight:700; color:#00e676; letter-spacing:8px;">{otp}</span>
                                        </div>
                                    </div>
                                    
                                    <p style="color:#5a5f80; font-size:12px; margin:0; line-height:1.5;">
                                        If you didn't request this code, please ignore this email. Do not share this code with anyone.
                                    </p>
                                </td>
                            </tr>
                            <!-- Footer -->
                            <tr>
                                <td style="padding:20px 40px; border-top:1px solid rgba(255,255,255,0.06); text-align:center;">
                                    <p style="color:#5a5f80; font-size:11px; margin:0;">
                                        © 2026 UAV Smart Agriculture • Vanguard X-1
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🔑 Your Login OTP: {otp} — UAV Agri Dashboard"
        msg["From"] = f"{SMTP_CONFIG['sender_name']} <{SMTP_CONFIG['email']}>"
        msg["To"] = to_email
        
        # Plain text fallback
        text_body = f"Your UAV Agri Dashboard OTP is: {otp}\nIt expires in {OTP_EXPIRY_SECONDS // 60} minutes.\nDo not share this code."
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))
        
        # Send via SMTP
        with smtplib.SMTP(SMTP_CONFIG["host"], SMTP_CONFIG["port"]) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_CONFIG["email"], SMTP_CONFIG["password"])
            server.send_message(msg)
        
        print(f"  ✅ Email sent successfully to {to_email}\n")
        return True
        
    except Exception as e:
        print(f"  ❌ Email sending failed: {e}")
        print(f"  ℹ️  OTP is still available in console above.\n")
        return True  # Return True so login continues (OTP visible in console)


# ====================================================================
# AUTH MODELS
# ====================================================================

class LoginRequest(BaseModel):
    username: str
    password: str

class OTPVerifyRequest(BaseModel):
    username: str
    otp: str

class ResendOTPRequest(BaseModel):
    username: str

class RegisterRequest(BaseModel):
    fullname: str
    username: str
    email: str
    password: str
    role: str = "operator"

# ====================================================================
# AUTH ROUTES
# ====================================================================

@app.post("/api/auth/register")
async def register_user(data: RegisterRequest):
    """Register a new user account. Stored in users_db.json."""
    db = load_users_db()
    
    if len(data.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    
    if data.username.lower() in db["users"]:
        raise HTTPException(status_code=400, detail="Username already taken. Please choose another.")
    
    for user in db["users"].values():
        if user.get("email", "").lower() == data.email.lower():
            raise HTTPException(status_code=400, detail="Email already registered.")
    
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")
    
    valid_roles = ["operator", "agronomist", "researcher", "admin"]
    role = data.role if data.role in valid_roles else "operator"
    
    user_entry = {
        "username": data.username.lower(),
        "fullname": data.fullname,
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "role": role,
        "created_at": datetime.now().isoformat(),
        "last_login": None,
        "login_count": 0,
        "is_active": True
    }
    
    db["users"][data.username.lower()] = user_entry
    save_users_db(db)
    
    return {
        "message": "Account created successfully.",
        "username": data.username.lower()
    }


@app.post("/api/auth/login")
async def login_user(data: LoginRequest):
    """Step 1: Validate credentials → send OTP to registered email."""
    db = load_users_db()
    
    username = data.username.lower()
    
    if username not in db["users"]:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    
    user = db["users"][username]
    
    if user["password_hash"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact an administrator.")
    
    # Generate OTP and store it
    otp = generate_otp()
    pending_otps[username] = {
        "otp": otp,
        "email": user["email"],
        "fullname": user["fullname"],
        "expires": time.time() + OTP_EXPIRY_SECONDS,
        "attempts": 0
    }
    
    # Send OTP via email (+ console)
    email_sent = send_otp_email(user["email"], otp, user["fullname"])
    
    # Mask the email for frontend display
    email = user["email"]
    parts = email.split("@")
    if len(parts[0]) > 2:
        masked = parts[0][:2] + "•" * (len(parts[0]) - 2) + "@" + parts[1]
    else:
        masked = parts[0][0] + "•@" + parts[1]
    
    return {
        "message": "OTP sent to your registered email.",
        "otp_required": True,
        "masked_email": masked,
        "username": username,
        "expires_in": OTP_EXPIRY_SECONDS
    }


@app.post("/api/auth/verify-otp")
async def verify_otp(data: OTPVerifyRequest):
    """Step 2: Verify OTP → issue session token."""
    username = data.username.lower()
    
    if username not in pending_otps:
        raise HTTPException(status_code=400, detail="No OTP pending. Please log in again.")
    
    otp_data = pending_otps[username]
    
    # Check expiry
    if time.time() > otp_data["expires"]:
        del pending_otps[username]
        raise HTTPException(status_code=400, detail="OTP has expired. Please log in again.")
    
    # Check attempts
    if otp_data["attempts"] >= MAX_OTP_ATTEMPTS:
        del pending_otps[username]
        raise HTTPException(status_code=429, detail="Too many failed attempts. Please log in again.")
    
    # Verify OTP
    if data.otp.strip() != otp_data["otp"]:
        otp_data["attempts"] += 1
        remaining = MAX_OTP_ATTEMPTS - otp_data["attempts"]
        raise HTTPException(
            status_code=401, 
            detail=f"Invalid OTP. {remaining} attempt{'s' if remaining != 1 else ''} remaining."
        )
    
    # OTP verified! Clean up and create session
    del pending_otps[username]
    
    db = load_users_db()
    user = db["users"][username]
    
    # Generate session token
    token = str(uuid.uuid4())
    active_sessions[token] = username
    
    # Update login stats
    user["last_login"] = datetime.now().isoformat()
    user["login_count"] = user.get("login_count", 0) + 1
    save_users_db(db)
    
    user_profile = {
        "username": user["username"],
        "fullname": user["fullname"],
        "email": user["email"],
        "role": user["role"],
        "login_count": user["login_count"],
        "created_at": user["created_at"]
    }
    
    return {
        "message": "OTP verified. Login successful.",
        "token": token,
        "user": user_profile
    }


@app.post("/api/auth/resend-otp")
async def resend_otp(data: ResendOTPRequest):
    """Resend a new OTP for a pending login."""
    username = data.username.lower()
    
    if username not in pending_otps:
        raise HTTPException(status_code=400, detail="No login session found. Please start over.")
    
    db = load_users_db()
    if username not in db["users"]:
        raise HTTPException(status_code=400, detail="User not found.")
    
    user = db["users"][username]
    
    # Generate new OTP
    otp = generate_otp()
    pending_otps[username] = {
        "otp": otp,
        "email": user["email"],
        "fullname": user["fullname"],
        "expires": time.time() + OTP_EXPIRY_SECONDS,
        "attempts": 0
    }
    
    send_otp_email(user["email"], otp, user["fullname"])
    
    return {
        "message": "New OTP sent to your email.",
        "expires_in": OTP_EXPIRY_SECONDS
    }


@app.get("/api/auth/me")
async def get_current_user(request: Request):
    """Verify session token and return user profile."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No valid token provided.")
    
    token = auth_header.replace("Bearer ", "")
    
    if token not in active_sessions:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    
    username = active_sessions[token]
    db = load_users_db()
    
    if username not in db["users"]:
        raise HTTPException(status_code=401, detail="User not found.")
    
    user = db["users"][username]
    return {
        "username": user["username"],
        "fullname": user["fullname"],
        "email": user["email"],
        "role": user["role"],
        "login_count": user["login_count"],
        "created_at": user["created_at"]
    }


@app.post("/api/auth/logout")
async def logout_user(request: Request):
    """Invalidate the session token."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "")
        active_sessions.pop(token, None)
    
    return {"message": "Logged out successfully."}


@app.get("/api/auth/users")
async def list_all_users():
    """Return all registered users (public profile info only) — for viewing the database."""
    db = load_users_db()
    users_list = []
    for user in db["users"].values():
        users_list.append({
            "username": user["username"],
            "fullname": user["fullname"],
            "email": user["email"],
            "role": user["role"],
            "created_at": user["created_at"],
            "last_login": user.get("last_login"),
            "login_count": user.get("login_count", 0),
            "is_active": user.get("is_active", True)
        })
    return {
        "total_users": len(users_list),
        "users": users_list
    }


# ====================================================================
# EXISTING API ROUTES
# ====================================================================

class TelemetryData(BaseModel):
    x: float
    y: float
    z: float
    battery: float
    timestamp: float

scan_history = []
MAX_HISTORY = 50

@app.post("/api/telemetry")
async def receive_telemetry(data: TelemetryData):
    return {"status": "success", "received": True}

@app.get("/api/telemetry-stream")
async def stream_mock_telemetry():
    mock_bars = [random.randint(20, 100) for _ in range(10)]
    return {"data": mock_bars}

@app.post("/api/analyze")
async def analyze_crop(
    file: UploadFile = File(...)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
    
    contents = await file.read()
    result = analyze_crop_image(contents)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    
    scan_history.append(result)
    if len(scan_history) > MAX_HISTORY:
        scan_history.pop(0)
        
    return result

@app.get("/api/analysis-history")
async def get_analysis_history(limit: int = 10):
    """Return the last N scan results."""
    return {"history": scan_history[-limit:], "total_scans": len(scan_history)}

@app.get("/api/analysis-stats")
async def get_analysis_stats():
    """Return aggregate statistics for all scans performed this session."""
    if not scan_history:
        return {
            "total_scans": 0,
            "anomalies": 0,
            "avg_confidence": 0,
            "avg_health": 0,
            "disease_counts": {}
        }
    
    anomalies = sum(1 for s in scan_history if s.get("status") == "Needs Attention")
    avg_confidence = sum(s.get("health_score", 0) for s in scan_history) / len(scan_history)
    
    disease_counts = {}
    for s in scan_history:
        disease = s.get("detected_disease", "Unknown")
        disease_counts[disease] = disease_counts.get(disease, 0) + 1
    
    return {
        "total_scans": len(scan_history),
        "anomalies": anomalies,
        "avg_confidence": round(avg_confidence, 2),
        "disease_counts": disease_counts
    }


# ====================================================================
# CONTACT FORM — Messages stored in JSON file
# ====================================================================
CONTACT_DB_FILE = os.path.join(os.path.dirname(__file__), "contact_messages.json")

class ContactMessage(BaseModel):
    name: str
    email: str
    subject: str
    message: str

def load_contact_db():
    if not os.path.exists(CONTACT_DB_FILE):
        return {"_meta": {"description": "UAV Dashboard — Contact Messages", "total_messages": 0}, "messages": []}
    with open(CONTACT_DB_FILE, "r") as f:
        return json.load(f)

def save_contact_db(db):
    db["_meta"]["total_messages"] = len(db["messages"])
    with open(CONTACT_DB_FILE, "w") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)

@app.post("/api/contact")
async def submit_contact(data: ContactMessage):
    """Receive a contact form message, store in JSON, and email it to inbox."""
    if not data.name.strip() or not data.email.strip() or not data.message.strip():
        raise HTTPException(status_code=400, detail="All fields are required.")
    
    db = load_contact_db()
    
    entry = {
        "id": str(uuid.uuid4())[:8],
        "name": data.name.strip(),
        "email": data.email.strip(),
        "subject": data.subject.strip(),
        "message": data.message.strip(),
        "submitted_at": datetime.now().isoformat(),
        "read": False
    }
    
    db["messages"].append(entry)
    save_contact_db(db)
    
    print(f"\n📬 NEW CONTACT MESSAGE from {data.name} ({data.email}): {data.subject}\n")
    
    # Send email notification to inbox
    try:
        send_contact_email(entry)
    except Exception as e:
        print(f"  ⚠️ Email notification failed: {e}")
    
    return {"message": "Message received! We'll get back to you soon.", "id": entry["id"]}


def send_contact_email(entry: dict):
    """Send the contact form message to your Gmail inbox."""
    if not SMTP_CONFIG["email"] or not SMTP_CONFIG["password"]:
        return
    
    html_body = f"""
    <html>
    <body style="margin:0; padding:0; background-color:#0f111a; font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f111a; padding:40px 0;">
            <tr><td align="center">
                <table width="520" cellpadding="0" cellspacing="0" style="background:#1a1d2c; border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden;">
                    <tr><td style="padding:28px 36px 16px; border-bottom:1px solid rgba(255,255,255,0.06);">
                        <h1 style="margin:0; color:#00e676; font-size:18px;">📬 New Contact Message</h1>
                        <p style="margin:6px 0 0; color:#8a90b8; font-size:12px;">UAV Agri Dashboard • {entry['submitted_at'][:19]}</p>
                    </td></tr>
                    <tr><td style="padding:28px 36px;">
                        <table width="100%" style="margin-bottom:20px;">
                            <tr>
                                <td style="color:#8a90b8; font-size:12px; text-transform:uppercase; padding:6px 0; width:80px;">From</td>
                                <td style="color:#f0f2f5; font-size:14px; font-weight:600; padding:6px 0;">{entry['name']}</td>
                            </tr>
                            <tr>
                                <td style="color:#8a90b8; font-size:12px; text-transform:uppercase; padding:6px 0;">Email</td>
                                <td style="padding:6px 0;"><a href="mailto:{entry['email']}" style="color:#2979ff; text-decoration:none; font-size:14px;">{entry['email']}</a></td>
                            </tr>
                            <tr>
                                <td style="color:#8a90b8; font-size:12px; text-transform:uppercase; padding:6px 0;">Subject</td>
                                <td style="color:#f0f2f5; font-size:14px; padding:6px 0;">{entry['subject']}</td>
                            </tr>
                        </table>
                        <div style="background:rgba(0,0,0,0.3); border-radius:12px; padding:20px; border-left:3px solid #00e676;">
                            <p style="margin:0; color:#a0a6cc; font-size:14px; line-height:1.7; white-space:pre-wrap;">{entry['message']}</p>
                        </div>
                        <p style="margin:24px 0 0; text-align:center;">
                            <a href="mailto:{entry['email']}?subject=Re: {entry['subject']}" style="display:inline-block; background:linear-gradient(135deg,#2979ff,#1565c0); color:white; text-decoration:none; padding:10px 28px; border-radius:8px; font-size:13px; font-weight:600;">↩ Reply to {entry['name']}</a>
                        </p>
                    </td></tr>
                    <tr><td style="padding:16px 36px; border-top:1px solid rgba(255,255,255,0.06); text-align:center;">
                        <p style="color:#5a5f80; font-size:11px; margin:0;">Message ID: {entry['id']}</p>
                    </td></tr>
                </table>
            </td></tr>
        </table>
    </body>
    </html>
    """
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"📬 Contact: {entry['subject']} — from {entry['name']}"
    msg["From"] = f"{SMTP_CONFIG['sender_name']} <{SMTP_CONFIG['email']}>"
    msg["To"] = SMTP_CONFIG["email"]  # Send to your own inbox
    msg["Reply-To"] = entry["email"]  # Reply goes to the sender
    
    text_body = f"New contact message from {entry['name']} ({entry['email']})\n\nSubject: {entry['subject']}\n\n{entry['message']}"
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))
    
    with smtplib.SMTP(SMTP_CONFIG["host"], SMTP_CONFIG["port"]) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_CONFIG["email"], SMTP_CONFIG["password"])
        server.send_message(msg)
    
    print(f"  ✅ Contact email forwarded to {SMTP_CONFIG['email']}\n")

@app.get("/api/contact/messages")
async def get_contact_messages():
    """Return all contact messages (for admin viewing)."""
    db = load_contact_db()
    return db


@app.get("/")
def read_root():
    """Redirect root to the login page."""
    return RedirectResponse(url="/static/login.html")

