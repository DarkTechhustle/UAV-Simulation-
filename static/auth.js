// ============================================================
// UAV Smart Agriculture — Auth Client
// Handles login → OTP verification → register, particles, etc.
// ============================================================

(function () {
  "use strict";

  // -----------------------------------------------------------
  // 1. Particle Background Animation
  // -----------------------------------------------------------
  const canvas = document.getElementById("particle-canvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let particles = [];
    const PARTICLE_COUNT = 60;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    class Particle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.3 + 0.05;
        this.color = Math.random() > 0.5 ? "0, 230, 118" : "41, 121, 255";
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
        if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
        ctx.fill();
      }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new Particle());
    }

    function connectParticles() {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const opacity = (1 - dist / 150) * 0.08;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    function animateParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      connectParticles();
      requestAnimationFrame(animateParticles);
    }

    animateParticles();
  }

  // -----------------------------------------------------------
  // 2. Section Elements
  // -----------------------------------------------------------
  const loginSection = document.getElementById("login-form-section");
  const otpSection = document.getElementById("otp-form-section");
  const registerSection = document.getElementById("register-form-section");
  const showRegisterBtn = document.getElementById("show-register");
  const showLoginBtn = document.getElementById("show-login");
  const otpBackBtn = document.getElementById("otp-back-btn");

  // -----------------------------------------------------------
  // 3. Section Switching
  // -----------------------------------------------------------
  function showSection(section) {
    [loginSection, otpSection, registerSection].forEach((s) => {
      s.classList.remove("active");
    });
    section.classList.add("active");
    clearAllMessages();
  }

  showRegisterBtn.addEventListener("click", () => showSection(registerSection));
  showLoginBtn.addEventListener("click", () => showSection(loginSection));
  otpBackBtn.addEventListener("click", () => {
    stopCountdown();
    showSection(loginSection);
  });

  // -----------------------------------------------------------
  // 4. Password Visibility Toggle
  // -----------------------------------------------------------
  document.getElementById("login-toggle-pw").addEventListener("click", () => {
    const input = document.getElementById("login-password");
    input.type = input.type === "password" ? "text" : "password";
  });

  document.getElementById("reg-toggle-pw").addEventListener("click", () => {
    const input = document.getElementById("reg-password");
    input.type = input.type === "password" ? "text" : "password";
  });

  // -----------------------------------------------------------
  // 5. Helpers
  // -----------------------------------------------------------
  function clearAllMessages() {
    ["login-error", "register-error", "register-success", "otp-error", "otp-success"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  }

  function showError(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.style.display = "flex";
  }

  function showSuccess(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.style.display = "flex";
  }

  function setLoading(btn, loading) {
    const text = btn.querySelector(".btn-text");
    const spinner = btn.querySelector(".btn-spinner");
    if (loading) {
      text.style.display = "none";
      spinner.style.display = "inline-block";
      btn.disabled = true;
    } else {
      text.style.display = "inline";
      spinner.style.display = "none";
      btn.disabled = false;
    }
  }

  // -----------------------------------------------------------
  // 6. OTP Input Handling (auto-advance, paste, backspace)
  // -----------------------------------------------------------
  const otpDigits = document.querySelectorAll(".otp-digit");
  
  otpDigits.forEach((input, index) => {
    // Only allow single digit
    input.addEventListener("input", (e) => {
      const value = e.target.value.replace(/[^0-9]/g, "");
      e.target.value = value.slice(-1); // Keep only last digit

      if (value && index < otpDigits.length - 1) {
        otpDigits[index + 1].focus();
      }

      // Auto-submit when all 6 digits are filled
      const fullOtp = getOtpValue();
      if (fullOtp.length === 6) {
        document.getElementById("otp-form").dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });

    // Handle backspace to move to previous
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && index > 0) {
        otpDigits[index - 1].focus();
        otpDigits[index - 1].value = "";
      }
    });

    // Handle paste — distribute digits across inputs
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData.getData("text") || "").replace(/[^0-9]/g, "");
      for (let i = 0; i < Math.min(pasted.length, 6); i++) {
        if (otpDigits[i]) {
          otpDigits[i].value = pasted[i];
        }
      }
      // Focus the next empty or last
      const nextEmpty = Array.from(otpDigits).findIndex((d) => !d.value);
      if (nextEmpty >= 0) {
        otpDigits[nextEmpty].focus();
      } else {
        otpDigits[5].focus();
        // Auto-submit
        const fullOtp = getOtpValue();
        if (fullOtp.length === 6) {
          document.getElementById("otp-form").dispatchEvent(new Event("submit", { cancelable: true }));
        }
      }
    });

    // Select content on focus
    input.addEventListener("focus", () => input.select());
  });

  function getOtpValue() {
    return Array.from(otpDigits)
      .map((d) => d.value)
      .join("");
  }

  function clearOtpInputs() {
    otpDigits.forEach((d) => (d.value = ""));
    otpDigits[0].focus();
  }

  // -----------------------------------------------------------
  // 7. OTP Countdown Timer
  // -----------------------------------------------------------
  let countdownInterval = null;
  let countdownSeconds = 0;

  function startCountdown(totalSeconds) {
    stopCountdown();
    countdownSeconds = totalSeconds;
    const countdownEl = document.getElementById("otp-countdown");
    const resendBtn = document.getElementById("otp-resend-btn");
    const timerEl = document.getElementById("otp-timer");

    resendBtn.disabled = true;
    timerEl.style.display = "inline-flex";

    function tick() {
      const mins = Math.floor(countdownSeconds / 60);
      const secs = countdownSeconds % 60;
      countdownEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;

      if (countdownSeconds <= 0) {
        stopCountdown();
        timerEl.style.display = "none";
        resendBtn.disabled = false;
        return;
      }

      // Change color as time runs low
      if (countdownSeconds <= 60) {
        countdownEl.style.color = "#ff6e40";
      } else {
        countdownEl.style.color = "var(--accent)";
      }

      countdownSeconds--;
    }

    tick(); // Immediate first tick
    countdownInterval = setInterval(tick, 1000);
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  // -----------------------------------------------------------
  // 8. Login Handler (Step 1 — Credentials → OTP)
  // -----------------------------------------------------------
  let pendingUsername = "";

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllMessages();

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("login-submit-btn");

    if (!username || !password) {
      showError("login-error", "Please fill in all fields.");
      return;
    }

    setLoading(btn, true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        showError("login-error", data.detail || "Login failed.");
        setLoading(btn, false);
        return;
      }

      // Credentials valid → show OTP step
      pendingUsername = data.username;
      document.getElementById("otp-email-text").textContent = data.masked_email;
      
      showSection(otpSection);
      clearOtpInputs();
      startCountdown(data.expires_in || 300);
      
      setLoading(btn, false);
    } catch (err) {
      showError("login-error", "Network error. Please try again.");
      setLoading(btn, false);
    }
  });

  // -----------------------------------------------------------
  // 9. OTP Verify Handler (Step 2 — OTP → Dashboard)
  // -----------------------------------------------------------
  document.getElementById("otp-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllMessages();

    const otp = getOtpValue();
    const btn = document.getElementById("otp-submit-btn");

    if (otp.length !== 6) {
      showError("otp-error", "Please enter the complete 6-digit code.");
      return;
    }

    setLoading(btn, true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: pendingUsername, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        showError("otp-error", data.detail || "Verification failed.");
        setLoading(btn, false);
        // Shake the OTP inputs on error
        document.getElementById("otp-input-group").classList.add("shake");
        setTimeout(() => {
          document.getElementById("otp-input-group").classList.remove("shake");
        }, 600);
        clearOtpInputs();
        return;
      }

      // OTP verified! Save session and redirect
      stopCountdown();
      showSuccess("otp-success", "✅ Verified! Redirecting...");

      localStorage.setItem("uav_token", data.token);
      localStorage.setItem("uav_user", JSON.stringify(data.user));

      // Brief success display then redirect
      setTimeout(() => {
        window.location.href = "/static/index.html";
      }, 800);
    } catch (err) {
      showError("otp-error", "Network error. Please try again.");
      setLoading(btn, false);
    }
  });

  // -----------------------------------------------------------
  // 10. Resend OTP Handler
  // -----------------------------------------------------------
  document.getElementById("otp-resend-btn").addEventListener("click", async () => {
    clearAllMessages();
    const resendBtn = document.getElementById("otp-resend-btn");
    resendBtn.disabled = true;
    resendBtn.textContent = "Sending...";

    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: pendingUsername }),
      });

      const data = await res.json();

      if (!res.ok) {
        showError("otp-error", data.detail || "Could not resend OTP.");
        resendBtn.textContent = "Resend Code";
        resendBtn.disabled = false;
        return;
      }

      showSuccess("otp-success", "New OTP sent to your email!");
      clearOtpInputs();
      startCountdown(data.expires_in || 300);
      resendBtn.textContent = "Resend Code";

      // Auto-hide success after 3s
      setTimeout(() => {
        document.getElementById("otp-success").style.display = "none";
      }, 3000);
    } catch (err) {
      showError("otp-error", "Network error. Please try again.");
      resendBtn.textContent = "Resend Code";
      resendBtn.disabled = false;
    }
  });

  // -----------------------------------------------------------
  // 11. Register Handler
  // -----------------------------------------------------------
  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllMessages();

    const fullname = document.getElementById("reg-fullname").value.trim();
    const username = document.getElementById("reg-username").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const role = document.getElementById("reg-role").value;
    const btn = document.getElementById("register-submit-btn");

    if (!fullname || !username || !email || !password) {
      showError("register-error", "Please fill in all fields.");
      return;
    }

    if (password.length < 4) {
      showError("register-error", "Password must be at least 4 characters.");
      return;
    }

    setLoading(btn, true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullname, username, email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        showError("register-error", data.detail || "Registration failed.");
        setLoading(btn, false);
        return;
      }

      showSuccess("register-success", "Account created! Redirecting to login...");
      setLoading(btn, false);

      setTimeout(() => {
        showSection(loginSection);
        document.getElementById("login-username").value = username;
        document.getElementById("login-username").focus();
      }, 1500);
    } catch (err) {
      showError("register-error", "Network error. Please try again.");
      setLoading(btn, false);
    }
  });

  // -----------------------------------------------------------
  // 12. Auto-redirect if already logged in
  // -----------------------------------------------------------
  const existingToken = localStorage.getItem("uav_token");
  if (existingToken) {
    fetch("/api/auth/me", {
      headers: { Authorization: "Bearer " + existingToken },
    })
      .then((res) => {
        if (res.ok) {
          window.location.href = "/static/index.html";
        } else {
          localStorage.removeItem("uav_token");
          localStorage.removeItem("uav_user");
        }
      })
      .catch(() => {});
  }
})();
