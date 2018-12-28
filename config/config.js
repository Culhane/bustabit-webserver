/**
 * For development you can set the variables by creating a .env file on the root
 */
var fs = require('fs');
var production = true;

//ar prodConfig;
//if(production) {
//  prodConfig = JSON.parse(fs.readFileSync(__dirname + '/build-config.json'));
//  console.log('Build config loaded: ', prodConfig);
//}

module.exports = {
  "PRODUCTION": production,
  "DATABASE_URL": process.env.DATABASE_URL || "",
  "BIP32_DERIVED": process.env.BIP32_DERIVED_KEY,
  "CONTACT_EMAIL": process.env.CONTACT_EMAIL || "",
  "SITE_URL": process.env.SITE_URL || "https://games.freebitcoins.com",
  "ENC_KEY": process.env.ENC_KEY || "enterkey", //"ENC_KEY": process.env.ENC_KEY || "devkey",
  "SIGNING_SECRET": process.env.SIGNING_SECRET || "secret",
  "BANKROLL_OFFSET": parseInt(process.env.BANKROLL_OFFSET) || 0,
  "RECAPTCHA_PRIV_KEY": process.env.RECAPTCHA_PRIV_KEY || '',
  "RECAPTCHA_SITE_KEY": process.env.RECAPTCHA_SITE_KEY || '',
  "PORT":  process.env.PORT || 3841,
  "MINING_FEE": process.env.MINING_FEE || 10000,
  "HTTPS_KEY": process.env.HTTPS_KEY || '/home/user/certs/privkey.pem',
  "HTTPS_CERT": process.env.HTTPS_CERT || '/home/user/certs/fullchain.pem',
  "HTTPS_CA": process.env.HTTPS_CA || '/home/user/certs/chain.pem'
  //"BUILD": prodConfig
};
