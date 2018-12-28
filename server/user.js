var assert = require('better-assert');
var async = require('async');
var request = require('request');
var timeago = require('timeago');
var lib = require('./lib');
var database = require('./database');
var withdraw = require('./withdraw');
var sendEmail = require('./sendEmail');
var speakeasy = require('speakeasy');
var qr = require('qr-image');
var uuid = require('uuid');
var _ = require('lodash');
var config = require('../config/config');
var logger = require('winston');
var Validator = require('wallet-address-validator');

var sessionOptions = {
    httpOnly: true,
    secure: config.PRODUCTION
};

/**
 * POST
 * Public API
 * Register a user
 */
exports.register = function(req, res, next) {
    var values = _.merge(req.body, {
        user: {}
    });
    var username = lib.removeNullsAndTrim(values.user.name);
    var password = lib.removeNullsAndTrim(values.user.password);
    var password2 = lib.removeNullsAndTrim(values.user.confirm);
    var email = lib.removeNullsAndTrim(values.user.email);
    var ipAddress = req.headers['x-real-ip'] || req.ip;
    var userAgent = req.get('user-agent');

    var notValid = lib.isInvalidUsername(username);
    if (notValid) return res.render('register', {
        warning: 'username not valid because: ' + notValid,
        values: values.user
    });

    // stop new registrations of >16 char usernames
    if (username.length > 16)
        return res.render('register', {
            warning: 'Username is too long',
            values: values.user
        });

    notValid = lib.isInvalidPassword(password);
    if (notValid) {
        values.user.password = null;
        values.user.confirm = null;
        return res.render('register', {
            warning: 'password not valid because: ' + notValid,
            values: values.user
        });
    }

    if (email) {
        notValid = lib.isInvalidEmail(email);
        if (notValid) return res.render('register', {
            warning: 'email not valid because: ' + notValid,
            values: values.user
        });
    }

    // Ensure password and confirmation match
    if (password !== password2) {
        return res.render('register', {
            warning: 'password and confirmation did not match'
        });
    }

    database.createUser(username, password, email, ipAddress, userAgent, function(err, sessionId) {
        if (err) {
            if (err === 'USERNAME_TAKEN') {
                values.user.name = null;
                return res.render('register', {
                    warning: 'User name taken...',
                    values: values.user
                });
            }
            return next(new Error('Unable to register user: \n' + err));
        }
        res.cookie('id', sessionId, sessionOptions);
        return res.redirect('/play?m=new');
    });
};

/**
 * POST
 * Public API
 * Login a user
 */
exports.login = function(req, res, next) {
    var username = lib.removeNullsAndTrim(req.body.username);
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var remember = !!req.body.remember;
    var ipAddress = req.headers['x-real-ip'] || req.ip
    var userAgent = req.get('user-agent');

    if (!username || !password)
        return res.render('login', {
            warning: 'no username or password'
        });

    database.validateUser(username, password, otp, function(err, userId) {
        if (err) {
            console.log('[Login] Error for ', username, ' err: ', err);

            if (err === 'NO_USER')
                return res.render('login', {
                    warning: 'Username does not exist'
                });
            if (err === 'WRONG_PASSWORD')
                return res.render('login', {
                    warning: 'Invalid password'
                });
            if (err === 'INVALID_OTP') {
                var warning = otp ? 'Invalid one-time password' : undefined;
                return res.render('login-mfa', {
                    username: username,
                    password: password,
                    warning: warning
                });
            }
            if(err === 'ACCOUNT_LOCKED'){
                return res.render('login', {
                    warning: 'Account is locked, please contact us at https://freebitcoins.supportsystem.com/'
                });
            }
            return next(new Error('Unable to validate user ' + username + ': \n' + err));
        }
        assert(userId);

        database.createSession(userId, ipAddress, userAgent, remember, function(err, sessionId, expires) {
            if (err)
                return next(new Error('Unable to create session for userid ' + userId + ':\n' + err));

            if (remember)
                sessionOptions.expires = expires;

            res.cookie('id', sessionId, sessionOptions);
            res.redirect('/');
        });
    });
};

/**
 * POST
 * Logged API
 * Logout the current user
 */
