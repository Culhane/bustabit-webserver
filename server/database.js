var assert = require('assert');
var uuid = require('uuid');
var config = require('../config/config');
var _ = require('lodash')
var async = require('async');
var lib = require('./lib');
var pg = require('pg');
var passwordHash = require('password-hash');
var speakeasy = require('speakeasy');
var m = require('multiline');
var logger = require('winston');
var Decimal = require('decimal.js');

var databaseUrl = config.DATABASE_URL;

if (!databaseUrl)
    throw new Error('must set DATABASE_URL environment var');

pg.types.setTypeParser(20, function(val) { // parse int8 as an integer
    return val === null ? null : parseInt(val);
});


var timer = function(name) {
    var start = new Date();
    return {
        stop: function() {
            var end  = new Date();
            var time = end.getTime() - start.getTime();
            console.log('Socket Timer:', name, 'finished in', time, 'ms');
        }
    }
};

// callback is called with (err, client, done)
function connect(callback) {
    return pg.connect(databaseUrl, callback);
}

function query(query, params, callback) {
    //third parameter is optional
    if (typeof params == 'function') {
        callback = params;
        params = [];
    }

    doIt();

    function doIt() {
        connect(function(err, client, done) {
            if (err) return callback(err);
            client.query(query, params, function(err, result) {
                done();
                if (err) {
                    if (err.code === '40P01') {
                        console.error('[INTERNAL] Warning: Retrying deadlocked transaction: ', query, params);
                        return doIt();
                    }
                    return callback(err);
                }

                callback(null, result);
            });
        });
    }
}

exports.query = query;

pg.on('error', function(err) {
    logger.error('POSTGRES EMITTED AN ERROR %s', err);
});


// runner takes (client, callback)

// callback should be called with (err, data)
// client should not be used to commit, rollback or start a new transaction

// callback takes (err, data)

function getClient(runner, callback) {
    doIt();

    function doIt() {
        connect(function(err, client, done) {
            if (err) return callback(err);

            function rollback(err) {
                client.query('ROLLBACK', done);

                if (err.code === '40P01') {
                    logger.error('[INTERNAL_ERROR] Warning: Retrying deadlocked transaction..');
                    return doIt();
                }

                callback(err);
            }

            client.query('BEGIN', function(err) {
                if (err)
                    return rollback(err);

                runner(client, function(err, data) {
                    if (err)
                        return rollback(err);

                    client.query('COMMIT', function(err) {
                        if (err)
                            return rollback(err);

                        done();
                        callback(null, data);
                    });
                });
            });
        });
    }
}

//Returns a sessionId
exports.createUser = function(username, password, email, ipAddress, userAgent, callback) {
    assert(username && password);

    getClient(
        function(client, callback) {
            var hashedPassword = passwordHash.generate(password);

            client.query('SELECT COUNT(*) count FROM users WHERE lower(username) = lower($1)', [username],
                function(err, data) {
                    if (err) return callback(err);
                    assert(data.rows.length === 1);
                    if (data.rows[0].count > 0)
                        return callback('USERNAME_TAKEN');

                    client.query('INSERT INTO users(username, email, password) VALUES($1, $2, $3) RETURNING id', [username, email, hashedPassword],
                        function(err, data) {
                            if (err) {
                                if (err.code === '23505')
                                    return callback('USERNAME_TAKEN');
                                else
                                    return callback(err);
                            }

                            assert(data.rows.length === 1);
                            var user = data.rows[0];

                            createSession(client, user.id, ipAddress, userAgent, false, callback);
                        }
                    );

                });
        }, callback);
};

exports.updateEmail = function(userId, email, callback) {
    assert(userId);

    query('UPDATE users SET email = $1 WHERE id = $2', [email, userId], function(err, res) {
        if (err) return callback(err);

        assert(res.rowCount === 1);
        callback(null);
    });

};

exports.changeUserPassword = function(userId, password, callback) {
    assert(userId && password && callback);
    var hashedPassword = passwordHash.generate(password);
    query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId], function(err, res) {
        if (err) return callback(err);
        assert(res.rowCount === 1);
        callback(null);
    });
};

exports.updateMfa = function(userId, secret, callback) {
    assert(userId);
    query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, userId], callback);
};

// Possible errors:
//   NO_USER, WRONG_PASSWORD, INVALID_OTP
exports.validateUser = function(username, password, otp, callback) {
    assert(username && password);

    query('SELECT id, password, mfa_secret, frozen FROM users WHERE lower(username) = lower($1)', [username], function(err, data) {
        if (err) return callback(err);

        if (data.rows.length === 0)
            return callback('NO_USER');

        var user = data.rows[0];

        var verified = passwordHash.verify(password, user.password);
        if (!verified)
            return callback('WRONG_PASSWORD');

        if (user.frozen === true)
            return callback('ACCOUNT_LOCKED');

        if (user.mfa_secret) {
            if (!otp) return callback('INVALID_OTP'); // really, just needs one

            var expected = speakeasy.totp({
                key: user.mfa_secret,
                encoding: 'base32'
            });

            if (otp !== expected)
                return callback('INVALID_OTP');
        }

        callback(null, user.id);
    });
};

/** Expire all the not expired sessions of an user by id **/
exports.expireSessionsByUserId = function(userId, callback) {
    assert(userId);

    query('UPDATE sessions SET expired = now() WHERE user_id = $1 AND expired > now()', [userId], callback);
};


function createSession(client, userId, ipAddress, userAgent, remember, callback) {
    var sessionId = uuid.v4();

    var expired = new Date();
    if (remember)
        expired.setFullYear(expired.getFullYear() + 10);
    else
        expired.setDate(expired.getDate() + 21);

    client.query('INSERT INTO sessions(id, user_id, ip_address, user_agent, expired) VALUES($1, $2, $3, $4, $5) RETURNING id', [sessionId, userId, ipAddress, userAgent, expired], function(err, res) {
        if (err) return callback(err);
        assert(res.rows.length === 1);

        var session = res.rows[0];
        assert(session.id);

        callback(null, session.id, expired);
    });
}

exports.createOneTimeToken = function(userId, ipAddress, userAgent, callback) {
    assert(userId);
    var id = uuid.v4();

    query('INSERT INTO sessions(id, user_id, ip_address, user_agent, ott) VALUES($1, $2, $3, $4, true) RETURNING id', [id, userId, ipAddress, userAgent], function(err, result) {
        if (err) return callback(err);
        assert(result.rows.length === 1);

        var ott = result.rows[0];

        callback(null, ott.id);
    });
};

exports.createSession = function(userId, ipAddress, userAgent, remember, callback) {
    assert(userId && callback);

    getClient(function(client, callback) {
        createSession(client, userId, ipAddress, userAgent, remember, callback);
    }, callback);

};

exports.getUserFromUsername = function(username, callback) {
    assert(username && callback);

    query('SELECT * FROM users_view WHERE lower(username) = lower($1)', [username], function(err, data) {
        if (err) return callback(err);

        if (data.rows.length === 0)
            return callback('NO_USER');

        assert(data.rows.length === 1);
        var user = data.rows[0];
        //assert(typeof user.balance_satoshis === 'number');

        callback(null, user);
    });
};

exports.getUsersFromEmail = function(email, callback) {
    assert(email, callback);

    query('select * from users where email = lower($1)', [email], function(err, data) {
        if (err) return callback(err);

        if (data.rows.length === 0)
            return callback('NO_USERS');

        callback(null, data.rows);

    });
};

