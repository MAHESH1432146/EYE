// Thin wrapper over WebGazer. Video never leaves the browser; only gaze coordinates, blinks and face-status are used.
const LOST_GRACE_MS = 400; // shorter detector drop-outs are not counted as the face being lost

export class GazeTracker {
  constructor() {
    this.wg = null;
    this.listeners = new Set();
    this.blinkListeners = new Set();
    this.statusListeners = new Set();
    this.last = null;
    this.faceVisible = false;
    this.lostSince = null;
    this.lostTotal = 0;
    this.earHistory = [];
    this.lastRatio = null;
    this.closedSince = null;
    this.statusTimer = null;
    this.screenSize = null; // viewport size during fullscreen calibration; gaze is normalised to it
    this.display = null;
  }

  async start() {
    // Explicit permission probe gives a clear error before WebGazer starts.
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera access');
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch {
      throw new Error('Camera permission was denied or no camera was found');
    }

    const { default: webgazer } = await import('webgazer');
    this.wg = webgazer;
    // Default path is page-relative and 404s on nested routes; assets are copied to public/.
    webgazer.params.faceMeshSolutionPath = '/mediapipe/face_mesh';
    webgazer.saveDataAcrossSessions(false);
    webgazer.setRegression('ridge');
    webgazer.applyKalmanFilter(true);
    webgazer.showVideoPreview(true).showPredictionPoints(false);
    webgazer.setGazeListener((data) => this.#onFrame(data));
    await webgazer.begin();
webgazer.setVideoViewerSize(200, 150);

// Enable dragging after WebGazer creates its preview.
requestAnimationFrame(() => {
  this.#makePreviewDraggable();
}); // small live preview, positioned by CSS
    this.statusTimer = setInterval(() => this.#checkLost(), 200);
    // A camera that is unplugged or taken by another app must be reported, not silently treated as "no gaze".
    const camTrack = document.getElementById('webgazerVideoFeed')?.srcObject?.getVideoTracks?.()[0];
    camTrack?.addEventListener('ended', () => this.statusListeners.forEach((fn) => fn({ faceDetected: false, cameraError: true })));
    return this;
  }

  // Makes the WebGazer camera preview draggable.
  #makePreviewDraggable() {
    const container = document.getElementById('webgazerVideoContainer');
    if (!container || container.dataset.draggable === 'true') return;

    container.dataset.draggable = 'true';

    // Override fixed bottom/right positioning with movable coordinates.
    const rect = container.getBoundingClientRect();
    container.style.setProperty('left', `${rect.left}px`, 'important');
    container.style.setProperty('top', `${rect.top}px`, 'important');
    container.style.setProperty('right', 'auto', 'important');
    container.style.setProperty('bottom', 'auto', 'important');
    container.style.setProperty('position', 'fixed', 'important');
    container.style.setProperty('cursor', 'grab');

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const startDrag = (e) => {
      if (e.button !== undefined && e.button !== 0) return;

      dragging = true;
      const point = e.touches ? e.touches[0] : e;

      const bounds = container.getBoundingClientRect();
      startX = point.clientX;
      startY = point.clientY;
      startLeft = bounds.left;
      startTop = bounds.top;

      container.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const moveDrag = (e) => {
      if (!dragging) return;

      const point = e.touches ? e.touches[0] : e;
      const maxLeft = window.innerWidth - container.offsetWidth;
      const maxTop = window.innerHeight - container.offsetHeight;

      const left = Math.max(0, Math.min(maxLeft, startLeft + point.clientX - startX));
      const top = Math.max(0, Math.min(maxTop, startTop + point.clientY - startY));

      container.style.left = `${left}px`;
      container.style.top = `${top}px`;

      e.preventDefault();
    };

    const stopDrag = () => {
      dragging = false;
      container.style.cursor = 'grab';
    };

    container.addEventListener('mousedown', startDrag);
    container.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
  }

  // Called once per video frame; data is null when no face/eyes were found in that frame.
  #onFrame(data) {
    const now = performance.now();
    if (!data) {
      // A fully closed eye has zero patch height, so WebGazer emits no frame at all; that gap is the blink signal.
      if (this.closedSince === null && this.lastRatio !== null && this.earHistory.length >= 30 && this.lastRatio < this.#baseline() * 0.85) this.closedSince = now;
      return;
    }
    this.last = { x: data.x, y: data.y, t: now };
    if (!this.faceVisible) this.#setVisible(true, now);
    this.lostSince = null;
    this.#detectBlink(data.eyeFeatures, now);
    this.listeners.forEach((fn) => fn(this.last));
  }

  #checkLost() {
    const now = performance.now();
    if (!this.last || now - this.last.t < LOST_GRACE_MS) return;
    if (this.lostSince === null) this.lostSince = this.last.t;
    if (this.faceVisible) this.#setVisible(false, now);
  }

  #setVisible(v, now) {
    if (!v && this.lostSince === null) this.lostSince = now;
    if (v && this.lostSince !== null) { this.lostTotal += now - this.lostSince; this.lostSince = null; }
    this.faceVisible = v;
    this.closedSince = null;
    this.statusListeners.forEach((fn) => fn({ faceDetected: v }));
  }