exports.logout = function(req, res, next) {
    var sessionId = req.cookies.id;
    var userId = req.user.id;

    assert(sessionId && userId);

    database.expireSessionsByUserId(userId, function(err) {
        if (err)
            return next(new Error('Unable to logout got error: \n' + err));
        res.redirect('/');
    });
};

/**
 * GET
 * Logged API
 * Shows the graph of the user profit and games
 */
exports.profile = function(req, res, next) {

    var user = req.user; //If logged here is the user info
    var username = lib.removeNullsAndTrim(req.params.name);
    var coin = lib.removeNullsAndTrim(req.params.coin);

    if(coin !== 'btc' && coin !== 'clam') {
        database.getPublicStats(username, function(err, stats) {
            if (err) {
                if (err === 'USER_DOES_NOT_EXIST'){


                    return next('User has not played any games yet');
                }
                else
                    return next(new Error('Cant get public stats: \n' + err));
            }

            res.render('user', {
                user: user,
                stats: stats,
                username: username
            }); 
        })
    } else { 

        var page = null;
        if (req.query.p) { //The page requested or last
            page = parseInt(req.query.p);
            if (!Number.isFinite(page) || page < 0)
                return next('Invalid page');
        }

        if (!username)
            return next('No username in profile');

        database.getPublicStats(username, function(err, stats) {
            if (err) {
                if (err === 'USER_DOES_NOT_EXIST')
                    return next('User does not exist');
                else
                    return next(new Error('Cant get public stats: \n' + err));
            }

            /**
             * Pagination
             * If the page number is undefined it shows the last page
             * If the page number is given it shows that page
             * It starts counting from zero
             */

            var resultsPerPage = 50;
            var pages 
            if(coin === 'btc')
                pages  = Math.floor(stats.games_played_btc / resultsPerPage);
            else if ( coin === 'clam')
                pages  = Math.floor(stats.games_played_clam / resultsPerPage);

            if (page && page >= pages)
                return next('User does not have page ', page);

            // first page absorbs all overflow
            var firstPageResultCount;
            if(coin === 'btc')
               firstPageResultCount  = stats.games_played_btc - ((pages - 1) * resultsPerPage);
            else if ( coin === 'clam')
                firstPageResultCount  = stats.games_played_clam - ((pages - 1) * resultsPerPage);

            var showing = page ? resultsPerPage : firstPageResultCount;
            var offset = page ? (firstPageResultCount + ((pages - page - 1) * resultsPerPage)) : 0;

            if (offset > 100000) {
                return next('Sorry we can\'t show games that far back :( ');
            }

            var tasks = [
                function(callback) {
                    database.getUserNetProfitSkip(stats.user_id, showing + offset, coin, callback);
                },
                function(callback) {
                    database.getUserPlays(stats.user_id, showing, offset, coin, callback);
                }
            ];


            async.parallel(tasks, function(err, results) {
                if (err) return next(new Error('Error getting user profit: \n' + err));

                var lastProfit = results[0];
                var netProfitOffset = lastProfit;
                var plays = results[1]

                if (!lib.isInt(netProfitOffset))
                    return next(new Error('Internal profit calc error: ' + username + ' does not have an integer net profit offset'));

                assert(plays);

                plays.forEach(function(play) {
                    play.timeago = timeago(play.created);
                });

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

                //delete user.password
                //delete user.mfa_secret
                var gamesFrom; 
                var gamesTo;

                if(coin === 'btc'){ 
                    if(stats.games_played_btc < resultsPerPage) { 
                         gamesFrom = 1
                         gamesTo = stats.games_played_btc 
                    } else{ 
                       gamesFrom = stats.games_played_btc - (offset + showing - 1)
                       gamesTo = stats.games_played_btc - offset
                    }
                    
                } else if(coin === 'clam') {
                    if(stats.games_played_btc < resultsPerPage) { 
                         gamesFrom = 1
                         gamesTo = stats.games_played_clam 
                    } else{
                        gamesFrom = stats.games_played_clam - (offset + showing - 1)
                        gamesTo = stats.games_played_clam - offset
                    }
                }

                var userStr = 'user-' + coin

                res.render(userStr, {
                    user: user,
                    coin: coin, 
                    stats: stats,
                    plays: plays,
                    net_profit_offset: netProfitOffset,
                    showing_last: !!page,
                    previous_page: previousPage,
                    next_page: nextPage,
                    games_from: gamesFrom,
                    games_to: gamesTo,
                    pages: {
                        current: page == 0 ? 1 : page + 1,
                        total: Math.ceil(stats.games_played / 100)
                    }
                });
            });
        });
    } 
};