exports.addRecoverId = function(userId, ipAddress, callback) {
    assert(userId && ipAddress && callback);

    var recoveryId = uuid.v4();

    query('INSERT INTO recovery (id, user_id, ip)  values($1, $2, $3)', [recoveryId, userId, ipAddress], function(err, res) {
        if (err) return callback(err);
        callback(null, recoveryId);
    });
};

exports.getUserBySessionId = function(sessionId, callback) {
    assert(sessionId && callback);
    query('SELECT * FROM users_view WHERE id = (SELECT user_id FROM sessions WHERE id = $1 AND ott = false AND expired > now())', [sessionId], function(err, response) {
        if (err) return callback(err);

        var data = response.rows;
        if (data.length === 0)
            return callback('NOT_VALID_SESSION');

        assert(data.length === 1);

        var user = data[0];
        user.balance_satoshis_clam = Math.floor(user.balance_satoshis_clam / 1e6);
        user.balance_satoshis_invested_clam = Math.floor(user.balance_satoshis_invested_clam / 1e6);
        user.balance_satoshis_btc = Math.floor(user.balance_satoshis_btc / 1e6);
        user.balance_satoshis_invested_btc = Math.floor(user.balance_satoshis_invested_btc / 1e6);

        assert(typeof user.balance_satoshis_clam === 'number');
        assert(typeof user.balance_satoshis_invested_clam === 'number');
        assert(typeof user.balance_satoshis_btc === 'number');
        assert(typeof user.balance_satoshis_invested_btc === 'number');

        callback(null, user);
    });
};

exports.getUserByValidRecoverId = function(recoverId, callback) {
    assert(recoverId && callback);
    query('SELECT * FROM users_view WHERE id = (SELECT user_id FROM recovery WHERE id = $1 AND used = false AND expired > NOW())', [recoverId], function(err, res) {
        if (err) return callback(err);

        var data = res.rows;
        if (data.length === 0)
            return callback('NOT_VALID_RECOVER_ID');

        assert(data.length === 1);

        var user = data[0];
        user.balance_satoshis = Math.floor(user.balance_satoshis / 1e6);
        user.balance_satoshis_invested = Math.floor(user.balance_satoshis_invested / 1e6);
        user.balance_satoshis_offsite = Math.floor(user.balance_satoshis_offsite / 1e6);

        return callback(null, user);
    });
};

exports.getUserByName = function(username, callback) {
    assert(username);
    query('SELECT * FROM users WHERE lower(username) = lower($1)', [username], function(err, result) {
        if (err) return callback(err);
        if (result.rows.length === 0)
            return callback('USER_DOES_NOT_EXIST');

        assert(result.rows.length === 1);

        var user = result.rows[0];
        user.balance_satoshis = Math.floor(user.balance_satoshis / 1e6);
        user.balance_satoshis_invested = Math.floor(user.balance_satoshis_invested / 1e6);
        user.balance_satoshis_offsite = Math.floor(user.balance_satoshis_offsite / 1e6);

        callback(null, user);
    });
};

exports.getUserInvestedBalances = function(userId, callback) {
    assert(userId);
    query('SELECT * FROM users WHERE id = $1', [userId], function(err, result) {
        if (err) return callback(err);
        if (result.rows.length === 0)
            return callback('USER_DOES_NOT_EXIST');

        assert(result.rows.length === 1);

        var user = {}
        user.balance_satoshis_invested_clam = new Decimal(result.rows[0].balance_satoshis_invested_clam).dividedBy(1e14).toFixed(8);
        user.balance_satoshis_invested_btc = new Decimal(result.rows[0].balance_satoshis_invested_btc).dividedBy(1e14).toFixed(8);

        callback(null, user);
    });
};



exports.getBtcClaimedFees = function(callback) {
    query('SELECT claimed_fees.withdraw_id, claimed_fees.amount as claimed_amount, withdrawals.* from claimed_fees LEFT JOIN (SELECT * FROM withdrawals ORDER BY id DESC) as withdrawals ON claimed_fees.withdraw_id = withdrawals.withdrawal_id', function(err, result) {
        if (err) return callback(err);

        callback(null, result.rows);
    });
};

exports.getBtcClaimedFeesTotal = function(callback) {
    query('SELECT COALESCE(SUM(amount),0) as sum from claimed_fees', function(err, result) {
        if (err) return callback(err);

        callback(null, result.rows[0].sum);
    });
};


 




/* Sets the recovery record to userd and update password */
exports.changePasswordFromRecoverId = function(recoverId, password, callback) {
    assert(recoverId && password && callback);
    var hashedPassword = passwordHash.generate(password);

    var sql = m(function() {
        /*
             WITH t as (UPDATE recovery SET used = true, expired = now()
             WHERE id = $1 AND used = false AND expired > now()
             RETURNING *) UPDATE users SET password = $2 where id = (SELECT user_id FROM t) RETURNING *
             */
    });

    query(sql, [recoverId, hashedPassword], function(err, res) {
        if (err)
            return callback(err);

        var data = res.rows;
        if (data.length === 0)
            return callback('NOT_VALID_RECOVER_ID');

        assert(data.length === 1);

        callback(null, data[0]);
    });
};

exports.getGame = function(gameId, coin, callback) {
    assert(gameId && callback);

    query('SELECT * FROM games LEFT JOIN game_hashes ON games.id = game_hashes.game_id ' + 
           'WHERE games.id = $1 AND games.coin = game_hashes.coin AND games.ended = TRUE AND games.coin = $2', [gameId, coin],
        function(err, result) {
            if (err) return callback(err);
            if (result.rows.length == 0) return callback('GAME_DOES_NOT_EXISTS');
            console.log(result.rows)
            assert(result.rows.length == 1);
            callback(null, result.rows[0]);
        });
};

exports.getGamesPlays = function(gameId, coin, callback) {
    query('SELECT u.username, p.bet, p.cash_out FROM plays p, users u ' +
        ' WHERE game_id = $1 AND p.user_id = u.id AND p.coin = $2 ORDER by p.cash_out/p.bet::float DESC NULLS LAST, p.bet DESC', [gameId, coin],
        function(err, result) {
            if (err) return callback(err);


            return callback(null, result.rows);
        }
    );
};

exports.getGameInfo = function(gameId, coin, callback) {
    assert(gameId && callback);

    var gameInfo = {
        game_id: gameId
    };

    function getSqlGame(callback) {

        var sqlGame = m(function() {
            /*
                     SELECT game_crash, created, hash
                     FROM games LEFT JOIN game_hashes ON games.id = game_id
                     WHERE games.ended = true AND games.id = $1 AND coin = $2
                     */
        });

        query(sqlGame, [gameId, coin], function(err, result) {
            if (err)
                return callback(err);

            if (result.rows.length === 0)
                return callback('GAME_DOES_NOT_EXISTS');

            console.assert(result.rows.length === 1);

            var game = result.rows[0];

            gameIngo.currecny = coin
            gameInfo.game_crash = game.game_crash;
            gameInfo.hash = game.hash;
            gameInfo.created = game.created;

            callback(null);
        });
    }

    function getSqlPlays(callback) {
        var sqlPlays = m(function() {
            /*
                     SELECT username, bet, (100 * cash_out / bet)::bigint AS stopped_at, bonus
                     FROM plays JOIN users ON user_id = users.id WHERE game_id = $1 AND coin = $2
                     */
        });

        query(sqlPlays, [gameId, coin], function(err, result) {
            if (err)
                return callback(err);

            var playsArr = result.rows;

            var player_info = {};
            playsArr.forEach(function(play) {
                player_info[play.username] = {
                    bet: play.bet,
                    stopped_at: play.stopped_at
                };
            });

            gameInfo.player_info = player_info;

            callback(null);
        });
    }


    async.parallel([getSqlGame, getSqlPlays],
        function(err, results) {
            if (err)
                return callback(err);

            callback(null, gameInfo);
        });
};

