// Optional screen capture (the browser asks the participant to choose what to share). Only still frames are used.
export class ScreenCapture {
  constructor() {
    this.stream = null;
    this.video = null;
  }

  get active() {
    return !!this.stream?.active;
  }

  async start() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('This browser cannot capture the screen');
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play();
    // The browser's own "stop sharing" button ends the stream.
    this.stream.getVideoTracks()[0].addEventListener('ended', () => { this.stream = null; });
  }

  // Downscaled JPEG still of the shared screen: { image (base64), width, height, dataUrl } or null.
  frame(maxWidth = 960, quality = 0.6) {
    if (!this.active || !this.video?.videoWidth) return null;
    const scale = Math.min(1, maxWidth / this.video.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(this.video.videoWidth * scale);
    c.height = Math.round(this.video.videoHeight * scale);
    c.getContext('2d').drawImage(this.video, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', quality);
    return { image: dataUrl.split(',')[1], width: c.width, height: c.height, dataUrl };
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
  }
}
