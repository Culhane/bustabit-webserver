var assert = require('assert');
var db = require('./database');
var request = require('request');
var config = require('../config/config');

// Doesn't validate
module.exports = function(userId, satoshis, withdrawalAddress, withdrawalId, coin, callback) {
    assert(typeof userId === 'number');
    assert(typeof withdrawalAddress === 'string');
    assert(typeof callback === 'function');

    db.makeWithdrawal(userId, satoshis, withdrawalAddress, withdrawalId, coin, function (err, fundingId) {
        if (err) {
            if (err.code === '23514')
                callback('NOT_ENOUGH_MONEY');
            else if(err.code === '23505')
                callback('SAME_WITHDRAWAL_ID');
            else
                callback(err);
            return;
        }

        assert(fundingId);
        callback(null);
    });
};
