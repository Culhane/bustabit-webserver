define([
    'lib/react',
    'lib/clib',
    'constants/AppConstants'
], function(
    React,
    Clib,
    AppConstants
){

    var D = React.DOM;

    return React.createClass({
        displayName: 'BetButton',

        propTypes: {
            engine: React.PropTypes.object.isRequired,
            invalidBet: React.PropTypes.func.isRequired,
            placeBet: React.PropTypes.func.isRequired,
            cancelBet: React.PropTypes.func.isRequired
        },

        getInitialState: function() {
            return {
                initialDisable: true
            }
        },

        componentDidMount: function() {
            var self = this;
            setTimeout(function() {
                if(self.isMounted())
                    self.setState({ initialDisable: false });
            }, AppConstants.BetButton.INITIAL_DISABLE_TIME);
        },

        //Returns the button to cancel
        _getCancelButton: function () {
            var cancel;
            if (this.props.engine.gameState !== 'STARTING')
                cancel = D.a({ className: 'cancel-bt', onClick: this.props.cancelBet }, 'cancel');

            return D.div('status', cancel);
        },

        render: function() {
            var self = this;

            // If betting (a bet is queued or the user already bet and the game has not started yet)
            if (this.props.engine.isBetting()) {
              var aco = this.props.engine.nextAutoCashout;

              var bet = this.props.engine.nextBetAmount;
              if(bet) //If the bet is queued
                  bet = Clib.formatSatoshis(bet, 6) + ' CLAM';

              var msg = null;
              if (aco)
                  msg = ' with auto cash-out at ' + (aco / 100) + 'x';

              return D.div({ className: 'cash-out' },
                D.a({ className: 'bet-btn button orange disable full' },
                    'Betting ', bet, msg),
                    this._getCancelButton()
              );
            } else {
                var invalidBet = this.props.invalidBet();

                var button;
                if (invalidBet || this.props.engine.placingBet) {
                    return D.a({ className: 'bet-btn button orange disable' }, 'Bet CLAM!');
                } else {
                    button = D.a({ className: 'bet-btn button orange', onClick: self.props.placeBet }, 'Bet CLAM!');
                    return D.div(null,
                        button,
                        (invalidBet ? D.div({ className: 'invalid cancel' }, invalidBet) : null)
                    );
                }
            }
        }
    });

});