function addSatoshis(client, userId, amount, callback) {
    amount = amount * 1e6;
    client.query('UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE id = $2', [amount, userId], function(err, res) {
        if (err) return callback(err);
        assert(res.rowCount === 1);
        callback(null);
    });
}

function payGiveaway(client, userId, amount, callback) {
    amount = amount * 1e6;
    client.query('UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE id = $2', [amount, userId], function(err, res) {
        if (err) return callback(err);
        assert(res.rowCount === 1);

        callback(null);
    });
};


exports.getUserPlays = function(userId, limit, offset, coin, callback) {
    assert(userId);
    query('SELECT p.bet, p.cash_out, p.created, p.game_id, g.game_crash FROM plays p LEFT JOIN (SELECT * FROM games) g ON g.id = p.game_id ' +  
           'WHERE p.user_id = $1 AND g.ended = true AND p.coin = g.coin AND p.coin = $2 ORDER BY p.id  DESC LIMIT $3 OFFSET $4', [userId, coin, limit, offset],
        function(err, result) {
            if (err) return callback(err);
            callback(null, result.rows);
        }
    );
};

exports.getGiveAwaysAmount = function(userId, callback) {
    assert(userId);
    query('SELECT SUM(g.amount) FROM giveaways g where user_id = $1', [userId], function(err, result) {
        if (err) return callback(err);
        return callback(null, result.rows[0]);
    });
};

exports.getUserNetProfit = function(userId, coin, callback) {
    assert(userId);
    query('SELECT (' +
        'COALESCE(SUM(cash_out), 0) * 1000000 - ' +
        'COALESCE(SUM(bet), 0)) profit ' +
        'FROM plays ' +
        'WHERE user_id = $1 AND coin = $2', [userId, coin],
        function(err, result) {
            if (err) return callback(err);
            assert(result.rows.length == 1);
            return callback(null, result.rows[0]);
        }
    );
};

exports.getUserNetProfitLast = function(userId, last, coin, callback) {
    assert(userId);
    query('SELECT (' +
        'COALESCE(SUM(cash_out), 0) * 1000000 - ' +
        'COALESCE(SUM(bet), 0))::bigint profit ' +
        'FROM ( ' +
        'SELECT * FROM plays ' +
        'WHERE user_id = $1 AND coin = $2' +
        'ORDER BY id DESC ' +
        'LIMIT $3 ' +
        ') restricted ', [userId, coin, last],
        function(err, result) {
            if (err) return callback(err);
            assert(result.rows.length == 1);
            return callback(null, result.rows[0].profit);
        }
    );
};

exports.getPublicStats = function(username, callback) {

    var sqlClam = 'SELECT * FROM user_stats_clam WHERE lower(username) = lower($1)'
    var sqlBtc  = 'SELECT * FROM user_stats_btc WHERE lower(username) = lower($1)'

    var clamNoUser = false

    query(sqlClam, [username], function(err, result) {
        if (err) return callback(err);

        var res = [];
        var clamResults = result
        if (result.rows.length !== 1) {
            clamNoUser = true 
            var obj = { games_played_clam:0, 
                site_wagered_clam :0,
                site_profit_clam:0,
                site_invested_clam:0,
                user_wagered_clam:0,
                net_profit_clam:0,
                rank_clam:0
            }
            res.push(obj)
        } else { 
            res = result.rows
        }


            //return callback('USER_DOES_NOT_EXIST');

        query(sqlBtc, [username], function(err, results) {
            if (err) return callback(err);

            var res2 = []
            if (results.rows.length !== 1){
                if(clamNoUser)
                    return callback('USER_DOES_NOT_EXIST');
                var obj = { games_played_btc:0, 
                    site_wagered_btc :0,
                    site_profit_btc:0,
                    site_invested_btc:0,
                    user_wagered_btc:0,
                    net_profit_btc:0,
                    rank_btc:0
                }
                res2.push(obj)
            } else { 
                res2 = results.rows
            }


            var merge = _.merge(res[0], res2[0]);
            merge.user_wagered_clam = Math.floor(merge.user_wagered_clam / 1e6)
            merge.user_wagered_btc = Math.floor(merge.user_wagered_btc / 1e6)
            merge.net_profit_clam = Math.floor(merge.net_profit_clam / 1e6)
            merge.net_profit_btc = Math.floor(merge.net_profit_btc / 1e6)

            merge.user_wagered_btc = merge.user_wagered_btc ? merge.user_wagered_btc : 0
            merge.user_wagered_clam = merge.user_wagered_clam ? merge.user_wagered_clam : 0
            merge.net_profit_clam = merge.net_profit_clam ? merge.net_profit_clam : 0
            merge.net_profit_btc = merge.net_profit_btc ? merge.net_profit_btc : 0
            merge.rank_clam = merge.rank_clam ? merge.rank_clam : 0
            merge.rank_btc = merge.rank_btc  ? merge.rank_btc : 0

            merge.games_played_clam = merge.games_played_clam ? merge.games_played_clam : 0
            merge.games_played_btc = merge.games_played_btc  ? merge.games_played_btc : 0

            return callback(null, merge);

        });
    });
};

exports.getSiteNetProfit = function(userId, callback) {
    assert(userId);
    query('SELECT (' +
        'COALESCE(SUM(cash_out), 0) * 1000000 - ' +
        'COALESCE(SUM(bet), 0)) profit ' +
        'FROM plays ',
        function(err, result) {
            if (err) return callback(err);
            assert(result.rows.length == 1);
            return callback(null, result.rows[0]);
        }
    );
};

exports.getUserNetProfitSkip = function(userId, skip, coin, callback) {
    assert(userId);

    query('SELECT (' +
        'COALESCE(SUM(cash_out), 0) * 1000000 - ' +
        'COALESCE(SUM(bet), 0))::bigint profit ' +
        'FROM ( ' +
        'SELECT * FROM plays ' +
        'WHERE user_id = $1 AND coin = $2' +
        'ORDER BY id DESC ' +
        'OFFSET $3 ' +
        ') restricted ', [userId, coin, skip],
        function(err, result) {
            if (err) return callback(err);
            assert(result.rows.length == 1);

            //console.log(Math.floor(result.rows[0].profit/1e6))
            return callback(null, Math.floor(result.rows[0].profit / 1e6));
        }
    );
};


