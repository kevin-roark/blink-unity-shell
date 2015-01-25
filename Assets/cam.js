#pragma strict

var IDEAL_WIDTH = 640;
var IDEAL_HEIGHT = 480;
var DIFF_THRESHOLD = 15.0f / 255.0f;
var LOG_ERRORS = false;
var MIN_TIME_BETWEEN_BLINKS = 0.75;

var webcamTexture : WebCamTexture;
var currentFrame : Color[];
var lastFrame : Color[];
var firstFrame = true;
var lastBlink = 0;

var frameCount = 0;
var blinkCount = 0;

function Start () {
	webcamTexture = WebCamTexture(IDEAL_WIDTH, IDEAL_HEIGHT);
	webcamTexture.Play();
	
	//renderer.material.mainTexture = webcamTexture;
}

function Update () {
	frameCount += 1;
	
	if (!webcamTexture.didUpdateThisFrame) {
		return;
	}
		
	currentFrame = webcamTexture.GetPixels();
		
	if (firstFrame || lastFrame.length != currentFrame.length || Time.time - lastBlink < MIN_TIME_BETWEEN_BLINKS) {
		firstFrame = false;
	} else {		
		var diff = DiffFrame(currentFrame, lastFrame);
			
		var cvResult = FindEyes(diff, webcamTexture.width, webcamTexture.height);
					
		if (cvResult.GetType() == EyePair) {
			blinkCount += 1;
			//Debug.Log('found blink!: ' + blinkCount + ' at ' + Time.time);
			Debug.Log('time diff: ' + (Time.time - lastBlink));
			lastBlink = Time.time;
		} else if (LOG_ERRORS) {
			Debug.Log(cvResult);
		}
	}
	
	lastFrame = currentFrame;
}

function DiffFrame(frame1 : Color[], frame2 : Color[]) {
	var minLength = (frame1.length > frame2.length)? frame2.length : frame1.length;
	
	var newFrame = new int[minLength];
		
    for (var i = 0; i < minLength; i += 1) {
      var color1 = frame1[i];
      var color2 = frame2[i];
      var avgDiff = (Mathf.Abs(color1.r - color2.r) + 
                     Mathf.Abs(color1.g - color2.g) +
                     Mathf.Abs(color1.b - color2.b)) / 3;
                                          
      // Threshold and invert
      if (avgDiff > DIFF_THRESHOLD) {
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
  var BLOB_MIN_DIFFERENTIAL = 60;
  var MIN_BLOBS_FOUND = 2;
  var MAX_BLOBS_FOUND = 30;
  var MIN_HOR_EYE_SEP = 35;
  var MAX_HOR_EYE_SEP = 170;
  var MIN_VERT_EYE_SEP = 2;
  var MAX_VERT_EYE_SEP = 40;
    
  // Find blobs
  var blobs = new Array();
  for (var h = BLOBS_SEARCH_BORDER; h < height - BLOBS_SEARCH_BORDER; h += 1) {
	if (blobs.length >= MAX_BLOBS_TO_FIND) break;

  	for (var j = BLOBS_SEARCH_BORDER; j < width - BLOBS_SEARCH_BORDER; j += 1) {
  	  if (pixel(frame, width, height, j, h) == 0 && pixel(frame, width, height, j, h-1) != 0) {
        var pos : Range2d = tracePerim(frame, width, height, j, h);
        
  	    if ((pos.xmax - pos.xmin) * (pos.ymax - pos.ymin) > BLOB_MIN_DIFFERENTIAL) {	
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
    return (b.xmax - b.xmin) * (b.ymax - b.ymin) - (a.xmax - a.xmin) * (a.ymax - a.ymin);
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

  if (xSep < MIN_HOR_EYE_SEP || xSep > MAX_HOR_EYE_SEP || ySep < MIN_VERT_EYE_SEP || ySep > MAX_VERT_EYE_SEP) {
	return CVError("Geometry off, xSep:" + xSep + ", ySep:" + ySep, 3);
  }
  
  Debug.Log('xSep: ' + xSep + ' / ySep: ' + ySep);

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
  	  xmax = Mathf.Max(x, xmax);
  	  ymax = Mathf.Max(y, ymax);
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
  	
  	function ToString() {
  		return "x: (" + this.xmin + ", " + this.xmax + ") / y: (" + this.ymin + ", " + this.ymax + ")";
  	}
}
  
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
  	
  	function ToString() {
  		return "left: " + this.leftEye + " / right: " + this.rightEye;
  	}
}
