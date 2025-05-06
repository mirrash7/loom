// Populate camera dropdown
navigator.mediaDevices.enumerateDevices().then((devices) => {
  const cameraSelect = document.getElementById("cameraSelect");
  devices.forEach((device) => {
    if (device.kind === "videoinput") {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${cameraSelect.length + 1}`;
      cameraSelect.appendChild(option);
    }
  });
});

document.getElementById("startVideo").addEventListener("click", () => {
  const cameraId = document.getElementById("cameraSelect").value;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId, {
      action: "startVideo",
      cameraId: cameraId,
    });
  });
});

document.getElementById("stopVideo").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId, { action: "stopVideo" });
  });
});

document.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('toggleMotionControl');
  
  // Check current state from storage
  chrome.storage.local.get(['motionControlEnabled'], function(result) {
    toggleButton.checked = result.motionControlEnabled || false;
  });
  
  // Toggle motion control
  toggleButton.addEventListener('change', function() {
    const isEnabled = toggleButton.checked;
    
    // Save state to storage
    chrome.storage.local.set({motionControlEnabled: isEnabled});
    
    // Send message to content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'toggleMotionControl',
        enabled: isEnabled
      });
    });
  });
});