exports.makeWithdrawal = function(userId, satoshis, withdrawalAddress, withdrawalId, coin, callback) {
    assert(typeof userId === 'number');
    assert(typeof satoshis === 'number');
    assert(typeof withdrawalAddress === 'string');
    assert(satoshis > 10000);
    assert(lib.isUUIDv4(withdrawalId));

    satoshis = satoshis * 1e6;

    getClient(function(client, callback) {

        client.query("SELECT * from withdrawals WHERE completed IS NULL and user_id = $1 AND coin = $2", [userId, coin], function(err, result) {
            if (err) return callback(err);

            if (result.rowCount > 0)
                return callback("PENDING")

            if(coin === "clam") { 

                client.query("UPDATE users SET balance_satoshis_clam = balance_satoshis_clam - $1 WHERE id = $2", [satoshis, userId], function(err, response) {
                    if (err) return callback(err);

                    if (response.rowCount !== 1)
                        return callback(new Error('Unexpected withdrawal row count: \n' + response));

                    client.query('INSERT INTO withdrawals(user_id, amount, address, withdrawal_id, coin) ' +
                        "VALUES($1, $2, $3, $4, $5) RETURNING id", [userId, -1 * Math.floor(satoshis / 1e6), withdrawalAddress, withdrawalId, coin],
                        function(err, response) {
                            if (err) return callback(err);

                            var fundingId = response.rows[0].id;
                            assert(typeof fundingId === 'number');

                            callback(null, fundingId);
                        }
                    );
                });
            } else if( coin === "btc"){
                client.query("UPDATE users SET balance_satoshis_btc = balance_satoshis_btc - $1 WHERE id = $2", [satoshis, userId], function(err, response) {
                    if (err) return callback(err);

                    if (response.rowCount !== 1)
                        return callback(new Error('Unexpected withdrawal row count: \n' + response));

                    client.query('INSERT INTO withdrawals(user_id, amount, address, withdrawal_id, coin) ' +
                        "VALUES($1, $2, $3, $4, $5) RETURNING id", [userId, -1 * Math.floor(satoshis / 1e6), withdrawalAddress, withdrawalId, coin],
                        function(err, response) {
                            if (err) return callback(err);

                            var fundingId = response.rows[0].id;
                            assert(typeof fundingId === 'number');

                            callback(null, fundingId);
                        }
                    );
                });
            }
        });

    }, callback);
};

exports.getWithdrawals = function(userId, callback) {
    assert(userId && callback);

    query("SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created DESC", [userId], function(err, result) {
        if (err) return callback(err);

        var data = result.rows.map(function(row) {
            return {
                amount: Math.abs(row.amount),
                destination: row.address,
                status: row.txid,
                coin: row.coin,
                created: row.created
            };
        });

        callback(null, data);
    });
};

exports.getTips = function(userId, callback) {
    assert(userId && callback);

    query("SELECT * FROM transfers WHERE from_user_id = $1 OR to_user_id = $1 ORDER BY created DESC", [userId], function(err, result) {
        if (err) return callback(err);

        var data = result.rows.map(function(row) {
            return {
                type: (row.from_user_id === userId) ? "SEND" : "RECIEVE",
                amount: Math.floor(row.amount / 1e6),
                from_user: row.from_user_id,
                to_user: row.to_user_id,
                coin: row.coin,
                created: row.created
            };
        });
        callback(null, data);
    });
};



exports.getWeeklyPrizes = function(userId, callback) {
    assert(userId && callback);
    var results = {"clam":[], "btc":[]}


    query("SELECT * FROM weekly_prizes WHERE user_id = $1 AND coin = \'clam\' ORDER BY id DESC", [userId], function(err, result) {
        if (err) return callback(err);

        var entriesClam = []
        for(var a = 0; a < result.rows.length; a++) { 
            var row = result.rows[a]

            var obj = {
                    prize_type: row.prize_type,
                    amount: Math.floor(row.amount / 1e6),
                    year: row.year,
                    coin: row.coin,
                    week: row.week
                }

                entriesClam.push(obj)
        }

        results.clam = entriesClam

        query("SELECT * FROM weekly_prizes WHERE user_id = $1 AND coin = \'btc\' ORDER BY id DESC", [userId], function(err, res) {
            if (err) return callback(err);

            var entriesBtc = []
            for(var j = 0; j < res.rows.length; j++) { 
                var row = res.rows[j]

                var obj = {
                        prize_type: row.prize_type,
                        amount: Math.floor(row.amount / 1e6),
                        year: row.year,
                        coin: row.coin,
                        week: row.week
                    }

                    entriesBtc.push(obj)
            }

            results.btc = entriesBtc
            callback(null, results)
        });
    });
};



exports.getDeposits = function(userId, callback) {
    assert(userId && callback);

    query("SELECT * FROM deposits WHERE user_id = $1 AND amount > 0 ORDER BY created DESC", [userId], function(err, result) {
        if (err) return callback(err);

        var data = result.rows.map(function(row) {
            return {
                amount: row.amount,
                txid: row.txid,
                confirmed: row.confirmed,
                confirmations: row.confirmations,
                coin: row.coin,
                created: row.created
            };
        });

        query("SELECT * FROM deposit_seen WHERE user_id = $1 ORDER BY seen DESC", [userId], function(err, results) {



            for(var a=0; a < results.rows.length;a++ ) { 
                var found = data.some(function (el) {
                    return el.txid === results.rows[a].txid;
                  });
                if(found){
                    continue
                }
                data.push({
                    amount: results.rows[a].amount,
                    txid: results.rows[a].txid,
                    confirmed: null,
                    confirmations: 0,
                    coin: results.rows[a].coin,
                    created: results.rows[a].seen
                })
            }

            data.sort(function(a,b){
              return new Date(b.created) - new Date(a.created);
            });

            callback(null, data);
        })
    });
};

exports.getDepositsAmount = function(userId, callback) {
    assert(userId);
    query('SELECT coin, SUM(f.amount) FROM deposits f WHERE user_id = $1 AND amount >= 0 group by coin', [userId], function(err, result) {
        if (err) return callback(err);
        var ret = { 'btc': 0, 'clam': 0 }
        
        for(var i =0; i < result.rows.length; i++){ 
            var a = result.rows[i]
            ret[a.coin] = a.sum
        }

        callback(null, ret);
    });
};

exports.getWithdrawalsAmount = function(userId, callback) {
    assert(userId);
    query('SELECT coin, SUM(f.amount) FROM withdrawals f WHERE user_id = $1 AND amount < 0 group by coin', [userId], function(err, result) {
        if (err) return callback(err);

        var ret = { 'btc': 0, 'clam': 0 }
        
        for(var i =0; i < result.rows.length; i++){ 
            var a = result.rows[i]
            ret[a.coin] = a.sum
        }

        callback(null, ret);
    });
};

exports.setWithdrawalWithdrawalTxid = function(fundingId, txid, callback) {
    assert(typeof fundingId === 'number');
    assert(typeof txid === 'string');
    assert(callback);

    query('UPDATE withdrawals SET txid = $1 WHERE id = $2', [txid, fundingId],
        function(err, result) {
            if (err) return callback(err);

            assert(result.rowCount === 1);

            callback(null);
        }
    );
};

exports.getLeaderBoardBtc = function(byDb, order, callback) {
    var sql = 'SELECT * FROM leaderboard_btc ORDER BY ' + byDb + ' ' + order + ' LIMIT 100';
    query(sql, function(err, data) {
        if (err)
            return callback(err);

        callback(null, data.rows);
    });
};

exports.getLeaderBoardClam = function(byDb, order, callback) {
    var sql = 'SELECT * FROM leaderboard_clam ORDER BY ' + byDb + ' ' + order + ' LIMIT 100';
    query(sql, function(err, data) {
        if (err)
            return callback(err);

        callback(null, data.rows);
    });
};

