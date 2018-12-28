var assert = require('assert');
var async = require('async');
var database = require('./database');
var config = require('../config/config');
var request = require('request');
var jayson = require('jayson');
var SimpleCrypto = require("simple-crypto-js").default;



var clamcore = require('clamcore');
var RpcClient = clamcore.RpcClient;

var config = {
    protocol: 'http',
    user: '',
    pass: '',
    host: '',
    port: ''
};

var configBtc = {
    protocol: 'http',
    user: '',
    pass: '',
    host: '',
    port: ''
};

var RpcClientBtc = require('bitcoind-rpc');

// create a client
var client = jayson.client.http({
  port: ,
  hostname: ''
});

var rpc = new RpcClient(config);
var clientBtc = new RpcClientBtc(configBtc);

var PassPhrase = "";
var simpleCrypto = new SimpleCrypto(PassPhrase);




exports.index = function(req, res) {
    var user = req.user;
    assert(user.admin);
    var data = {};
    var tasks = [
    /*
        //get warm wallet balance   
        function(callback) {
            request.get('http://192.168.2.15:8080', function (error, response, body) {
                if (error) {
                    return callback(error)
                }
                    console.log(body); // Show the HTML for the Modulus homepage.
                    return callback(null, body)
                
            });

        },
    */
        // get hot wallet balance 
        function(callback){
            rpc.getbalance(function(err,ret) {
                    if(err) {
                        callback(err)
                    }
                        callback(null, ret.result * 1e8);
            });
        },
        // get stake totals
        function(callback){
            database.getStake(function(err,res){ 
                if (err) return callback(err)


                callback(null, res)
            })
        },
        // get commissions
        function(callback){
            database.getCommissionPayouts(function(err,res){ 
                if (err) return callback(err)

                callback(null, calcCommission(res))
            })
        },
        // get clam hot wallet balance
        function(callback){
            client.request('getinfo', [], function(err, response) {
              if(err) return callback(err)
            
                callback(null, JSON.parse(decrypt(response.result)))
            });
        },
        //get bitcoin hot wallet blanace
        function(callback){
            database.getHotWalletInfo('btc', function(err, response) {
              if(err) return callback(err)
            



                callback(null, response)
            });
        },
        //get bitcoin cold wallet
        function(callback){
            clientBtc.getBalance('*', 0, true, function(err, response) {
              if(err) return callback(err)
            
                callback(null, response.result)
            });
        },
        function(callback){ 
            database.getBtcClaimedFeesTotal(function(err, total) {

                callback(null, total)
            })
        }
        ];

    async.series(tasks, function(err, results) {
        if (err) {
            console.log("errrrr", err)
            return;
        }
        
        data.clamHw = results[0];
        data.clamWw = ( results[3].balance + results[3].stake ) * 1e8
        data.clamTotal = Number(data.clamHw) + Number(data.clamWw)

        data.stake = results[1];
        data.commissions = results[2]
        data.btcWithdrawCommission = results[6]

        data.btcHw = results[4]
        data.btcCw = results[5] * 1e8

        data.btcWithdrawCommission = results[6]

        //console.log(results[4], results[5])
        data.btcTotal =  Number(data.btcHw) +  Number(data.btcCw)

        res.render('admin', { user: user, info: data});

    });   
};


exports.btcfees = function(req, res, next) {
    var user = req.user;
    assert(user.admin);


    database.getBtcClaimedFees(function(err, response) {
      if(err) return next('Unknown error ');
    
        var claimedFeeList = response

        database.getBtcClaimedFeesTotal(function(err, total) {
            if(err) return next('Unknown error ');


        res.render('admin-btc-fees', {
                claimedTotal: total,
                entries: claimedFeeList,
            });


         });
    });

}


exports.weeklycommissions = function(req, res, next) {
    var user = req.user;
    assert(user.admin);

    var page = null;
    if (req.query.p) { //The page requested or last
        page = parseInt(req.query.p);
        if (!Number.isFinite(page) || page < 0)
            return next('Invalid page');
    }


    database.getWeeklyCommissionsEntryCount(function(err, entryCount) {
        if(err) return next('Unknown error ');
        /**
         * Pagination
         * If the page number is undefined it shows the last page
         * If the page number is given it shows that page
         * It starts counting from zero
         */

        var resultsPerPage = 50;
        var pages = Math.floor(entryCount / resultsPerPage);

        if (page && page >= pages)
            return next('User does not have page ', page);

        // first page absorbs all overflow
        var firstPageResultCount = entryCount - ((pages - 1) * resultsPerPage);

        var showing = page ? resultsPerPage : firstPageResultCount;
        var offset = page ? (firstPageResultCount + ((pages - page - 1) * resultsPerPage)) : 0;

        if (offset > 100000) {
            return next('Sorry we can\'t show games that far back :( ');
        }


        database.getWeeklyCommissions(showing, offset, function(err, entries) {
            if(err) return next('Unknown error ');

            var previousPage;
            if (pages > 1) {
                if (page && page >= 2)
                    previousPage = '?p=' + (page - 1);
                else if (!page)
                    previousPage = '?p=' + (pages - 1);
            }

            var nextPage;
            if (pages > 1) {
                if (page && page < (pages - 1))
                    nextPage = '?p=' + (page + 1);
                else if (page && page == pages - 1)
                    nextPage = '?p=1';
            }


            res.render('weekly-commission', {
                showing_last: !!page,
                previous_page: previousPage,
                next_page: nextPage,
                entries: entries,
                entries_from: entryCount - (offset + showing - 1),
                entries_to: entryCount - offset,
                pages: {
                    current: page == 0 ? 1 : page + 1,
                    total: Math.ceil(entryCount / 100)
                }
            });

        })
    })
}



