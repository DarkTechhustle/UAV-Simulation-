// Three.js Drone Simulation and API Connectors
const initDashboard = () => {
    // -------------------------------------------------------------------
    // 1. Scene Setup & Camera
    // -------------------------------------------------------------------
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    
    // Create a beautiful skybox/fog effect
    scene.background = new THREE.Color(0x0f111a);
    scene.fog = new THREE.FogExp2(0x0f111a, 0.02);

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // -------------------------------------------------------------------
    // 2. Lighting & Environment Setup (Aesthetics)
    // -------------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // soft white light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);
    
    // Add glowing grid underneath to simulate scanning terrain
    const gridHelper = new THREE.GridHelper(200, 100, 0x00e676, 0x113322);
    gridHelper.position.y = -5;
    scene.add(gridHelper);

    // Add some simple parametric "crops" (cubes)
    const cropGroup = new THREE.Group();
    for(let i=0; i<300; i++) {
        const material = new THREE.MeshPhongMaterial({ 
            color: Math.random() > 0.1 ? 0x2e7d32 : 0x827717, // mostly green, some yellowish
            shininess: 10
        });
        const geometry = new THREE.BoxGeometry(0.5, Math.random() * 1.5 + 0.5, 0.5);
        const crop = new THREE.Mesh(geometry, material);
        crop.position.set(
            (Math.random() - 0.5) * 80,
            gridHelper.position.y + 0.5,
            (Math.random() - 0.5) * 80
        );
        cropGroup.add(crop);
    }
    scene.add(cropGroup);

    // -------------------------------------------------------------------
    // 3. Drone Model Construction (Using Primitives for the Mock)
    // -------------------------------------------------------------------
    const droneGroup = new THREE.Group();
    
    // Body
    const bodyGeo = new THREE.BoxGeometry(2, 0.5, 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    droneGroup.add(body);

    // Glowing core
    const coreGeo = new THREE.SphereGeometry(0.4, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 0.3;
    droneGroup.add(core);

    // Arms & Rotors
    const arms = [
        [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];
    
    const rotors = [];
    
    arms.forEach((pos) => {
        // Arm
        const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.5);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.position.set(pos[0] * 0.8, 0, pos[1] * 0.8);
        arm.rotation.x = Math.PI / 2;
        arm.rotation.z = Math.atan2(pos[1], pos[0]);
        droneGroup.add(arm);

        // Rotor ring
        const ringGeo = new THREE.TorusGeometry(0.4, 0.05, 8, 24);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(pos[0] * 1.4, 0.2, pos[1] * 1.4);
        ring.rotation.x = Math.PI / 2;
        droneGroup.add(ring);

        // Rotor blade (transparent disc to simulate motion)
        const bladeGeo = new THREE.CircleGeometry(0.35, 16);
        const bladeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.set(pos[0] * 1.4, 0.2, pos[1] * 1.4);
        blade.rotation.x = Math.PI / 2;
        rotors.push(blade);
        droneGroup.add(blade);
    });

    scene.add(droneGroup);

    // Drone state
    let droneAlt = 0; // Starts on ground
    const targetAlt = 15.0; // Target flight altitude
    droneGroup.position.set(0, -4.5, 0); // Ground level
    
    // Camera follows drone slightly diagonally behind
    camera.position.set(0, 10, 15);
    camera.lookAt(droneGroup.position);

    // -------------------------------------------------------------------
    // 4. Drone Interaction / Flight Controls (W,A,S,D,Q,E)
    // -------------------------------------------------------------------
    const keys = { w: false, a: false, s: false, d: false, q: false, e: false };
    
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if(keys.hasOwnProperty(key)) keys[key] = true;
    });
    
    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if(keys.hasOwnProperty(key)) keys[key] = false;
    });

    // -------------------------------------------------------------------
    // 5. Animation Loop
    // -------------------------------------------------------------------
    const hudAlt = document.getElementById('hud-alt-val');
    const hudSpd = document.getElementById('hud-spd-val');
    const hudBat = document.getElementById('hud-bat-val');
    let speed = 0;
    const maxSpeed = 0.5;

    function animate() {
        requestAnimationFrame(animate);

        // Spin the rotors fast
        rotors.forEach(r => r.rotation.z += 0.5);

        // Takeoff Sequence (Smooth movement to targetAlt)
        if (droneGroup.position.y < targetAlt) {
            droneGroup.position.y += 0.05;
        }

        // Handle Movement
        speed = 0;
        let moving = false;
        if (keys.w) { droneGroup.position.z -= 0.3; speed = 12.5; moving = true; droneGroup.rotation.x = -0.2; } else { droneGroup.rotation.x = 0; }
        if (keys.s) { droneGroup.position.z += 0.3; speed = 8.5; moving = true; droneGroup.rotation.x = 0.2; }
        if (keys.a) { droneGroup.position.x -= 0.3; speed = 10.5; moving = true; droneGroup.rotation.z = 0.2; } else { droneGroup.rotation.z = 0; }
        if (keys.d) { droneGroup.position.x += 0.3; speed = 10.5; moving = true; droneGroup.rotation.z = -0.2; }
        if (keys.q) { droneGroup.rotation.y += 0.05; }
        if (keys.e) { droneGroup.rotation.y -= 0.05; }

        // Hover effect pseudo-randomly
        if (!moving) {
            droneGroup.position.y += Math.sin(Date.now() * 0.002) * 0.01;
        }

        // Camera smoothly follows drone
        camera.position.x += (droneGroup.position.x - camera.position.x) * 0.1;
        camera.position.z += (droneGroup.position.z + 15 - camera.position.z) * 0.1;
        // Keep camera looking at drone
        camera.lookAt(droneGroup.position);

        // Update HUD
        hudAlt.innerText = (droneGroup.position.y - gridHelper.position.y).toFixed(1);
        hudSpd.innerText = speed.toFixed(1);

        renderer.render(scene, camera);
    }

    animate();

    // Handle Resize
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });


    // ===================================================================
    // REAL-TIME CROP ANALYSIS MODULE
    // ===================================================================

    // DOM Elements
    const cameraFeed = document.getElementById('camera-feed');
    const cameraPlaceholder = document.getElementById('camera-placeholder');
    const scanOverlay = document.getElementById('scan-overlay');
    const liveBadge = document.getElementById('live-badge');
    const frameCounter = document.getElementById('frame-counter');
    const scanToggleBtn = document.getElementById('scan-toggle-btn');
    const uploadFallbackBtn = document.getElementById('upload-fallback-btn');
    const cropImageUpload = document.getElementById('crop-image-upload');
    const detectionStatus = document.getElementById('detection-status');
    
    // Result elements
    const rtPlaceholder = document.getElementById('rt-placeholder');
    const rtDetectionContainer = document.getElementById('rt-detection-container');
    const rtDetection = document.getElementById('rt-detection');
    const rtStatusIcon = document.getElementById('rt-status-icon');
    const rtDiseaseName = document.getElementById('rt-disease-name');
    const rtStatusLabel = document.getElementById('rt-status-label');
    const rtConfidenceValue = document.getElementById('rt-confidence-value');
    const rtConfidenceFill = document.getElementById('rt-confidence-fill');
    const rtRecommendationText = document.getElementById('rt-recommendation-text');
    
    // Metric elements
    const metricScans = document.getElementById('metric-scans');
    const metricAnomalies = document.getElementById('metric-anomalies');
    const metricAvgConf = document.getElementById('metric-avg-conf');
    const healthRingFill = document.getElementById('health-ring-fill');
    const healthRingValue = document.getElementById('health-ring-value');
    
    // History elements
    const historyList = document.getElementById('history-list');
    const historyEmpty = document.getElementById('history-empty');
    const historyCount = document.getElementById('history-count');

    // State
    let isScanning = false;
    let scanInterval = null;
    let cameraStream = null;
    let frameCount = 0;
    let scanResults = [];
    const SCAN_INTERVAL_MS = 2000;
    const MAX_HISTORY_DISPLAY = 12;
    const CIRCUMFERENCE = 2 * Math.PI * 28; // For the health ring SVG (r=28)

    // -------------------------------------------------------------------
    // Camera Management
    // -------------------------------------------------------------------
    async function startCamera() {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            cameraFeed.srcObject = cameraStream;
            cameraFeed.style.display = 'block';
            cameraPlaceholder.style.display = 'none';
            return true;
        } catch (err) {
            console.warn('Camera access denied or unavailable:', err.message);
            // Keep placeholder, user can use manual upload
            cameraPlaceholder.querySelector('.placeholder-label').textContent = 
                'Camera unavailable — use "Upload" to scan images manually.';
            return false;
        }
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        cameraFeed.style.display = 'none';
        cameraFeed.srcObject = null;
        cameraPlaceholder.style.display = 'flex';
        cameraPlaceholder.querySelector('.placeholder-label').textContent = 
            'Click "Start Scanning" to activate drone camera';
    }

    // -------------------------------------------------------------------
    // Frame Capture
    // -------------------------------------------------------------------
    function captureFrame() {
        const canvas = document.createElement('canvas');
        const video = cameraFeed;

        if (video.videoWidth === 0 || video.videoHeight === 0) return null;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
        });
    }

    // -------------------------------------------------------------------
    // API Call
    // -------------------------------------------------------------------
    async function analyzeFrame(imageBlob) {
        const formData = new FormData();
        formData.append('file', imageBlob, 'frame.jpg');

        const response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Server error');
        }

        return await response.json();
    }

    // -------------------------------------------------------------------
    // Result Rendering
    // -------------------------------------------------------------------
    function renderResult(data) {
        const isHealthy = data.status === 'Healthy';
        const statusClass = isHealthy ? 'healthy' : 'warning';

        // Hide placeholder, show results
        rtPlaceholder.style.display = 'none';
        rtDetectionContainer.style.display = 'flex';
        rtDetectionContainer.style.flexDirection = 'column';
        rtDetectionContainer.style.gap = '16px';

        // Trigger re-animation by cloning
        const oldDetection = rtDetection;
        const newDetection = oldDetection.cloneNode(true);
        newDetection.id = 'rt-detection';
        oldDetection.parentNode.replaceChild(newDetection, oldDetection);

        // Update detection card
        newDetection.className = `rt-detection ${statusClass}`;
        
        const icon = newDetection.querySelector('.rt-status-icon');
        icon.className = `rt-status-icon ${statusClass}`;
        icon.textContent = isHealthy ? '✅' : '⚠️';

        const name = newDetection.querySelector('.rt-disease-name');
        name.className = `rt-disease-name ${statusClass}`;
        name.textContent = data.detected_disease;

        const label = newDetection.querySelector('.rt-status-label');
        label.textContent = `Status: ${data.status}`;

        // Confidence bar
        rtConfidenceValue.textContent = `${data.health_score}%`;
        rtConfidenceValue.style.color = isHealthy ? 'var(--accent)' : 'var(--warning)';
        rtConfidenceFill.style.width = `${data.health_score}%`;
        rtConfidenceFill.className = `rt-confidence-fill ${isHealthy ? '' : 'warning'}`;

        // Recommendation
        rtRecommendationText.textContent = data.recommendation;

        // Status label
        detectionStatus.textContent = isHealthy ? '🟢 Healthy' : '🔴 Alert';
    }

    function updateMetrics() {
        const totalScans = scanResults.length;
        const anomalies = scanResults.filter(r => r.status === 'Needs Attention').length;
        const avgConf = totalScans > 0 
            ? (scanResults.reduce((sum, r) => sum + r.health_score, 0) / totalScans).toFixed(1)
            : '—';

        // Get latest health score for ring
        const latestHealth = totalScans > 0 ? scanResults[totalScans - 1].health_score : 0;
        const isLatestHealthy = totalScans > 0 ? scanResults[totalScans - 1].status === 'Healthy' : true;

        // Animate counters
        metricScans.textContent = totalScans;
        metricAnomalies.textContent = anomalies;
        metricAvgConf.textContent = avgConf === '—' ? '—' : `${avgConf}%`;

        // Health ring
        const offset = CIRCUMFERENCE - (latestHealth / 100) * CIRCUMFERENCE;
        healthRingFill.style.strokeDashoffset = offset;
        healthRingFill.className = `health-ring-fill ${isLatestHealthy ? '' : 'warning'}`;
        healthRingValue.textContent = totalScans > 0 ? `${Math.round(latestHealth)}%` : '—';
        healthRingValue.style.color = isLatestHealthy ? 'var(--accent)' : 'var(--warning)';
    }

    function addHistoryEntry(data) {
        if (historyEmpty) historyEmpty.style.display = 'none';

        const isHealthy = data.status === 'Healthy';
        const time = new Date(data.timestamp * 1000).toLocaleTimeString();

        const entry = document.createElement('div');
        entry.className = `history-item ${isHealthy ? '' : 'warning'}`;
        entry.innerHTML = `
            <span class="history-dot"></span>
            <span class="history-disease">${data.detected_disease}</span>
            <span class="history-confidence">${data.health_score}%</span>
            <span class="history-time">${time}</span>
        `;

        // Prepend (newest first)
        historyList.insertBefore(entry, historyList.firstChild);

        // Limit displayed entries
        const items = historyList.querySelectorAll('.history-item');
        if (items.length > MAX_HISTORY_DISPLAY) {
            items[items.length - 1].remove();
        }

        historyCount.textContent = `${scanResults.length} scans`;
    }

    // -------------------------------------------------------------------
    // Scan Loop
    // -------------------------------------------------------------------
    async function performScan() {
        try {
            frameCount++;
            frameCounter.textContent = `Frame: ${frameCount}`;

            let imageBlob;

            // If camera is active, capture a frame
            if (cameraStream && cameraFeed.videoWidth > 0) {
                imageBlob = await captureFrame();
            }

            if (!imageBlob) {
                // If no camera is available, create a synthetic colored image for demo
                imageBlob = await createSyntheticFrame();
            }

            const result = await analyzeFrame(imageBlob);

            scanResults.push(result);
            renderResult(result);
            updateMetrics();
            addHistoryEntry(result);

        } catch (err) {
            console.error('Scan error:', err);
            detectionStatus.textContent = '❌ Error';
        }
    }

    // Create a synthetic image when no camera is available (for demo purposes)
    function createSyntheticFrame() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Generate a random green/brown-ish pattern simulating crop fields
        for (let y = 0; y < 128; y += 4) {
            for (let x = 0; x < 128; x += 4) {
                const isGreen = Math.random() > 0.2;
                const r = isGreen ? Math.floor(Math.random() * 60 + 20) : Math.floor(Math.random() * 80 + 100);
                const g = isGreen ? Math.floor(Math.random() * 100 + 100) : Math.floor(Math.random() * 60 + 60);
                const b = isGreen ? Math.floor(Math.random() * 30 + 10) : Math.floor(Math.random() * 20 + 10);
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x, y, 4, 4);
            }
        }

        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
        });
    }

    // -------------------------------------------------------------------
    // Scan Toggle
    // -------------------------------------------------------------------
    async function startScanning() {
        isScanning = true;

        // Try to start camera
        const cameraOk = await startCamera();

        // Update UI
        scanToggleBtn.className = 'btn-scan-toggle btn-scan-stop';
        scanToggleBtn.innerHTML = '⏹ Stop Scanning';
        
        liveBadge.className = 'live-badge active';
        liveBadge.innerHTML = '<span class="live-dot"></span> LIVE';
        
        scanOverlay.classList.add('active');
        detectionStatus.textContent = 'Scanning...';

        if (!cameraOk) {
            liveBadge.innerHTML = '<span class="live-dot"></span> DEMO';
        }

        // Start the scan loop
        await performScan(); // Immediately perform first scan
        scanInterval = setInterval(performScan, SCAN_INTERVAL_MS);
    }

    function stopScanning() {
        isScanning = false;

        // Stop interval
        if (scanInterval) {
            clearInterval(scanInterval);
            scanInterval = null;
        }

        // Stop camera
        stopCamera();

        // Update UI
        scanToggleBtn.className = 'btn-scan-toggle btn-scan-start';
        scanToggleBtn.innerHTML = '▶ Start Scanning';
        
        liveBadge.className = 'live-badge';
        liveBadge.innerHTML = '<span class="live-dot"></span> OFFLINE';
        
        scanOverlay.classList.remove('active');
        detectionStatus.textContent = 'Paused';
    }

    // Toggle button handler
    scanToggleBtn.addEventListener('click', () => {
        if (isScanning) {
            stopScanning();
        } else {
            startScanning();
        }
    });

    // -------------------------------------------------------------------
    // Manual Upload Fallback
    // -------------------------------------------------------------------
    uploadFallbackBtn.addEventListener('click', () => {
        cropImageUpload.click();
    });

    cropImageUpload.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        detectionStatus.textContent = 'Analyzing upload...';
        
        try {
            const result = await analyzeFrame(file);
            frameCount++;
            frameCounter.textContent = `Frame: ${frameCount}`;
            scanResults.push(result);
            renderResult(result);
            updateMetrics();
            addHistoryEntry(result);
        } catch (err) {
            console.error('Upload analysis error:', err);
            detectionStatus.textContent = '❌ Upload failed';
        }

        // Reset file input
        cropImageUpload.value = '';
    });

    // -------------------------------------------------------------------
    // 8. Navigation Handling
    // -------------------------------------------------------------------
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');
    const viewTitle = document.getElementById('view-title');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active from all nav items
            navItems.forEach(nav => nav.classList.remove('active'));
            // Add active to clicked item
            item.classList.add('active');

            // Hide all views
            viewSections.forEach(view => {
                view.classList.remove('active');
                view.classList.add('hidden');
            });

            // Show target view
            const targetId = item.getAttribute('data-target');
            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.classList.add('active');
            }
            
            // Update Title
            if (targetId === "dashboard-view") viewTitle.innerText = "Live Flight Simulation";
            if (targetId === "analysis-view") viewTitle.innerText = "Crop Analysis Module";
            if (targetId === "telemetry-view") viewTitle.innerText = "Live Drone Telemetry";
            if (targetId === "settings-view") viewTitle.innerText = "System Preferences";
        });
    });

};

// Initialize once page is loaded
window.onload = initDashboard;
