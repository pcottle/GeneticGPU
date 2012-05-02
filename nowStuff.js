function joinRoom(roomName) {
    //join the room via node, and then update the equation with what the room has

}

function makeAndJoinRoom(roomName) {
    //NODEJS TODO NOWJS

}

function changeRoomEquation(equationString) {

}

function doNodeStuff() {
    if(!now)
    {
        alert("no now.js detected, entering no-network mode");
    }

    defineNowFunctions();
    roomUpdate();
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
    };

    now.receiveEquation = function(equationInfo) {
        //TODO: will basically make a new problem and all of that stuff, hopefully call to
        //aux method
    };

    now.receiveMessage = function(message) {
        //append to the message dom
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

