 var assert = require('better-assert');
 var async = require('async');
 var AsyncCache = require('async-cache');
 var timeago = require('timeago');
 var database = require('./database');
 var currentWeekNumber = require('current-week-number');
 var logger = require('winston');
 var Decimal = require('decimal.js');
var uuid = require('uuid');


exports.leaderboardIndex = function(req, res) {
    //assert(req.user);
    res.render('leaderboard', {
        user: req.user,
        id: uuid.v4()
    });
};

 /**
  * GET
  * Public API
  * Shows the leaderboard index
  **/
exports.weeklyLeaderboardIndex = function(req, res) {
    //assert(req.user);
    res.render('weekly-leaderboard', {
        user: req.user,
        id: uuid.v4()
    });
};

 /**
  * GET
  * Public API
  * Show a single game info
  **/
 exports.showClam = function(req, res, next) {
     var user = req.user;
     var gameId = parseInt(req.params.id);

     if (!gameId ||  typeof gameId !== 'number') return res.render('404');

     database.getGame(gameId, 'clam', function(err, game) {
         if (err) {
             if (err === 'GAME_DOES_NOT_EXISTS')
                 return res.render('404');

             return next(new Error('Unable to get game: \n' + err));
         }

         database.getGamesPlays(game.id, 'clam', function(err, plays) {
             if (err)
                 return next(new Error('Unable to get game information: \n' + err)); //If getGame worked this should work too

             var arr = [];
             if (plays.lenght == 0)
                 return []


             for (var j = 0; j < plays.length; j++) {
                 var data = {
                     username: plays[j].username,
                     bet: Math.floor(plays[j].bet),
                     cash_out: plays[j].cash_out ? Math.floor(plays[j].cash_out) : undefined,
                     crash_point: plays[j].cash_out ? plays[j].cash_out / plays[j].bet * 1e6 : undefined
                 }
                 arr.push(data);
             }



             game.timeago = timeago(game.created);
             res.render('game-clam', {
                 game: game,
                 plays: arr,
                 user: user
             });
         });
     });
 };


  exports.showBtc = function(req, res, next) {
     var user = req.user;
     var gameId = parseInt(req.params.id);

     if (!gameId ||  typeof gameId !== 'number') return res.render('404');

     database.getGame(gameId, 'btc', function(err, game) {
         if (err) {
             if (err === 'GAME_DOES_NOT_EXISTS')
                 return res.render('404');

             return next(new Error('Unable to get game: \n' + err));
         }

         database.getGamesPlays(game.id, 'btc', function(err, plays) {
             if (err)
                 return next(new Error('Unable to get game information: \n' + err)); //If getGame worked this should work too

             var arr = [];
             if (plays.lenght == 0)
                 return []


             for (var j = 0; j < plays.length; j++) {
                 var data = {
                     username: plays[j].username,
                     bet: Math.floor(plays[j].bet),
                     cash_out: plays[j].cash_out ? Math.floor(plays[j].cash_out) : undefined,
                     crash_point: plays[j].cash_out ? plays[j].cash_out / plays[j].bet * 1e6 : undefined
                 }
                 arr.push(data);
             }



             game.timeago = timeago(game.created);
             res.render('game-btc', {
                 game: game,
                 plays: arr,
                 user: user
             });
         });
     });
 };

 /**
  * GET
  * Public API
  * Shows the leader board
  **/
 /**
  * GET
  * Public API
  * Shows the leader board
  **/
 exports.getLeaderBoardClam = function(req, res, next) {
     var user = req.user;
     var by = req.query.by;

     var byDb, order;
     switch (by) {
         case 'net_desc':
             byDb = 'net_profit';
             order = 'DESC';
             break;
         case 'net_asc':
             byDb = 'net_profit';
             order = 'ASC';
             break;
         case 'wagered_desc':
             byDb = 'wagered';
             order = 'DESC';
             break;
         default:
             byDb = 'gross_profit';
             order = 'DESC';
     }

     database.getLeaderBoardClam(byDb, order, function(err, leaders) {
         if (err)
             return next(new Error('Unable to get leader board: \n' + err));



         res.render('leaderboard-clam', {
             user: user,
             leaders: leaders,
             sortBy: byDb,
             order: order
         });
     });
 };



 exports.getLeaderBoardBtc = function(req, res, next) {
     var user = req.user;
     var by = req.query.by;

     var byDb, order;
     switch (by) {
         case 'net_desc':
             byDb = 'net_profit';
             order = 'DESC';
             break;
         case 'net_asc':
             byDb = 'net_profit';
             order = 'ASC';
             break;
         case 'wagered_desc':
             byDb = 'wagered';
             order = 'DESC';
             break;
         default:
             byDb = 'gross_profit';
             order = 'DESC';
     }

     database.getLeaderBoardBtc(byDb, order, function(err, leaders) {
         if (err)
             return next(new Error('Unable to get leader board: \n' + err));



         res.render('leaderboard-btc', {
             user: user,
             leaders: leaders,
             sortBy: byDb,
             order: order
         });
     });
 };


 exports.getWeeklyLeaderBoardClam = function(req, res, next) {
     var user = req.user;
     var week = Number(req.query.week) || currentWeekNumber();
     var year = Number(req.query.year) || new Date().getFullYear();



     var nextWeek = week + 1;
     var nextYear = year;
     var previousWeek = week - 1;
     var previousYear = year;

     if (nextWeek > 52) {
         nextWeek = 1;
         nextYear++;
     } else if (previousWeek < 1) {
         previousWeek = 52;
         previousYear--;
     }


     database.getWeeklyLeaderBoardsClam(year, week, function(err, result) {
         if (err) return next(new Error('Unable to get leader board: \n' + err));

         var prizePool = new Decimal(result.prizePool).dividedBy(2).toNumber()

         for (var h = 0; h < result.net.length; h++) {
             var entry = result.net[h]
             if (entry.net_prize_amount > 0)
                 continue

             if (entry.net_rank <= 10) {
                 var p = .5
                 var prize = Math.round(((1 - p) / (1 - Math.pow(p, result.net.length))) * Math.pow(p, (entry.net_rank - 1)) * prizePool)
                 result.net[h].pending_net_prize_amount = prize
             }
         }


         for (var g = 0; g < result.wagered.length; g++) {
             var entry = result.wagered[g]
             if (entry.wagered_prize_amount > 0)
                 continue

             if (entry.wagered_rank <= 10) {
                 var p = .5
                 var prize = Math.round(((1 - p) / (1 - Math.pow(p, result.wagered.length))) * Math.pow(p, (entry.wagered_rank - 1)) * prizePool)
                 result.wagered[g].pending_wagered_prize_amount = prize
             }
         }


         return res.render('weekly-leaderboard-clam', {
             user: user,
             prize_pool: result.prizePool,
             net_leaders: result.net,
             wagered_leaders: result.wagered,
             week: week,
             year: year,
             nextWeek: nextWeek,
             nextYear: nextYear,
             previousWeek: previousWeek,
             previousYear: previousYear
         });
     });
 };

  exports.getWeeklyLeaderBoardBtc = function(req, res, next) {
     var user = req.user;
     var week = Number(req.query.week) || currentWeekNumber();
     var year = Number(req.query.year) || new Date().getFullYear();



     var nextWeek = week + 1;
     var nextYear = year;
     var previousWeek = week - 1;
     var previousYear = year;

     if (nextWeek > 52) {
         nextWeek = 1;
         nextYear++;
     } else if (previousWeek < 1) {
         previousWeek = 52;
         previousYear--;
     }


     database.getWeeklyLeaderBoardsBtc(year, week, function(err, result) {
         if (err) return next(new Error('Unable to get leader board: \n' + err));

         var prizePool = new Decimal(result.prizePool).dividedBy(2).toNumber()

         for (var h = 0; h < result.net.length; h++) {
             var entry = result.net[h]
             if (entry.net_prize_amount > 0)
                 continue

             if (entry.net_rank <= 10) {
                 var p = .5
                 var prize = Math.round(((1 - p) / (1 - Math.pow(p, result.net.length))) * Math.pow(p, (entry.net_rank - 1)) * prizePool)
                 result.net[h].pending_net_prize_amount = prize
             }
         }


         for (var g = 0; g < result.wagered.length; g++) {
             var entry = result.wagered[g]
             if (entry.wagered_prize_amount > 0)
                 continue

             if (entry.wagered_rank <= 10) {
                 var p = .5
                 var prize = Math.round(((1 - p) / (1 - Math.pow(p, result.wagered.length))) * Math.pow(p, (entry.wagered_rank - 1)) * prizePool)
                 result.wagered[g].pending_wagered_prize_amount = prize
             }
         }


         return res.render('weekly-leaderboard-btc', {
             user: user,
             prize_pool: result.prizePool,
             net_leaders: result.net,
             wagered_leaders: result.wagered,
             week: week,
             year: year,
             nextWeek: nextWeek,
             nextYear: nextYear,
             previousWeek: previousWeek,
             previousYear: previousYear
         });
     });
 };



 /**
  * GET
  * Public API
  * Show a single game info
  **/
 exports.getGameInfoJsonClam = function(req, res, next) {
     var gameId = parseInt(req.params.id);

     if (!gameId || typeof gameId !== 'number')
         return res.sendStatus(400);

     database.getGameInfo(gameId, 'clam', function(err, game) {
         if (err) {
             if (err === 'GAME_DOES_NOT_EXISTS')
                 return res.json(err);

             logger.error('[INTERNAL_ERROR] Unable to get game info. gameId: %d', gameId);
             return res.sendStatus(500);
         }
         res.json(game);
     });
 };


  exports.getGameInfoJsonBtc = function(req, res, next) {
     var gameId = parseInt(req.params.id);

     if (!gameId || typeof gameId !== 'number')
         return res.sendStatus(400);

     database.getGameInfo(gameId, 'btc', function(err, game) {
         if (err) {
             if (err === 'GAME_DOES_NOT_EXISTS')
                 return res.json(err);

             logger.error('[INTERNAL_ERROR] Unable to get game info. gameId: %d', gameId);
             return res.sendStatus(500);
         }
         res.json(game);
     });
 };