var database = require('./database');
var timeago = require('timeago');
var config = require('../config/config');
var logger = require('winston');

var stats;
var generated;

function getSiteStats() {
    database.getSiteStats(function(err, results) {
        if (err) {
            logger.error('[INTERNAL_ERROR] Unable to get site stats: %s', err);
            return;
        }

        stats = results;
        generated = new Date();
    });
}

setInterval(getSiteStats, 1000 * 60 * 5);
getSiteStats();

exports.stats = function(req, res, next) {
    if (!stats) {
        return next('Stats are loading');
    }
    var user = req.user;
    res.render('stats', { user: user, generated: timeago(generated), stats: stats });

};

exports.index = function(req, res, next) {
    if (!stats) {
        return next('Stats are loading');
    }
    var user = req.user;
    res.render('index', { user: user, generated: timeago(generated), stats: stats });

};