/**
 * GET
 * Shows the request bits page
 * Restricted API to logged users
 **/
exports.request = function(req, res) {
    var user = req.user; //Login var
    assert(user);

    res.render('request', {
        user: user
    });
};


/**
 * GET
 * Restricted API
 * Shows the account page, the default account page.
 **/
exports.account = function(req, res, next) {
    var user = req.user;
    assert(user);

    var tasks = [
        function(callback) {
            database.getDepositsAmount(user.id, callback);
        },
        function(callback) {
            database.getWithdrawalsAmount(user.id, callback);
        },
        function(callback) {
            database.getUserNetProfit(user.id, 'clam', callback)
        },
        function(callback) {
            database.getUserNetProfit(user.id, 'btc', callback)
        },
        function(callback) {
            database.getUserStats(user.id, callback)
        },
        function(callback) {
            database.getUserDepositAddresses(user.id, callback)
        }
    ];

    async.parallel(tasks, function(err, ret) {
        if (err)
            return next(new Error('Unable to get account info: \n' + err));


        var deposits_clam = ret[0].clam;
        var deposits_btc = ret[0].btc;
        var withdrawals_clam = ret[1].clam;
        var withdrawals_btc = ret[1].btc;

        var netClam = ret[2];
        var netBtc = ret[3];

        var stats = ret[4];
        var depositAddresses = ret[5]

        user.deposits_clam = deposits_clam
        user.deposits_btc = deposits_btc

        user.deposits_clam = deposits_clam
        user.deposits_btc = deposits_btc

        user.withdrawal_clam = withdrawals_clam
        user.withdrawal_btc  = withdrawals_btc
        // Math.sign(num) * Math.floor10(Math.sign(num) * num)
        user.net_profit_clam = Math.floor(netClam.profit/1e6);
        user.net_profit_btc = Math.floor(netBtc.profit/1e6);

        user.deposit_address_clam = depositAddresses.clam
        user.deposit_address_btc = depositAddresses.btc
        user.stats = stats;

        res.render('account', {
            user: user
        });
    });
};

/**
 * POST
 * Restricted API
 * Change the user's password
 **/
exports.resetPassword = function(req, res, next) {
    var user = req.user;
    assert(user);
    var password = lib.removeNullsAndTrim(req.body.old_password);
    var newPassword = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var confirm = lib.removeNullsAndTrim(req.body.confirmation);
    var ipAddress = req.headers['x-real-ip'] || req.ip
    var userAgent = req.get('user-agent');

    if (!password) return res.redirect('/security?err=Enter%20your%20old%20password');

    var notValid = lib.isInvalidPassword(newPassword);
    if (notValid) return res.redirect('/security?err=new%20password%20not%20valid:' + notValid);

    if (newPassword !== confirm) return res.redirect('/security?err=new%20password%20and%20confirmation%20should%20be%20the%20same.');

    database.validateUser(user.username, password, otp, function(err, userId) {
        if (err) {
            if (err === 'WRONG_PASSWORD') return res.redirect('/security?err=wrong password.');
            if (err === 'INVALID_OTP') return res.redirect('/security?err=invalid one-time password.');
            //Should be an user here
            return next(new Error('Unable to reset password: \n' + err));
        }
        assert(userId === user.id);
        database.changeUserPassword(user.id, newPassword, function(err) {
            if (err)
                return next(new Error('Unable to change user password: \n' + err));

            database.expireSessionsByUserId(user.id, function(err) {
                if (err)
                    return next(new Error('Unable to delete user sessions for userId: ' + user.id + ': \n' + err));

                database.createSession(user.id, ipAddress, userAgent, false, function(err, sessionId) {
                    if (err)
                        return next(new Error('Unable to create session for userid ' + userId + ':\n' + err));


                    logger.info("User %s password was reset", user.username)
                    res.cookie('id', sessionId, sessionOptions);
                    res.redirect('/security?m=Password changed');
                });
            });
        });
    });
};

