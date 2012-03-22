
//board bounds
var sym = 3;

var minX = -sym;
var maxX = sym;
var minY = -sym;
var maxY = sym;

var minZ = -3;
var maxZ = 3;

//divisors
var numRows = 70;

var gl;


//camera stuff
var zoomAmount = -2;
var currentZoomLevel = -6;

var scaleAmount = 0.04;
var ourScaleTween = null;
var scaleVariablesForTween = null;

var globalYrotate = 0;
var globalXrotate = -90;
var angleLimit = 90;
var rotateOn = false;

var rotVariablesForTween = {'x':globalXrotate,'y':globalYrotate};
var ourTween = null;
var tweenTime = 1000;
var tweenEasing = TWEEN.Easing.Cubic.EaseInOut;
var ourTweenOn = false;
var timeoutMinutes = 10;
var timeOnLoad = new Date();
var startTime = timeOnLoad.getTime();

var blendShaderObj = null;


/*****************CLASSES*******************/
var myShader = function(vShaderId,fShaderId,uniformAttributes) {
    this.vShaderId = vShaderId;
    this.fShaderId = fShaderId;

    this.uniformAttributes = uniformAttributes;
    this.shaderProgram = null;

    this.buildShader();
    this.buildAttributes();
};

myShader.prototype.buildShader = function() {
    var vShader = getShader(gl,this.vShaderId);
    var fShader = getShader(gl,this.fShaderId);

    this.shaderProgram = gl.createProgram();
    gl.attachShader(this.shaderProgram,vShader);
    gl.attachShader(this.shaderProgram,fShader);
    gl.linkProgram(this.shaderProgram);

    var linkStatus = gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS);
    if(linkStatus != true)
    {
        console.warn("could not init shader",this.vShaderId);
    }
}

myShader.prototype.buildAttributes = function() {
    this.switchToShader();

    //always vertices as well
    this.shaderProgram.vertexPositionAttribute = gl.getAttribLocation(this.shaderProgram,"aVertexPosition");
    gl.enableVertexAttribArray(this.shaderProgram.vertexPositionAttribute);

    //do all the uniforms
    for(key in this.uniformAttributes)
    {
        var varName = key;
        var varLocation = varName + "location";
        //console.log("adding this",varName,"to location",varLocation);
        this.shaderProgram[varLocation] = gl.getUniformLocation(this.shaderProgram,varName);
    }
};

myShader.prototype.drawGrid = function(matrixAttributeUpdates) {
    //here matrixattributeupdates is optional. we might not need them if we have a fixed projection matrix
    this.switchToShader();

    //update the right matrices
    if(matrixAttributeUpdates)
    {
        //this will replace them in JS memory and also update them on the gpu
        this.updateAttributes(matrixAttributeUpdates);
    }

    //bind the buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,gridVertexPositionBuffer);
    gl.vertexAttribPointer(this.shaderProgram.vertexPositionAttribute, gridVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, gridVertexPositionBuffer.numItems);
};

myShader.prototype.switchToShader = function() {
    gl.useProgram(this.shaderProgram);
};

myShader.prototype.updateAttributes = function(attributes) {
    for(key in attributes)
    {
        var varName = key;
        if(!this.uniformAttributes[varName])
        {
            console.warn("Warning!! this attribute", varName, " has not been built yet, build it first!");
            continue;
        }
        this.uniformAttributes[varName] = attributes[varName];
    }
    //now go buffer all of these again
    this.switchToShader();
    this.bufferUniforms();
};

myShader.prototype.updateTime = function(timeVal) {
    this.uniformAttributes['time'] = timeVal;
};

