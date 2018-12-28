define([
    'lib/react',
    'components/Game',
    'lib/clib',
    'game-logic/engine'
], function(
    React,
    GameClass,
    Clib,
    Engine
) {

    var Game = React.createFactory(GameClass);

    React.render(
        Game({ engine: Engine }),
        document.getElementById('game')
    );

    var isMobile = {
        Android: function() {
            return navigator.userAgent.match(/Android/i);
        },
        BlackBerry: function() {
            return navigator.userAgent.match(/BlackBerry/i);
        },
        iOS: function() {
            return navigator.userAgent.match(/iPhone|iPad|iPod/i);
        },
        Opera: function() {
            return navigator.userAgent.match(/Opera Mini/i);
        },
        Windows: function() {
            return navigator.userAgent.match(/IEMobile/i) || navigator.userAgent.match(/WPDesktop/i);
        },
        any: function() {
            return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
        }
    };

    //Update the balance in an ugly way TODO: Improve
    Engine.on('all', function() {
        var userBalance = document.getElementById('user_balance_bits_clam');
        if (userBalance){
            if(isMobile.any()){
                userBalance.innerHTML = Clib.formatSatoshis(Engine.userBalanceClam, 2)  
            }
            else {
                userBalance.innerHTML = Clib.formatSatoshis(Engine.userBalanceClam, 8)
            }
        }

        var userBalanceBtc = document.getElementById('user_balance_bits_btc');
        if (userBalanceBtc){
            if(isMobile.any()){
                userBalanceBtc.innerHTML = Clib.formatSatoshis(Engine.userBalanceBtc, 2); 
            }
            else {
                userBalanceBtc.innerHTML = Clib.formatSatoshis(Engine.userBalanceBtc, 8);
            }
        }

        var userInvested = document.getElementById('user_balance_invested');
        if (userInvested){
            if(isMobile.any()){
                userInvested.innerHTML = Clib.formatSatoshis(Engine.userInvestedBtc, 2) + ' BTC';
            } else {
                userInvested.innerHTML = Clib.formatSatoshis(Engine.userInvestedBtc, 8) + ' BTC';
            }
        }

        var siteInvested = document.getElementById('site_balance_invested');
        if (siteInvested){
            if(isMobile.any()){
                siteInvested.innerHTML = Clib.formatSatoshis(Engine.siteInvestedBtc, 2) + ' BTC';
            } else {
               siteInvested.innerHTML = Clib.formatSatoshis(Engine.siteInvestedBtc, 8) + ' BTC';
            }
        }

        var siteProfitPercentage = document.getElementById('site_profit_percentage');
        if (siteProfitPercentage && Engine.siteProfitPercentageBtc){
            if(isMobile.any()){
                siteProfitPercentage.innerHTML = Clib.formatDecimals(Engine.siteProfitPercentageBtc, 2) + '%';
            } else {    
                siteProfitPercentage.innerHTML = Clib.formatDecimals(Engine.siteProfitPercentageBtc, 6) + '%';
            }
        }

        var userInvestmentProfit = document.getElementById('user_investment_profit');
        if (userInvestmentProfit){
            if(isMobile.any()){
                userInvestmentProfit.innerHTML = Clib.formatSatoshis(Engine.userInvestmentProfitBtc, 2) + ' BTC';
            } else {    
                userInvestmentProfit.innerHTML = Clib.formatSatoshis(Engine.userInvestmentProfitBtc, 8) + ' BTC';
            }
        }

        var siteProfitAmount = document.getElementById('site_profit_amount');
        if (siteProfitAmount){
            if(isMobile.any()){
                siteProfitAmount.innerHTML = Clib.formatSatoshis(Engine.siteProfitAmountBtc, 2) + ' BTC';
            } else {    
                siteProfitAmount.innerHTML = Clib.formatSatoshis(Engine.siteProfitAmountBtc, 8) + ' BTC';
            }
        }

        var userProfit = document.getElementById('user_profit');
        if (userProfit){
            if(isMobile.any()){
                userProfit.innerHTML = Clib.formatSatoshis(Engine.userProfitAmountBtc, 2) + ' BTC';
            } else {    
                userProfit.innerHTML = Clib.formatSatoshis(Engine.userProfitAmountBtc, 8) + ' BTC';
            }
        }

        var siteWagered = document.getElementById('site_wagered');
        if (siteWagered){
            if(isMobile.any()){
                siteWagered.innerHTML = Clib.formatSatoshis(Engine.siteWageredBtc, 2) + ' BTC';
            } else {    
                siteWagered.innerHTML = Clib.formatSatoshis(Engine.siteWageredBtc, 8) + ' BTC';
            }
        }

        var userWagered = document.getElementById('user_wagered');
        if (userWagered){
            if(isMobile.any()){
                userWagered.innerHTML = Clib.formatSatoshis(Engine.userWageredBtc, 2) + ' BTC';
            } else {    
                userWagered.innerHTML = Clib.formatSatoshis(Engine.userWageredBtc, 8) + ' BTC';
            }
        }

    });
});
