define([
    'lib/react',
    'lib/clib',
    'components/Payout'
], function(
    React,
    Clib,
    PayoutClass
){

    var Payout = React.createFactory(PayoutClass);
    var D = React.DOM;

    return React.createClass({
        displayName: 'CashOutButton',

        propTypes: {
            engine: React.PropTypes.object.isRequired,
            invalidBet: React.PropTypes.func.isRequired,
            cashOut: React.PropTypes.func.isRequired
        },

        _cashOut: function () {
            this.props.cashOut();
        },

        render: function() {

          return D.div({ className: 'cash-out' },
            D.a({className: 'bet-btn button orange full', onMouseDown: this._cashOut },
              'Cash out at ', Payout({engine: this.props.engine}), ' CLAM'
            )
          );
        }
    });
});