myShader.prototype.bufferUniforms = function() {
    //uses my set of uniform attributes. essentially this means that i can have my own set of 
    //a perspective matrix, a move matrix, and several other things without requiring a lot of switching between everything.
    //
    //
    //the only thing im worried about is the uniform attribute... does this mean that it's uniform throughout the GPU? I don't think
    //so because you are specifying unique locations for each variable on the shader program, but this requires investigation...
    //
    //

    for(key in this.uniformAttributes)
    {
        var varName = key;

        var val = this.uniformAttributes[key].val;
        var type = this.uniformAttributes[key].type;
        var varLocation = varName + "location";

        if(type == 'f')
        {
            gl.uniform1f(this.shaderProgram[varLocation],val);
        }
        else if(type == '4fm')
        {
            gl.uniformMatrix4fv(this.shaderProgram[varLocation],false,val);
        }
        else
        {
            console.warn("unsupported type ",type);
        }
    }
};




/***************End Classes!*****************************/


/********** Geometry Functions *******/



/*******************End Geometry Functions******************/



//global colors

function initShaders() {

    //box shadeer
    var attributes = {
        'time':{type:'f',val:0},
        'minX':{type:'f',val:0},
        'maxX':{type:'f',val:0},
        'maxY':{type:'f',val:0},
        'minY':{type:'f',val:0},
        'minZ':{type:'f',val:0},
        'maxZ':{type:'f',val:0},
        'pMatrix':{type:'4fm',val:pMatrix},
        'mvMatrix':{type:'4fm',val:mvMatrix},
    };

    blendShaderObj = new myShader("shader-box-vs","shader-box-fs",attributes);
}



var earthTexture;
var otherFramebuffer;
var otherTexture;

function initOtherFrameBuffer() {
    //make frame buffer
    otherFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,otherFramebuffer);
    otherFramebuffer.width = $j(window).width();
    otherFramebuffer.height = $j(window).height();

    //something with a render buffer?
    var renderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER,renderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, otherFramebuffer.width, otherFramebuffer.height);

    //reset back to default
    gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindRenderbuffer(gl.RENDERBUFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

var mvMatrix = mat4.create();
var mvMatrixStack = [];
var pMatrix = mat4.create();

function mvPushMatrix() {
    var copy = mat4.create();
    mat4.set(mvMatrix, copy);
    mvMatrixStack.push(copy);
}

function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
        throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}

function setObjUniforms() {
    var now = new Date();
    var deltaT = (now.getTime() - startTime) / 1000.0;

    var attributes = {
        'time':{type:'f',val:deltaT},
        'minX':{type:'f',val:minX},
        'maxX':{type:'f',val:maxX},
        'maxY':{type:'f',val:maxY},
        'minY':{type:'f',val:minY},
        'minZ':{type:'f',val:minZ},
        'maxZ':{type:'f',val:maxZ},
        'pMatrix':{type:'4fm',val:pMatrix},
        'mvMatrix':{type:'4fm',val:mvMatrix},
    };

    blendShaderObj.updateAttributes(attributes);
}

function degToRad(degrees) {
    return degrees * Math.PI / 180;
}
var gridVertexPositionBuffer;

var vertices;
var colors;

function initGridBuffers() {

    //initialize the grid vertices
    var gridVertexPositions = [];

    var addPointsToBuffer = function() {
        for(var temp = 0; temp < arguments.length; temp++)
        {
            point = arguments[temp];
            //omit adding z coordinate, its not needed
            //gridVertexPositions.push(point.x, point.y, 0);
            gridVertexPositions.push(point.x, point.y);
        }
    };

    var makePoint = function(x,y) {
        return {'x':x,'y':y};
    };

    //numRows = someValue (global now)

    var xMinBoard = -1;
    var xMaxBoard = 1;
    var yMinBoard = -1;
    var yMaxBoard = 1;

    var xDivisor = (xMaxBoard - xMinBoard) / numRows;
    var yDivisor = (yMaxBoard - yMinBoard) / numRows;

    //the x loop
    for(var i = 0; i < numRows; i++)
    {
        //the y loop
        for(var j = 0; j < numRows; j++)
        {
            var xHere = i * xDivisor + xMinBoard;
            var yHere = j * yDivisor + yMinBoard;

            var xAcross = (i + 1) * xDivisor + xMinBoard;
            var yAcross = (j + 1) * yDivisor + yMinBoard;

            var pHere = makePoint(xHere,yHere);
            var pAbove = makePoint(xHere,yAcross);
            var pRight = makePoint(xAcross,yHere);
            var pDiagonal = makePoint(xAcross,yAcross);

            addPointsToBuffer(pHere,pDiagonal,pAbove);
            addPointsToBuffer(pHere,pRight,pDiagonal);
        }
    }

    //gridVertexPositions = [1,1,0,-1,-1,0,-1,1,0];

    gridVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridVertexPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridVertexPositions), gl.STATIC_DRAW);

    //we don't need the z coordinate here, so omit it from the array

    gridVertexPositionBuffer.itemSize = 2;
    gridVertexPositionBuffer.numItems = gridVertexPositions.length / gridVertexPositionBuffer.itemSize;
}