/**
 * POST
 * Restricted API
 * Adds an email to the account
 **/
exports.editEmail = function(req, res, next) {
    var user = req.user;
    assert(user);

    var email = lib.removeNullsAndTrim(req.body.email);
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);

    //If no email set to null
    if (email.length === 0) {
        email = null;
    } else {
        var notValid = lib.isInvalidEmail(email);
        if (notValid) return res.redirect('/security?err=email invalid because: ' + notValid);
    }

    notValid = lib.isInvalidPassword(password);
    if (notValid) return res.render('/security?err=password not valid because: ' + notValid);

    database.validateUser(user.username, password, otp, function(err, userId) {
        if (err) {
            if (err === 'WRONG_PASSWORD') return res.redirect('/security?err=wrong%20password');
            if (err === 'INVALID_OTP') return res.redirect('/security?err=invalid%20one-time%20password');
            //Should be an user here
            return next(new Error('Unable to validate user adding email: \n' + err));
        }

        database.updateEmail(userId, email, function(err) {
            if (err)
                return next(new Error('Unable to update email: \n' + err));

            res.redirect('security?m=Email added');
        });
    });
};

/**
 * GET
 * Restricted API
 * Shows the security page of the users account
 **/
exports.security = function(req, res) {
    var user = req.user;
    assert(user);

    if (!user.mfa_secret) {
        user.mfa_potential_secret = speakeasy.generate_key({
            length: 32
        }).base32;
        var qrUri = 'otpauth://totp/freebitcoins:' + user.username + '?secret=' + user.mfa_potential_secret + '&issuer=freebitcoins';
        user.qr_svg = qr.imageSync(qrUri, {
            type: 'svg'
        });
        user.sig = lib.sign(user.username + '|' + user.mfa_potential_secret);
    }

    res.render('security', {
        user: user
    });
};

/**
 * POST
 * Restricted API
 * Enables the two factor authentication
 **/
exports.enableMfa = function(req, res, next) {
    var user = req.user;
    assert(user);

    var otp = lib.removeNullsAndTrim(req.body.otp);
    var sig = lib.removeNullsAndTrim(req.body.sig);
    var secret = lib.removeNullsAndTrim(req.body.mfa_potential_secret);

    if (user.mfa_secret) return res.redirect('/security?err=2FA%20is%20already%20enabled');
    if (!otp) return next('Missing otp in enabling mfa');
    if (!sig) return next('Missing sig in enabling mfa');
    if (!secret) return next('Missing secret in enabling mfa');

    if (!lib.validateSignature(user.username + '|' + secret, sig))
        return next('Could not validate sig');

    var expected = speakeasy.totp({
        key: secret,
        encoding: 'base32'
    });

    if (otp !== expected) {
        user.mfa_potential_secret = secret;
        var qrUri = 'otpauth://totp/freebitcoins:' + user.username + '?secret=' + secret + '&issuer=freebitcoins';
        user.qr_svg = qr.imageSync(qrUri, {
            type: 'svg'
        });
        user.sig = sig;

        return res.render('security', {
            user: user,
            warning: 'Invalid 2FA token'
        });
    }

    database.updateMfa(user.id, secret, function(err) {
        if (err) return next(new Error('Unable to update 2FA status: \n' + err));
        res.redirect('/security?=m=Two-Factor%20Authentication%20Enabled');
    });
};

/**
 * POST
 * Restricted API
 * Disables the two factor authentication
 **/
exports.disableMfa = function(req, res, next) {
    var user = req.user;
    assert(user);

    var secret = lib.removeNullsAndTrim(user.mfa_secret);
    var otp = lib.removeNullsAndTrim(req.body.otp);

    if (!secret) return res.redirect('/security?err=Did%20not%20sent%20mfa%20secret');
    if (!user.mfa_secret) return res.redirect('/security?err=2FA%20is%20not%20enabled');
    if (!otp) return res.redirect('/security?err=No%20OTP');

    var expected = speakeasy.totp({
        key: secret,
        encoding: 'base32'
    });

    if (otp !== expected)
        return res.redirect('/security?err=invalid%20one-time%20password');

    database.updateMfa(user.id, null, function(err) {
        if (err) return next(new Error('Error updating Mfa: \n' + err));

        res.redirect('/security?=m=Two-Factor%20Authentication%20Disabled');
    });
};