exports.getWeeklyLeaderBoardsClam = function(year, week, callback) {

    async.parallel({
        net: function(done) {
            var sql = 'SELECT * FROM weekly_leaderboard_clam WHERE year = $1 AND week = $2' +
                'ORDER BY net_rank ASC LIMIT 20';

            query(sql, [year, week], done);
        },
        wagered: function(done) {
            var sql = 'SELECT * FROM weekly_leaderboard_clam WHERE year = $1 AND week = $2' +
                'ORDER BY wagered_rank ASC LIMIT 20';

            query(sql, [year, week], done);
        },
        prizePool: function(done) {
            var sql = 'SELECT (COALESCE(SUM(amount), 0::NUMERIC))::NUMERIC FROM weekly_donors WHERE year = $1 AND week = $2 AND coin = \'clam\''

            query(sql, [year, week], done);
        }
    }, function(err, results) {
        if (err) return callback(err);

        callback(null, {
            net: results.net.rows,
            wagered: results.wagered.rows,
            prizePool: results.prizePool.rows[0].coalesce
        });
    });
};




exports.getWeeklyLeaderBoardsBtc = function(year, week, callback) {

    async.parallel({
        net: function(done) {
            var sql = 'SELECT * FROM weekly_leaderboard_btc WHERE year = $1 AND week = $2' +
                'ORDER BY net_rank ASC LIMIT 20';

            query(sql, [year, week], done);
        },
        wagered: function(done) {
            var sql = 'SELECT * FROM weekly_leaderboard_btc WHERE year = $1 AND week = $2' +
                'ORDER BY wagered_rank ASC LIMIT 20';

            query(sql, [year, week], done);
        },
        prizePool: function(done) {
            var sql = 'SELECT (COALESCE(SUM(amount), 0::NUMERIC))::NUMERIC FROM weekly_donors WHERE year = $1 AND week = $2 AND coin = \'btc\''

            query(sql, [year, week], done);
        }
    }, function(err, results) {
        if (err) return callback(err);

        callback(null, {
            net: results.net.rows,
            wagered: results.wagered.rows,
            prizePool: results.prizePool.rows[0].coalesce
        });
    });
};



exports.addChatMessage = function(userId, created, message, channelName, isBot, callback) {
    var sql = 'INSERT INTO chat_messages (user_id, created, message, channel, is_bot) values($1, $2, $3, $4, $5)';
    query(sql, [userId, created, message, channelName, isBot], function(err, res) {
        if (err)
            return callback(err);

        assert(res.rowCount === 1);

        callback(null);
    });
};

exports.getChatTable = function(limit, channelName, callback) {
    assert(typeof limit === 'number');
    var sql = "SELECT chat_messages.created AS date, 'say' AS type, users.username, users.userclass AS role, chat_messages.message, is_bot AS bot " +
        "FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE channel = $1 ORDER BY chat_messages.id DESC LIMIT $2";
    query(sql, [channelName, limit], function(err, data) {
        if (err)
            return callback(err);
        callback(null, data.rows);
    });
};

//Get the history of the chat of all channels except the mods channel
exports.getAllChatTable = function(limit, callback) {
    assert(typeof limit === 'number');
    var sql = m(function() {
        /*
             SELECT chat_messages.created AS date, 'say' AS type, users.username, users.userclass AS role, chat_messages.message, is_bot AS bot, chat_messages.channel AS "channelName"
             FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE channel <> 'moderators'  ORDER BY chat_messages.id DESC LIMIT $1
            */
    });
    query(sql, [limit], function(err, data) {
        if (err)
            return callback(err);
        callback(null, data.rows);
    });
};

exports.getUsernamesByPrefix = function(unamePrefix, callback) {
    var sql = m(function() {
        /*
             WITH d AS (
             SELECT username FROM users WHERE lower(username)  LIKE $1 || '%' LIMIT 100
             ) SELECT array_agg(username) AS usernames FROM d;
             */
    });

    query(sql, [unamePrefix], function(err, data) {
        if (err)
            return callback(err);

        callback(null, data.rows[0].usernames);
    });
};


exports.getUserStats = function(userId, callback) {
    query('SELECT * FROM users WHERE id = $1', [userId], function(err, data) {
        if (err) {
            logger.error('[DB][getLiveStats][Error] Unknown Error: %s', err);
            return callback('unknown-error');
        }
        assert(data.rows.length === 1);
        var user = data.rows[0];

        var res = {
            balance_satoshis_clam: new Decimal(user.balance_satoshis_clam).dividedBy(1e6),
            balance_satoshis_invested_clam: new Decimal(user.balance_satoshis_invested_clam).dividedBy(1e6),
            bankrole_profit_clam: new Decimal(user.bankrole_profit_clam).dividedBy(1e6),
            staking_profit: new Decimal(user.staking_profit).dividedBy(1e6),
            commission_clam: new Decimal(user.hightide_clam).dividedBy(1e6).times(.10),
            balance_satoshis_btc: new Decimal(user.balance_satoshis_btc).dividedBy(1e6),
            balance_satoshis_invested_btc: new Decimal(user.balance_satoshis_invested_btc).dividedBy(1e6),
            bankrole_profit_btc: new Decimal(user.bankrole_profit_btc).dividedBy(1e6),
            commission_btc: new Decimal(user.hightide_btc).dividedBy(1e6).times(.10),
            staking_only: user.staking_only
        };

        callback(null, res);
    });
};

exports.getUserDepositAddresses = function(userId, callback) {
    query('SELECT * FROM addresses WHERE user_id = $1', [userId], function(err, data) {
        if (err) {
            logger.error('[DB][getLiveStats][Error] Unknown Error: %s', err);
            return callback('unknown-error');
        }

        var ret = { btc:'', clam:'' }
        for(var i =0; i < data.rows.length; i++) { 
            if(data.rows[i].coin === 'btc')
                ret.btc = data.rows[i].address
            else if(data.rows[i].coin === 'clam')
                ret.clam = data.rows[i].address
        }

        callback(null, ret);
    });
};


exports.getStake = function(callback) {
    query('SELECT * FROM staking', function(err, result) {
        if (err) return callback(err);

        //assert(typeof count === 'number');

        callback(null, result.rows[0]);
    });
}

exports.getCommissionPayouts = function(callback) {
    query('SELECT * FROM commissions WHERE user_id = 7 ORDER BY created DESC', function(err, result) {
        if (err) return callback(err);

        //assert(typeof count === 'number');

        callback(null, result.rows);
    });
}


exports.getSiteStats = function(callback) {

    function as(name, callback) {
        return function(err, results) {
            if (err)
                return callback(err);

            assert(results.rows.length === 1);
            callback(null, [name, results.rows[0]]);
        }
    }

    var tasks = [
        function(callback) {
            query('SELECT COUNT(*) FROM users', as('users', callback));
        },
        function(callback) {
            query('SELECT COUNT(*) FROM games', as('games', callback));
        },
        function(callback) {
            query('SELECT COALESCE(SUM(deposits.amount), 0)::bigint sum FROM deposits WHERE amount < 0', as('withdrawals', callback));
        },
        function(callback) {
            query('SELECT COALESCE(SUM(withdrawals.amount), 0::numeric)::numeric sum FROM withdrawals WHERE amount > 0', as('withdrawals', callback));
        },
        function(callback) {
            query("SELECT COUNT(*) FROM games WHERE ended = false AND created < NOW() - interval '5 minutes'", as('unterminated_games', callback));
        },
        function(callback) {
            query("SELECT COUNT(*) FROM withdrawals WHERE amount < 0 AND txid IS NULL AND created < NOW() - interval '30 seconds'", as('pending_withdrawals', callback));
        },
        function(callback) {
            query('SELECT COALESCE(SUM(deposits.amount), 0)::bigint sum FROM deposits WHERE amount > 0', as('deposits', callback));
        },
        function(callback) {
            query('SELECT ' +
                'COUNT(*) count, ' +
                'SUM(plays.bet)::bigint total_bet, ' +
                'SUM(plays.cash_out)::bigint cashed_out ' +
                'FROM plays', as('plays', callback));
        }
    ];

    async.series(tasks, function(err, results) {
        if (err) return callback(err);

        var data = {};

        results.forEach(function(entry) {
            data[entry[0]] = entry[1];
        });

        callback(null, data);
    });

};