/*
function getArcAtMousePos(x,y) {
    ***********this is old but i want to reference this code later!!!***
    //flip y
    y = gl.viewportHeight - y;

    //real quick, render the frame but in pick mode into another buffer!
    gl.bindFramebuffer(gl.FRAMEBUFFER, otherFramebuffer);
    drawSceneIntoOtherBuffer();

    //go get the pixel data from the frame buffer
    var pixelValues = new Uint8Array(4);
    gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixelValues);

    //now switch back
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    //console.log("R:" + pixelValues[0] + " G:" + pixelValues[1] + " B:" + pixelValues[2]);

    var r = pixelValues[0]; var rS = zeroPad(r,3);
    var g = pixelValues[1]; var gS = zeroPad(g,3);
    var b = pixelValues[2]; var bS = zeroPad(b,3);

    //get the string for this
    var cString = rS + gS + bS;
    
    //see if its there
    if(globalColorTaken[cString])
    {
        //also tell who it is
        var theArc = globalColorLookup[cString];
        return theArc;
    }
    return null;
}
*/

function drawScene() {

    cameraPerspectiveClear();
    translateAndRotate();

    cameraUpdates = {
        'pMatrix':{type:'4fm','val':pMatrix},
        'mvMatrix':{type:'4fm','val':mvMatrix},
    };

    //here, we draw the grid with our shader object
    blendShaderObj.switchToShader();
    setObjUniforms();
    blendShaderObj.drawGrid(cameraUpdates);

    //go find the minimum
    findMinimumOnFrameBuffer();
}

function cameraPerspectiveClear() {

    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    //we set our clearColor to be 0 0 0 0, so its essentially transparent.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    //mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0, pMatrix);
    //mat4.ortho(-100,-100,gl.viewportWidth,gl.viewportHeight,0.1,100,pMatrix);
    mat4.ortho(-0.0519,0.0519,-0.0414,0.0414,0.1,100.0,pMatrix);
}


function translateAndRotate() {

    mat4.identity(mvMatrix);

    mat4.translate(mvMatrix, [0, 0, zoomAmount]);

    //cap variables
    if(globalYrotate > 360)
    {
        globalYrotate -= 360;
    }
    if(globalYrotate < -360)
    {
        globalYrotate += 360;
    }

    //do rotation for camera
    var newRot = mat4.create();
    mat4.identity(newRot);

    //now need to get the other axis
    var secondRotAxis = vec3.create();
    var result = vec3.create();
    secondRotAxis[0] = 1;
    mat4.multiplyVec3(newRot,secondRotAxis,result);

    mat4.rotate(newRot,degToRad(globalXrotate), [result[0],result[1],result[2]]);
    mat4.rotate(newRot,degToRad(globalYrotate), [0,1,0]);

    //now multiply earth rotation
    mat4.identity(earthRotationMatrix);
    mat4.multiply(earthRotationMatrix,newRot);

    mat4.scale(mvMatrix,[scaleAmount,scaleAmount,scaleAmount]);

    mat4.multiply(mvMatrix, earthRotationMatrix);
}

