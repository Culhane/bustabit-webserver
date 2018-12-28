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
                userInvested.innerHTML = Clib.formatSatoshis(Engine.userInvestedClam, 2) + ' CLAM';
            } else {
                userInvested.innerHTML = Clib.formatSatoshis(Engine.userInvestedClam, 8) + ' CLAM';
            }
        }

        var siteInvested = document.getElementById('site_balance_invested');
        if (siteInvested){
            if(isMobile.any()){
                siteInvested.innerHTML = Clib.formatSatoshis(Engine.siteInvestedClam, 2) + ' CLAM';
            } else {
               siteInvested.innerHTML = Clib.formatSatoshis(Engine.siteInvestedClam, 8) + ' CLAM';
            }
        }

        var siteProfitPercentage = document.getElementById('site_profit_percentage');
        if (siteProfitPercentage && Engine.siteProfitPercentageClam){
            if(isMobile.any()){
                siteProfitPercentage.innerHTML = Clib.formatDecimals(Engine.siteProfitPercentageClam, 2) + '%';
            } else {    
                siteProfitPercentage.innerHTML = Clib.formatDecimals(Engine.siteProfitPercentageClam, 6) + '%';
            }
        }

        var userInvestmentProfit = document.getElementById('user_investment_profit');
        if (userInvestmentProfit){
            if(isMobile.any()){
                userInvestmentProfit.innerHTML = Clib.formatSatoshis(Engine.userInvestmentProfitClam, 2) + ' CLAM';
            } else {    
                userInvestmentProfit.innerHTML = Clib.formatSatoshis(Engine.userInvestmentProfitClam, 8) + ' CLAM';
            }
        }

        var siteProfitAmount = document.getElementById('site_profit_amount');
        if (siteProfitAmount){
            if(isMobile.any()){
                siteProfitAmount.innerHTML = Clib.formatSatoshis(Engine.siteProfitAmountClam, 2) + ' CLAM';
            } else {    
                siteProfitAmount.innerHTML = Clib.formatSatoshis(Engine.siteProfitAmountClam, 8) + ' CLAM';
            }
        }

        var userProfit = document.getElementById('user_profit');
        if (userProfit){
            if(isMobile.any()){
                userProfit.innerHTML = Clib.formatSatoshis(Engine.userProfitAmountClam, 2) + ' CLAM';
            } else {    
                userProfit.innerHTML = Clib.formatSatoshis(Engine.userProfitAmountClam, 8) + ' CLAM';
            }
        }

        var siteWagered = document.getElementById('site_wagered');
        if (siteWagered){
            if(isMobile.any()){
                siteWagered.innerHTML = Clib.formatSatoshis(Engine.siteWageredClam, 0) + ' CLAM';
            } else {    
                siteWagered.innerHTML = Clib.formatSatoshis(Engine.siteWageredClam, 8) + ' CLAM';
            }
        }

        var userWagered = document.getElementById('user_wagered');
        if (userWagered){
            if(isMobile.any()){
                userWagered.innerHTML = Clib.formatSatoshis(Engine.userWageredClam, 2) + ' CLAM';
            } else {    
                userWagered.innerHTML = Clib.formatSatoshis(Engine.userWageredClam, 8) + ' CLAM';
            }
        }

    });
});
