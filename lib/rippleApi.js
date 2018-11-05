var config = require('../config')
var ripple = require('chainsql-lib');
var rippleAPI = new ripple.ChainsqlLibAPI(config.get('ripple'))

rippleAPI.connect()
.then(function() {
  console.log('ripple API connected.')
})
.catch(function(e) {
  console.log(e)
})

rippleAPI.on('error', function(errorCode, errorMessage, data) {
  console.log(errorCode, errorMessage, data)
})

module.exports = rippleAPI
