(function() {
  let video;
  let model;
  let isRunning = false;
  let canvas;
  let ctx;
  let lastRightWristPos = { x: 0, y: 0 };
  let pseudoCursor;
  let leftWristLowered = true; // Start with wrist assumed to be in lowered position
  
  // Listen for stop message from content script
  window.addEventListener('message', (event) => {
    if (event.data.action === 'stopMotionControl') {
      stopTracking();
    }
  });
  
  async function initMotionControl() {
    // Create video element for webcam
    video = document.createElement('video');
    video.style.display = 'none'; // Keep hidden but use as source
    video.width = 320;
    video.height = 240;
    document.body.appendChild(video);
    
    // Remove the separate display video element
    
    // Create canvas for combined video and skeleton visualization
    canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    canvas.style.position = 'fixed';
    canvas.style.bottom = '10px';
    canvas.style.left = '10px';
    canvas.style.zIndex = '9999999';
    canvas.style.border = '2px solid white';
    canvas.style.backgroundColor = 'rgba(0,0,0,0.7)';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    
    // Create pseudo cursor element
    pseudoCursor = document.createElement('div');
    pseudoCursor.style.position = 'fixed';
    pseudoCursor.style.width = '20px';
    pseudoCursor.style.height = '20px';
    pseudoCursor.style.borderRadius = '50%';
    pseudoCursor.style.backgroundColor = 'rgba(0, 100, 255, 0.7)';
    pseudoCursor.style.border = '2px solid white';
    pseudoCursor.style.zIndex = '10000000';
    pseudoCursor.style.pointerEvents = 'none'; // Make sure it doesn't interfere with clicks
    pseudoCursor.style.transform = 'translate(-50%, -50%)'; // Center the cursor
    pseudoCursor.style.boxShadow = '0 0 10px rgba(0, 100, 255, 0.7)';
    document.body.appendChild(pseudoCursor);
    
    try {
      // Load TensorFlow.js and PoseNet model
      await loadTensorFlow();
      model = await loadPoseNetModel();
      
      // Start webcam
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 }
      });
      
      video.srcObject = stream;
      
      video.onloadedmetadata = () => {
        video.play();
        isRunning = true;
        detectPoses();
      };
      
    } catch (error) {
      console.error('Error initializing motion control:', error);
      const overlay = document.getElementById('motion-control-overlay');
      if (overlay) {
        overlay.innerHTML = 'Error: ' + error.message;
      }
    }
  }
  
  async function loadTensorFlow() {
    return new Promise((resolve, reject) => {
      // First load TensorFlow.js
      const tfScript = document.createElement('script');
      tfScript.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs';
      tfScript.onload = () => {
        console.log('TensorFlow.js loaded');
        // Add a small delay to ensure TF is fully initialized
        setTimeout(resolve, 500);
      };
      tfScript.onerror = reject;
      document.head.appendChild(tfScript);
    });
  }
  
  async function loadPoseNetModel() {
    // Use MoveNet instead of PoseNet - it's faster and more reliable
    const model = await tf.loadGraphModel(
      'https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4',
      { fromTFHub: true }
    );
    console.log('MoveNet model loaded');
    return model;
  }
  
  async function detectPoses() {
    if (!isRunning) return;
    
    try {
      // Make sure video is playing
      if (video.paused || video.ended) {
        video.play();
      }
      
      // MoveNet requires a specific input format
      const imageTensor = tf.browser.fromPixels(video);
      const input = tf.image.resizeBilinear(imageTensor, [192, 192]);
      const expanded = input.expandDims(0);
      const casted = expanded.cast('int32');
      
      // Get pose prediction - MoveNet expects input as int32
      const result = model.execute({'input': casted});
      
      // MoveNet returns a tensor with shape [1, 1, 17, 3]
      const poses = await result.array();
      
      // Clean up tensors
      imageTensor.dispose();
      input.dispose();
      expanded.dispose();
      casted.dispose();
      result.dispose();
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw video frame on canvas first
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1); // Mirror the video horizontally
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      
      // Add semi-transparent overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Process pose and draw skeleton
      if (poses && poses.length > 0 && poses[0].length > 0) {
        const keypoints = convertMoveNetToKeypoints(poses[0][0]);
        
        // Mirror the x-coordinate to match the mirrored video display
        keypoints.forEach(keypoint => {
          keypoint.position.x = canvas.width - keypoint.position.x;
        });
        
        processPose(keypoints);
        drawSkeleton(keypoints);
        
        // Debug info
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText('Pose detected!', 10, 60);
      } else {
        ctx.fillStyle = 'red';
        ctx.font = '16px Arial';
        ctx.fillText('No pose detected', 10, 120);
      }
      
      // Continue detection loop
      requestAnimationFrame(detectPoses);
    } catch (error) {
      console.error('Error detecting pose:', error);
      ctx.fillStyle = 'red';
      ctx.font = '16px Arial';
      ctx.fillText('Error: ' + error.message, 10, 120);
      
      // Try to continue despite error
      setTimeout(() => requestAnimationFrame(detectPoses), 1000);
    }
  }
  
  // Convert MoveNet output format to keypoints format
  function convertMoveNetToKeypoints(posenetOutput) {
    const keypointNames = [
      'nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar',
      'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
      'leftWrist', 'rightWrist', 'leftHip', 'rightHip',
      'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'
    ];
    
    const keypoints = [];
    
    // MoveNet returns keypoints in [y, x, score] format
    for (let i = 0; i < keypointNames.length; i++) {
      const y = posenetOutput[i][0] * canvas.height;
      const x = posenetOutput[i][1] * canvas.width;
      const score = posenetOutput[i][2];
      
      keypoints.push({
        part: keypointNames[i],
        position: { x, y },
        score: score
      });
    }
    
    return keypoints;
  }
  
  function processPose(keypoints) {
    // Get the correct anatomical wrists (not mirrored)
    const leftWrist = findKeypoint(keypoints, 'leftWrist');
    const rightWrist = findKeypoint(keypoints, 'rightWrist');
    const leftShoulder = findKeypoint(keypoints, 'leftShoulder');
    const rightShoulder = findKeypoint(keypoints, 'rightShoulder');
    const nose = findKeypoint(keypoints, 'nose');
    
    // Update overlay with position info
    const overlay = document.getElementById('motion-control-overlay');
    if (overlay) {
      overlay.innerHTML = 'Motion Control Active';
    }
    
    // RIGHT wrist controls cursor movement (user's right hand)
    if (rightWrist && rightWrist.score > 0.2) {
      // Scale wrist position to screen coordinates
      const screenX = (rightWrist.position.x / canvas.width) * window.innerWidth;
      const screenY = (rightWrist.position.y / canvas.height) * window.innerHeight;
      
      // Smooth movement by averaging with last position
      const smoothX = (screenX + lastRightWristPos.x) / 2;
      const smoothY = (screenY + lastRightWristPos.y) / 2;
      
      // Move cursor
      moveMouse(smoothX, smoothY);
      
      // Update last position
      lastRightWristPos = { x: screenX, y: screenY };
    }
    
    // LEFT wrist position for click detection
    if (leftWrist && leftShoulder && nose && 
        leftWrist.score > 0.2 && leftShoulder.score > 0.2 && nose.score > 0.2) {
      
      // Check if wrist is above nose (trigger click)
      if (leftWristLowered && leftWrist.position.y < nose.position.y) {
        simulateMouseClick();
        leftWristLowered = false; // Mark that wrist is raised
        
        // Add visual feedback for the state
        ctx.fillStyle = 'yellow';
        ctx.font = '14px Arial';
        ctx.fillText('Click triggered! Lower wrist to reset', 10, 80);
      }
      
      // Check if wrist is below shoulder (reset)
      if (!leftWristLowered && leftWrist.position.y > leftShoulder.position.y) {
        leftWristLowered = true; // Mark that wrist is lowered again
        
        // Add visual feedback for the state
        ctx.fillStyle = 'lightgreen';
        ctx.font = '14px Arial';
        ctx.fillText('Ready for next click', 10, 80);
      }
      
      // Add visual feedback about current state
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText(`Wrist ready: ${leftWristLowered ? 'YES' : 'NO'}`, 10, 120);
    }
  }
  
  function findKeypoint(keypoints, name) {
    return keypoints.find(keypoint => keypoint.part === name);
  }
  
  function moveMouse(x, y) {
    // Update the pseudo cursor position instead of dispatching mouse events
    if (pseudoCursor) {
      pseudoCursor.style.left = x + 'px';
      pseudoCursor.style.top = y + 'px';
      
      // Store the current position for click events
      lastRightWristPos = { x, y };
      
      // Check if cursor is over a clickable element and change color
      const element = document.elementFromPoint(x, y);
      if (element) {
        // Check if this element or its parents are clickable
        let isClickable = false;
        let currentElement = element;
        let depth = 0;
        const maxDepth = 3;
        
        while (currentElement && depth < maxDepth) {
          const tagName = currentElement.tagName.toLowerCase();
          if (tagName === 'a' || tagName === 'button' || 
              tagName === 'input' || tagName === 'select' || 
              tagName === 'textarea' || currentElement.onclick ||
              getComputedStyle(currentElement).cursor === 'pointer') {
            isClickable = true;
            break;
          }
          currentElement = currentElement.parentElement;
          depth++;
        }
        
        // Change cursor color based on whether it's over a clickable element
        if (isClickable) {
          pseudoCursor.style.backgroundColor = 'rgba(0, 255, 0, 0.7)'; // Green for clickable
          pseudoCursor.style.boxShadow = '0 0 10px rgba(0, 255, 0, 0.7)';
        } else {
          pseudoCursor.style.backgroundColor = 'rgba(0, 100, 255, 0.7)'; // Blue for non-clickable
          pseudoCursor.style.boxShadow = '0 0 10px rgba(0, 100, 255, 0.7)';
        }
      }
    }
  }
  
  function simulateMouseClick() {
    // Prevent rapid clicking by checking time since last click
    if (simulateMouseClick.lastClickTime && (Date.now() - simulateMouseClick.lastClickTime < 1000)) {
      return;
    }
    
    simulateMouseClick.lastClickTime = Date.now();
    
    // Find the element under the pseudo cursor
    const element = document.elementFromPoint(lastRightWristPos.x, lastRightWristPos.y);
    
    if (element) {
      console.log('Clicking on element:', element);
      
      // Visual feedback for the click
      const clickIndicator = document.createElement('div');
      clickIndicator.style.position = 'fixed';
      clickIndicator.style.left = (lastRightWristPos.x - 25) + 'px';
      clickIndicator.style.top = (lastRightWristPos.y - 25) + 'px';
      clickIndicator.style.width = '50px';
      clickIndicator.style.height = '50px';
      clickIndicator.style.borderRadius = '50%';
      clickIndicator.style.backgroundColor = 'rgba(255, 255, 0, 0.5)';
      clickIndicator.style.zIndex = '9999998';
      clickIndicator.style.pointerEvents = 'none';
      clickIndicator.style.animation = 'clickPulse 0.5s ease-out';
      document.body.appendChild(clickIndicator);
      
      // Add animation style if it doesn't exist
      if (!document.getElementById('clickAnimationStyle')) {
        const style = document.createElement('style');
        style.id = 'clickAnimationStyle';
        style.textContent = `
          @keyframes clickPulse {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(2); opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }
      
      // Remove the indicator after animation completes
      setTimeout(() => {
        clickIndicator.remove();
      }, 500);
      
      // Try multiple click approaches
      
      // 1. Direct click
      element.click();
      
      // 2. Try to find clickable parent if this element doesn't respond
      let currentElement = element;
      let depth = 0;
      const maxDepth = 3; // Don't go too far up the tree
      
      while (currentElement && depth < maxDepth) {
        // Check if this is a common clickable element
        const tagName = currentElement.tagName.toLowerCase();
        if (tagName === 'a' || tagName === 'button' || 
            tagName === 'input' || tagName === 'select' || 
            tagName === 'textarea' || currentElement.onclick) {
          console.log('Found clickable parent:', currentElement);
          currentElement.click();
          break;
        }
        
        currentElement = currentElement.parentElement;
        depth++;
      }
      
      // 3. Create and dispatch more realistic events with all possible event types
      const eventOptions = {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: lastRightWristPos.x,
        clientY: lastRightWristPos.y,
        screenX: lastRightWristPos.x,
        screenY: lastRightWristPos.y,
        button: 0,
        buttons: 1
      };
      
      // Try dispatching events to document, element, and window
      const targets = [element, document, window];
      
      targets.forEach(target => {
        // Mouse events sequence
        target.dispatchEvent(new MouseEvent('mousedown', eventOptions));
        target.dispatchEvent(new MouseEvent('mouseup', eventOptions));
        target.dispatchEvent(new MouseEvent('click', eventOptions));
        
        // Additional events that games might listen for
        target.dispatchEvent(new MouseEvent('pointerdown', eventOptions));
        target.dispatchEvent(new MouseEvent('pointerup', eventOptions));
        target.dispatchEvent(new MouseEvent('pointermove', eventOptions));
        
        // Touch events for touch-enabled games
        const touchEventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          touches: [{ 
            identifier: Date.now(),
            target: element,
            clientX: lastRightWristPos.x,
            clientY: lastRightWristPos.y,
            screenX: lastRightWristPos.x,
            screenY: lastRightWristPos.y,
            pageX: lastRightWristPos.x,
            pageY: lastRightWristPos.y
          }],
          targetTouches: [{ 
            identifier: Date.now(),
            target: element,
            clientX: lastRightWristPos.x,
            clientY: lastRightWristPos.y,
            screenX: lastRightWristPos.x,
            screenY: lastRightWristPos.y,
            pageX: lastRightWristPos.x,
            pageY: lastRightWristPos.y
          }],
          changedTouches: [{ 
            identifier: Date.now(),
            target: element,
            clientX: lastRightWristPos.x,
            clientY: lastRightWristPos.y,
            screenX: lastRightWristPos.x,
            screenY: lastRightWristPos.y,
            pageX: lastRightWristPos.x,
            pageY: lastRightWristPos.y
          }]
        };
        
        try {
          target.dispatchEvent(new TouchEvent('touchstart', touchEventInit));
          target.dispatchEvent(new TouchEvent('touchend', touchEventInit));
        } catch (e) {
          // TouchEvent might not be supported in all browsers
          console.log('Touch events not supported');
        }
      });
      
      // 4. For canvas games, try to directly trigger events on the canvas element
      if (element.tagName.toLowerCase() === 'canvas') {
        console.log('Canvas element detected, using special handling');
        // Some games use custom event listeners on canvas
        const canvasEvents = ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'];
        canvasEvents.forEach(eventType => {
          element.dispatchEvent(new MouseEvent(eventType, eventOptions));
        });
      }
    }
  }
  
  function drawSkeleton(keypoints) {
    if (!keypoints || keypoints.length === 0) {
      return;
    }
    
    // Draw keypoints with larger circles
    keypoints.forEach(keypoint => {
      if (keypoint.score > 0.2) { // Lower threshold to see more points
        ctx.beginPath();
        ctx.arc(keypoint.position.x, keypoint.position.y, 8, 0, 2 * Math.PI); // Larger circles
        
        // Highlight important points (wrists) in different colors
        if (keypoint.part === 'leftWrist') {
          ctx.fillStyle = 'blue';
        } else if (keypoint.part === 'rightWrist') {
          ctx.fillStyle = 'green';
        } else {
          ctx.fillStyle = 'red';
        }
        
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'white';
        ctx.stroke();
        
        // In the drawSkeleton function, add special highlighting for the right wrist
        if (keypoint.part === 'rightWrist') {
          // Draw a larger, more visible circle for the right wrist
          ctx.fillStyle = 'green';
          ctx.beginPath();
          ctx.arc(keypoint.position.x, keypoint.position.y, 12, 0, 2 * Math.PI);
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'yellow';
          ctx.stroke();
          
          // Add text showing the screen coordinates
          ctx.fillStyle = 'white';
          ctx.font = '12px Arial';
          const screenX = (keypoint.position.x / canvas.width) * window.innerWidth;
          const screenY = (keypoint.position.y / canvas.height) * window.innerHeight;
          ctx.fillText(`X: ${Math.round(screenX)}, Y: ${Math.round(screenY)}`, 10, 100);
        }
      }
    });
    
    // Define skeleton connections using indices
    const connections = [
      [0, 1], [0, 2], // Nose to eyes
      [1, 3], [2, 4], // Eyes to ears
      [5, 6], // Connect shoulders
      [5, 7], [7, 9], // Left shoulder to elbow to wrist
      [6, 8], [8, 10], // Right shoulder to elbow to wrist
      [5, 11], [6, 12], // Shoulders to hips
      [11, 12], // Connect hips
      [11, 13], [13, 15], // Left hip to knee to ankle
      [12, 14], [14, 16] // Right hip to knee to ankle
    ];
    
    // Draw skeleton connections
    connections.forEach(([idxA, idxB]) => {
      const pointA = keypoints[idxA];
      const pointB = keypoints[idxB];
      
      if (pointA && pointB && pointA.score > 0.2 && pointB.score > 0.2) {
        ctx.beginPath();
        ctx.moveTo(pointA.position.x, pointA.position.y);
        ctx.lineTo(pointB.position.x, pointB.position.y);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'white';
        ctx.stroke();
      }
    });
    
    // Add instructions
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.fillText('Right wrist: Move mouse', 10, 20);
    ctx.fillText('Left wrist above head: Click', 10, 40);
  }
  
  function stopTracking() {
    isRunning = false;
    
    if (video && video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      video.remove();
    }
    
    if (canvas) {
      canvas.remove();
    }
    
    if (pseudoCursor) {
      pseudoCursor.remove();
    }
  }
  
  // Start motion control
  initMotionControl();
})(); 