exports.sendPasswordRecover = function(req, res, next) {
    var username = lib.removeNullsAndTrim(req.body.username);
    if (!username) return res.redirect('forgot-password');
    var remoteIpAddress = req.headers['x-real-ip'] || req.ip

    //We don't want to leak if the email has users, so we send this message even if there are no users from that email
    var messageSent = {
        success: 'We\'ve sent an email to you if there is a recovery email.'
    };

    database.getUserFromUsername(username, function(err, user) {
        if (err) {
            if (err === 'NO_USERS')
                return res.render('forgot-password', messageSent);
            else
                return next(new Error('Unable to get user by username ' + username + ': \n' + err));
        }

        database.addRecoverId(user.id, remoteIpAddress, function(err, recoveryId) {
            if (err)
                return callback(err);

            if(user.email) { 
                sendEmail.passwordReset(user.email, user.id, recoveryId, function(err) {
                    if (err)
                        return next(new Error('Unable to send password email: \n' + err));

                    logger.info("Sent password reset key to user %d", user.id)
                    return res.render('forgot-password', messageSent);
                })
            } else { 
                return next(new Error('No email address is set for this account'));
            }
        })
    })
};



/**
 * GET
 * Public API
 * Validate if the reset id is valid or is has not being uses, does not alters the recovery state
 * Renders the change password
 **/
exports.validateResetPassword = function(req, res, next) {
    var recoverId = req.params.recoverId;
    if (!recoverId || !lib.isUUIDv4(recoverId))
        return next('Invalid recovery id');

    database.getUserByValidRecoverId(recoverId, function(err, user) {
        if (err) {
            if (err === 'NOT_VALID_RECOVER_ID')
                return next('Invalid recovery id');
            return next(new Error('Unable to get user by recover id ' + recoverId + '\n' + err));
        }
        res.render('reset-password', {
            user: user,
            recoverId: recoverId
        });
    });
};

/**
 * POST
 * Public API
 * Receives the new password for the recovery and change it
 **/
exports.resetPasswordRecovery = function(req, res, next) {
    var recoverId = req.body.recover_id;
    var password = lib.removeNullsAndTrim(req.body.password);
    var ipAddress = req.headers['x-real-ip'] || req.ip
    var userAgent = req.get('user-agent');

    if (!recoverId || !lib.isUUIDv4(recoverId)) return next('Invalid recovery id');

    var notValid = lib.isInvalidPassword(password);
    if (notValid) return res.render('reset-password', {
        recoverId: recoverId,
        warning: 'password not valid because: ' + notValid
    });

    database.changePasswordFromRecoverId(recoverId, password, function(err, user) {
        if (err) {
            if (err === 'NOT_VALID_RECOVER_ID')
                return next('Invalid recovery id');
            return next(new Error('Unable to change password for recoverId ' + recoverId + ', password: ' + password + '\n' + err));
        }
        database.createSession(user.id, ipAddress, userAgent, false, function(err, sessionId) {
            if (err)
                return next(new Error('Unable to create session for password from recover id: \n' + err));

            logger.info("Password reset for user %d", user.id)
            res.cookie('id', sessionId, sessionOptions);
            res.redirect('/');
        });
    });
};

/**
 * GET
 * Restricted API
 * Shows the deposit history
 **/
exports.deposit = function(req, res, next) {
    var user = req.user;
    assert(user);

    database.getUserDepositAddresses(user.id, function(err, depositAddresses) {
        if (err) {
             return next(new Error('Unable to get deposits: \n' + err));
        }
        
        database.getDeposits(user.id, function(err, deposits) {
            if (err) {
                return next(new Error('Unable to get deposits: \n' + err));
            }
            user.deposits = deposits;
            user.deposit_address_clam = depositAddresses.clam
            user.deposit_address_btc = depositAddresses.btc
            res.render('deposit', { user: user } );
        });
    });
};


/**
 * GET
 * Restricted API
 * Shows the transfer history
 **/
exports.invest = function(req, res, next) {
    var user = req.user;
    assert(user);

    var success = (req.query.m === 'success') ? 'Investment action has been made' : undefined;
    database.getInvestments(user.id, function(err, investments) {
        if (err)
            return next(new Error('Unable to get investments: ' + err));

        res.render('invest', {
            user: user,
            investments: investments,
            success: success
        });
    });
};

