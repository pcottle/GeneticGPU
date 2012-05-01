
//divisors
var numRows = 71;

var gl;


//camera stuff
var zoomAmount = -2;

var scaleAmount = 0.04;
var ourScaleTween = null;
var scaleVariablesForTween = null;

var globalYrotate = 10;
var globalXrotate = -80;
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

//hacked up javascript clone object method from stackoverflow. certainly a blemish on the face of JS

function clone(obj) {
    //3 simple types and null / undefined
    if(null == obj || "object" != typeof obj) return obj;

    //date
    if(obj instanceof Date) {
        var copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    //array
    if (obj instanceof Array) {
        var copy = [];
        for( var i = 0; i < obj.length; ++i) {
            copy[i] = clone(obj[i]);
        }
        return copy;
    }

    //object
    if(obj instanceof Object) {
        var copy = {};
        for(var attr in obj) {
            if(obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
        }
        return copy;
    }
    throw new Error("object type not supported yet!");
}


/*****************CLASSES*******************/
var SearchWindow = function(sampleVars,fixedVars) {

    this.sampleVars = sampleVars;

    if(!fixedVars)
    {
        fixedVars = [];
    }

    this.fixedVars = fixedVars;

    this.windowAttributes = {};
    this.minmaxList = [];
    this.fixedList = [];

    this.reset();

};


SearchWindow.prototype.reset = function() {

    this.minmaxList = [];
    this.fixedList = [];

    //include z for window attributes and minmax, but it's not a "sample var"
    var attributeVars = this.sampleVars.concat(['z']);

    for(var i = 0; i < attributeVars.length; i++)
    {
        var min = "min" + attributeVars[i].toUpperCase();
        var max = "max" + attributeVars[i].toUpperCase();

        this.windowAttributes[min] = {type:'f', val: -3};
        this.windowAttributes[max] = {type:'f', val: 3};

        $j('#' + min).html(String(-3));
        $j('#' + max).html(String(3));

        this.minmaxList.push(min);
        this.minmaxList.push(max);
    }

    for(var j = 0; j < this.fixedVars.length; j++)
    {
        var fixedVal = "fixed" + this.fixedVars[j].toUpperCase() + "val";
        this.windowAttributes[fixedVal] = {type:'f',val:1};

        $j('#' + fixedVal).html(String(1));

        this.fixedList.push(fixedVal);
    }

    this.windowAttributes['pMatrix'] = {type:'4fm',val:orthogProjMatrix};
    this.windowAttributes['mvMatrix'] = {type:'4fm',val:standardMoveMatrix};
};

SearchWindow.prototype.getAllVariables = function() {
    return this.fixedVars.concat(this.sampleVars);
};

SearchWindow.prototype.makeZoomWindow = function(centerPosition,percent) {
    //we will essentially "breed out" the search window here

    //first clone the search window we have right now
    //this used to be a call to the clone method, but that did not preserve the float32array type
    //of our perspective matrices, so we will do it manually here
    var copy = {};
    copy.windowAttributes = {};

    for(key in this.windowAttributes)
    {
        var type = this.windowAttributes[key].type;
        if(type != '4fm') //don't copy the matrices
        {
            copy.windowAttributes[key] = {'type':type,'val':this.windowAttributes[key].val};
        }
    }

    //the centerposition must contain all the sample variables and the z
    //attribute. it has direct access to the value, NOT the typical "type/val" object
    for(key in centerPosition)
    {
        if(key != 'z' && this.sampleVars.indexOf(key) == -1)
        {
            continue;
        }

        var min = "min" + key.toUpperCase();
        var max = "max" + key.toUpperCase();

        var maxVal = this.windowAttributes[max].val;
        var minVal = this.windowAttributes[min].val;
        var centerVal = centerPosition[key];

        var range = maxVal - minVal;
        var deltaEachSide = range * percent * 0.5;

        //we could go outside the bounds here by accident, so make sure to
        //floor these
        var newMaxVal = centerVal + deltaEachSide;
        newMaxVal = Math.min(newMaxVal,maxVal);

        var newMinVal = centerVal - deltaEachSide;
        newMinVal = Math.max(newMinVal,minVal);

        //set these new min / max's in the new window
        copy.windowAttributes[max].val = newMaxVal;
        copy.windowAttributes[min].val = newMinVal;
    }

    //should be done "zooming" on a point from a window
    return copy;
};


var Problem = function(equationString,userSpecifiedFixedVariables,fixAllBut2) {

    //here the equationString is the given equation we want to parse. the fixedVariables
    //are the variables we want fixed, aka gravity or conductivity or something else similar

    if(!userSpecifiedFixedVariables)
    {
        userSpecifiedFixedVariables = [];
    }

    //check if its valid. validateequationstring will throw errors on bad strings,
    //so these need to be caught by a try / catch block
    equationString = this.validateEquationString(equationString);

    //first add the colon if it's not there
    if(!equationString.match(/;/))
    {
        equationString = equationString + ";";
    }

    //ok so we have a valid equation
    //get all the variables besides z
    this.equationString = equationString;
    var es = equationString;

    //first see if "time" is there, aka we want to use time
    //to drive the simulation in some way (but its not a dimensional variable to solve for)
    var timeIsThere = false;

    if(es.match(/time/))
    {
        timeIsThere = true;
    }
    this.wantsTime = timeIsThere;

    //first replace all the "pow" operations and such. this will also remove time because that's a 
    //multicharacter match
    var es = equationString;
    es = es.replace(/([a-zA-Z][a-zA-Z]+)/g,"");

    //now extract out all single variables, except for z because that's the cost function. note the
    //a-y in the regex for omitting z
    var allVariables = es.match(/([a-yA-Y])/g);

    //make variables unique! we will no longer abuse jquery here and abuse javascript objects
    //abusing jquery didnt work because it would catch two instances of "x" for some reason,
    //it was confused between the object x and the string containing "x" i guess
    var varSet = {};
    for(var i = 0; i < allVariables.length; i++)
    {
        varSet[allVariables[i]] = true;
    }
    allVariables = [];
    for(key in varSet)
    {
        allVariables.push(key);
    }

    //sort so hopefully x and y are at the back
    allVariables = allVariables.sort()
    console.log("after sorting",allVariables);

    if(allVariables.length < 2)
    {
        throw new Error("Specify at least 2 variables!");
    }

    //we need to determine which are sample variables in the problem and which are 
    //fixed variables specified by the user.
    var sampleVariables = [];
    var fixedVariables = [];

    //now we will loop through these variables, either adding them to sample variables or fixed variables
    for(var i = 0; i < allVariables.length; i++)
    {
        var thisVar = allVariables[i];
        if(userSpecifiedFixedVariables.indexOf(thisVar) != -1)
        {
            fixedVariables.push(thisVar);
        }
        else
        {
            sampleVariables.push(thisVar);
        }
    }

    //also, there's an optional mode to fix all but 2 of the variables. so here...
    if(fixAllBut2 && sampleVariables.length > 2)
    {
        var length = sampleVariables.length;
        var sampleOnes = sampleVariables.slice(length-2);
        var fixedOnes = sampleVariables.slice(0,length-2);

        sampleVariables = sampleOnes;
        fixedVariables = fixedVariables.concat(fixedOnes);
    }

    console.log("all variables",allVariables);
    console.log("results: fixed",fixedVariables," sample", sampleVariables);

    //go build a window for these variables.
    //z is included as a sample variable because it has bounds that need to be updated as the function scales
    //the fixed variables will be given uniform attributes that can be easily modified
    this.baseSearchWindow = new SearchWindow(sampleVariables,fixedVariables);

    //ok so now we have our base search window. if our number of sample variables is just two,
    //the 2d sampler base window is the same as the base search window. if not, we have to
    //fix the sample variables one by one until we achieve a 2d sample space
    var sampleVariablesFor2d = sampleVariables.slice(0);
    var fixedVariablesFor2d = fixedVariables.slice(0);
    var variablesWeHadToFixFor2d = [];

    while(sampleVariablesFor2d.length > 2)
    {
        var thisVar = sampleVariablesFor2d.splice(0,1);
        fixedVariablesFor2d.push(thisVar);
        variablesWeHadToFixFor2d.push(thisVar);
    }

    //ok now we are guaranteed that we have a 2d search space for this window. go make a search window
    this.searchWindow2d = new SearchWindow(sampleVariablesFor2d,fixedVariablesFor2d);

    //very long variable name. but this is a very important list. we don't want to iterate through
    //user-specified constants, but we want to iterate through the fixed variables we created to
    //reduce the dimensionality down to 2
    this.searchWindow2d.variablesWeHadToFixFor2d = variablesWeHadToFixFor2d;

    //also do control HTML
    this.renderControlHTML();
};

Problem.prototype.validateEquationString = function(equationString) {
    //first remove all the valid digits
    var es = equationString;
    var toReturn = equationString;

    //first check that it begins with "z = " something
    if(!es.match(/^[ ]*z[ ]*=/g))
    {
        throw new Error("the equation must start with z = something. Z is your cost function that you are trying to minimize with non-convex optimization");
    }

    //see if there are any digits with no period before and after
    if(es.match(/([^.0-9]\d+[^.0-9])|([^.0-9]\d+$)|(^\d+[^.0-9])/g))
    {
        //this is a giant pain but we have to replace them specifically by index
        var shouldContinue = true;
        var regex = /([^.0-9]\d+[^.0-9])|([^.0-9]\d+$)|(^\d+[^.0-9])/;
        var num = 0;
        while(true)
        {
            num++;
            if(num > 10)
            {
                break;
            }
            var indexFirst = es.search(regex);
            if(indexFirst == -1)
            {
                break;
            }
            var matchString = es.match(regex)[0];
            //extract just the number and get the rest
            //GOD this is a pain
            var numWithin = matchString.match(/(\d+)/)[0];
            var numWithinIndex = matchString.search(/(\d+)/);
            var withinPart1 = matchString.substring(0,numWithinIndex);
            var withinPart2 = matchString.substring(numWithinIndex + numWithin.length);

             var matchString = es.match(regex)[0];
            //extract just the number and get the rest
            //GOD this is a pain
            var numWithin = matchString.match(/(\d+)/)[0];
            var numWithinIndex = matchString.search(/(\d+)/);
            var withinPart1 = matchString.substring(0,numWithinIndex);
            var withinPart2 = matchString.substring(numWithinIndex + numWithin.length);
            var matchLength = matchString.length;

            var firstPart = es.substring(0,indexFirst);
            var secondPart = es.substring(indexFirst + matchLength);

            es = firstPart + withinPart1 + numWithin + ".0" + withinPart2 + secondPart;
        }
    }

    //probably valid, still need to compile it of course though but this catches the user mistakes
    return es;
};

var getSource = function(obj) {
    if(obj.match)
    {
        //its a string, return it
        return obj;
    }
    if(obj.length)
    {
        //its a jquery array, get first element and get the text there
        return obj[0].text;
    }
    //its an html element
    return obj.text;
};

Problem.prototype.renderControlHTML = function() {
    //this is a big pain

    $j('#equationStringTextArea').text(this.equationString);

    var sampleVarsToRender = this.baseSearchWindow.sampleVars.concat(['z']);

    var sampleVariablesHTML = "";
    for(var i = 0; i < sampleVarsToRender.length; i++)
    {
        var varName = sampleVarsToRender[i];

        var minKey = 'min' + varName.toUpperCase();
        var maxKey = 'max' + varName.toUpperCase();

        var minVal = this.baseSearchWindow.windowAttributes[minKey].val;
        var maxVal = this.baseSearchWindow.windowAttributes[maxKey].val;

        var line = "<p>" + varName + ":";
        line = line + " Minimum ";
        line = line + '<span class="frobSpanner" id="' + minKey + '">' + String(minVal) + '</span>';

        line = line + " Maximum ";
        line = line + '<span class="frobSpanner" id="' + maxKey + '">' + String(maxVal) + '</span>';
        
        line = line + "</p>";
        sampleVariablesHTML = sampleVariablesHTML + line;
    }

    var fixedVariablesHTML = "";
    for(var i = 0; i < this.baseSearchWindow.fixedVars.length; i++)
    {
        var varName = this.baseSearchWindow.fixedVars[i];
        
        //we need to construct the "key" here
        var key = "fixed" + varName.toUpperCase() + "val";

        var varValue = this.baseSearchWindow.windowAttributes[key].val;

        var line = "<p>" + varName + ": Value of ";
        line = line + '<span class="frobSpanner" id="' + key + '">' + String(varValue) + '</span>';

        line = line + '<a class="uiButtonWhite unfixButton" style="display:inline-block;margin-left:10px;" id="';
        line = line + varName + '">Unfix</a>';
        line = line + "</p>";

        fixedVariablesHTML += line;
    }

    $j('#fixedVariablesList').html(fixedVariablesHTML);
    $j('#sampleVariablesList').html(sampleVariablesHTML);

};

var ShaderTemplateRenderer = function(problem,fixedVars,vertexShaderSrc,fragShaderSrc) {
    if(!vertexShaderSrc)
    {
        vertexShaderSrc = $j('#shader-box-vs');
    }
    if(!fragShaderSrc)
    {
        fragShaderSrc = $j('#shader-box-fs');
    }
    if(!fixedVars)
    {
        fixedVars = [];
    }

    if(!problem)
    {
        throw new Error("Specify a problem!");
    }
    //getSource takes in a string, an HTML element, or a jquery query
    this.vertexShaderTemplateUniform = getSource(vertexShaderSrc);
    this.vertexShaderTemplateRandom = getSource(vertexShaderSrc);
    this.fragShaderTemplate = getSource(fragShaderSrc);

    this.problem = problem;

    //first format the templates, aka add the minimum / max attributes to the vertex shader and eliminate the hue stuff
    this.formatTemplates();

    var solvingObjectsUniform = this.buildShaders(this.problem.searchWindow2d.sampleVars,'uniform');
    var solvingObjectsRandom = this.buildShaders(this.problem.baseSearchWindow.sampleVars,'random');

    //first make a shader that just draws the surface
    //in order to get a shader like this, we will grab the source code from the first uniform shader for the
    //vertices and then simply use our old frag shader src
    var graphicalShader = new myShader(solvingObjectsUniform.shaders[0].vShaderSrc,fragShaderSrc,problem.searchWindow2d.windowAttributes,false);

    //now we have all the necessary shaders and extractors for an equation and everything. let's go build a solver
    //with all of this

    var solver = new Solver(this.problem,solvingObjectsUniform,solvingObjectsRandom,graphicalShader);

    this.solver = solver;
    //usually the template is not kept in memory, the solver is what the person is interested in
}

ShaderTemplateRenderer.prototype.formatTemplates = function() {
    //first remove the hue code, its not needed
    this.fragShaderTemplate = this.fragShaderTemplate.replace(/\/\/hueStart[\s\S]*?\/\/hueEnd/g,"");

    /*******
    * The big operation here is to replace the uniform attribute declaration of each shader
    * with the proper variable names. The tricky part is that these variable names are different
    * depending on the search window, so we basically have to do this twice with the uniform and
    * base search windows
    *********/

    //next, add all the uniform variables for the two different windows we have
    var minmaxListRandom = this.problem.baseSearchWindow.minmaxList;
    var fixedListRandom = this.problem.baseSearchWindow.fixedList;

    var minmaxListUniform = this.problem.searchWindow2d.minmaxList;
    var fixedListUniform = this.problem.searchWindow2d.fixedList;

    var allToAddRandom = minmaxListRandom.concat(fixedListRandom);
    var allToAddUniform = minmaxListUniform.concat(fixedListUniform);

    var uniformsToAddRandom = "";
    var uniformsToAddUniform = "";

    for(var i = 0; i < allToAddRandom.length; i++)
    {
        var thisLine = "uniform float " + allToAddRandom[i] + ";\n";
        uniformsToAddRandom = uniformsToAddRandom + thisLine;
    }

    for(var i = 0; i < allToAddUniform.length; i++)
    {
        var thisLine = "uniform float " + allToAddUniform[i] + ";\n";
        uniformsToAddUniform = uniformsToAddUniform + thisLine;
    }

    //replace the uniform section with this
    this.vertexShaderTemplateUniform = this.vertexShaderTemplateUniform.replace(/\/\/uniformStart[\s\S]*?\/\/uniformEnd/,uniformsToAddUniform);
    this.vertexShaderTemplateRandom = this.vertexShaderTemplateRandom.replace(/\/\/uniformStart[\s\S]*?\/\/uniformEnd/,uniformsToAddRandom);

    //we should be done! Go do specific shader builds
}

ShaderTemplateRenderer.prototype.buildShaders = function(varsToSolve,type) {
    //ok so essentially loop through in groups of 1-3 variables and compile the shader object to extract them

    //copy this array.
    var varsToSolve = varsToSolve.slice(0);

    var myShaders = [];
    var myExtractors = [];

    while(varsToSolve.length > 0)
    {
        //for now we do one variable per shader
        var varsToExtract = varsToSolve.splice(0,1);

        console.log("building shader for these vars");
        console.log(varsToExtract);

        //SWITCH: random vs uniform shader
        //the shader will render this surface with these variables as the rgb
        var thisShader = null;

        if(type == 'random')
        {
            thisShader = this.buildRandomShaderForVariables(varsToExtract);
        }
        else
        {
            thisShader = this.buildUniformShaderForVariables(varsToExtract);
        }

        //the extractor will take in RGB / a window and return the estimated variable value. it uses closures
        var thisExtractor = this.buildExtractorForVariables(varsToExtract);

        //add this shader to our shaders
        myShaders.push(thisShader);
        myExtractors.push(thisExtractor);
    }

    return {'shaders':myShaders,'extractors':myExtractors};
};

ShaderTemplateRenderer.prototype.buildExtractorForVariables = function(varsToExtract) {
    //i know this code is a bit repetitive but I didn't want to further complicate it

    var minR = "min" + varsToExtract[0].toUpperCase();
    var maxR = "max" + varsToExtract[0].toUpperCase();

    var minG = null; var maxG = null;
    if(varsToExtract.length > 1)
    {
        minG = "min" + varsToExtract[1].toUpperCase();
        maxG = "max" + varsToExtract[1].toUpperCase();
    }

    var minB = null; var maxB = null;
    if(varsToExtract.length > 2)
    {
        minB = "min" + varsToExtract[2].toUpperCase();
        maxB = "max" + varsToExtract[2].toUpperCase();
    }

    var extractor = function(colors,searchWindow) {
        var rRange = searchWindow[maxR].val - searchWindow[minR].val;
        var rPos = (colors.r / 255.0) * rRange + searchWindow[minR].val;

        //we also need the original places in the grid in order to do graphical display of the minimum
        var rPosOrig = (colors.r / 255.0) * 2 - 1;

        var gPos = null; var bPos = null; var gPosOrig = null; var bPosOrig = null;
        if(minG)
        {
            var gRange = searchWindow[maxG].val - searchWindow[minG].val;
            gPos = (colors.g / 255.0) * gRange + searchWindow[minG].val;
            gPosOrig = (colors.g / 255.0) * 2 - 1;
        }
        if(minB)
        {
            var bRange = searchWindow[maxB].val - searchWindow[minB].val;
            bPos = (colors.b / 255.0) * bRange + searchWindow[minB].val;
            bPosOrig = (colors.b / 255.0) * 2 - 1;
        }

        var toReturn = {};
        toReturn[varsToExtract[0]] = rPos;
        toReturn[varsToExtract[0] + "Orig"] = rPosOrig;

        if(gPos)
        {
            toReturn[varsToExtract[1]] = gPos;
            toReturn[varsToExtract[1] + "Orig"] = gPosOrig;
        }
        if(bPos)
        {
            toReturn[varsToExtract[2]] = bPos;
            toReturn[varsToExtract[2] + "Orig"] = bPosOrig;
        }
        return toReturn;
    };

    return extractor;
};

ShaderTemplateRenderer.prototype.doBaseShaderTemplateFormatting = function(varsToExtract,vShaderSrc) {

    //first copy the variable array
    varsToExtract = varsToExtract.slice(0);

    //stick in zeros where there is no variable
    if(varsToExtract.length == 1) { varsToExtract = varsToExtract.concat(["0.0","0.0"]); }
    if(varsToExtract.length == 2) { varsToExtract.push("0.0"); }

    if(varsToExtract.length != 3)
    {
        console.log(varsToExtract);
        throw new Error("what! something is wrong with variable length and array pushing");
    }

    //building and compiling a shader requires a few things. first, we must replace the equation line with the given equationString. then, we must replace
    //the varying vec3 varData with our given variables in the correctly scaled manner. We have to declare all the variables the user wants as floats
    //And finally, we must assign the variables that we are sampling. For the two 'sample directions', these will be derived from their grid positions,
    //but for the fixed variables, it will be a fixed amount.

    var fShaderSrc = this.fragShaderTemplate;

    //here we need all the variables in the problem...
    var allVariables = this.problem.baseSearchWindow.getAllVariables();
    //the declaration as floats
    var varDeclarationString = "float " + allVariables.join(',') + ';';
    //replace it
    vShaderSrc = vShaderSrc.replace(/\/\/varDeclaration[\s\S]*?\/\/varDeclarationEnd/,varDeclarationString);

    //the template for the varData assignment
    var varDataString = "varData = vec3(%var0,%var1,%var2);\n";

    //insert variable strings into the vardata assignment or 0.0 if there's no variable there
    for(var i = 0; i < 3; i++)
    {
        if(varsToExtract[i] == "0.0")
        {
            varDataString = varDataString.replace("%var" + String(i),varsToExtract[i]);
            continue;
        }
        
        //we need to scale these variables to a 0->1 range
        //as well for the extractors to work property
        var min = "min" + varsToExtract[i].toUpperCase();
        var max = "max" + varsToExtract[i].toUpperCase();

        var scaled = "(" + varsToExtract[i] + " - " + min + ")/(" + max + " - " + min + ")";

        varDataString = varDataString.replace("%var" + String(i),scaled);
    }

    //vardata assignment string
    vShaderSrc = vShaderSrc.replace(/\/\/varDataAssignment[\s\S]*?\/\/varDataAssignmentEnd/,varDataString);

    //equation string replace
    vShaderSrc = vShaderSrc.replace(/\/\/equationString[\s\S]*?\/\/equationStringEnd/,this.problem.equationString);

    return {'vShaderSrc':vShaderSrc,'fShaderSrc':fShaderSrc};

};

ShaderTemplateRenderer.prototype.buildUniformShaderForVariables = function(varsToExtract) {

    var baseSource = this.doBaseShaderTemplateFormatting(varsToExtract,this.vertexShaderTemplateUniform);

    var vShaderSrc = baseSource.vShaderSrc;
    var fShaderSrc = baseSource.fShaderSrc;

    //here we must also change the variable assignments for the "sample directions."
    //For all the sample variables, their value is based on the grid, but for the fixed variables,
    //it's a buffered value on the GPU that we will just assign

    var sampleVars = this.problem.searchWindow2d.sampleVars;
    var fixedVars = this.problem.searchWindow2d.fixedVars;

    var varAssignmentBlock = "";

    if(sampleVars.length > 2)
    {
        throw new Error("we cant sample more than 2 variables at once in 3d space!");
    }

    //for the sample variables it needs to be:
    //x = ((aVertexPosition[variableIndex] + 1.0)/(2.0)) * (maxX - minX) + minX;

    for(var i = 0; i < sampleVars.length; i++)
    {
        var min = "min" + sampleVars[i].toUpperCase();
        var max = "max" + sampleVars[i].toUpperCase();

        var line = sampleVars[i] + " = ";
        line = line + "((aVertexPosition[" + String(i) + "] + 1.0)/(2.0))";
        line = line + " * (" + max + " - " + min + ") + " + min + ";\n";

        varAssignmentBlock = varAssignmentBlock + line;
    }

    //for the fixed variables it needs to be:
    //g = fixedGval;
    for(var i = 0; i < fixedVars.length; i++)
    {
        var fixed = "fixed" + fixedVars[i].toUpperCase() + "val";

        var line = fixedVars[i] + " = " + fixed + ";\n";

        varAssignmentBlock = varAssignmentBlock + line;
    }

    //replace entire assignment block
    vShaderSrc = vShaderSrc.replace(/\/\/varAssignment[\s\S]*?\/\/varAssignmentEnd/,varAssignmentBlock); 

    /****Source code modification done!***/

    //now that we have our sources, go compile our shader object with these sources
    var shaderObj = new myShader(vShaderSrc,fShaderSrc,this.problem.searchWindow2d.windowAttributes,false);

    console.log("Generated Shader uniform source for vertex!");
    //console.log(vShaderSrc);
    console.log({'src':vShaderSrc});
    console.log("Generated shader uniform source for frag!");
    //console.log(fShaderSrc);
    console.log({'src':fShaderSrc});

    return shaderObj;
};

ShaderTemplateRenderer.prototype.buildRandomShaderForVariables = function(varsToExtract) {

    //grab the base source and format the easy stuff
    var baseSource = this.doBaseShaderTemplateFormatting(varsToExtract,this.vertexShaderTemplateRandom);

    var vShaderSrc = baseSource.vShaderSrc;
    var fShaderSrc = baseSource.fShaderSrc;

    //now we must do every single sample variable assignment with the myRand() function and indexes to spice up the randomness
    //except fix the fixed variables

    var sampleVars = this.problem.baseSearchWindow.sampleVars;
    var fixedVars = this.problem.baseSearchWindow.fixedVars;

    var varAssignmentBlock = "";

    for(var i = 0; i < sampleVars.length; i++)
    {
        var min = "min" + sampleVars[i].toUpperCase();
        var max = "max" + sampleVars[i].toUpperCase();
        var iFloat = String(i+1) + ".0";

        var line = sampleVars[i] + " = ";
        //an example of the compiled line is:
        //x = myRand(pow(i,3.0) + i * i * float(aVertexPosition[0]) * 17 + i * float(aVertexPosition[1]) * 100) * (maxX - minX) + minX;
        //--or with time--
        //x = myRand(pow(i + time,3.0) + i * i * time * float(aVertexPosition[0]) * 17 + i * pow(time,2.0) * float(aVertexPosition[1]) * 100) * (maxX - minX) + minX;

        //without time
        //line = line + "myRand(pow(" + iFloat + ",3.0) + " + iFloat + " * " + iFloat + " * " + "float(aVertexPosition[0]) * 17.0";
        //line = line + " + " + iFloat + " * float(aVertexPosition[1]) * 100.0) * (" + max + " - " + min + ") + " + min + ";\n";

        //with time
        line = line + "myRand(pow(" + iFloat + " + time,3.0) + " + iFloat + " * " + iFloat + " * " + " time * float(aVertexPosition[0]) * 17.0";
        line = line + " + " + iFloat + " * pow(time,2.0) * float(aVertexPosition[1]) * 100.0 + time) * (" + max + " - " + min + ") + " + min + ";\n";

        varAssignmentBlock = varAssignmentBlock + line;
    }

    for(var i = 0; i < fixedVars.length; i++)
    {
        var fixed = "fixed" + fixedVars[i].toUpperCase() + "val";

        var line = fixedVars[i] + " = " + fixed + ";\n";

        varAssignmentBlock = varAssignmentBlock + line;
    }

    //replace entire assignments block
    vShaderSrc = vShaderSrc.replace(/\/\/varAssignment[\s\S]*?\/\/varAssignmentEnd/,varAssignmentBlock);

    /***Source code modification done****/

    var shaderObj = new myShader(vShaderSrc,fShaderSrc,this.problem.baseSearchWindow.windowAttributes,false);

    console.log("Generated Shader random source for vertex!");
    console.log({'src':vShaderSrc});
    //console.log(vShaderSrc);
    console.log("Generated shader random source for frag!");
    //console.log(fShaderSrc);
    console.log({'src':fShaderSrc});

    return shaderObj;
};


//the SOLVER, it will solve for the minimum given a problem / window and everything :D
var Solver = function(problem,uniformObjects,randomObjects,graphicalShader) {
    this.problem = problem;
    this.baseSearchWindow = problem.baseSearchWindow;
    this.searchWindow2d = problem.searchWindow2d;
    this.graphicalShader = graphicalShader;

    this.zoomWindows = [];

    var now = new Date();
    this.createTime = now.getTime();

    //here the shaders and extractors are tied to each other by index. not exactly elegant by good for now,
    //possible refactor but all the object does is just pass the rgb to the extractor and return.
    this.uniformShaders = uniformObjects.shaders;
    this.uniformExtractors = uniformObjects.extractors;

    this.randomShaders = randomObjects.shaders;
    this.randomExtractors = randomObjects.extractors;

    this.createFrameBuffer();

    var _this = this;
    $j('.unfixButton').live('mousedown',function(e) {
        _this.unfixVariable(e);
    });

    //also clear canvases
    $j(',screenshotCanvas').remove();

    //initial set of the window on the shaders
    this.setWindowOnShaders(this.uniformShaders,this.baseSearchWindow);
    this.setWindowOnShaders(this.randomShaders,this.baseSearchWindow);
}

Solver.prototype.createFrameBuffer = function() {

    //ok lets make a frame buffer for our own solving reasons
    this.frameBuffer = gl.createFramebuffer();
    //default frame buffer sizes (framebuffer sizes)
    this.frameBuffer.width = 200;
    this.frameBuffer.height = 200;

    this.texture = gl.createTexture();
    this.renderBuffer = gl.createRenderbuffer();

    //default frame buffer sizes (framebuffer sizes)
    //bind the framebuffer for the following operations
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.frameBuffer);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);

    //set it to rgba
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.frameBuffer.width, this.frameBuffer.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    //now bind renderbuffer and do storage
    gl.bindRenderbuffer(gl.RENDERBUFFER,this.renderBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.frameBuffer.width, this.frameBuffer.height);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.renderBuffer);

    //reset all
    gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindRenderbuffer(gl.RENDERBUFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
};

