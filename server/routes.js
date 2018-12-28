var admin = require('./admin');
var assert = require('better-assert');
var lib = require('./lib');
var database = require('./database');
var user = require('./user');
var games = require('./games');
var sendEmail = require('./sendEmail');
var stats = require('./stats');
var config = require('../config/config');
var recaptchaValidator = require('recaptcha-validator');
var logger = require('winston');

var production = process.env.NODE_ENV === 'production';

function staticPageLogged(page, loggedGoTo) {

    return function(req, res) {
        var user = req.user;
        if (!user){
            return res.render(page);
        }
        if (loggedGoTo) return res.redirect(loggedGoTo);

        res.render(page, {
            user: user
        });
    }
}

function contact(origin) {
    assert(typeof origin == 'string');

    return function(req, res, next) {
        var user = req.user;
        var from = req.body.email;
        var message = req.body.message;

        if (!from ) return res.render(origin, { user: user, warning: 'email required' });

        if (!message) return res.render(origin, { user: user, warning: 'message required' });

        if (user) message = 'user_id: ' + req.user.id + '\n' + message;

        sendEmail.contact(from, message, null, function(err) {
            if (err)
                return next(new Error('Error sending email: \n' + err ));

            return res.render(origin, { user: user, success: 'Thank you for writing, one of my humans will write you back very soon :) ' });
        });
    }
}

function restrict(req, res, next) {
    if (!req.user) {
       res.status(401);
       if (req.header('Accept') === 'text/plain')
          res.send('Not authorized');
       else
          res.render('401');
       return;
    } else
        next();
}

function restrictRedirectToHome(req, res, next) {
    if(!req.user) {
        res.redirect('/');
        return;
    }
    next();
}

function adminRestrict(req, res, next) {

    if (!req.user || !req.user.admin) {
        res.status(401);
        if (req.header('Accept') === 'text/plain')
            res.send('Not authorized');
        else
            res.render('401'); //Not authorized page.
        return;
    }
    next();
}

function recaptchaRestrict(req, res, next) {
    var recaptcha = lib.removeNullsAndTrim(req.body['g-recaptcha-response']);

    if (!config.PRODUCTION && !recaptcha) {
        logger.info('Skipping recaptcha check, for dev');
        next();
        return;
    }

    if (!recaptcha)
        return res.send('No recaptcha submitted, go back and try again');

    var ip = req.headers['x-real-ip'] || req.ip
    recaptchaValidator.callback(config.RECAPTCHA_PRIV_KEY, recaptcha, ip, function (err) {
        if (err) {
            if (typeof err === 'string')
                res.send('Got recaptcha error: ' + err + ' please go back and try again');
            else {
                logger.error('[INTERNAL_ERROR] Recaptcha failure: %s', err);
                res.render('error');
            }
            return;
        }

        next();
    });
}



function tableClam() {
    return function(req, res) {
        res.render('table_clam', {
            user: req.user,
            buildConfig: config.BUILD,
            table: true
        });
    }
}

function tableBtc() {
    return function(req, res) {
        res.render('table_btc', {
            user: req.user,
            buildConfig: config.BUILD,
            table: true
        });
    }
}


function tableDev() {
    return function(req, res) {
        if(config.PRODUCTION)
            return res.status(401);
        requestDevOtt(req.params.id, function(devOtt) {
            res.render('table_new', {
                user: req.user,
                devOtt: devOtt,
                table: true
            });
        });
    }
}

function requestDevOtt(id, callback) {
    var curl = require('curlrequest');
    var options = {
        url: 'https://games.freebitcoins.com/ott',
        include: true ,
        method: 'POST',
        'cookie': 'id='+id
    };

    var ott=null;
    curl.request(options, function (err, parts) {
        parts = parts.split('\r\n');
        var data = parts.pop()
            , head = parts.pop();
        ott = data.trim();
        //logger.info('DEV OTT: %s', ott);
        callback(ott);
    });
}

