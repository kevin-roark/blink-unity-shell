#pragma strict

var IDEAL_WIDTH = 640;
var IDEAL_HEIGHT = 480;

var webcamTexture : WebCamTexture;
var currentFrame : Color[];
var lastFrame : Color[];
var firstFrame = true;
var frameCount = 0;

function Start () {
	// start the camera feed
	webcamTexture = WebCamTexture(IDEAL_WIDTH, IDEAL_HEIGHT);
	webcamTexture.Play();
}

function Update () {	
	if (!webcamTexture.didUpdateThisFrame) {
		Debug.Log('webcam did not update this frame');
		return;
	}
		
	frameCount += 1;
	
	currentFrame = webcamTexture.GetPixels();
	
	Debug.Log('Just got the pixel data');
	
	Debug.Log('current frame length: ' + currentFrame.length);
	if (!firstFrame) {
		Debug.Log('last frame length: ' + lastFrame.length);
	}
	
	if (firstFrame || lastFrame.length != currentFrame.length) {
		firstFrame = false;
		
		Debug.Log('not gonna do this frame!!');		
	} else {
		Debug.Log('doing this frame!');
	
		var diff = DiffFrame(currentFrame, lastFrame);
	
		Debug.Log('Made the diff');
		
		var cvResult = FindEyes(diff, webcamTexture.width, webcamTexture.height);
	
		Debug.Log('Got the result');
		
		Debug.Log(cvResult);	
	}
	
	lastFrame = currentFrame;
}

function DiffFrame(frame1 : Color[], frame2 : Color[]) {
	Debug.Log('calculating diff!');
	
	var minLength = (frame1.length > frame2.length)? frame2.length : frame1.length;
	
	Debug.Log('min length for diff: ' + minLength);

	var newFrame = new int[minLength];
	
    for (var i = 0; i < minLength; i += 1) {
      var color1 = frame1[i];
      var color2 = frame2[i];
      var avgDiff = (Mathf.Abs(color1.r - color2.r) + 
                     Mathf.Abs(color1.g - color2.g) +
                     Mathf.Abs(color1.b - color2.b)) / 3;
                                          
      // Threshold and invert
      if (avgDiff > 15) {
  	    newFrame[i] = 0;
  	  } else {
  		  newFrame[i] = 255;
  	  }
    }
    
    return newFrame;
}

function FindEyes(frame : int[], width : int, height : int) {
  var MAX_BLOBS_TO_FIND = 30;
  var BLOBS_SEARCH_BORDER = 20;
  var MIN_BLOBS_FOUND = 2;
  var MAX_BLOBS_FOUND = 25;
  var MIN_HOR_EYE_SEP = 15;
  var MAX_HOR_EYE_SEP = 80;
  var MAX_VERT_EYE_SEP = 55;

  // Find blobs
  var blobs = new Array();
  for (var h = BLOBS_SEARCH_BORDER; h < height - BLOBS_SEARCH_BORDER; h++) {
	if (blobs.length >= MAX_BLOBS_TO_FIND) break;

  	for (var j = BLOBS_SEARCH_BORDER; j < width - BLOBS_SEARCH_BORDER; j++) {
  	  if (pixel(frame, width, height, j, h) == 0 && pixel(frame, width, height, j, h-1) != 0) {
        var pos : Range2d = tracePerim(frame, width, height, j, h);

  	    if ((pos.xmax - pos.xmin) * (pos.ymax - pos.ymin) > 5) {
  		    blobs.Add(pos);
  		    if (blobs.length >= MAX_BLOBS_TO_FIND) break;
  		}
  	  }
  	}
  }

  // Sort blobs
  if (blobs.length < MIN_BLOBS_FOUND) {
  	return CVError("Too few blobs: " + blobs.length, 1);
  } else if (blobs.length > MAX_BLOBS_FOUND) {
    return CVError("Too many blobs: " + blobs.length, 2);
  }
  blobs.sort(function(a : Range2d, b : Range2d) {
    (b.xmax - b.xmin) * (b.ymax - b.ymin) - (a.xmax - a.xmin) * (a.ymax - a.ymin);
  });

  // prune duplicate blobs
  while (blobs.length >= 2) {
    var b1 = blobs[1] as Range2d;
    var b0 = blobs[0] as Range2d;
    
    // if neither horizontal things are equal, no more duplicates
    if (b1.xmax != b0.xmax && b1.xmin != b0.xmin) {
    	break;
    }
    
    blobs.splice(1, 1);

    if (blobs.length < MIN_BLOBS_FOUND) {
      return CVError("Not enough blobs", 1);
    }
  }
  if (blobs.length < MIN_BLOBS_FOUND) {
    return CVError("Not enough blobs", 1);
  }

  // Check dimensions
  var blob0 = blobs[0] as Range2d;
  var blob1 = blobs[1] as Range2d;
  var xSep = Mathf.Abs((blob0.xmax + blob0.xmin) - (blob1.xmax + blob1.xmin)) / 2;
  var ySep = Mathf.Abs((blob0.ymax + blob0.ymin) - (blob1.ymax + blob1.ymin)) / 2;

  if (xSep < MIN_HOR_EYE_SEP || xSep > MAX_HOR_EYE_SEP || ySep > MAX_VERT_EYE_SEP) {
	return CVError("Geometry off, xSep:" + xSep + ", ySep:" + ySep, 3);
  }

  // Find which eye is which
  var l = (blob0.xmax < blob1.xmax)? 0 : 1;
  var r = (l == 0)? 1 : 0;

  // Expand bounding boxes
  var dx = 3;
  var dy = 3;
  var left = blobs[l] as Range2d;
  var right = blobs[r] as Range2d;
  return EyePair(left.pad(dx, dy), right.pad(dx, dy));
}