Solver.prototype.unfixVariable = function(e) {
    //make a new problem without this variable as a fixed variable and then
    //overwrite the global variable
    console.log(e);
};

Solver.prototype.graphicalDraw = function(cameraUpdates) {
    this.graphicalShader.drawGrid(cameraUpdates);
};

Solver.prototype.solvePass = function() {

    var numSampleVars = this.problem.baseSearchWindow.sampleVars.length;

    //first, dispatch to the appropriate N-d wrappers
    if(numSampleVars > 2)
    {
        throw new Error("sample vars more than 2 not supported yet!!");
    }

    if(numSampleVars == 2)
    {
        return this.easy2dSolveWrapper();
    }
};

Solver.prototype.handleExtendZ = function(results) {

    if(results.increaseZ)
    {
        console.log("increasing z");
        this.baseSearchWindow.windowAttributes.minZ.val += 1;
        this.baseSearchWindow.windowAttributes.maxZ.val += 1.1;

    } else if (results.decreaseZ) {
        console.log("decreasing z");
        this.baseSearchWindow.windowAttributes.minZ.val -= 1;
        this.baseSearchWindow.windowAttributes.maxZ.val -= 0.9;
    }
    if(results.decreaseZ || results.increaseZ)
    {
        //update the control UI
        $j('#minZ').html(String(this.baseSearchWindow.windowAttributes.minZ.val
                        ).substring(0,5));
        $j('#maxZ').html(String(this.baseSearchWindow.windowAttributes.maxZ.val
                        ).substring(0,5));
    }
};

