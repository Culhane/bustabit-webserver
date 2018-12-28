define([
    'lib/react',
    'lib/clib',
    'lib/Autolinker',
    'stores/ChatStore',
    'actions/ChatActions',
    'game-logic/engine'
], function(
    React,
    Clib,
    Autolinker,
    ChatStore,
    ChatActions,
    Engine
) {

    // Overrides Autolinker.js' @username handler to instead link to
    // user profile page.
    var replaceUsernameMentions = function(autolinker, match) {
        // Use default handler for non-twitter links
        if (match.getType() !== 'twitter') return true;

        var username = match.getTwitterHandle();
        return '<a href="/user/' + username + '" target="_blank">@' + username + '</a>';
    };

    var escapeHTML = (function() {
        var entityMap = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': '&quot;',
            "'": '&#39;'
        };

        return function(str) {
            return String(str).replace(/[&<>"']/g, function(s) {
                return entityMap[s];
            });
        };
    })();

    function linkify_text(a){ 
        return a.replace(/\[#([0-9]+)\]/, '[<a target="_blank" href="/game/$1">#$1</a>]').replace(/(^|[^0-9a-z#])((?:game|roll):? |#)([1-9][0-9]{4,9})\b/gi,'$1<a target="_blank" href="/game/$3">$2$3</a>').replace(/(https:\/\/games.freebitcoins[.]com\/game\/)([1-9][0-9]{0,9})/gi,' <a target="_blank" href="/game/$2">$2</a> ').replace(/(bitcoin-talk|bticointakl)(\b[^<]*$)/gi,"$1 (a phishing site, do not visit)$2").replace(/dicen[o0]w/gi,"dice-now").replace(/letsdice/gi,"lets-dice").replace(/grindabit/gi,"spamalot").replace(/bitdice[.]de/gi,"[yet more spam]").replace(/(?:https?:\/\/)?(?:www[.])?cryptodouble[.]com(?:\/(?:[?]?ref=[0-9a-z]*)?)?\b/gi,"[Ponzi spam]").replace(/([\/#?]|&amp;)(id|from|code|partner|bonus|r|ref[_a-z]*)\s*=\s*(?:.+?\b)/gi,"$1$2= [spam link] ").replace(/(\/ref\/[0-9a-z\/]*)/gi," [spam link]").replace(/(speedy[.]sh|bit\s*[.]\s*ly|gg\s*[.]\s*gg|cc4\s*[.]\s*co|fkref\s*[.]\s*com|cur\s*[.]\s*lv|goo\s*[.]\s*gl|is\s*[.]\s*gd|tinyurl\s*[.]\s*com|ge\s*[.]\s*tt)\/[?]?[a-z0-9-]{4,}/gi,"[suspicious link]").replace(/\bbitwars\b/gi,"[spam link]").replace(/\bmegaapp\b/gi,"[suspicious link]").replace(/\b(javascript:)/i,"[potential scam warning] $1").replace(/([a-z0-9.-_]*buybtc[a-z0-9.-_]*@gmail[.])com/gi,"I am a scammer and will steal your coins!  $1cum to meet your sticky end!").replace(/([a-z0-9.-_]*buybtc[a-z0-9.-_]*@gmail[.])com/gi,"").replace(/(^|[^a-z])[á´¦rÐ³]â *(h*)[aÃ¤Î‘ÐÉ‘]â *[pÑ€]â *[eÐµÎ•]/gi,"$1t$2ickle").replace(/(^|[^a-z])[á´¦rÐ³]â *(h*)[aÃ¤Î‘ÐÉ‘]â *[pÑ€]â *iâ *([^d])/gi,"$1t$2ickli$3").replace(/(^|[^a-z])[á´¦rÐ³]â *(h*)[aÃ¤Î‘ÐÉ‘]â *[eÐµÎ•]â *[pÑ€]/gi,"$1t$2ickel").replace(/(^|[^a-z])[á´¦rÐ³]â *(h*)[aÃ¤Î‘ÐÉ‘]â *[eÐµÎ•]â *[pÑ€]â *i/gi,"$1t$2ickeli").replace(/(^|[^s])((?:(?:[nÃ±á¹‰É´â“Î]|[1iá¸­Ñ–lÉª!|\\/]â *[1iá¸­Ñ–lÉª!|\\/]â *[1iá¸­Ñ–lÉª!|\\/])(?:[â  ]*))+)((?:[1iá¸­Ñ–lÉª!|â“˜][â  ]*)+)([gá¸¡Ç¥É¢â“–9][â  ]*)((?:[gá¸¡Ç¥É¢â“–9][â  ]*)+)((?:(?:[3eá¸›ÐµÐµÎ•á´‡uâ“”aÃ¤á¸Ð°@iá¸­Ñ–][â  ]*)+)(?:[á´¦rá¹™ÑÐ³Ê€â“¡][â  ]*)+|(?:[a@Ã¤á¸Ð°á´€4â“][â  ]*)+)/gi,"$1$4$3$2$5$6").replace(/\b(butthurt)\b/gi,'<a target="_blank" href="https://just-dice.com/images/form.jpg">$1</a>').replace(/\b(pony|ponies|mlp)\b/gi,'<a target="_blank" href="http://theevildragon.imgur.com/">$1</a>').replace(/(^|[^\/])\b(biggest)\b/gi,'$1<a target="_blank" href="/biggest.txt">$2</a>').replace(/\bhttps:\/\/games.freebitcoins.com[.]com\/biggest[.]txt\b/gi,'<a target="_blank" href="/biggest.txt">biggest bets</a>').replace(/\b(IRC)\b/,'<a target="_blank" href="http://webchat.freenode.net/?channels=clams">$1</a>').replace(/(?:(?:https?:\/\/)?(?:www[.])?clamsight(?:[.]com)?)(\b[^<\/]*(\s|$))/gi,'[<a target="_blank" href="http://clamsight.com/">clamsight</a>]$1').replace(/(?:(?:https?:\/\/)?(?:www[.])?blocktree(?:[.]io(?:\/e\/CLAM\/?)?)?)([^<\/]*(\s|$))/gi,'[<a target="_blank" href="http://blocktree.io/e/CLAM">blocktree</a>] $1').replace(/(blockchain[.]info\/)(?:[a-w]{2}|zh-cn)\//g,"$1").replace(/\b(?:(?:https?:\/\/)?blockchain[.]info\/tx\/|btc:)([0-9a-f]{8})([0-9a-f]{56})\b/gi,'[<a target="_blank" href="https://blockchain.info/tx/$1$2">BTC:$1</a>]').replace(/\b(?:(?:https?:\/\/)?live[.]blockcypher[.]com\/ltc\/tx\/|ltc:)([0-9a-f]{8})([0-9a-f]{56})\b[\/]?/gi,'[<a target="_blank" href="https://live.blockcypher.com/ltc/tx/$1$2/">LTC:$1</a>]').replace(/\b(?:(?:https?:\/\/)?dogechain.info\/tx\/|doge:)([0-9a-f]{8})([0-9a-f]{56})\b/gi,'[<a target="_blank" href="https://dogechain.info/tx/$1$2">DOGE:$1</a>]').replace(/\b(?:https?:\/\/)?((?:clamsight[.]com\/tx\/|khashier[.]com\/tx\/|(?:www[.])?presstab[.]pw\/phpexplorer\/CLAM\/tx[.]php[?]tx=|(?:www[.])?blocktree[.]io\/(?:tx|transaction)\/CLAM\/)([0-9a-f]{8})([0-9a-f]{56}))\b/g,'[<a target="_blank" href="http://khashier.com/tx/$2$3">$2</a>]').replace(/(^|[^\/:=\b])(?:(?:tx(?:id)?|clam)?:)?([0-9a-f]{8})([0-9a-f]{56})\b/g,'$1[<a target="_blank" href="http://khashier.com/tx/$2$3">$2</a>]').replace(/\b(?:https?:\/\/)?blockchain[.]info\/charts\/balance[?]format=csv&amp;address=(1[1-9A-HJ-NP-Za-km-z]{7})([1-9A-HJ-NP-Za-km-z]{24,26})\b/g,'[<a target="_blank" href="https://blockchain.info/charts/balance?format=csv&address=$1$2">history:$1</a>]').replace(/(^|[^a-zA-Z0-9\/=?])(?:(?:https?:\/\/)?blockchain[.]info\/address\/)?([13][1-9A-HJ-NP-Za-km-z]{7})([1-9A-HJ-NP-Za-km-z]{19,26})\b/g,'$1[<a target="_blank" href="http://blockchain.info/address/$2$3">$2</a>]').replace(/\b(?:(?:https?:\/\/)?dogechain[.]info\/address\/)?(D[1-9A-HJ-NP-Za-km-z]{7})([1-9A-HJ-NP-Za-km-z]{24,26})\b/g,'[<a target="_blank" href="http://dogechain.info/address/$1$2">$1</a>]').replace(/\b(?:(?:https?:\/\/)?live[.]blockcypher[.]com\/ltc\/address\/)?(L[1-9A-HJ-NP-Za-km-z]{7})([1-9A-HJ-NP-Za-km-z]{24,26})(?:\/|\b)/g,'[<a target="_blank" href="http://live.blockcypher.com/ltc/address/$1$2/">$1</a>]').replace(/\b(?:(?:https?:\/\/)?clamsight[.]com\/address\/)(x[1-9A-HJ-NP-Za-km-z]{7})([1-9A-HJ-NP-Za-km-z]{24,26})\b/g,'[<a target="_blank" href="http://khashier.com/address/$1$2">$1</a>]').replace(/\b(?:(?:https?:\/\/)?khashier[.]com\/address\/)(x[1-9A-HJ-NP-Za-km-z]{7})([1-9A-HJ-NP-Za-km-z]{24,26})\b/g,'[<a target="_blank" href="http://khashier.com/address/$1$2">$1</a>]').replace(/\b(?:(?:https?:\/\/)?(?:www[.])?presstab[.]pw\/phpexplorer\/CLAM\/address.php[?]address=)(x[1-9A-HJ-NP-Za-km-z]{7})([1-9A-HJ-NP-Za-km-z]{24,26})\b/g,'[<a target="_blank" href="http://khashier.com/address/$1$2">$1</a>]').replace(/(^|[^a-zA-Z0-9\/=?])(?:(?:https?:\/\/)?(?:www[.])?blocktree[.]io\/address\/CLAM\/)?(x[1-9A-HJ-NP-Za-km-z]{7})([1-9A-HJ-NP-Za-km-z]{24,26})\b/g,'$1[<a target="_blank" href="http://khashier.com/address/$2$3">$2</a>]').replace(/\b(rich(?:-|\s)?list|(?:https?:\/\/)?(?:www[.])?blocktree[.]io\/richlist\/CLAM)\b/gi,'<a target="_blank" href="http://www.presstab.pw/phpexplorer/CLAM/richlist.php">rich list</a>').replace(/\b(hot wallet(?: balance)?)\b/i,'<a target="_blank" href="http://khashier.com/chain/Clam/q/addressbalance/xFREEi5LRgUaqbTZAgx5jFSHnZjDFYmiXJ">$1</a>').replace(/\b(cold wallet(?: balance)?)\b/i,'<a target="_blank" href="http://blockchain.info/address/3BxwvTXe2m3kswT4yCfQkWdyxi2mHyvbvT">$1</a>')    .replace(/\b(warm wallet(?: balance)?)\b/i,'<a target="_blank" href="http://khashier.com/chain/Clam/q/addressbalance/xFREEkW5bfEL71LY9eShKqULSt2JcS5rgg">$1</a>').replace(/\b(?:(?:https?:\/\/)?(?:www[.])?polo(?:niex(?:[.]com)?(?:\/exchange#btc_clam)?)?)([^\/.]|$)\b/gi,'[<a target="_blank" href="https://poloniex.com/exchange#btc_clam">poloniex</a>]$1').replace(/(?:(?:https?:\/\/)?(?:www[.])?shapeshift(?:[.]io)?)\b/gi,'[<a target="_blank" href="https://shapeshift.io/">shapeshift</a>]').replace(/\b(?:clam markets|https?:\/\/(?:www[.])?coinmarketcap[.]com\/currencies\/clams\/#markets)\b/gi,'<a target="_blank" href="https://coinmarketcap.com/currencies/clams/#markets">CLAM markets</a>').replace(/(?:(?:https?:\/\/)?(?:www[.])?cyrptopia(?:[.]co\.nz)?)\b/gi,'[<a target="_blank" href="https://cryptopia.co.nz/Exchange/?market=CLAM_BTC">cryptopia</a>]').replace(/\bhttps:\/\/ip[.]bitcointalk[.]org\/[?]u=http%3A%2F%2F(i[.]imgur[.]com)%2F([^&]*)&amp;t=[a-z0-9=&_;]*\b/gi,"https://$1/$2").replace(/\b(?:https?:\/\/)?((?:i|www)[.]imgur[.]com\/[0-9a-z]{5,9}[.](?:jpe?g|png|gifv?)(?:[?][0-9]+)?)\b/gi,'[<a target="_blank" href="https://$1">img</a>]').replace(/\b(?:https?:\/\/)?((?:i|www)[.]imgur[.]com\/[0-9a-z]{5,9}[.](?:webm|mp4)(?:[?][0-9]+)?)\b/gi,'[<a target="_blank" href="https://$1">video</a>]').replace(/\b(https?:\/\/imgur[.]com\/(?:a|gallery)\/[0-9a-z]{5,9}\/?(?:#\d+)?)(?:\b|$)/gi,'[<a target="_blank" href="$1">imgs</a>]').replace(/\b((?:https?:\/\/)?(?:(?:www[.])?youtube[.]com\/watch[?]v=|youtu[.]be\/)[0-9a-z_-]{11}[?]?(?:(?:&amp;)?(?:wide|(?:feature|list)=[a-z.0-9]*|t=[0-9msh]+))*)\b/gi,'[<a target="_blank" href="$1">video</a>]').replace(/\b(vid\b[.]\bme\/[a-z0-9]{3,8})\b/i,"$1 (beware: vid.me is used to spam coin-stealing malware)").replace(/\b(way she goes)\b/i,'<a target="_blank" href="https://youtu.be/gtM9xD-Ky7E">$1</a>').replace(/\b(cash out)\b/i,'<a target="_blank" href="https://www.youtube.com/watch?v=m8162FR-fbY&t=1873">$1</a>').replace(/\b((?:my|your) dick)\b/i,'<a target="_blank" href="https://youtu.be/TNgWQfOd-1M">$1</a>').replace(/\b(bubble)\b/i,'<a target="_blank" href="https://youtu.be/KTf5j9LDObk">$1</a>').replace(/\b((?:you|u) have no power here)\b/i,'<a target="_blank" href="https://youtu.be/UuKsnsrQxVo">$1</a>').replace(/\b(?:https?:\/\/)?(mudi)(?:[.]mylittleponies[.]org)?(?:\b|\/)?/i,'<a target="_blank" href="http://mudi.mylittleponies.org/">$1</a>').replace(/\b((?:(?:(?:(?:do\s+)?you\s+)?want\s+to\s+)?trade\s+some\s+)?shit\s*coins?\b[?]{0,3})/gi,'<a target="_blank" href="https://youtu.be/3gfntBEI3Aw">$1</a>').replace(/\b(?:you(?:r|'re| are) (?:all )?gay)\b/i,'<a target="_blank" href="https://youtu.be/aO_DV1mw-Xo">your all gay</a>').replace(/\b(https?:\/\/(?:(?:www|r2)[.])?reddit[.]com\/r\/([a-z0-9]+)\/comments\/[a-z0-9]+\/([a-z0-9_]+)(?:\/[0-9a-z]+)?\/?)(\b| |$)/gi,'[<a target="_blank" href="$1">reddit:$2 $3</a>]$4').replace(/\b(https?:\/\/(?:www[.])?steemit[.]com\/(@[a-z0-9]+))(?:\b| |$)/gi,'<a target="_blank" href="$1">$2</a>').replace(/\b(https?:\/\/(?:www[.])?steemit[.]com\/[a-z0-9]+\/@[a-z0-9]+\/[a-z0-9-]+)(?:\b| |$)/gi,'[<a target="_blank" href="$1">steemit post</a>]').replace(/\b(https:\/\/bitcointalk[.]org\/(?:index[.]php)?[?]topic=[0-9]+(?:[.](?:new#new|(?:msg)?[0-9]+))?(?:;(?:all|topicseen))?(?:#new|#msg[0-9]+)?)\b/gi,'[<a target="_blank" href="$1">thread</a>]').replace(/\b(bootstrap[.]dat)\b/i,'<a target="_blank" href="https://bitcointalk.org/index.php?topic=623147.msg41173171#msg41173171">$1</a>')
    }

    var D = React.DOM;

    /* Constants */
    var SCROLL_OFFSET = 120;

    function getState() {
        var state = ChatStore.getState();
        state.engine = Engine;
        return state;
    }

    return React.createClass({
        displayName: 'Chat',

        getInitialState: function() {
            var state = getState();

            /* Avoid scrolls down if a render is not caused by length chat change */
            this.listLength = state.engine.chat.length;
            this.lastmsg = new Date().getTime();

            this.lastchat = [""]
            this.lastchat_index = 0
            this.lastchat_max = 100

            return state;
        },

        componentDidMount: function() {
            Engine.on({
                msg: this._onChange
            });
            ChatStore.addChangeListener(this._onChange);

            var msgs = this.refs.messages.getDOMNode();
            msgs.scrollTop = msgs.scrollHeight;

            window.onresize = function(event) {
                // document.querySelector('.messages-list').style.height = window.innerHeight - 110 + 'px';
            };
        },

        componentWillUnmount: function() {
            Engine.off({
                msg: this._onChange
            });
            ChatStore.removeChangeListener(this._onChange);

            var height = this.refs.messages.getDOMNode().style.height;
            ChatActions.setHeight(height);
        },

        /** If the length of the chat changed and the scroll position is near bottom scroll to the bottom **/
        componentDidUpdate: function(prevProps, prevState) {

            if (prevState.engine.chat.length != this.listLength) {
                this.listLength = this.state.engine.chat.length;

                var msgsBox = this.refs.messages.getDOMNode();
                var scrollBottom = msgsBox.scrollHeight - msgsBox.offsetHeight - msgsBox.scrollTop;

                if (scrollBottom < SCROLL_OFFSET)
                    msgsBox.scrollTop = msgsBox.scrollHeight;
            }
        },

        _onChange: function() {
            //Check if its mounted because when Game view receives the disconnect event from EngineVirtualStore unmounts all views
            //and the views unregister their events before the event dispatcher dispatch them with the disconnect event
            if (this.isMounted())
                this.setState(getState());
        },

        _sendMessage: function(e) {
            if (e.keyCode == 13) {
                var msg = this.state.inputText;
                if (msg.length > 1 && msg.length < 500 && new Date().getTime() - this.lastmsg > 1000) {
                    this.lastmsg = new Date().getTime();
                    this._say(msg);
                }
            } else if (e.keyCode == 38) {
                if (this.lastchat_index === 0) this.lastchat[0] = this.state.inputText;
                if (++this.lastchat_index < this.lastchat.length) ChatActions.updateInputText(this.lastchat[this.lastchat_index]);
                else this.lastchat_index = this.lastchat.length - 1;
            } else if (e.keyCode == 40) {
                if (this.lastchat_index-- > 0) ChatActions.updateInputText(this.lastchat[this.lastchat_index]);
                else this.lastchat_index = 0;
            }
        },

        _say: function(msg) {

            if (this.lastchat[1] != msg) {
                this.lastchat[0] = msg;
                this.lastchat.unshift("");
                this.lastchat.splice(this.lastchat_max + 1)
            }
            this.lastchat_index = 0;

            var cmdReg = /^\/(tip*|reward*)\s*(.*)$/;
            var cmdMatch = msg.match(cmdReg);
            var matches;

            if (cmdMatch && cmdMatch[1] === "tip") {
                var rest = cmdMatch[2];
                var uidReg = /^(?:(noconf)?\s?)(?:(private|priv)?\s?)((?:\d+(?:,\d+)*))\s+(btc|BTC|clam|CLAM)\s+([0-9]*[1-9][0-9]*(\.[0-9]{1,8})?|[0]*\.[0-9]*[1-9][0-9]*)\s*(each|split)?\s*([0-9]{6})?.*$/;
                var uidMatch = rest.match(uidReg);

                if (uidMatch && uidMatch[1] === "noconf" ) {
                    ChatActions.say(msg);
                } else if( uidMatch) {
                        var t = confirm("Are you sure you want to tip " + uidMatch[5] + " " + uidMatch[4] + " to userid: " + uidMatch[3]);
                        if (t == true) {
                            ChatActions.say(msg);
                        }
                } else { 
                    ChatActions.say(msg);
                } 
            } else if (cmdMatch && cmdMatch[1] === "reward") {
                var rest = cmdMatch[2];

                var rewardStatsReg = /^\s?((?:stats|stat)\s+(?:btc|BTC|clam|CLAM)|(?:donors|donor)\s+(?:btc|BTC|clam|CLAM))\s*$/
                var rewardStatsMatch = rest.match(rewardStatsReg);

                var rewardReg = /^(?:(noconf)?\s?)\s*(btc|BTC|clam|CLAM)\s+([0-9]*[1-9][0-9]*(?:\.[0-9]{1,8})?|[0]*\.[0-9]*[1-9][0-9]*)\s*([0-9]{6})?.*$/
                var rewardMatch = rest.match(rewardReg);

               if (( rewardMatch && rewardMatch[1] === "noconf" && rest ) || rewardStatsMatch ) {
                    ChatActions.say(msg);
                } else {
                    var t = confirm("Are you sure want to donante " + rewardMatch[3] + " " + rewardMatch[2] + " to the weekly prize pool? This is non-refundable!");
                    if (t == true) {
                        ChatActions.say(msg);
                    }
                }
            } else {
                ChatActions.say(msg);
                if (matches = msg.match(/^\s*([\/\\](?:(?:msg|pm)\s+\d+|mods?|r|reply))\s+\S+/i)) ChatActions.updateInputText(matches[1] + " ");
            }
        },

        _updateInputText: function(ev) {
            ChatActions.updateInputText(ev.target.value);
        },


        render: function() {
            var self = this;
            var messages = this.state.engine.chat.map(renderMessage, self);
            var chatInput;


            var val = this.state.inputText
            var classname = 'chat-input'

            if (val.match(/^\s*[\/\\](?:pm|msg|r|reply).*/))
                classname += ' chatpm'
            else if (val.match(/^\s*[\/\\]mods?.*/))
                classname += ' chatmod'
            else if (val.match(/^\s*[\/\\]tip.*/))
                classname += ' chatinfo'

            if (this.state.engine.username)
                chatInput = D.input({
                    className: 'chat-input',
                    onKeyDown: this._sendMessage,
                    onChange: this._updateInputText,
                    value: this.state.inputText,
                    ref: 'input',
                    placeholder: 'Type here...'
                });
            else
                chatInput = D.input({
                    className: 'chat-input',
                    ref: 'input',
                    placeholder: 'Log in to chat...',
                    disabled: true
                });

            var ulStyle = {
                // height: window.innerHeight - 110 + 'px'
            };

            return D.div({
                    className: 'messages'
                },
                D.div({
                        className: 'messages-container'
                    },
                    D.div({
                        className: 'header-bg'
                    }, D.span(null, 'Chat')),
                    D.ul({
                            className: 'messages-list',
                            ref: 'messages',
                            style: ulStyle
                        },
                        messages
                    ),
                    chatInput
                )
            );
        }
    });

    function renderMessage(message, index) {
        var self = this;

        var pri = 'msg-chat-message';
        switch (message.type) {
            case 'say':
                if (message.role === 'admin') 
                    pri += ' msg-admin-message';
                else if (message.role === 'moderator') 
                    pri += ' msg-moderator-message';
                else if (message.username === "Deb" )
                    pri += ' msg-princess-message'

                var username = self.state.engine.username;

                var r = new RegExp('.*' + username + '(?:$|[^a-z0-9_\-])', 'i');
                if (username && message.username != username && r.test(message.message)) {
                    pri += ' msg-highlight-message msg-highlight-other';
                }

                var timestamp = new Date(message.time).toLocaleTimeString();

                return D.li({
                        className: pri,
                        key: 'msg' + index
                    },
                    D.a({
                            href: '/user/' + message.username,
                            target: '_blank'
                        },
                        '' + timestamp.replace(/(:\d{2}| [AP]M)$/, "") + ' <' + message.uid + '>' + ' <',
                        message.username, '>'),
                    ' ',
                    D.span({
                        className: 'msg-body',
                        dangerouslySetInnerHTML: {
                            __html: Autolinker.link(
                                linkify_text(escapeHTML(message.message)), {
                                    truncate: 50,
                                    replaceFn: replaceUsernameMentions
                                }
                            )
                        }
                    })
                );
            case 'mute':
                pri = 'msg-mute-message';
                return D.li({
                        className: pri,
                        key: 'msg' + index
                    },
                    D.a({
                            href: '/user/' + message.moderator,
                            target: '_blank'
                        },
                        '*** <' + message.moderator + '>'),
                    message.shadow ? ' shadow muted ' : ' muted ',
                    D.a({
                            href: '/user/' + message.username,
                            target: '_blank'
                        },
                        '<' + message.username + '>'),
                    ' for ' + message.timespec);
            case 'error':
            case 'info':
                pri = 'msg-info-message';
                return D.li({
                        className: pri,
                        key: 'msg' + index
                    },
                    D.span(null, ' INFO: ' + message.message));
                break;
            case 'private':
                pri = 'msg-private-message';

                var username = self.state.engine.username;


                var r = new RegExp('.*' + username + '(?:$|[^a-z0-9_\-])', 'i');
                if (username && message.username != username && r.test(message.message)) {
                    pri += ' msg-highlight-message';
                }

                var timestamp = new Date(message.time).toLocaleTimeString();

                return D.li({
                        className: pri,
                        key: 'msg' + index
                    },
                    D.a({
                            href: '/user/' + message.username,
                            target: '_blank'
                        },
                        '' + timestamp.replace(/(:\d{2}| [AP]M)$/, "") + ' <' + message.uid + '>' + ' <',
                        message.username, '> --> (' + message.to + ') <' + message.to_username + '> '),
                    ' ',
                    D.span({
                        className: 'msg-body',
                        dangerouslySetInnerHTML: {
                            __html: Autolinker.link(
                                linkify_text(escapeHTML(message.message)), {
                                    truncate: 50,
                                    replaceFn: replaceUsernameMentions
                                }
                            )
                        }
                    })
                );
                break;
            case 'mod':
                pri = 'msg-mod-message';

                var username = self.state.engine.username;
                var r = new RegExp('.*' + username + '(?:$|[^a-z0-9_\-])', 'i');

                if (username && message.username != username && r.test(message.message)) {
                    pri += ' msg-highlight-message';
                }

                var timestamp = new Date(message.time).toLocaleTimeString();

                return D.li({
                        className: pri,
                        key: 'msg' + index
                    },
                    D.a({
                            href: '/user/' + message.username,
                            target: '_blank'
                        },
                        '' + timestamp.replace(/(:\d{2}| [AP]M)$/, "") + ' <' + message.uid + '>' + ' <',
                        message.username, '>'),
                    ' ',
                    D.span({
                        className: 'msg-body',
                        dangerouslySetInnerHTML: {
                            __html: Autolinker.link(
                                linkify_text(escapeHTML(message.message)), {
                                    truncate: 50,
                                    replaceFn: replaceUsernameMentions
                                }
                            )
                        }
                    })
                );
                break;
            default:
                break;
        }
    }

});