function tweenUpdate() {
    globalXrotate = rotVariablesForTween.x;
    globalYrotate = rotVariablesForTween.y;
}

function tweenDone() {
    ourTweenOn = false;
}

function tick() {
    requestAnimFrame(tick);
    drawScene();
}


function webGLStart() {
    startLoadingWithText("Initializing WebGL...");
   
    canvas = document.getElementById("earth-canvas");
    initGL(canvas);
    initShaders();
    initGridBuffers();

    initOtherFrameBuffer();

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.enable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

    document.onmousedown = handleMouseDown;
    document.onmouseup = handleMouseUp;
    document.onmousemove = handleMouseMove;

    //do the finish down here
    stopLoadingWithText();
    doEarthFlyin();
    tick();
}

function doEarthFlyin() {
    scaleAmount = 0.0001;
    if(ourScaleTween)
    {
        ourScaleTween.stop();
    }

    scaleVariablesForTween = {'scale':scaleAmount};

    ourScaleTween = new TWEEN.Tween(scaleVariablesForTween).to({'scale':0.04},tweenTime*1.5).onUpdate(scaleTweenUpdate);
    setTimeout('scaleTweenComplete()',tweenTime*0.5);
    ourScaleTween.easing(TWEEN.Easing.Quartic.EaseInOut);
    ourScaleTween.start();
} 

function scaleTweenComplete()
{
    //code here possibly
}

function scaleTweenUpdate() {
    scaleAmount = scaleVariablesForTween.scale;
}

function getShader(gl, id) {
    var shaderScript = document.getElementById(id);
    if (!shaderScript) {
        return null;
    }

    var str = "";
    var k = shaderScript.firstChild;
    while (k) {
        if (k.nodeType == 3) {
            str += k.textContent;
        }
        k = k.nextSibling;
    }

    var shader;
    if (shaderScript.type == "x-shader/x-fragment") {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type == "x-shader/x-vertex") {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
        return null;
    }

    gl.shaderSource(shader, str);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}

var wtf = false;
function getPixelData(x,y,width,height)
{
    var pixelValues = new Uint8Array(4 * (width+1) * (height+1));
    gl.readPixels(x,y,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixelValues);
    if(!wtf)
    {
        wtf = true;
        console.log(pixelValues);
    }

    return pixelValues;
}

