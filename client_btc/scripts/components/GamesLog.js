define([
    'lib/react',
    'lib/clib',
    'game-logic/engine'
], function(
    React,
    Clib,
    Engine
){

    /** Constants **/
    var MAX_GAMES_SHOWED = 50;

    var D = React.DOM;

    function getState(){
        return {
            engine: Engine
        }
    }

    function copyHash(gameId, hash) {
        return function() {
            prompt('Game ' + gameId + ' Hash: ', hash);
        }
    }

    return React.createClass({
        displayName: 'gamesLog',

        getInitialState: function () {
            return getState();
        },

        componentDidMount: function() {
            Engine.on({
                game_crash: this._onChange
            });
        },

        componentWillUnmount: function() {
            Engine.off({
                game_crash: this._onChange
            });
        },

        _onChange: function() {
            //Check if its mounted because when Game view receives the disconnect event from EngineVirtualStore unmounts all views
            //and the views unregister their events before the event dispatcher dispatch them with the disconnect event
            if(this.isMounted())
                this.setState(getState());
        },

        render: function () {
            var self = this;

            var rows = self.state.engine.tableHistory.slice(0, MAX_GAMES_SHOWED).map(function (game, i) {
                var cashed_at, bet, profit;
                var player = game.player_info[self.state.engine.username];

                if (player) {
                    bet = player.bet;

                    //If the player won
                    if (player.stopped_at) {
                        profit = ((player.stopped_at / 100) * player.bet) - player.bet;
                        cashed_at = Clib.formatDecimals(player.stopped_at / 100, 2);

                        //If the player lost
                    } else {
                        profit = -bet;
                        cashed_at = '-';
                    }

                    profit = Clib.formatSatoshis(profit);
                    bet = Clib.formatSatoshis(bet);

                    //If we didn't play
                } else {
                    cashed_at = '-';
                    bet = '-';
                    profit = '-';
                }

                var className;
                if (game.game_crash >= 198)
                    className = 'games-log-goodcrash';
                else if (game.game_crash <= 196)
                    className = 'games-log-badcrash';
                else
                    className = '';

                return D.tr({ key: 'game_' + i },

                    D.td(null,
                        D.a({ href: '/game/btc/' + game.game_id, target: '_blank',
                            className: className
                        },
                            Clib.formatDecimals(game.game_crash / 100, 2), D.i(null, 'x'))
                        ),
                    D.td(null, cashed_at),
                    D.td(null, bet),
                    D.td(null, profit)

                );
            });


            return D.div({ className: 'history'},
              D.div({ className: 'header-bg'}),
              D.div({ className: 'table-inner'},
                D.table({ className: 'games-log' },
                  D.thead(null,
                    D.tr(null,
                      D.th(null,
                        D.div({ className:'th-inner'}, 'Crash')
                      ),
                    D.th(null,
                        D.div({ className:'th-inner'}, '@')
                      ),
                      D.th(null,
                        D.div({ className:'th-inner'}, 'Bet')
                      ),
                      D.th(null,
                        D.div({ className:'th-inner'}, 'Profit')
                      )
                    )
                  ),
                  D.tbody(null,
                    rows
                  )
                )
              )
            );
        }

    });

});