Solver.prototype.easy1dSolveWrapper = function() {
    this.updateTimeOnAll();

    var results = this.easyUniformSolve();

    this.handleExtendZ(results);
    if(!results)
    {
        this.baseSearchWindow.reset();
        this.setWindowOnShaders(this.uniformShaders,this.baseSearchWindow);
        results = this.easyUniformSolve();
    }
    if(!results)
    {
        return; //bootup time issue
    }

    //ok now actually set the position of the ball (along x)
    var minPos = results.minPos;

    var ballPos = {};
    ballPos.zOrig = minPos.zOrig;

    var sampleVarName = this.baseSearchWindow.sampleVars[0];
    var sv = sampleVarName;
    var maxSv = "max" + sv.toUpperCase();
    var minSv = "min" + sv.toUpperCase();

    var maxSvVal = this.baseSearchWindow.windowAttributes[maxSv].val;
    var minSvVal = this.baseSearchWindow.windowAttributes[minSv].val;

    ballPos.xOrig = (minPos[sv] - minSvVal) / (maxSvVal - minSvVal) * 2 - 1;
    ballPos.yOrig = 0;

    return ballPos;
};

Solver.prototype.easy2dSolveWrapper = function() {

    this.updateTimeOnAll();
    this.setWindowOnShaders(this.uniformShaders,this.baseSearchWindow);

    //first do a coarsely-sampled 2d solve
    var results = this.easyUniformSolve();

    //if it breaks, go reset the window
    if(!results)
    {
        this.baseSearchWindow.reset();
        this.setWindowOnShaders(this.uniformShaders,this.baseSearchWindow);
        results = this.easyUniformSolve();
    }

    if(!results) //if its still broken, we might be waiting for the gpu to buffer or something
    {
        return;
    }

    this.handleExtendZ(results);

    var pos = results.minPos;

    //then make a zoom window on this coarse solution and further zoom in
    var zoomWindow = this.baseSearchWindow.makeZoomWindow(pos,0.05);
    this.setWindowOnShaders(this.uniformShaders,zoomWindow);

    //get the 2d solve results with the zoomed window
    var zoomResults = this.easyUniformSolve(zoomWindow.windowAttributes);
    var zoomPos = zoomResults.minPos;

    if(!asd) //debug
    {
        console.log("zoompos",zoomPos," and pos", pos);
        asd = true;
    }

    //now go ahead and update the original "pos" result with the more accurate results,
    //both for the x and y but also reconstructing the xOrig and yOrig

    pos.x = zoomPos.x;
    pos.y = zoomPos.y;


    ballPos = {};
    ballPos.zOrig = pos.zOrig;
    ballKeys = ['xOrig','yOrig'];

    for(var i = 0; i < 2; i++)
    {
        var varName = this.baseSearchWindow.sampleVars[i];
        var v = varName;
        var minV = "min" + v.toUpperCase();
        var maxV = "max" + v.toUpperCase();
        var minVval = this.baseSearchWindow.windowAttributes[minV].val;
        var maxVval = this.baseSearchWindow.windowAttributes[maxV].val;

        ballPos[ballKeys[i]] = (pos[v] - minVval)/(maxVval - minVval) * 2 - 1;
    }

    //reset our search window
    this.setWindowOnShaders(this.uniformShaders,this.problem.baseSearchWindow);
    return ballPos;
};



