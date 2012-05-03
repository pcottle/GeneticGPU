function joinRoom(roomName) {
    //join the room via node
    now.changeRoom(roomName);

    //TODO: update equation here

}

function getMyEquationInfo() {
    var equationString = solver.problem.equationString;
    var fixedVars = solver.baseSearchWindow.fixedVars;

    var equationInfo = {
        'equationString':equationString,
        'fixedVars':fixedVars,
        'fixAllBut2':false
    };

    return equationInfo;
}

function makeAndJoinRoom(roomName) {
    //make the room, using our current variables
    var equationInfo = getMyEquationInfo();

    now.makeRoom(roomName,equationInfo);
    //will join automatically once its made
}

function changeRoomEquation(equationInfo) {
    if(!window.now || !window.now.changeEquation)
    {
        return;
    }

    //update it, we will receive the equation as well but whatever
    now.changeEquation(now.room,equationInfo);
}

function doNodeStuff() {
    if(!window.now)
    {
        alert("no now.js detected, entering no-network mode");
    }

    now.ready(function() {
        defineNowFunctions();
        roomUpdate();
    });
}

function defineNowFunctions() {
    now.receiveNetworkMinimum = function(minPos) {
        //go to the current solver's saver
        if(!window.solver)
        {
            return;
        }

        solver.minSaver.receiveNetworkMin(minPos);
    };

    now.receiveTotal = function(total) {
        now.total = total;

        //our position should be set
        if(!now.position)
        {
            alert("no position set! error");
            return;
        }

        //now update the bounds on the main search window
        solver.baseSearchWindow.divideUpSearchSpace(now.position,total);

        now.receiveMessage("Dividing up search space with new total of " + String(total));
    };

    now.receiveRoom = function(room) {
        //for some reason this isnt setting the room correctly...
        now.room = room;
        now.receiveMessage("Set room to " + room);
    };

    now.receiveEquation = function(equationInfo) {
        console.log("equation info is",equationInfo);
        now.receiveMessage("Changing equation to " + equationInfo.equationString);
        changeOurEquation(equationInfo);
    };

    now.receiveMessage = function(message) {
        //append to the message dom
        $j('#networkMessages').prepend('<p>' + message + '</p>');
    };
}

function roomUpdate() {

    //first check if we are being linked to a room....
    var href = window.location.href;

    results = /room=(\w+)/.exec(href);
    var room = null;

    if(results)
    {
        //we got linked to a room, go join it
        room = results[1];
        joinRoom(room);
    }
    else
    {
        //make room
        room = randomString(5);
        makeAndJoinRoom(room);
        //link room
        history.pushState(null,'Genetic GPU!',"?room=" + room);
    }
}

