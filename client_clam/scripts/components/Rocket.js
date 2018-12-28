define(['lib/react', 'lib/clib'],

    function(React, Clib) {
        var D = React.DOM;

        return React.createClass({
            displayName: 'Rocket',

            propType: {
                engine: React.PropTypes.object.isRequired
            },

            componentWillMount: function() {
            },

            componentWillUnmount: function() {
                this.mounted = false;
            },

            componentDidMount: function() {
                this.gameMultiplier = document.getElementById("game-multiplier");
                this.spaceWrap = document.getElementById("space-wrap");
                this.rocket = document.getElementById("rocket");
                this.mounted = true;
                this.animRequest = window.requestAnimationFrame(this.draw);
            },

            framesToSkip: 2, // 60 (default) / 2 = 30 fps
            counter: 0,

            draw: function() {
                if(this.mounted) {
                    if (this.counter < this.framesToSkip) {
                        this.counter++;
                        window.requestAnimationFrame(this.draw);
                        return;
                    }
                    this.counter = 0;

                    this.setData(this.props.engine);
                    this.drawGameData();

                    window.requestAnimationFrame(this.draw);
                }
            },

            setData: function(engine) {
                this.engine = engine;
                this.gameState = engine.gameState;
                this.userState = engine.userState;

                this.cashingOut = engine.cashingOut;

                this.lag = engine.lag;

                this.startTime = engine.startTime;

                if(this.gameState == 'IN_PROGRESS') {
                    this.lastBalance = engine.getGamePayout(); //Payout in percentage
                    this.currentTime = engine.getElapsedTime();
                } else {
                    this.lastBalance = 0;
                    this.currentTime = 0;
                }
            },

            clean: function() {

            },

            drawRocket: function() {

            },

            drawGameData: function() {
              var lastGameCrashedAt = this.engine.tableHistory[0].game_crash

                if(this.engine.gameState === 'IN_PROGRESS') {
                    this.gameMultiplier.innerHTML = parseFloat(this.lastBalance).toFixed(2) + 'x';
                    if (this.spaceWrap.className.indexOf("waiting") !== -1) {
                        this.spaceWrap.className = this.spaceWrap.className.replace(" waiting", "");
                    }
                    if (this.spaceWrap.className.indexOf("flying") === -1) {
                        this.spaceWrap.className += " flying";
                    }
                } else {
                    if (this.spaceWrap.className.indexOf("flying") !== -1) {
                        this.spaceWrap.className = this.spaceWrap.className.replace(" flying", "");
                    }
                    if (this.spaceWrap.className.indexOf("waiting") === -1) {
                        this.spaceWrap.className += " waiting";
                    }
                }

                //If the engine enters in the room @ ENDED it doesnt have the crash value, so we dont display it
                if(this.engine.gameState === 'ENDED' && lastGameCrashedAt) {
                    var html = 'Rocket exploded' + '<br>' + 'at ' + lastGameCrashedAt / 100 + 'x';
                    this.gameMultiplier.innerHTML = html;
                    if (this.rocket.className.indexOf("crash") === -1) {
                        this.rocket.className += " crash";
                        this.rocket.className = this.rocket.className.replace(" launch", "");
                    }
                } else {
                    if (this.engine.gameState === 'IN_PROGRESS' && this.rocket.className.indexOf("crash") !== -1) {
                        this.rocket.className = this.rocket.className.replace(" crash", "");
                    }
                    if (this.engine.gameState === 'IN_PROGRESS' && this.rocket.className.indexOf("launch") === -1) {
                        this.rocket.className += " launch";
                    }
                }

            },

            render: function() {
                return D.div();
            }

        });

    }
)
