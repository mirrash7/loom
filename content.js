let videoElement = null;
let currentStream = null;

function startVideo(cameraId) {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    videoElement.remove();
    videoElement = null;
  }

  navigator.mediaDevices
    .getUserMedia({ video: { deviceId: cameraId } })
    .then((stream) => {
      currentStream = stream;
      videoElement = document.createElement("video");
      videoElement.style.width = "200px";
      videoElement.style.height = "auto";
      videoElement.style.objectFit = "contain";
      videoElement.style.position = "fixed";
      videoElement.style.bottom = "10px";
      videoElement.style.right = "10px";
      videoElement.style.zIndex = "1000000";
      videoElement.style.transform = "scaleX(-1)";
      videoElement.autoplay = true;
      document.body.appendChild(videoElement);

      // Drag and drop functionality
      let isDragging = false;
      let offsetX, offsetY;
      videoElement.addEventListener("mousedown", (e) => {
        isDragging = true;
        offsetX = e.clientX - videoElement.getBoundingClientRect().left;
        offsetY = e.clientY - videoElement.getBoundingClientRect().top;
      });

      window.addEventListener("mousemove", (e) => {
        if (isDragging) {
          videoElement.style.left = e.clientX - offsetX + "px";
          videoElement.style.top = e.clientY - offsetY + "px";
        }
      });

      window.addEventListener("mouseup", () => {
        isDragging = false;
      });

      videoElement.srcObject = stream;
    })
    .catch((error) => {
      console.error("Error accessing the camera:", error);
    });
}

function stopVideo() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    videoElement.remove();
    videoElement = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startVideo") {
    startVideo(message.cameraId);
  } else if (message.action === "stopVideo") {
    stopVideo();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'toggleMotionControl') {
    if (request.enabled) {
      injectOverlayScript();
    } else {
      removeOverlay();
    }
  }
});

function injectOverlayScript() {
  // Check if already injected
  if (document.getElementById('motion-control-overlay')) {
    return;
  }
  
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'motion-control-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '10px';
  overlay.style.right = '10px';
  overlay.style.zIndex = '9999';
  overlay.style.background = 'rgba(0,0,0,0.5)';
  overlay.style.padding = '5px';
  overlay.style.borderRadius = '5px';
  overlay.style.color = 'white';
  overlay.innerHTML = 'Motion Control Active';
  document.body.appendChild(overlay);
  
  // Inject the motion control script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('overlay.js');
  script.id = 'motion-control-script';
  document.body.appendChild(script);
}

function removeOverlay() {
  const overlay = document.getElementById('motion-control-overlay');
  const script = document.getElementById('motion-control-script');
  
  if (overlay) overlay.remove();
  if (script) script.remove();
  
  // Send message to stop webcam if it's running
  window.postMessage({action: 'stopMotionControl'}, '*');
}

// Looking for any CSS that might be applying a circular crop to the video
