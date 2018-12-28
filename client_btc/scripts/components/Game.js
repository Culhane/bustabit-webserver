/**
 * This view acts as a wrapper for all the other views in the game
 * it is subscribed to changes in EngineVirtualStore but it only
 * listen to connection changes so every view should subscribe to
 * EngineVirtualStore independently.
 */
define([
    'lib/react',
    'components/Chart',
    'components/Controls',
    'components/TabsSelector',
    'components/Players',
    'components/BetBar',
    'components/Chat',
    'components/Rocket',
    'game-logic/engine'
], function(
    React,
    ChartClass,
    ControlsClass,
    TabsSelectorClass,
    PlayersClass,
    BetBarClass,
    ChatClass,
    RocketClass,
    Engine
){
    var D = React.DOM;

    var Rocket = React.createFactory(RocketClass);
    var Chart = React.createFactory(ChartClass);
    var Controls  = React.createFactory(ControlsClass);
    var TabsSelector = React.createFactory(TabsSelectorClass);
    var Players = React.createFactory(PlayersClass);
    var BetBar = React.createFactory(BetBarClass);
    var Chat = React.createFactory(ChatClass);

    function getState(){
        return {
            isConnected: Engine.isConnected,
            engine: Engine
        };
    }

    return React.createClass( {
      displayName: 'Game',

      getInitialState: function () {
          return getState();
      },

      componentDidMount: function() {
        Engine.on({
          'connected': this._onChange,
          'game_starting': this._onChange,
          'disconnected': this._onChange
        });
      },

      componentWillUnmount: function() {
        Engine.off({
          'connected': this._onChange,
          'game_starting': this._onChange,
          'disconnected': this._onChange
        });
      },

      _onChange: function() {
          if(this.isMounted())
              this.setState(getState());
      },

      render: function() {
        if (!this.state.isConnected) {
          return D.div(({className: 'loading'}), 'Connecting to server..');
        }

        var divArgs = [{id: "rocket", className: 'rocket' }, D.div({ className: 'ship' }), D.div({ className: 'rocket-flame' })]
        for (i = 0; i < 100; i++){
          divArgs.push(D.div({ className: 'explosion-particle' }));
        }
        return D.div({ className: 'inner-wrapper row' },
          D.div({ className: 'small-12 large-3 column' },
            Chat()
          ),
          D.div({ className: 'small-12 large-6 column' },
            D.div({ className: 'row'},
              D.div({ className: 'small-12 large-12 column'},
                D.div({ className: 'rocket-outer' },
                  D.div({ className: 'rocket-inner' },
                    D.div.apply(null, divArgs),
                    D.div({id: "game-multiplier", className: 'multiplier'})
                  ),
                  D.div({ className: 'max-win'}, 'Max profit: ', (this.state.engine.maxWin/1e8).toFixed(6), ' BTC')
          
                ),
                Rocket({ engine: this.state.engine })
              )
            ),
            D.div({ className: 'row'},
              D.div({ className: 'small-12 large-12 column'},
                Controls({ engine: this.state.engine })
              )
            )
          ),
          D.div({ className: 'small-12 large-3 column' },
            D.div({ className: 'row'},
              D.div({ className: 'small-12 large-12 column'}, 
                D.div({ className: 'players' },
                  Players({ engine: this.state.engine })
                )
              )
            ),
            D.div({ className: 'row'},
              D.div({ className: 'small-12 large-12 column'}, 
                D.div({ className: 'log-chat' },
                  TabsSelector({ engine: this.state.engine })
                )
              )
            )
          )
        )
      }
    });

});