function pixel(frame : int[], width : int, height : int, x : int, y : int) {
  	if (x < 0 || x >= width || y < 0 || y >= height) {
  	  return 255;
  	}
  	
  	Debug.Log('frame legth: ' + frame.length);
  	Debug.Log('x: ' + x + ' / y: ' + y + ' / width: ' + width);
  	
    return frame[x + y * width];
 }
 
 // Heuristic to trace the perimeter of a blob of pixels
  function tracePerim(frame : int[], width : int, height : int, i : int, j : int) {
    var x = i;
    var y = j + 1;
    var xmin = i;
    var xmax = i;
    var ymin = j;
    var ymax = j;
    var dir = 1;

    for (var count = 0; count < 300; count++) {
	  var found = false;
  	  if ((x == i) && (y == j)) break; // gone full circle

        //   /3\
        // 2<   >4
        //   \1/

  	  if (!found && dir == 1) {  // Downwards
  	    if (!found && pixel(frame, width, height, x-1, y) == 0) {
  		  x--;
  		  found = true;
  		  dir = 2;
  		}
	    if (!found && pixel(frame, width, height, x, y+1) == 0) {
	      y++;
	      found = true;
	      dir = 1;
	    }
		if (!found && pixel(frame, width, height, x+1, y) == 0) {
		  x++;
		  found = true;
		  dir = 4;
		}
        if (!found && pixel(frame, width, height, x, y-1) == 0) {
  	      y--;
    	  found = true;
  		  dir = 3;
  		}
      }

	  if (!found && dir == 4) { // Rightwards
  	    if (!found && pixel(frame, width, height, x, y+1) == 0) {
  		  y++;
  		  found = true;
  		  dir = 1;
  		}
  		if (!found && pixel(frame, width, height, x+1, y) == 0) {
  		  x++;
  		  found = true;
  		  dir = 4;
  		}
  		if (!found && pixel(frame, width, height, x, y-1) == 0) {
    	  y--;
          found = true;
    	  dir = 3;
    	}
        if (!found && pixel(frame, width, height, x-1, y) == 0) {
          x--;
    	  found = true;
    	  dir = 2;
        }
      }

      if (!found && dir == 3) { // Upwards
        if (!found && pixel(frame, width, height, x+1, y) == 0) {
   		  x++;
    	  found = true;
    	  dir = 4;
    	}
    	if (!found && pixel(frame, width, height, x, y-1) == 0) {
    	  y--;
    	  found = true;
    	  dir = 3;
    	}
    	if (!found && pixel(frame, width, height, x-1, y) == 0) {
    	  x--;
    	  found = true;
    	  dir = 2;
    	}
        if (!found && pixel(frame, width, height, x, y+1) == 0) {
    	  y++;
    	  found = true;
    	  dir = 1;
    	}
      }

      if (!found && dir == 2) { // Leftwards
        if (!found && pixel(frame, width, height, x, y-1) == 0) {
    	  y--;
    	  found = true;
    	  dir = 3;
    	}
    	if (!found && pixel(frame, width, height, x-1, y) == 0) {
    	  x--;
    	  found = true;
    	  dir = 2;
   		}
   		if (!found && pixel(frame, width, height, x, y+1) == 0) {
    	  y++;
   		  found = true;
   		  dir = 1;
   		}
        if (!found && pixel(frame, width, height, x+1, y) == 0) {
    	  x++;
    	  found = true;
    	  dir = 4;
    	}
      }
      
      xmin = Mathf.Min(x, xmin);
      ymin = Mathf.Min(y, ymin);
  	  xmax = Mathf.Min(x, xmax);
  	  ymax = Mathf.Min(y, ymax);
  	}
    
    return Range2d(xmin, ymin, xmax, ymax);
  }
  
  class Range2d {
  	var xmin : int;
  	var ymin : int;
  	var xmax : int;
  	var ymax : int;
  	
  	function Range2d(x1 : int, y1 : int, x2 : int, y2 : int) {
  	  this.xmin = x1;
  	  this.ymin = y1;
  	  this.xmax = x2;
  	  this.ymax = y2;
  	}
  	
  	function pad(x : int, y : int) {
  		return Range2d(this.xmin - x, this.ymin - y, this.xmax + x, this.ymax + y);
  	}
  };
  
  class CVError {
    var message : String;
    var code : int;
    
    function CVError(m : String, c : int) {
    	this.message = m;
    	this.code = c;
    }
    
    function ToString() {
    	return "error: " + this.message;
    }
  }
  
  class EyePair {
  	var leftEye : Range2d;
  	var rightEye : Range2d;
  	
  	function EyePair(left : Range2d, right : Range2d) {
  		this.leftEye = left;
  		this.rightEye = right;
  	}
  }