  #baseline() {
    const sorted = [...this.earHistory].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.8)];
  }

  // Eye-openness ratio = eye-patch height / width averaged over both eyes (from the face-mesh eyelid landmarks).
  // A blink is a dip below 70% of the participant's open-eye baseline lasting 50-600 ms.
  #detectBlink(f, now) {
    if (!f?.left?.width || !f?.right?.width) return;
    const ratio = (f.left.height / f.left.width + f.right.height / f.right.width) / 2;
    this.lastRatio = ratio;
    this.earHistory.push(ratio);
    if (this.earHistory.length > 150) this.earHistory.shift();
    if (this.earHistory.length < 30) return;
    const baseline = this.#baseline();
    const closed = ratio < baseline * 0.75;
    if (closed && this.closedSince === null) this.closedSince = now;
    if (!closed && this.closedSince !== null) {
      const d = now - this.closedSince;
      const start = this.closedSince;
      this.closedSince = null;
      if (d >= 50 && d <= 600) this.blinkListeners.forEach((fn) => fn({ start, d }));
    }
  }

  // Cumulative time the face was not detected since the last reset (includes an ongoing loss).
  faceLostMs() {
    return Math.round(this.lostTotal + (this.lostSince !== null ? performance.now() - this.lostSince : 0));
  }

  resetTaskStats() {
    this.lostTotal = 0;
    this.lostSince = this.faceVisible ? null : performance.now();
    this.closedSince = null;
  }

  hidePreview() { this.wg?.showVideoPreview(false); }
  showPreview() { this.wg?.showVideoPreview(true); }

  // Feeds a known on-screen position to the regression model (click-based calibration).
  addCalibrationPoint(x, y) { this.wg?.recordScreenPosition(x, y, 'click'); }

  // Called when fullscreen calibration finishes: predictions are then screen coordinates, so page clicks and
  // mouse moves (which are page coordinates once the window is no longer fullscreen) must stop training the model.
  finishCalibration(width, height, display = null) {
    this.screenSize = { w: width, h: height };
    this.display = display; // desktop app only: the physical display the calibration ran on
    this.wg?.removeMouseEventListeners();
  }

  // Gaze point as a fraction of the calibrated screen (0..1).
  normalise(g) {
    const { w, h } = this.screenSize || { w: window.screen.width, h: window.screen.height };
    return { x: g.x / w, y: g.y / h };
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  subscribeBlinks(fn) { this.blinkListeners.add(fn); return () => this.blinkListeners.delete(fn); }
  subscribeStatus(fn) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }

  stop() {
    clearInterval(this.statusTimer);
    this.listeners.clear();
    this.blinkListeners.clear();
    this.statusListeners.clear();
    try { this.wg?.end(); } catch { /* already stopped */ }
    this.wg = null;
  }
}