exports.investJson = function(req, res, next) {
    var user = req.user;
    assert(user);

    database.getinvestments(user.id, function(err, investments) {
        if (err)
            return next(new Error('Unable to get investments: ' + err));

        res.json(investments);
    });
};

/**
 * GET
 * Restricted API
 * Shows the transfer request page
 **/

exports.investRequest = function(req, res) {
    assert(req.user);
    var user = req.user;

    res.render('invest-request', {
        user: req.user,
        id: uuid.v4()
    });
};

/**
 * GET
 * Restricted API
 * Shows the transfer request page
 **/

exports.divestRequest = function(req, res) {
    assert(req.user);
    var user = req.user;
    
    res.render('divest-request', {
        user: req.user,
        id: uuid.v4()
    });
};



exports.handleDivestRequest = function(req, res, next) {
    var user = req.user;
    assert(user);
    var uid = req.body['divest-id'];
    var amount = lib.removeNullsAndTrim(req.body.amount);
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var coin = lib.removeNullsAndTrim(req.body.coin);
    var setAll = lib.removeNullsAndTrim(req.body.setall)
    if(setAll)
        setAll = true
    else 
        setAll = false

    var r = /^[0-9]\d*(\.\d{0,8})?$/;
    var r2 = /^\.\d{0,8}?$/;

    if (!r.test(amount) && !r2.test(amount) && !setAll)
        return res.render('divest-request', {
            user: user,
            id: uuid.v4(),
            warning: 'Not a valid amount'
        });

    if(coin !== 'btc' && coin !==  'clam')
         return res.render('divest-request', {
            user: user,
            id: uuid.v4(),
            warning: 'You must select either clam or btc to withdraw'
        });
    //amount = Math.round(parseFloat(amount) * 100);
    if(setAll)
        amount = 0
    else 
        amount = Math.floor(amount * 1e8);

    if (!password)
        return res.render('divest-request', {
            user: user,
            id: uuid.v4(),
            warning: 'Must enter a password'
        });


    database.validateUser(user.username, password, otp, function(err) {

        if (err) {
            if (err === 'WRONG_PASSWORD')
                return res.render('divest-request', {
                    user: user,
                    id: uuid.v4(),
                    warning: 'wrong password, try it again...'
                });
            if (err === 'INVALID_OTP')
                return res.render('divest-request', {
                    user: user,
                    id: uuid.v4(),
                    warning: 'invalid one-time token'
                });
            //Should be an user
            return next(new Error('Unable to validate user handling transfer: ' + err));
        }
        // Check destination user

        database.setDivest(uid, user.id, user.username, amount, coin, setAll, function(err) {
            if (err) {
                if (err === 'NOT_ENOUGH_BALANCE')
                    return res.render('divest-request', {
                        user: user,
                        id: uuid.v4(),
                        warning: 'Not enough balance for divest'
                    });
                if (err === 'INVESTMENT_ALREADY_MADE')
                    return res.render('divest-request', {
                        user: user,
                        id: uuid.v4(),
                        warning: 'You already submitted an investment action this round'
                    });

                console.error('[INTERNAL_ERROR] could not divest: ', err);
                return res.render('divest-request', {
                    user: user,
                    id: uuid.v4(),
                    warning: 'Could not divest'
                });
            }

            return res.redirect('/invest?m=success');
        });
    });

};