Solver.prototype.setWindowOnShaders = function(shaders,searchWindow) {
    for(var i = 0; i < shaders.length; i++)
    {
        shaders[i].updateAttributes(searchWindow.windowAttributes);
    }
};

Solver.prototype.updateTimeOnAll = function() {

    //if the problem wants time in order to drive the simulation, 
    //go ahead and buffer it onto all the shaders i contain

    if(this.problem.wantsTime)
    {
        var now = new Date();
        var deltaT = (now.getTime() - startTime) / 1000.0;
        for(var i = 0; i < this.uniformShaders.length; i++)
        {
            this.uniformShaders[i].updateTime(deltaT);
        }
        for(var i = 0; i < this.randomShaders.length; i++)
        {
            this.randomShaders[i].updateTime(deltaT);
        }
    }
};

Solver.prototype.easyUniformSolve = function(searchWindowAttributes) {

    shouldSwitchToBuffer = true;
    var offSet = 0; //an offset for the screenshots

    if(shouldSwitchToBuffer)
    {
        //switch to the frame buffer that's hidden! so we can do our drawing for solving here
        gl.bindFramebuffer(gl.FRAMEBUFFER,this.frameBuffer);

        gl.viewport(0,0, this.frameBuffer.width, this.frameBuffer.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    //this function is only called when there are 2 sample variables, so we can use the baseSearchWindow
    if(!searchWindowAttributes)
    {
        offSet = 2; //if we are solving on a zoomed window, dump 2 different screenshots
        searchWindowAttributes = this.baseSearchWindow.windowAttributes;
    }

    //ok so essentially loop through our shaders,
    //draw each shader, get the RGB at the min,
    //and then pass that into the extractor to get the positions
    var totalMinPosition = {};

    for(var passIndex = 0; passIndex < this.uniformShaders.length; passIndex++)
    {
        //call CLEAR on the frame buffer between each draw
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        //draws the surface with the right coloring
        this.uniformShaders[passIndex].drawGrid();
        
        //get the RGB on the current frame buffer for this surface
        if(shouldSwitchToBuffer)
        {
            var colors = findRGBofBottomFrameBuffer(this.frameBuffer.height,this.frameBuffer.width);

            //interactive mode
            dumpScreenShot(this.frameBuffer.height,this.frameBuffer.width,passIndex+offSet);
            
            if(colors.noneFound) //this occurs for a while once we boot, so only return null after a 3 seconds
            {
                var now = new Date();
                var nowTime = now.getTime();
                if(nowTime - this.createTime > 3 * 1000)
                {
                    console.warn("none found after bootup time, resetting window :O");
                    return null;
                }
            }

            //also go color in the area we found
            var cvs = $j('#screenshot' + String(passIndex + offSet))[0];
            var ctx = cvs.getContext('2d');
            ctx.fillStyle = "rgb(255,255,255)";
            ctx.fillRect(colors.col - 2,this.frameBuffer.height - colors.row - 2,4,4);
        }

        var thesePositions = this.uniformExtractors[passIndex](colors,searchWindowAttributes);

        //merge these positions into the global solution
        for(key in thesePositions)
        {
            totalMinPosition[key] = thesePositions[key];
        }
    }

    //decrease the z coordinate if the minimum z we got was somewhat close to the bottom of the frame buffer
    //and vice versa
    var shouldDecreaseZ = colors.yHeight < 0.2;
    var shouldIncreaseZ = colors.yHeight > 0.8;

    //estimate the z coordinate for putting the ball in the right place. this is easy and
    //doesn't refer to the window attributes
    var estZ = colors.yHeight * 2 + -1;
    totalMinPosition.zOrig = estZ;

    //switch back from the frame buffer
    if(shouldSwitchToBuffer)
    {
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }

    //return the results
    return {'minPos':totalMinPosition,'increaseZ':shouldIncreaseZ,'decreaseZ':shouldDecreaseZ};
}


var myShader = function(vShaderSrc,fShaderSrc,uniformAttributes,isBall) {
    this.vShaderSrc = getSource(vShaderSrc);
    this.fShaderSrc = getSource(fShaderSrc);

    //force it to include time as well, even if its not explicity in the equation
    uniformAttributes.time = {type:'f','val':0};

    this.uniformAttributes = uniformAttributes;
    this.shaderProgram = null;

    if(isBall)
    {
        this.isBall = true;
    }
    else
    {
        this.isBall = false;
    }

    this.buildShader();
    this.buildAttributes();
    this.bufferUniforms();
};

myShader.prototype.buildShader = function() {
    var vShader = compileShader(this.vShaderSrc,"vertex");
    var fShader = compileShader(this.fShaderSrc,"frag");

    this.shaderProgram = gl.createProgram();
    gl.attachShader(this.shaderProgram,vShader);
    gl.attachShader(this.shaderProgram,fShader);
    gl.linkProgram(this.shaderProgram);

    var linkStatus = gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS);

    if(linkStatus != true)
    {
        console.warn("could not init shader",this.vShaderSrc);
    }
}

myShader.prototype.buildAttributes = function() {
    this.switchToShader();

    //always vertices as well
    this.shaderProgram.vertexPositionAttribute = gl.getAttribLocation(this.shaderProgram,"aVertexPosition");
    gl.enableVertexAttribArray(this.shaderProgram.vertexPositionAttribute);

    if(this.isBall)
    {
        //we also need color for the ball
        this.shaderProgram.vertexColorAttribute = gl.getAttribLocation(this.shaderProgram,"aVertexColor");
        gl.enableVertexAttribArray(this.shaderProgram.vertexColorAttribute);
    }

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

    if(!this.isBall)
    {
        //bind the buffer
        gl.bindBuffer(gl.ARRAY_BUFFER,gridVertexPositionBuffer);
        gl.vertexAttribPointer(this.shaderProgram.vertexPositionAttribute, gridVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, gridVertexPositionBuffer.numItems);
    }
    else
    {
        //bind both position and color
        gl.bindBuffer(gl.ARRAY_BUFFER,ballVertexPositionBuffer);
        gl.vertexAttribPointer(this.shaderProgram.vertexPositionAttribute, ballVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER,ballVertexColorBuffer);
        gl.vertexAttribPointer(this.shaderProgram.vertexColorAttribute, ballVertexColorBuffer.itemSize, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ballVertexIndexBuffer);
        gl.drawElements(gl.TRIANGLES, ballVertexIndexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
    }
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
    this.switchToShader();

    this.uniformAttributes['time'].val = timeVal;

    gl.uniform1f(this.shaderProgram.timelocation,timeVal); 
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

    var ballAttributes = {
        'pMatrix':{type:'4fm',val:pMatrix},
        'mvMatrix':{type:'4fm',val:mvMatrix},
        'xPos':{type:'f',val:0},
        'yPos':{type:'f',val:0},
        'zPos':{type:'f',val:0},
    };

    blendShaderObj = new myShader($j("#shader-box-vs"),$j("#shader-box-fs"),attributes,false);
    ballShaderObj = new myShader($j("#shader-simple-vs"),$j("#shader-simple-fs"),ballAttributes,true);
}

var otherFramebuffer;

function initOtherFrameBuffer() {
    //make frame buffer
    otherFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,otherFramebuffer);
    otherFramebuffer.width = $j(window).width();
    otherFramebuffer.height = $j(window).height();

    //something with a render buffer?
    //var renderbuffer = gl.createRenderbuffer();
    //gl.bindRenderbuffer(gl.RENDERBUFFER,renderbuffer);
    //gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, otherFramebuffer.width, otherFramebuffer.height);

    //reset back to default
    gl.bindRenderbuffer(gl.RENDERBUFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

var mvMatrix = mat4.create();
var mvMatrixStack = [];
var pMatrix = mat4.create();

var orthogProjMatrix = mat4.create();
var standardMoveMatrix = mat4.create();

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

    var sym = 3;

    var attributes = {
        'time':{type:'f',val:deltaT},
        'minX':{type:'f',val:-sym},
        'maxX':{type:'f',val:sym},
        'maxY':{type:'f',val:-sym},
        'minY':{type:'f',val:sym},
        'minZ':{type:'f',val:-sym},
        'maxZ':{type:'f',val:sym},
        'pMatrix':{type:'4fm',val:pMatrix},
        'mvMatrix':{type:'4fm',val:mvMatrix},
    };

    blendShaderObj.updateAttributes(attributes);
}

function degToRad(degrees) {
    return degrees * Math.PI / 180;
}
var gridVertexPositionBuffer;

var ballVertexPositionBuffer;
var ballVertexColorBuffer;
var ballVertexIndexBuffer;

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

    var xDivisor = (xMaxBoard - xMinBoard) / (numRows - 1);
    var yDivisor = (yMaxBoard - yMinBoard) / (numRows - 1);

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

    
    //do the ball too
    initBallBuffers();
}

function initBallBuffers() {
    //generate the points to draw

    var latitudeBands = 10;
    var longitudeBands = 10;
    var radius = 0.2;

    var ballVertexPositions = [];
    var ballVertexColors = [];

    for (var latNumber=0; latNumber <= latitudeBands; latNumber++) {
        var theta = latNumber * Math.PI / latitudeBands;
        var sinTheta = Math.sin(theta);
        var cosTheta = Math.cos(theta);

        for (var longNumber=0; longNumber <= longitudeBands; longNumber++) {
                var phi = longNumber * 2 * Math.PI / longitudeBands;
                var sinPhi = Math.sin(phi);
                var cosPhi = Math.cos(phi);

                var x = cosPhi * sinTheta;
                var y = cosTheta;
                var z = sinPhi * sinTheta;

                ballVertexPositions.push(radius * x);
                ballVertexPositions.push(radius * y);
                ballVertexPositions.push(radius * z);

                //push colors
                ballVertexColors.push(0);
                ballVertexColors.push(x*0.5 + 0.5);
                ballVertexColors.push(z*0.5 + 0.5);
                ballVertexColors.push(0.9);
        }
    }

    var indexData = [];
    for (var latNumber=0; latNumber < latitudeBands; latNumber++) {
        for (var longNumber=0; longNumber < longitudeBands; longNumber++) {

            var first = (latNumber * (longitudeBands + 1)) + longNumber;
            var second = first + longitudeBands + 1;

            indexData.push(first);
            indexData.push(second);
            indexData.push(first + 1);

            indexData.push(second);
            indexData.push(second + 1);
            indexData.push(first + 1);
        }
    }

    ballVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ballVertexPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ballVertexPositions), gl.STATIC_DRAW);

    ballVertexColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ballVertexColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ballVertexColors), gl.STATIC_DRAW);

    ballVertexPositionBuffer.itemSize = 3;
    ballVertexPositionBuffer.numItems = ballVertexPositions.length / ballVertexPositionBuffer.itemSize;

    ballVertexColorBuffer.itemSize = 4;
    ballVertexColorBuffer.numItems = ballVertexColors.length / ballVertexColorBuffer.itemSize;

    ballVertexIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ballVertexIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexData), gl.STATIC_DRAW);

    ballVertexIndexBuffer.itemSize = 1;
    ballVertexIndexBuffer.numItems = indexData.length / 1;
}