module.exports = function(app) {

    app.get('/', staticPageLogged('index'));
    app.get('/register', staticPageLogged('register', '/blastoff/btc'));
    app.get('/login', staticPageLogged('login', '/blastoff/btc'));
    app.get('/reset/:recoverId', user.validateResetPassword);
    app.get('/faq', staticPageLogged('faq'));
    app.get('/contact', staticPageLogged('contact'));

    app.get('/deposit', restrict, user.deposit);
    app.get('/invest', restrict, user.invest);
    app.get('/invest.json', restrict, user.investJson);
    app.get('/investrequest', restrict, user.investRequest);
    app.get('/divestrequest', restrict, user.divestRequest);
    app.get('/withdraw', restrict, user.withdraw);
    app.get('/withdraw/request', restrict, user.withdrawRequest);
    app.get('/support', restrict, user.contact);
    app.get('/account', restrict, user.account);
    app.get('/security', restrict, user.security);
    app.get('/forgot-password', staticPageLogged('forgot-password'));
    app.get('/calculator', staticPageLogged('calculator'));
    app.get('/guide', staticPageLogged('guide'));

    app.get('/tip', restrict, user.tip);
    //app.get('/livestats', restrict, user.getLiveStats);
    //app.get('/togglestakeonly', restrict, user.stakeonly);


    app.get('/blastoff/clam', tableClam());
    app.get('/blastoff/btc', tableBtc());

    // indexes
    app.get('/weeklyprizes', restrict, user.weeklyPrizes);
    app.get('/leaderboard', games.leaderboardIndex);
    app.get('/weekly-leaderboard', games.weeklyLeaderboardIndex);
    //prizes and leaderboards
    //app.get('/weeklyprizes/clam', restrict, user.weeklyPrizesClam);
    //app.get('/weeklyprizes/btc', restrict, user.weeklyPrizesClam);
    app.get('/leaderboard/clam', games.getLeaderBoardClam);
    app.get('/leaderboard/btc', games.getLeaderBoardBtc);
    app.get('/weekly-leaderboard/clam', games.getWeeklyLeaderBoardClam);
    app.get('/weekly-leaderboard/btc', games.getWeeklyLeaderBoardBtc);
    //games info
    app.get('/game/clam/:id.json', games.getGameInfoJsonClam);
    app.get('/game/clam/:id', games.showClam);
    app.get('/game/btc/:id.json', games.getGameInfoJsonBtc);
    app.get('/game/btc/:id', games.showBtc);

    app.get('/user/:name', user.profile);
    app.get('/user/:name/:coin', user.profile);
    app.get('/error', function(req, res, next) { // Sometimes we redirect people to /error
      return res.render('error');
    });

    app.post('/sent-reset', user.resetPasswordRecovery);
    app.post('/sent-recover', recaptchaRestrict, user.sendPasswordRecover);
    app.post('/reset-password', restrict, user.resetPassword);
    app.post('/edit-email', restrict, user.editEmail);
    app.post('/enable-2fa', restrict, user.enableMfa);
    app.post('/disable-2fa', restrict, user.disableMfa);


    app.post('/invest-request', restrict, user.handleInvestRequest);
    app.post('/divest-request', restrict, user.handleDivestRequest);
    app.post('/withdraw-request', restrict, user.handleWithdrawRequest);
    

    app.post('/support', restrict, contact('support'));
    app.post('/contact', contact('contact'));
    app.post('/logout', restrictRedirectToHome, user.logout);
    app.post('/login', recaptchaRestrict, user.login);
    app.post('/register', recaptchaRestrict, user.register);
   // app.get('/togglestakeonly', restrict, user.togglestakeonly);

    app.post('/ott', restrict, function(req, res, next) {
        var user = req.user;
        var ipAddress = req.headers['x-real-ip'] || req.ip;
        var userAgent = req.get('user-agent');
        assert(user);
        database.createOneTimeToken(user.id, ipAddress, userAgent, function(err, token) {
            if (err) {
                logger.error('[INTERNAL_ERROR] unable to get OTT got %s' + err);
                res.status(500);
                return res.send('Server internal error');
            }
            res.send(token);
        });
    });

    app.get('/stats', stats.index);
    app.get('/terms-conditions', staticPageLogged('terms'));

    // Admin stuff
    app.get('/admin', adminRestrict, admin.index);
    app.get('/admin/weeklycommissions', adminRestrict, admin.weeklycommissions);
    app.get('/admin/recentdeposits', adminRestrict, admin.recentdeposits);
    app.get('/admin/recentwithdraws', adminRestrict, admin.recentwithdraws);
    app.get('/admin/commissions', adminRestrict, admin.commissions);
    app.get('/admin/btcfees', adminRestrict, admin.btcfees);
    //app.get('/admin/prizes', adminRestrict, admin.prizes);
    //app.post('/admin', adminRestrict, admin.post);

    app.get('*', function(req, res) {
        res.status(404);
        res.render('404');
    });
};