exports.setDivest = function(uid, userId, userName, satoshis, coin, allset, callback) {
    assert(typeof userId === 'number');
    assert(typeof userName === 'string');
    assert(typeof satoshis === 'number');

    if(coin === 'clam') { 
        this.setDivestClam(uid, userId, userName, satoshis, coin, allset, function(err){ 
            if(err)
                return callback(err)

            return callback(null)

        })
    } else if (coin === 'btc') { 
        this.setDivestBtc(uid, userId, userName, satoshis, coin, allset, function(err){ 
            if(err)
                return callback(err)

            return callback(null)
        })
    }
} 




exports.setDivestClam = function(uid, userId, userName, satoshis, coin, allset, callback) {
    getClient(function(client, callback) {
        client.query('SELECT * FROM investments WHERE user_id = $1 AND status IS NULL AND coin = \'clam\'', [userId], function(err, data) {
            if (err) {
                logger.info(err)
                return callback(err);
            }
            if (data.rowCount > 0)
                return callback('INVESTMENT_ALREADY_MADE');

            client.query('SELECT balance_satoshis_clam, balance_satoshis_invested_clam, username FROM users WHERE id = $1', [userId], function(err, result) {
                if (err)
                    return callback(err);
                if (result.rows.length === 0)
                    return callback('USER_DOES_NOT_EXIST');

                var balance_satoshis = new Decimal(result.rows[0].balance_satoshis_clam)
                var balance_satoshis_invested = new Decimal(result.rows[0].balance_satoshis_invested_clam)
                var username = result.rows[0].username

                var divestAmount = 0;
                if (allset) {
                    divestAmount = balance_satoshis_invested
                } else
                    divestAmount = new Decimal(satoshis).times(1e6)

                if (divestAmount.greaterThan(balance_satoshis_invested))
                    return callback('NOT_ENOUGH_BALANCE');


                // we can't remove a user balance here, as it could be in the middle of a game...  invested balances should
                // only ever be adjusted between games.. this also means then when we do update balances, if theres an error 
                // we have to nuke the investment request entirely, theres no good way to give a error back to the user
                client.query('WITH sitebalance AS ( SELECT (' +
                    '    ( SELECT COALESCE(SUM(balance_satoshis_invested_clam),0) FROM users)' +
                    '  )' +
                    '), userbalance AS ( SELECT (' +
                    '    ( SELECT balance_satoshis_invested_clam FROM users WHERE id=$2 )' +
                    '  )' +
                    ')' +
                    'INSERT INTO investments (id, user_id, username, amount, investment_balance_prev, site_balance, action, allset, coin)' +
                    'values($1,$2,$3,$4,(SELECT * FROM userbalance) , (SELECT * FROM sitebalance), $5, $6, $7)', [uid, userId, username, divestAmount.toNumber(), 'divest', allset, 'clam'],
                    function(err) {
                        if (err) {

                            if (err.code === '23505') { // dupe key
                                return callback('INVESTMENT_ALREADY_MADE');
                            }

                            logger.info(err)
                            return callback(err);
                        }

                        callback(null);
                    });
            })
        });
    }, callback);

}


exports.setDivestBtc = function(uid, userId, userName, satoshis, coin, allset, callback) {
    getClient(function(client, callback) {
        client.query('SELECT * FROM investments WHERE user_id = $1 AND status IS NULL AND coin = \'btc\'', [userId], function(err, data) {
            if (err) {
                logger.info(err)
                return callback(err);
            }
            if (data.rowCount > 0)
                return callback('INVESTMENT_ALREADY_MADE');

            client.query('SELECT balance_satoshis_btc, balance_satoshis_invested_btc, username FROM users WHERE id = $1', [userId], function(err, result) {
                if (err)
                    return callback(err);
                if (result.rows.length === 0)
                    return callback('USER_DOES_NOT_EXIST');

                var balance_satoshis = new Decimal(result.rows[0].balance_satoshis_btc)
                var balance_satoshis_invested = new Decimal(result.rows[0].balance_satoshis_invested_btc)
                var username = result.rows[0].username

                var divestAmount = 0;
                if (allset) {
                    divestAmount = balance_satoshis_invested
                } else
                    divestAmount = new Decimal(satoshis).times(1e6)


                if (divestAmount.greaterThan(balance_satoshis_invested))
                    return callback('NOT_ENOUGH_BALANCE');

                // we can't remove a user balance here, as it could be in the middle of a game...  invested balances should
                // only ever be adjusted between games.. this also means then when we do update balances, if theres an error 
                // we have to nuke the investment request entirely, theres no good way to give a error back to the user
                client.query('WITH sitebalance AS ( SELECT (' +
                    '    ( SELECT COALESCE(SUM(balance_satoshis_invested_btc),0) FROM users)' +
                    '  )' +
                    '), userbalance AS ( SELECT (' +
                    '    ( SELECT balance_satoshis_invested_btc FROM users WHERE id=$2 )' +
                    '  )' +
                    ')' +
                    'INSERT INTO investments (id, user_id, username, amount, investment_balance_prev, site_balance, action, allset, coin)' +
                    'values($1,$2,$3,$4,(SELECT * FROM userbalance) , (SELECT * FROM sitebalance), $5, $6, $7)', [uid, userId, username, divestAmount.toNumber(), 'divest', allset, 'btc'],
                    function(err) {
                        if (err) {

                            if (err.code === '23505') { // dupe key
                                return callback('INVESTMENT_ALREADY_MADE');
                            }

                            logger.info(err)
                            return callback(err);
                        }

                        callback(null);
                    });
            })
        });
    }, callback);

}