/*
function getArcAtMousePos(x,y) {
    ***********this is old but i want to reference this code later!!!***
    //flip y
    y = gl.viewportHeight - y;

    //real quick, render the frame but in pick mode into another buffer!
    gl.bindFramebuffer(gl.FRAMEBUFFER, otherFramebuffer);
    drwScneIntoOtherBuffer();

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
    setObjUniforms();
    blendShaderObj.drawGrid(cameraUpdates);
}

function drawScene2() {

    cameraUpdates = {
        'pMatrix':{type:'4fm','val':pMatrix},
        'mvMatrix':{type:'4fm','val':mvMatrix},
    };

    var pos = solver.solvePass();

    cameraPerspectiveClear();
    translateAndRotate();

    ballUpdates = {
        'pMatrix':{type:'4fm','val':pMatrix},
        'mvMatrix':{type:'4fm','val':mvMatrix},
        'xPos':{type:'f','val':pos.xOrig},
        'yPos':{type:'f','val':pos.yOrig},
        'zPos':{type:'f','val':pos.zOrig},
    };

    //here, we draw the grid with our shader object
    solver.graphicalDraw(cameraUpdates);

    ballShaderObj.drawGrid(ballUpdates);

    /*
    var rightnow = new Date();
    if(rightnow.getTime() % 123 == 0)
    {
        console.log("min pos is", pos);
    }
    */

}