exports.handleInvestRequest = function(req, res, next) {
    var user = req.user;
    assert(user);
    var uid = req.body['invest-id'];
    var amount = lib.removeNullsAndTrim(req.body.amount);
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var coin = lib.removeNullsAndTrim(req.body.coin);
    var setAll = lib.removeNullsAndTrim(req.body.setall)

    if(setAll)
        setAll = true
    else 
        setAll = false

    var r = /^[0-9]\d*(\.\d{0,8})?$/;
    var r2 = /^\.\d{0,8}?$/;

    if (!r.test(amount) && !r2.test(amount) && !setAll)
        return res.render('invest-request', {
            user: user,
            id: uuid.v4(),
            warning: 'Not a valid amount'
        });

    if(coin !== 'btc' && coin !==  'clam')
         return res.render('invest-request', {
            user: user,
            id: uuid.v4(),
            warning: 'You must select either clam or btc to invest'
        });

    if(setAll)
        amount = 0
    else 
        amount = Math.floor(amount * 1e8);

    if (amount < 1000 && !setAll)
        return res.render('invest-request', {
            user: user,
            id: uuid.v4(),
            warning: 'Must invest at least .0001 ' + coin
        });

    if (!password)
        return res.render('invest-request', {
            user: user,
            id: uuid.v4(),
            warning: 'Must enter a password'
        });

    /*
    if (user.username.toLowerCase() === toUserName.toLowerCase()) {
        return res.render('invest-request', { user: user,  id: uuid.v4(), warning: 'Can\'t send money to yourself'});
    }*/

    database.validateUser(user.username, password, otp, function(err) {

        if (err) {
            if (err === 'WRONG_PASSWORD')
                return res.render('invest-request', {
                    user: user,
                    id: uuid.v4(),
                    warning: 'wrong password, try it again...'
                });
            if (err === 'INVALID_OTP')
                return res.render('invest-request', {
                    user: user,
                    id: uuid.v4(),
                    warning: 'invalid one-time token'
                });
            //Should be an user
            return next(new Error('Unable to validate user handling transfer: ' + err));
        }
        // Check destination user

        database.setInvest(uid, user.id, user.username, amount, coin, setAll, function(err) {
            if (err) {
                if (err === 'NOT_ENOUGH_BALANCE')
                    return res.render('invest-request', {
                        user: user,
                        id: uuid.v4(),
                        warning: 'Not enough balance for transfer'
                    });
                if (err === 'INVESTMENT_ALREADY_MADE')
                    return res.render('invest-request', {
                        user: user,
                        id: uuid.v4(),
                        warning: 'You already submitted an investment this round'
                    });

                console.error('[INTERNAL_ERROR] could not invest: ', err);
                return res.render('invest-request', {
                    user: user,
                    id: uuid.v4(),
                    warning: 'Could not make investment'
                });
            }

            return res.redirect('/invest?m=success');
        });
    });

};


/**
 * GET
 * Restricted API
 * Shows the withdrawal history
 **/
exports.withdraw = function(req, res, next) {
    var user = req.user;
    assert(user);

    database.getWithdrawals(user.id, function(err, withdrawals) {
        if (err)
            return next(new Error('Unable to get withdrawals: \n' + err));

        withdrawals.forEach(function(withdrawal) {
            withdrawal.shortDestination = withdrawal.destination.substring(0, 8);
        });
        user.withdrawals = withdrawals;

        res.render('withdraw', {
            user: user
        });
    });
};


/**
 * GET
 * Restricted API
 * Shows the withdrawal history
 **/
exports.tip = function(req, res, next) {
    var user = req.user;
    assert(user);

    database.getTips(user.id, function(err, tips) {
        if (err)
            return next(new Error('Unable to get tips: \n' + err));

        user.tips = tips;
        res.render('tip', {
            user: user
        });
    });
};


/**
 * GET
 * Restricted API
 * Shows the weeklyPrizes history for clam
 **/
exports.weeklyPrizes = function(req, res, next) {
    var user = req.user;
    assert(user);

    database.getWeeklyPrizes(user.id, function(err, prizes) {
        if (err)
            return next(new Error('Unable to prizes: \n' + err));

        user.prizes = prizes;
        res.render('weekly-prizes', {
            user: user
        });
    });
};


/**
 * POST
 * Restricted API
 * Process a withdrawal
 **/
