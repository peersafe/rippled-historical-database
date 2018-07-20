var BigNumber  = require('bignumber.js');

// from ripple-lib-extensions

function adjustQualityForDAC(quality, pays, gets) {
  var numeratorShift = (pays === 'DAC' ? -6 : 0);
  var denominatorShift = (gets === 'DAC' ? -6 : 0);
  var shift = numeratorShift - denominatorShift;
  return shift === 0 ? (new BigNumber(quality)) :
    (new BigNumber(quality)).shift(shift);
}

function parseQuality(bookDirectory, pays, gets) {
  var qualityHex = bookDirectory.substring(bookDirectory.length - 16);
  var mantissa = new BigNumber(qualityHex.substring(2), 16);
  var offset = parseInt(qualityHex.substring(0, 2), 16) - 100;
  var quality = mantissa.toString() + 'e' + offset.toString();
  return adjustQualityForDAC(quality, pays, gets);
}

module.exports = parseQuality;