function dumpScreenShot()
{
    //get all the pixels of the viewport
    var height = gl.viewportHeight;
    var width = gl.viewportWidth;

    var pixels = getPixelData(0,0,width,height);

    //get or make the snapshot canvas
    var cvs = document.getElementById('screenShotCanvas');
    if(!cvs)
    {
        cvs = document.createElement('canvas');
        cvs.id = 'screenShotCanvas';
        document.getElementsByTagName('body')[0].appendChild(cvs);
        cvs = document.getElementById('screenShotCanvas');
        $j('#screenShotCanvas').css({
                            'position':'absolute',
                            'right':'0px',
                            'top':'0px'});
    }

    cvs.width = gl.viewportWidth;
    cvs.height = gl.viewportHeight;

    var ctx2d = cvs.getContext('2d');
    var image = ctx2d.createImageData(cvs.width, cvs.height);

    for (var y = 0; y < cvs.height; y++){
        for (var x = 0; x < cvs.width; x++){
            var index = (y * cvs.width + x) * 4;
            var index2 = ((cvs.height-1-y) * cvs.width + x) * 4;

            for(var p = 0; p < 4; p++){
                    image.data[index2 + p] = pixels[index + p];
                }
        }
    }

    //now we have transferred the pixels, lets go find the optimum
    heightOfBuffer = cvs.height;
    widthOfBuffer = cvs.width;
    allPixels = pixels;

    var haveFound = false;
    var maxR = 0;

    var minX = Number.MAX_VALUE;
    var yAtMinX = 0;

    for(var y = 0; y < heightOfBuffer; y++)
    {
        for(var x = 0; x < widthOfBuffer; x++)
        {
            var indexPixelData = (y * cvs.width + x) * 4;
            var indexPixelDataAbove = ((y + 1) * cvs.width + x) * 4;
            var indexCanvas = ((cvs.height - 1 - y) * cvs.width + x)*4;

            var r = allPixels[indexPixelData];
            var rAbove = allPixels[indexPixelDataAbove];

            if(r > maxR)
            {
                maxR = r;
            }

            var g = allPixels[indexPixelData + 1];
            var b = allPixels[indexPixelData + 2];
            //alpha would be the fourth entry here

            if(r != 0 && x < minX)
            {
                minX = x;
                yAtMinX = y;
            }


            if((r != 0 || g != 0 || b != 0) && !haveFound)
            {
                haveFound = true;
                console.log("found one!");

                //here calculate x and y based off of the numRows and stuff
                xAtMin = x;
                var xPos = colorIntToPosition(r,minX,maxX);
                var yPos = colorIntToPosition(g,minY,maxY);
                var xPos2 = colorIntToPosition(rAbove,minX,maxX);

                console.log("with color r:",r," and g",g);
                console.log("at position x:",xPos," and y:",yPos);
                console.log("***ABOVE***");
                console.log("color r:",rAbove," and pos:",xPos2);

                //color the pixels here
                for(var p = 0; p < 4; p++)
                {
                    image.data[indexCanvas + p] = 255;
                }
            }
        }
    }

    //now sample this row...
    y = yAtMinX;
    rArray = [];
    for(var x = 0; x < widthOfBuffer; x++)
    {
        var indexPixelData = (y * cvs.width + x) * 4;
        var indexCanvas = ((cvs.height -1 - y) * cvs.width + x)*4;

        var r = allPixels[indexPixelData];
        rArray.push(r);
        image.data[indexCanvas] = 0;
    }
    console.log("r color at gradient is",rArray[xAtMin]);

    console.log("max r value was",maxR);

    //put the image onto the canvas
    ctx2d.putImageData(image, 0, 0);
}

function colorIntToPosition(colorValue,coordMin,coordMax)
{
    var originalPos = ((colorValue / 256.0) - 0.5) * 2;
    var originalPosition = ((originalPos + 1)/2.0) * (coordMax - coordMin) + coordMin;

    return originalPos;
    return originalPosition;
}

var minToSearch;
var should = false;

function findMinimumOnFrameBuffer(heightOfBuffer,widthOfBuffer) {
    if(!should)
    {
        return;
    }
    if(!heightOfBuffer)
    {
        heightOfBuffer = gl.viewportHeight;
    }
    if(!widthOfBuffer)
    {
        widthOfBuffer = gl.viewportWidth;
    }
    if(!minToSearch)
    {
        minToSearch = gl.viewportHeight - 10;
    }

    //its actually faster to copy all the pixels at once!
    var allPixels = getPixelData(0,0,widthOfBuffer,heightOfBuffer);

    //scan from the bottom to the top on the current frame buffer, and return once we find something thats
    //nonzero
    for(var row = 0; row < heightOfBuffer; row++)
    {
        for(var x = 0; x < widthOfBuffer; x++)
        {
            var r = allPixels[row * widthOfBuffer * 4 + x*4];
            var g = allPixels[row * widthOfBuffer * 4 + x*4 + 1];
            var b = allPixels[row * widthOfBuffer * 4 + x*4 + 2];
            //alpha would be the fourth entry here

            if(r != 0 || g != 0 || b != 0)
            {
                console.log("the minimum has color r:",r);
                minXpixel = x;
                minYpixel = heightOfBuffer - row;
                minRcolor = r;
                minGcolor = g;
                minBcolor = b;

                //here calculate x and y based off of the numRows and stuff
                var xPos = colorIntToPosition(r,minX,maxX);
                var yPos = colorIntToPosition(g,minY,maxY);
                console.log("at x:",xPos," and y:",yPos);
                return {'x':xPos,'y':yPos};
                break;
            }
        }
    }
};
var minXpixel; var minYpixel;

