var assert = require('assert');
var nodemailer = require('nodemailer');
var sesTransport = require('nodemailer-ses-transport');
var config = require('../config/config');

var SITE_URL = config.SITE_URL;

function send(details, callback) {
    assert(details, callback);


    var transporter = nodemailer.createTransport({direct:true,
        host: '',
        port: 465,
        auth: { 
            user: '', 
            pass: '' },
        secure: true
    });


    /*
    var transport = nodemailer.createTransport(sesTransport({
        AWSAccessKeyID: config.AWS_SES_KEY,
        AWSSecretKey: config.AWS_SES_SECRET
    }));
    */

    transporter.sendMail(details, function(err) {
        if (err)
            return callback(err);

        callback(null);
    });
    
}

exports.passwordReset = function(to, userId, recoveryId, callback) {

    var htmlRecoveryLinks = '<a href="' + SITE_URL + '/reset/' + recoveryId +'">Please click here to reset ' + userId + "'s account</a><br>";

    var html = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
        '<html xmlns="http://www.w3.org/1999/xhtml">' +
        '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" />' +
        '<title>BlastOff</title>' +
        '</head>' +
        '<body>'+
        '<h2>BlastOff Password recovery</h2>' +
        '<br>' +
         htmlRecoveryLinks +
        '<br>' +
        '<br>' +
        "<span>We only send password resets to registered email accounts." +
        '</body></html>';

    var details =  {
        to: to,
        from: 'Hello@freebitcoins.com',
        subject: 'games.freebitcoins.com - BlastOff - Reset Password Request',
        html: html

    };
    send(details, callback);
};
