define([
    'lib/react',
    'lib/clib',
    'lib/lodash',
    'components/Countdown',
    'components/BetButton',
    'components/CashOutButton',
    'actions/ControlsActions',
    'stores/ControlsStore',
    'game-logic/engine'
], function(
    React,
    Clib,
    _,
    CountDownClass,
    BetButtonClass,
    CashOutButtonClass,
    ControlsActions,
    ControlsStore,
    Engine
){

    var Countdown = React.createFactory(CountDownClass);
    var BetButton = React.createFactory(BetButtonClass);
    var CashOutButton = React.createFactory(CashOutButtonClass);

    var D = React.DOM;

    function getState(){
        return {
            betSize: ControlsStore.getBetSize(),
            cashOut: ControlsStore.getCashOut(),
            engine: Engine
        }
    }

    return React.createClass({
        displayName: 'Controls',

        getInitialState: function () {
            return getState();
        },


        componentDidMount: function() {
            ControlsStore.addChangeListener(this._onChange);
            Engine.on({
                game_started: this._onChange,
                game_crash: this._onChange,
                game_starting: this._onChange,
                player_bet: this._onChange,
                cashed_out: this._onChange,

                placing_bet: this._onChange,
                bet_placed: this._onChange,
                bet_queued: this._onChange,
                cashing_out: this._onChange,
                cancel_bet: this._onChange
            });
        },

        componentWillUnmount: function() {
            ControlsStore.removeChangeListener(this._onChange);
            Engine.off({
                game_started: this._onChange,
                game_crash: this._onChange,
                game_starting: this._onChange,
                player_bet: this._onChange,
                cashed_out: this._onChange,


                placing_bet: this._onChange,
                bet_placed: this._onChange,
                bet_queued: this._onChange,
                cashing_out: this._onChange,
                cancel_bet: this._onChange
            });
        },

        _onChange: function() {
            //Check if its mounted because when Game view receives the disconnect event from EngineVirtualStore unmounts all views
            //and the views unregister their events before the event dispatcher dispatch them with the disconnect event
            if(this.isMounted())
                this.setState(getState());
        },

        _placeBet: function () {
            var bet = parseFloat(Math.round(this.state.betSize * 1e8));
            console.assert(_.isFinite(bet));

            var cashOut = parseFloat(this.state.cashOut);
            console.assert(_.isFinite(cashOut));
            cashOut = Math.round(cashOut * 100);
            console.assert(_.isFinite(cashOut));

            ControlsActions.placeBet(bet, cashOut);
        },

        _cancelBet: function() {
            ControlsActions.cancelBet();
        },

        _cashOut: function() {
            ControlsActions.cashOut();
        },

        _setBetSize: function(betSize) {
            ControlsActions.setBetSize(betSize);
        },

        _setAutoCashOut: function(autoCashOut) {
            ControlsActions.setAutoCashOut(autoCashOut);
        },

        /** If the bet quantity is ok and the cash out quantity is ok returns null else returns true **/
        _invalidBet: function () {
            var self = this;          

            if (self.state.engine.userBalanceBtc < 100)
                return 'Not enough BTC to play';

            if (self.state.maxWin < 1)
                return 'Not enough BTC Bankroll to play';

            var bet = Clib.parseBet(self.state.betSize);
            if(bet instanceof Error)
                return bet.message;

            var co = Clib.parseAutoCash(self.state.cashOut);
            if(co instanceof Error)
                return co.message;

            if (self.state.engine.userBalanceBtc < bet * Math.pow(10, 8))
                return 'Not enough BTC';


            return null;
        },

        _getStatusMessage: function () {
            var pi = this.state.engine.currentPlay();

            if (this.state.engine.gameState === 'STARTING') {
                return Countdown({ engine: this.state.engine });
            }

            if (this.state.engine.gameState === 'IN_PROGRESS') {
                //user is playing
                if (pi && pi.bet && !pi.stopped_at) {
                    return D.span(null, 'Currently playing...');
                } else if (pi && pi.stopped_at) { // user has cashed out
                    return D.span(null, 'Cashed Out @  ',
                        D.b({className: 'green'}, pi.stopped_at / 100, 'x'),
                        ' / Won: ',
                        D.b({className: 'green'}, Clib.formatSatoshis(pi.bet * pi.stopped_at / 100)),
                        ' ', Clib.grammarBits(pi.bet * pi.stopped_at / 100)
                    );

                } else { // user still in game
                    return D.span(null, 'Game in progress..');
                }
            } else if (this.state.engine.gameState === 'ENDED') {

                if (pi && pi.stopped_at) { // bet and won


                    return D.span(null, 'Cashed Out @ ',
                        D.b({className: 'green'}, pi.stopped_at / 100, 'x'),
                        ' / Won: ',
                        D.b({className: 'green'}, Clib.formatSatoshis(pi.bet * pi.stopped_at / 100)),
                        ' ', Clib.grammarBits(pi.bet * pi.stopped_at / 1000)
                    );
                } else if (pi) { // bet and lost

                    return D.span(null,
                        'Busted @ ', D.b({className: 'red'},
                            this.state.engine.tableHistory[0].game_crash / 100, 'x'),
                        ' / You lost ', D.b({className: 'red'}, pi.bet / Math.pow(10, 8)), ' ', Clib.grammarBits(pi.bet)
                    );

                } else { // didn't bet

                  if (this.state.engine.tableHistory[0].game_crash === 0) {
                    return D.span(null, D.b({className: 'red'}, 'INSTABUST!'));
                  }

                  return D.span(null,
                      'Busted @ ', D.b({className: 'red'}, this.state.engine.tableHistory[0].game_crash / 100, 'x')
                  );
                }

            }
        },

        _getBetting: function () {
          var invalidBet = this._invalidBet();

          var button = BetButton({
              engine: this.state.engine,
              invalidBet: this._invalidBet,
              placeBet: this._placeBet,
              cancelBet: this._cancelBet
          });

          return D.div(null,
              button
          );
        },

        _getBetter: function () {
          var self = this;

          var betInput = D.div(null,
              D.label(null, 'Bet', D.br(), 'Size'),
              D.div({ className: 'input-wrapper'},
                D.input({
                    name: 'bet-size',
                    min: 0.01,
                    step: 0.01,
                    type: 'number',
                    value: self.state.betSize,
                    onChange: function (e) {
                        //self.setState({ betSize: e.target.value })
                        self._setBetSize(e.target.value);
                    }
                }),
                D.span({ className: 'bet-unit'}, 'BTC')
              )
          );

          var autoCashOut = D.div(null,
              D.label(null, 'Auto', D.br(), 'Cash', D.br(), 'Out'),
              D.div({ className: 'input-wrapper'},
                D.input({
                    min: 1,
                    step: 0.01,
                    value: self.state.cashOut,
                    type: 'number',
                    name: 'cash-out',
                    onChange: function (e) {
                        self._setAutoCashOut(e.target.value);
                    }
                }),
                D.span({ className: 'bet-unit'}, 'x')
              )
          );

          var button = BetButton({
              engine: this.state.engine,
              invalidBet: this._invalidBet,
              placeBet: this._placeBet,
              cancelBet: this._cancelBet
          });

          return D.div(null,
              D.div({ className: 'action cashout' },
                  autoCashOut
              ),
              D.div({ className: 'action betsize' },
                  betInput
              ),
              button
          );
        },

        _getCashOut: function() {
          var button = CashOutButton({
              engine: this.state.engine,
              invalidBet: this._invalidBet,
              cashOut: this._cashOut
          });

          return D.div(null,
            button
          );
        },

        _getContents: function() {
          if (this.state.engine.gameState === 'IN_PROGRESS' && this.state.engine.userState === 'PLAYING') {
            return this._getCashOut();
          } else if (this.state.engine.nextBetAmount || (this.state.engine.gameState === 'STARTING' && this.state.engine.userState === 'PLAYING')) {
            return this._getBetting();
          } else if ((this.state.engine.maxWin > 0)){ // user can place a bet
            return this._getBetter();
          } 
        },

        render: function () {
            var self = this;
            // If they're not logged in, let just show a login to play
            if (!this.state.engine.username) {
              return D.div({ className: 'gui' },
                D.div({ className: 'gui-inner'},
                  D.a({className: 'bet-btn button orange full', href: '/login' }, 'Login'),
                  D.a({href: '/register', className: 'register button green full'}, 'Register')
                )
              );
            }
            var invalidBet = this._invalidBet();

            //If the user is logged in render the controls
            return D.div({ className: 'gui ' },
                D.div({ className: 'gui-inner' },

                    D.div({ className: 'information'},
                        this._getStatusMessage()
                    ),
                    (invalidBet ? D.div({className: 'error-msg'}, invalidBet) : null),
                    this._getContents(),
                    D.div({ className: 'game-hash'},
                      'Previous Hash: ',
                      D.a({href:"/faq#fair", target: 'blank'}, this.state.engine.lastHash)
                    )
                )
            );
        }
    });

});