exports.handleWithdrawRequest = function(req, res, next) {
    var user = req.user;
    assert(user);

    var amount = lib.removeNullsAndTrim(req.body.amount);
    var destination = lib.removeNullsAndTrim(req.body.destination);
    var withdrawalId = lib.removeNullsAndTrim(req.body.withdrawal_id);
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var coin = lib.removeNullsAndTrim(req.body.coin);


    var r = /^[0-9]\d*(\.\d{0,8})?$/;
    if (!r.test(amount))
        return res.render('withdraw-request', {
            user: user,
            id: uuid.v4(),
            warning: 'Not a valid amount'
        });

    amount = Math.round(parseFloat(amount) * 1e8);
    assert(Number.isFinite(amount));

    var minWithdrawClam = 1000000;
    var minWithdrawBtc = 100000;

    if (coin !== 'btc' && coin !==  'clam') {
         return res.render('withdraw-request', {
            user: user,
            id: uuid.v4(),
            warning: 'You must select either clam or btc to withdraw'
        });
    }

    if (amount < minWithdrawClam && coin === "clam") {
        return res.render('withdraw-request', {
            user: user,
            id: uuid.v4(),
            warning: 'You must withdraw ' + minWithdrawClam / 1e8 + ' or more clam'
        });
    }

    if (amount < minWithdrawBtc && coin === "btc") {
        return res.render('withdraw-request', {
            user: user,
            id: uuid.v4(),
            warning: 'You must withdraw ' + minWithdrawBtc / 1e8 + ' or more btc'
        });
    }

    if (typeof destination !== 'string')
        return res.render('withdraw-request', {
            user: user,
            id: uuid.v4(),
            warning: 'Destination address not provided'
        });

    var wdValid = (coin === "clam") ? Validator.validate(destination, "clam") : Validator.validate(destination, "btc")
    if (!wdValid) return res.render('withdraw-request', {
            user: user,
            id: uuid.v4(),
            warning: 'Destination address is not a valid ' + coin + ' address'
        });

    if (!password || typeof password !== 'string')
        return res.render('withdraw-request', {
            user: user,
            id: uuid.v4(),
            warning: 'Must enter a password'
        });

    if (!lib.isUUIDv4(withdrawalId))
        return res.render('withdraw-request', {
            user: user,
            id: uuid.v4(),
            warning: 'Could not find a one-time token'
        });

    database.validateUser(user.username, password, otp, function(err) {

        if (err) {
            if (err === 'WRONG_PASSWORD')
                return res.render('withdraw-request', {
                    user: user,
                    id: uuid.v4(),
                    warning: 'wrong password, try it again...'
                });
            if (err === 'INVALID_OTP')
                return res.render('withdraw-request', {
                    user: user,
                    id: uuid.v4(),
                    warning: 'invalid one-time token'
                });
            //Should be an user
            return next(new Error('Unable to validate user handling withdrawal: \n' + err));
        }

        withdraw(req.user.id, amount, destination, withdrawalId, coin, function(err) {
            if (err) {
                if (err === 'NOT_ENOUGH_MONEY')
                    return res.render('withdraw-request', {
                        user: user,
                        id: uuid.v4(),
                        warning: 'Not enough coins in your balance to process withdraw.'
                    });
                else if (err === 'PENDING')
                    return res.render('withdraw-request', {
                        user: user,
                        id: uuid.v4(),
                        warning: 'Withdrawal already being processed. Please try again in 30 seconds!'
                    });
                else if (err === 'SAME_WITHDRAWAL_ID')
                    return res.render('withdraw-request', {
                        user: user,
                        id: uuid.v4(),
                        warning: 'Please reload your page, it looks like you tried to make the same transaction twice.'
                    });
                else
                    return next(new Error('Unable to withdraw: ' + err));
            }
            return res.render('withdraw-request', {
                user: user,
                id: uuid.v4(),
                success: 'OK'
            });
        });
    });
};

/**
 * GET
 * Restricted API
 * Shows the withdrawal request page
 **/
exports.withdrawRequest = function(req, res) {
    assert(req.user);
    res.render('withdraw-request', {
        user: req.user,
        id: uuid.v4()
    });
};

/**
 * GET
 * Restricted API
 * Shows the support page
 **/
exports.contact = function(req, res) {
    assert(req.user);
    res.render('support', {
        user: req.user
    })
};

/**
 * GET
 * Public API
 * Returns an array of usernames or null
 **/
exports.getUsernamesByPrefix = function(req, res, next) {
    var prefix = req.params.prefix;

    //Validate prefix
    if (lib.isInvalidUsername(prefix))
        return res.status(400).send('INVALID_PREFIX');

    database.getUsernamesByPrefix(prefix, function(err, usernames) {
        if (err) {
            logger.error('[INTERNAL_ERROR] unable to request usernames by prefix: %s', usernames);
            return res.status(500).send('INTERNAL_ERROR');
        }

        res.send(JSON.stringify(usernames));
    })
};