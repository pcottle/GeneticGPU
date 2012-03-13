
//function globals
//board bounds
var sym = 3;

var minX = -sym;
var maxX = sym;
var minY = -sym;
var maxY = sym;

var minZ = -5;
var maxZ = 5;

var gl;


//camera stuff
var zoomAmount = -2;
var currentZoomLevel = -6;

var scaleAmount = 1;
var ourScaleTween = null;
var scaleVariablesForTween = null;

var globalYrotate = 0;
var globalXrotate = -45;
var angleLimit = 85;
var rotateOn = false;

var rotVariablesForTween = {'x':globalXrotate,'y':globalYrotate};
var ourTween = null;
var tweenTime = 1000;
var tweenEasing = TWEEN.Easing.Cubic.EaseInOut;
var ourTweenOn = false;
var timeoutMinutes = 10;
var timeOnLoad = new Date();
var startTime = timeOnLoad.getTime();


/*****************CLASSES*******************/


/***************End Classes!*****************************/


/********** Geometry Functions *******/



/*******************End Geometry Functions******************/



//global colors
var blendShaderProgram;

function initShaders() {
    //box shadeer
    var blendVertexShader = getShader(gl, "shader-box-vs");
    var blendFragShader = getShader(gl, "shader-box-fs");

    blendShaderProgram = gl.createProgram();
    gl.attachShader(blendShaderProgram, blendVertexShader);
    gl.attachShader(blendShaderProgram, blendFragShader);
    gl.linkProgram(blendShaderProgram);

    if (!gl.getProgramParameter(blendShaderProgram, gl.LINK_STATUS))
    {
        alert("Could not initialise shaders");
    }

    //our arcs
    gl.useProgram(blendShaderProgram);

    blendShaderProgram.vertexPositionAttribute = gl.getAttribLocation(blendShaderProgram,"aVertexPosition");
    gl.enableVertexAttribArray(blendShaderProgram.vertexPositionAttribute);

    blendShaderProgram.pMatrixUniform = gl.getUniformLocation(blendShaderProgram,"uPMatrix");
    blendShaderProgram.mvMatrixUniform = gl.getUniformLocation(blendShaderProgram,"uMVMatrix");


    blendShaderProgram.timeUniform = gl.getUniformLocation(blendShaderProgram,"time");
    blendShaderProgram.uniformMinX = gl.getUniformLocation(blendShaderProgram,"minX");
    blendShaderProgram.uniformMaxX = gl.getUniformLocation(blendShaderProgram,"maxX");
    blendShaderProgram.uniformMinY = gl.getUniformLocation(blendShaderProgram,"minY");
    blendShaderProgram.uniformMaxY = gl.getUniformLocation(blendShaderProgram,"maxY");
    blendShaderProgram.uniformMinZ = gl.getUniformLocation(blendShaderProgram,"minZ");
    blendShaderProgram.uniformMaxZ = gl.getUniformLocation(blendShaderProgram,"maxZ");
    
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

function setMatrixUniforms() {

    gl.uniformMatrix4fv(blendShaderProgram.pMatrixUniform, false, pMatrix);
    gl.uniformMatrix4fv(blendShaderProgram.mvMatrixUniform, false, mvMatrix);

    var now = new Date();
    var deltaT = (now.getTime() - startTime) / 1000.0;

    //all the things that change
    gl.uniform1f(blendShaderProgram.timeUniform,deltaT);
    gl.uniform1f(blendShaderProgram.uniformMinX,minX);
    gl.uniform1f(blendShaderProgram.uniformMaxX,maxX);
    gl.uniform1f(blendShaderProgram.uniformMinY,minY);
    gl.uniform1f(blendShaderProgram.uniformMaxY,maxY);
    gl.uniform1f(blendShaderProgram.uniformMinZ,minZ);
    gl.uniform1f(blendShaderProgram.uniformMaxZ,maxZ);
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
            gridVertexPositions.push(point.x, point.y, 0);
        }
    };

    var makePoint = function(x,y) {
        return {'x':x,'y':y};
    };

    var numRows = 70.0;

    var xMinBoard = -1;
    var xMaxBoard = 1;
    var yMinBoard = -1;
    var yMaxBoard = 1;

    var xDivisor = (xMaxBoard - xMinBoard) / numRows;
    console.log(xDivisor);
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
    gridVertexPositionBuffer.itemSize = 3;
    gridVertexPositionBuffer.numItems = gridVertexPositions.length / 3;

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

function drawSceneIntoOtherBuffer() {
    drawSceneEither(true);
}

function drawScene() {
    drawSceneEither(false);
}

function drawSceneEither(forPicking) {

    cameraPerspectiveClear();
    translateAndRotate();

    gl.useProgram(blendShaderProgram);
    setMatrixUniforms();
    //here, we draw the grid
    drawGrid();

}

function cameraPerspectiveClear() {

    gl.useProgram(blendShaderProgram);
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

    //we set our clearColor to be 0 0 0 0, so its essentially transparent.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0, pMatrix);
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
    setMatrixUniforms();
}


function drawGrid() {
    gl.useProgram(blendShaderProgram);
    setMatrixUniforms();

    //need a new buffer for grid positions
    gl.bindBuffer(gl.ARRAY_BUFFER, gridVertexPositionBuffer);
    gl.vertexAttribPointer(blendShaderProgram.vertexPositionAttribute, gridVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, gridVertexPositionBuffer.numItems);
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
    scaleAmount = 0.01;
    if(ourScaleTween)
    {
        ourScaleTween.stop();
    }

    scaleVariablesForTween = {'scale':scaleAmount};

    ourScaleTween = new TWEEN.Tween(scaleVariablesForTween).to({'scale':1},tweenTime*1.5).onUpdate(scaleTweenUpdate);
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