var asd = true;

function cameraPerspectiveClear() {

    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    //we set our clearColor to be 0 0 0 0, so its essentially transparent.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.ortho(-0.0519,0.0519,-0.0414,0.0414,0.1,100.0,pMatrix);
}

function buildStandardMatrices() {

    mat4.ortho(-0.0519,0.0519,-0.0414,0.0414,0.1,100.0,orthogProjMatrix);

    //standardMoveMatrix
    mat4.identity(standardMoveMatrix);
    mat4.translate(standardMoveMatrix, [0, 0, -2]);

    var newRot = mat4.create();
    mat4.identity(newRot);

    //now need to get the other axis
    var secondRotAxis = vec3.create();
    var result = vec3.create();

    secondRotAxis[0] = 1;
    mat4.multiplyVec3(newRot,secondRotAxis,result);

    mat4.rotate(newRot,degToRad(-90), [result[0],result[1],result[2]]);
    mat4.rotate(newRot,degToRad(0.0), [0,1,0]);

    var standardScale = 0.04;
    mat4.scale(standardMoveMatrix,[standardScale,standardScale,standardScale]);

    mat4.multiply(standardMoveMatrix, newRot);
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

    buildStandardMatrices();
   
    canvas = document.getElementById("earth-canvas");
    initGL(canvas);
    initShaders();
    initGridBuffers();

    initOtherFrameBuffer();

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.enable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

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

    ourScaleTween = new TWEEN.Tween(scaleVariablesForTween).to({'scale':0.03},tweenTime*1.5).onUpdate(scaleTweenUpdate);
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

    return compileShader(str,shaderScript.type);
}