exports.commissions = function(req, res, next) {
    var user = req.user;
    assert(user.admin);

    var page = null;
    if (req.query.p) { //The page requested or last
        page = parseInt(req.query.p);
        if (!Number.isFinite(page) || page < 0)
            return next('Invalid page');
    }

    database.getCommissionsEntryCount(function(err, entryCount) {
        if(err) return next('Unknown error ');
        /**
         * Pagination
         * If the page number is undefined it shows the last page
         * If the page number is given it shows that page
         * It starts counting from zero
         */

        var resultsPerPage = 25;
        var pages = Math.floor(entryCount / resultsPerPage);

        if (page && page >= pages)
            return next('User does not have page ', page);

        // first page absorbs all overflow
        // 5 - ( -1 * 50)
        var firstPageResultCount = entryCount - ((pages - 1) * resultsPerPage);


        var showing = page ? resultsPerPage : firstPageResultCount;
        var offset = page ? (firstPageResultCount + ((pages - page - 1) * resultsPerPage)) : 0;

        if (offset > 100000) {
            return next('Sorry we can\'t show games that far back :( ');
        }


        database.getCommissions(showing, offset, function(err, entries) {
            if(err) return next('Unknown error ');

            var previousPage;
            if (pages > 1) {
                if (page && page >= 2)
                    previousPage = '?p=' + (page - 1);
                else if (!page)
                    previousPage = '?p=' + (pages - 1);
            }

            var nextPage;
            if (pages > 1) {
                if (page && page < (pages - 1))
                    nextPage = '?p=' + (page + 1);
                else if (page && page == pages - 1)
                    nextPage = stats.username;
            }

            res.render('admin-commissions', {
                showing_last: !!page,
                previous_page: previousPage,
                next_page: nextPage,
                entries: entries,
                entries_from: entryCount - (offset + showing - 1),
                entries_to: entryCount - offset,
                pages: {
                    current: page == 0 ? 1 : page + 1,
                    total: Math.ceil(entryCount / 100)
                }
            });
        })
    })
}



exports.recentdeposits = function(req, res) {
    var user = req.user;
    assert(user.admin);

    database.getDepositTotal(function(err, depositTotal) {
        if(err) return next('Unknown error ');

        database.getRecentDeposits(function(err, recentDeposits) {
            if(err) return next('Unknown error ');


            res.render('admin-recent-deposits', {
                depositTotal: depositTotal,
                entries: recentDeposits,
            });

        })
    })
}

exports.recentwithdraws = function(req, res) {
    var user = req.user;
    assert(user.admin);

    database.getWithdrawTotal(function(err, withdrawTotal) {
        if(err) return next('Unknown error ');

        database.getRecentWithdraws(function(err, recentWithdraws) {
            if(err) return next('Unknown error ');


            res.render('admin-recent-withdraws', {
                withdrawTotal: withdrawTotal,
                entries: recentWithdraws,
            });

        })
    })
}




function calcCommission(commissionData) { 

    var stakeSum = 0
    var gamblingSumClam = 0
    var gamblingSumBtc = 0
    var entrys = []

    for(var i = 0; i  < commissionData.length; i++) { 
        //stake-commission   divest-gambling-commission  weekly-gambling-commission
        var entry = commissionData[i]
        if(entry.reason === "stake-commission"){
            stakeSum += entry.amount
            entry.from_user = 'stake'
        } else if (entry.reason === "divest-gambling-commission" || entry.reason === "weekly-commission"){
            if(entry.coin === 'clam')
                 gamblingSumClam += entry.amount
            else if (entry.coin === 'btc')
                gamblingSumBtc += entry.amount
        }
        entrys.push(entry)
    }

    return { stakeSum:stakeSum, gamblingSumClam:gamblingSumClam, gamblingSumBtc:gamblingSumBtc, entrys:entrys }
}

function encrypt(msg) {
    return simpleCrypto.encrypt(msg);
}

function decrypt(msg) {
    return simpleCrypto.decrypt(msg);
}