//investment stuffs
exports.setDivestOLD = function(uid, userId, userName, satoshis, coin, allset, callback) {
    assert(typeof userId === 'number');
    assert(typeof userName === 'string');
    assert(typeof satoshis === 'number');

    var divestAmount = 0;
    satoshis = satoshis * 1e6;
    // Update balances
    getClient(function(client, callback) {

        async.waterfall([
            function(callback) {
                client.query('SELECT * FROM investments WHERE user_id = $1 AND status IS NULL AND coin = $2', [userId, coin], function(err, data) {
                    if (err)
                        return callback(err);
                    if (data.rowCount > 0)
                        return callback('INVESTMENT_ALREADY_MADE');
                    callback(null, null);

                });
            },
            function(prevData, callback) {
                if(coin === 'clam') { 
                    client.query('SELECT balance_satoshis_clam, balance_satoshis_invested_clam FROM users where id = $1', [userId], function(err, data) {

                        var balanceInvested = Math.floor(data.rows[0].balance_satoshis_invested_clam);
                        var balance = Math.floor(data.rows[0].balance_satoshis_clam);

                        if (allset) {
                            divestAmount = balanceInvested
                        } else {
                            divestAmount = satoshis
                        }

                        if (divestAmount > balanceInvested)
                            return callback('NOT_ENOUGH_BALANCE');

                        callback(null, null);
                    });
                } else if (coin === 'btc') { 
                    client.query('SELECT balance_satoshis_btc, balance_satoshis_invested_btc FROM users where id = $1', [userId], function(err, data) {

                        var balanceInvested = Math.floor(data.rows[0].balance_satoshis_invested_btc);
                        var balance = Math.floor(data.rows[0].balance_satoshis_btc);

                        if (allset) {
                            divestAmount = balanceInvested
                        } else {
                            divestAmount = satoshis
                        }

                        if (divestAmount > balanceInvested)
                             return callback('NOT_ENOUGH_BALANCE');

                        callback(null, null);
                    });
                }       
            },
            function(prevData, callback) {
                if(coin === 'clam') { 
                    client.query('WITH sitebalance AS ( SELECT (' +
                    '    ( SELECT COALESCE(SUM(balance_satoshis_invested_clam),0) FROM users WHERE staking_only IS false)' +
                    '  )' +
                    '), userbalance AS ( SELECT (' +
                    '    ( SELECT balance_satoshis_invested_clam FROM users WHERE id=$2 )' +
                    '  )' +
                    ')' +
                    'INSERT INTO investments (id, user_id, username, amount, investment_balance_prev, site_balance, action, coin)' +
                    'values($1,$2,$3,$4,(SELECT * FROM userbalance) , (SELECT * FROM sitebalance), $5, $6)', [uid, userId, userName, satoshis, 'divest', coin], callback);

                } else if (coin === 'btc') {
                    client.query('WITH sitebalance AS ( SELECT (' +
                    '    ( SELECT COALESCE(SUM(balance_satoshis_invested_btc),0) FROM users)' +
                    '  )' +
                    '), userbalance AS ( SELECT (' +
                    '    ( SELECT balance_satoshis_invested_btc FROM users WHERE id=$2 )' +
                    '  )' +
                    ')' +
                    'INSERT INTO investments (id, user_id, username, amount, investment_balance_prev, site_balance, action, allset, coin)' +
                    'values($1,$2,$3,$4,(SELECT * FROM userbalance) , (SELECT * FROM sitebalance), $5, $6, $7)', [uid, userId, userName, divestAmount, 'divest', allset, coin], callback);
                }
                
            }
        ], function(err) {
            if (err) {
                if (err.code === '23514') { // constraint violation
                    return callback('NOT_ENOUGH_BALANCE');
                }
                if (err.code === '23505') { // dupe key
                    return callback('INVESTMENT_ALREADY_MADE');
                }

                return callback(err);
            }
            callback();
        });
    }, callback);
};


exports.getHotWalletInfo = function(coin, callback) {

    var balance = 0
    query('SELECT * FROM wallet_inputs WHERE amount>0 AND confirmed IS NOT NULL AND spent is NULL AND coin = \'btc\'', function(err, results) {
        if(err) return callback(err)

        for(var i = 0; i < results.rows.length; i++){ 
            balance = new Decimal(balance).plus(results.rows[i].amount).toNumber()
            //ret.hot_wallet_balance = new Decimal(ret.hot_wallet_balance).plus(results.rows[i].amount).toNumber()
            //ret.wallet_inputs.push({id:results.rows[i].id, vout:results.rows[i].vout, txid:results.rows[i].txid, amount:results.rows[i].amount, coin:results.rows[i].coin, type:'hot'})
        }

        query('SELECT * FROM deposits WHERE amount>0 AND confirmed IS NOT NULL AND moved IS NULL AND coin = \'btc\'', function(err, result) {
            if(err) return callback(err)

            for(var i = 0; i < result.rows.length; i++){ 
                balance = new Decimal(balance).plus(result.rows[i].amount).toNumber()
                //ret.user_balance = new Decimal(ret.user_balance).plus(result.rows[i].amount).toNumber()
                //ret.user_inputs.push({id:result.rows[i].id, vout:result.rows[i].vout, txid:result.rows[i].txid, amount:result.rows[i].amount, user_id:result.rows[i].user_id, coin:result.rows[i].coin, type:'user'})
            }

            return callback(null, balance)
        })
    })
}






exports.setInvest = function(uid, userId, userName, satoshis, coin, allset, callback) {
    if(coin === 'btc') {
        this.setInvestBtc(uid, userId, userName, satoshis, coin, allset, function(err, balances){ 
            if(err) return callback(err)

            return callback(balances)
        })
    }
    else if(coin === 'clam'){
        this.setInvestClam(uid, userId, userName, satoshis, coin, allset, function(err, balances){ 
            if(err) return callback(err)

            return callback(balances)
        })
    }
}



exports.setInvestClam = function(uid, userId, userName, satoshis, coin, allset, callback) {
    assert(typeof userId === 'number');
    assert(typeof callback === 'function');

    getClient(function(client, callback) {
        client.query('SELECT * FROM investments WHERE user_id = $1 AND coin = \'clam\' AND status IS NULL', [userId], function(err, data) {
            if (err) {
                logger.info("investment error", err)
                return callback(err);
            }
            if (data.rowCount > 0)
                return callback('INVESTMENT_ALREADY_MADE');

            client.query('SELECT balance_satoshis_clam, balance_satoshis_invested_clam, username FROM users WHERE id = $1', [userId], function(err, result) {
                if (err) {
                    logger.info(err)
                    return callback(err);
                }
                if (result.rows.length === 0)
                    return callback('USER_DOES_NOT_EXIST');

                var balance_satoshis = new Decimal(result.rows[0].balance_satoshis_clam)
                var balance_satoshis_invested = new Decimal(result.rows[0].balance_satoshis_invested_clam)
                var username = result.rows[0].username

                var investAmount = 0;
                if (allset) {
                    investAmount = balance_satoshis
                } else {
                    investAmount = new Decimal(satoshis).times(1e6)
                }

                if ((investAmount).greaterThan(balance_satoshis))
                    return callback('NOT_ENOUGH_BALANCE');

                client.query('UPDATE users SET balance_satoshis_clam = balance_satoshis_clam - $1 WHERE id = $2', [investAmount.toNumber(), userId], function(err, results) {
                    if (err) {
                        if (err.code === '23514') // constraint violation
                            return callback('NOT_ENOUGH_BALANCE');

                        logger.info("investment error", err)
                        return callback(err);
                    }

                    client.query('WITH sitebalance AS ( SELECT (' +
                        '    ( SELECT COALESCE(SUM(balance_satoshis_invested_clam),0) FROM users )' +
                        '  )' +
                        '), userbalance AS ( SELECT (' +
                        '    ( SELECT balance_satoshis_invested_clam FROM users WHERE id=$2 )' +
                        '  )' +
                        ')' +
                        'INSERT INTO investments (id, user_id, username, amount, investment_balance_prev, site_balance, action, allset, coin)' +
                        'values($1,$2,$3,$4,(SELECT * FROM userbalance) , (SELECT * FROM sitebalance), $5, $6, $7)', [uid, userId, username, investAmount.toNumber(), 'invest', allset, 'clam'],
                        function(err) {
                            if (err) {
                                if (err.code === '23505') { // dupe key
                                    return callback('INVESTMENT_ALREADY_MADE');
                                }

                                logger.info("investment error", err)
                                return callback(err);
                            }

                            callback();
                        });

                })
            });
        });
    }, callback);
}