function compileShader(str,type) {

    var shader;
    if (type == "x-shader/x-fragment" || type == "frag" || type == "fragment") {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (type == "x-shader/x-vertex" || type == "vertex") {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
        throw new Error("invalid shader type: " + type);
        return null;
    }

    gl.shaderSource(shader, str);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error("Compile Error:" + String(gl.getShaderInfoLog(shader)));
    }

    return shader;
}

function getPixelData(x,y,width,height)
{
    var pixelValues = new Uint8Array(4 * (width+1) * (height+1));
    gl.readPixels(x,y,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixelValues);

    return pixelValues;
}

function dumpScreenShot(height,width,shaderNum)
{
    if(!height)
    {
        height = gl.viewportHeight;
        width = gl.viewportWidth;
        shaderNum = 0;
    }

    //get the pixel data from the current framebuffer
    var pixels = getPixelData(0,0,width,height);

    //get or make the snapshot canvas
    var getOrMakeCanvas = function(id) {
        var cvs= document.getElementById(id);
        if(!cvs)
        {
            cvs = document.createElement('canvas');
            cvs.id = id;
            document.getElementById('holder-for-screenshots').appendChild(cvs);
            $j('#' + id).addClass('screenshotCanvas');
        }
        return cvs;
    };
    //get or make the snapshot canvas
    var cvs = getOrMakeCanvas("screenshot" + String(shaderNum));

    cvs.width = width;
    cvs.height = height;

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

    //put the image onto the canvas
    ctx2d.putImageData(image, 0, 0);
}