exports.setInvestBtc = function(uid, userId, userName, satoshis, coin, allset, callback) {
    getClient(function(client, callback) {
        client.query('SELECT * FROM investments WHERE user_id = $1 AND coin = \'btc\' AND status IS NULL', [userId], function(err, data) {
            if (err) {
                logger.info(err)
                return callback(err);
            }
            if (data.rowCount > 0)
                return callback('INVESTMENT_ALREADY_MADE');

            client.query('SELECT balance_satoshis_btc, balance_satoshis_invested_btc, username FROM users WHERE id = $1', [userId], function(err, result) {
                if (err) {
                    logger.info(err)
                    return callback(err);
                }
                if (result.rows.length === 0)
                    return callback('USER_DOES_NOT_EXIST');


                var balance_satoshis = new Decimal(result.rows[0].balance_satoshis_btc)
                var balance_satoshis_invested = new Decimal(result.rows[0].balance_satoshis_invested_btc)
                var username = result.rows[0].username

                var investAmount = 0;
                if (allset) {
                    investAmount = balance_satoshis
                } else {
                    investAmount = new Decimal(satoshis).times(1e6)
                }

                if ((investAmount).greaterThan(balance_satoshis))
                    return callback('NOT_ENOUGH_BALANCE');

                client.query('UPDATE users SET balance_satoshis_btc = balance_satoshis_btc - $1 WHERE id = $2', [investAmount.floor().toNumber(), userId], function(err) {
                    if (err) {
                        if (err.code === '23514') // constraint violation
                            return callback('NOT_ENOUGH_BALANCE');

                        logger.info(err)
                        return callback(err);
                    }

                    client.query('WITH sitebalance AS ( SELECT (' +
                        '    ( SELECT COALESCE(SUM(balance_satoshis_invested_btc),0) FROM users )' +
                        '  )' +
                        '), userbalance AS ( SELECT (' +
                        '    ( SELECT balance_satoshis_invested_btc FROM users WHERE id=$2 )' +
                        '  )' +
                        ')' +
                        'INSERT INTO investments (id, user_id, username, amount, investment_balance_prev, site_balance, action, allset, coin)' +
                        'values($1,$2,$3,$4,(SELECT * FROM userbalance) , (SELECT * FROM sitebalance), $5, $6, $7)', [uid, userId, username, investAmount.floor().toNumber(), 'invest', allset, 'btc'],
                        function(err) {
                            if (err) {
                                if (err.code === '23505') { // dupe key
                                    return callback('INVESTMENT_ALREADY_MADE');
                                }

                                logger.info(err)
                                return callback(err);
                            }

                            callback(null);
                        });

                })
            });
        });
    }, callback);
}

exports.getInvestments = function(userId, callback) {
    assert(userId && callback);

    query("SELECT * FROM investments WHERE user_id = $1 ORDER BY created DESC", [userId], function(err, result) {
        if (err) return callback(err);


        var data = result.rows.map(function(row) {
            //console.log(row)
            var theStatus = row.status ? row.status : "pending"
            return {
                uid: row.uid,
                amount: (row.action === "divest") ? Math.floor(row.amount / 1e6) * -1 : Math.floor(row.amount / 1e6),
                commission_amount: Math.floor(row.commission_amount / 1e6),
                investment_balance_prev: Math.floor(row.investment_balance_prev / 1e6),
                site_balance: Math.floor(row.site_balance / 1e6),
                status: theStatus,
                action: row.action,
                coin: row.coin,
                created: row.created
            };
        });
        callback(null, data);
    });
};



function refreshViewOne() {

async.parallel([
        function(done) {
            query('REFRESH MATERIALIZED VIEW leaderboard_clam;', function(err){ 
                if(err) return done(err)

                done()
            });
        },
        function(done) {
            query('REFRESH MATERIALIZED VIEW weekly_leaderboard_clam;', function(err){ 
                if(err) return done(err)

            
                done()
            });
        },
        function(done) {
            query('REFRESH MATERIALIZED VIEW  leaderboard_btc;', function(err){ 
                if(err) return done(err)

                done()
            });
        },
        function(done) {
            query('REFRESH MATERIALIZED VIEW weekly_leaderboard_btc;', function(err){ 
                if(err) return done(err)

                done()
            });
        }
    ], function(err, results) {
        if (err) logger.error('err refreshing leaderboards %s', err);

        setTimeout(refreshViewOne, 60 * 1053);
    });
}
setTimeout(refreshViewOne, 1500);


function refreshViewTwo() {

async.parallel([
        function(done) {
            query('REFRESH MATERIALIZED VIEW  leaderboard_btc;', function(err){ 
                if(err) return done(err)

                done()
            });
        },
        function(done) {
            query('REFRESH MATERIALIZED VIEW  user_stats_btc;', function(err){ 
                if(err) return done(err)

                done()
            });
        },
        function(done) {
            query('REFRESH MATERIALIZED VIEW  user_stats_clam;', function(err){ 
                if(err) return done(err)

                done()
            });
        },
        function(done) {
            query('REFRESH MATERIALIZED VIEW weekly_leaderboard_btc;', function(err){ 
                if(err) return done(err)

                done()
            });
        }
    ], function(err, results) {
        if (err) logger.error('err refreshing leaderboards %s', err);

        setTimeout(refreshViewTwo, 61 * 1022);
    });
}
setTimeout(refreshViewTwo, 2000);



function refreshViewQuick() {
    
    async.parallel([
        function(done) {
            query('REFRESH MATERIALIZED VIEW  weekly_donors_list_clam;', function(err){ 
                if(err) return done(err)

                done()
            });
        },
        function(done) {
            query('REFRESH MATERIALIZED VIEW  weekly_donors_list_btc;', function(err){ 
                if(err) return done(err)

                done()
            });
        }
    ], function(err, results) {
        if (err) logger.error('err refreshing leaderboards %s', err);

        setTimeout(refreshViewQuick, 10 * 1000);
    });
}
setTimeout(refreshViewQuick, 1000);



// admin functions
exports.getWeeklyCommissionsEntryCount = function(callback) {
    query('SELECT COUNT(*) FROM weekly_commissions_overview', function(err, result) {
        if (err) return callback(err)

        return callback(null, result.rows[0].count)
    })
}

exports.getWeeklyCommissions = function(limit, offset, callback) {
    query('SELECT * FROM weekly_commissions_overview ORDER BY id DESC LIMIT $1 OFFSET $2', [limit, offset], function(err, result) {
        if (err) return callback(err)


        callback(null, result.rows);
    })
}

exports.getCommissionsEntryCount = function(callback) {
    query('SELECT COUNT(*) FROM commissions', function(err, result) {
        if (err) return callback(err)

        return callback(null, result.rows[0].count)
    })
}

exports.getCommissions = function(limit, offset, callback) {
    query('SELECT * FROM commissions ORDER BY created ASC LIMIT $1 OFFSET $2', [limit, offset], function(err, result) {
        if (err) return callback(err)


        callback(null, result.rows);
    })
}

exports.getWithdrawTotal = function(callback) {
    query('SELECT COALESCE(SUM(withdrawals.amount * -1), 0)::bigint sum FROM withdrawals WHERE completed IS NOT NULL', function(err, result) {
        if (err) return callback(err)

        callback(null, result.rows[0].sum)
    })
}

exports.getRecentWithdraws = function(callback) {
    query('SELECT * FROM  withdrawals ORDER BY created DESC LIMIT 25', function(err, result) {
        if (err) return callback(err)

        callback(null, result.rows)
    })
}

exports.getDepositTotal = function(callback) {
    query('SELECT COALESCE(SUM(deposits.amount), 0)::bigint sum FROM deposits WHERE confirmations > 2', function(err, result) {
        if (err) return callback(err)

        callback(null, result.rows[0].sum)
    })
}

exports.getRecentDeposits = function(callback) {
    query('SELECT * FROM  deposits ORDER BY created DESC LIMIT 25', function(err, result) {
        if (err) return callback(err)

        callback(null, result.rows)
    })
}