function colorIntToPosition(colorValue,coordMin,coordMax,numRows)
{
    var positionInUniformGridFromMin = (colorValue / 255.0);

    /* OBSOLETE
    //we will round this position in the uniform grid by going to numrows, rounding, and then back
    var roundedPos = Math.round(positionInUniformGridFromMin * (numRows - 1));
    var coordDivisor = (coordMax - coordMin) / (numRows - 1);

    //yay this works!
    //console.log("the rounded pos is",roundedPos);
    //console.log("coord divisor",coordDivisor);
    
    //rounded pos is the 0-indexed base position of the row in the grid. aka for a 3 row grid, 0 is the min, 1 is middle, 2 is max
    //so then to get the "snapped" coordinate, we take the position, multiply it by the divisor, and then add it to the min
    var coordPos = coordDivisor * roundedPos + coordMin;
    */
    var coordPos = coordMin + (coordMax - coordMin) * positionInUniformGridFromMin;

    return coordPos;
}

function makeCoordToIndexConverter(height,width) {
    var converter = function(x,y) {
            var index = 4*(y * width + x);
            return index;
    };
    return converter;
}

function findRGBofBottomFrameBuffer(heightOfBuffer,widthOfBuffer) {
    //default to viewport if nothing is specified
    if(!heightOfBuffer)
    {
        heightOfBuffer = gl.viewportHeight;
    }
    if(!widthOfBuffer)
    {
        widthOfBuffer = gl.viewportWidth;
    }

    //use a closure to simplify our conversion process
    var converter = makeCoordToIndexConverter(heightOfBuffer,widthOfBuffer);

    //its actually faster to copy all the pixels at once and loop through that Uint8 array
    var allPixels = getPixelData(0,0,widthOfBuffer,heightOfBuffer);

    var anyColorPositive = function(x,y) {
        var rIndex = converter(x,y);
        return allPixels[rIndex] || allPixels[rIndex+1] || allPixels[rIndex+2] || allPixels[rIndex+3];
    };

    //scan from the bottom to the top on the current frame buffer, and return once we find something thats
    //nonzero. Make sure to take the middle of the row that has an optimum
    for(var y = 0; y < heightOfBuffer; y++)
    {
        for(var x = 0; x < widthOfBuffer; x++)
        {
            if(anyColorPositive(x,y))
            {
                //here we need to loop forward while the row still has positive colors just so we can get the middle
                var xLeft = x;
                var xRight = x + 1;
                //move right while there are still positive colors
                while(xRight < widthOfBuffer && anyColorPositive(xRight,y))
                {
                    xRight++;
                }
                xRight--; //subtract one because we broke the loop condition

                //now get the "middle." We use floor because sometimes we overshoot
                var xMiddle = Math.round(xRight*0.5 + xLeft*0.5);

                var rIndex = converter(xMiddle,y);

                if(!anyColorPositive(xMiddle,y))
                {
                    console.warn("warning! got an empty pixel after rounding and searching");
                }
                
                var r = allPixels[rIndex];
                var g = allPixels[rIndex+1];
                var b = allPixels[rIndex+1];

                //return these optimums and the location where we found z
                var yHeight01 = (y / heightOfBuffer);
                return {
                    'r':r,
                    'g':g,
                    'b':b,
                    'yHeight':yHeight01,
                    'row':y,
                    'col':xMiddle
                };
            }
        }
    }

    //this line should never execute unless we are on a completely empty framebuffer
    //console.warn("found nothing on frame buffer!");
    return {'r':0,'g':0,'b':0,'noneFound':true,'yHeight':0.5};
};
var minXpixel; var minYpixel;

