var Logger = require('../../lib/logger');
var log = new Logger({scope : 'account exchanges'});
var smoment = require('../../lib/smoment');
var utils = require('../../lib/utils');
var hbase;

AccountExchanges = function (req, res, next) {

  var options = prepareOptions();

  if (!options.start) {
    errorResponse({
      error: 'invalid start date format',
      code: 400
    });
    return;

  } else if (!options.end) {
    errorResponse({
      error: 'invalid end date format',
      code: 400
    });
    return;
  }

  getOfferCancel(req).then(function(offerCancel) {
    // success
    
    hbase.getAccountExchanges(options, function(err, exchanges) {
      if (err) {
        errorResponse(err);

      } else {
        exchanges.rows.forEach(function(ex) {
          ex.executed_time = smoment(parseInt(ex.executed_time)).format();
          ex.base_amount = ex.base_amount.toString();
          ex.counter_amount = ex.counter_amount.toString();
          ex.rate = ex.rate.toPrecision(8);
          delete ex.rowkey;
        });

        exchanges.rows = exchanges.rows.concat(offerCancel);
        exchanges.rows.sort(dateCompare('executed_time'));
        exchanges.rows = exchanges.rows.slice(0,req.query.limit);

        successResponse(exchanges);
      }
    });
  }).catch(function(err){
    //err
    // console.log(err);
    errorResponse(err);
  })

 /**
  * prepareOptions
  * parse request parameters to determine query options
  */

  function prepareOptions () {
    var options = {
      account      : req.params.address,
      base         : req.params.base,
      counter      : req.params.counter,
      limit        : req.query.limit || 200,
      marker       : req.query.marker,
      descending   : (/true/i).test(req.query.descending) ? true : false,
      start        : smoment(req.query.start || '2013-01-01'),
      end          : smoment(req.query.end),
      format       : (req.query.format || 'json').toLowerCase()
    };

    var base    = req.params.base ? req.params.base.split(/[\+|\.]/) : undefined;
    var counter = req.params.counter ? req.params.counter.split(/[\+|\.]/) : undefined;

    options.base= {};
    options.base.currency = base && base[0] ? base[0].toUpperCase() : undefined;
    options.base.issuer   = base && base[1] ? base[1] : undefined;

    options.counter= {};
    options.counter.currency = counter && counter[0] ? counter[0].toUpperCase() : undefined;
    options.counter.issuer   = counter && counter[1] ? counter[1] : undefined;

    if (isNaN(options.limit)) {
      options.limit = 200;

    } else if (options.limit > 1000) {
      options.limit = 1000;
    }

    return options;
  }

  function isObject(obj) {
    return Object.prototype.toString.call(obj) === '[object Object]';
  }

  function isEmptyObject(obj) {  
    var t;  
    for (t in obj)  
        return false;  
    return true; 
  } 

  function offerCancelOptions(req) {
    var options = {
      account: req.params.address,
      type: 'OfferCancel',
      result: '',
      binary: (/true/i).test(req.query.binary) ? true : false,
      minSequence: req.query.min_sequence,
      maxSequence: req.query.max_sequence,
      marker: '',
      limit: 1000000,
      descending: false
    };

    // query by date
    options.start = smoment(req.query.start || 0);
    options.end = smoment(req.query.end);

    return options;
  }

  function dateCompare(propertyName) {
    return function(object1, object2) {  
      var value1 = object1[propertyName];  
      var value2 = object2[propertyName];  
      return value2.localeCompare(value1);  
    }  
  }

  /**
  * getOfferCancel
  * return the transactions which type is OfferCancel
  */

  function getOfferCancel (req) {
    return new Promise(function (resolve, reject) {
      var offerCancelRecord = [];
      var options = offerCancelOptions(req);

      hbase.getAccountTransactions(options, function(err, resp) {
        if (err) {
          // errorResponse(err);
          console.log(err);
        } else {
          resp.rows.forEach(function(ts) {
            var offerCancel = {
              base_amount: '',
              counter_amount: '',
              rate: '',
              base_currency: '',
              base_issuer: '',
              buyer : ts.tx.Account,
              counter_currency: '',
              executed_time : ts.date.replace('+00:00','Z'),
              ledger_index : ts.ledger_index,
              offer_sequence : ts.tx.OfferSequence,
              provider : '',
              seller : '',
              taker : ts.tx.Account,
              tx_hash : ts.hash,
              tx_type : ts.tx.TransactionType
            };

            var offerNode ;
            // get offer node object
            ts.meta.AffectedNodes.forEach(function(no){
               if (no.hasOwnProperty('DeletedNode')) {
                  if (no.DeletedNode.hasOwnProperty('LedgerEntryType') && no.DeletedNode.LedgerEntryType === 'Offer') {
                    offerNode = no.DeletedNode;
                    return;
                  }
               }
            });

            if (isEmptyObject(offerNode)) {
              return;
            }

           
            var takerPays = offerNode.FinalFields.TakerPays;
            var takerGets = offerNode.FinalFields.TakerGets;

            if (isObject(takerGets)){
              offerCancel.base_amount=takerGets.value;
              offerCancel.base_currency = takerGets.currency;
              offerCancel.base_issuer = takerGets.issuer;
            }else{
              offerCancel.base_amount= (parseFloat(takerGets)/1000000).toString();
              offerCancel.base_currency = 'XRP';
            }

            if (isObject(takerPays)){
              offerCancel.counter_amount = takerPays.value;
              offerCancel.counter_currency = takerPays.currency;
            }else{
              offerCancel.counter_amount = (parseFloat(takerPays)/1000000).toString();
              offerCancel.counter_currency = 'XRP';
            }
            

            offerCancel.rate = (parseFloat(offerCancel.counter_amount)/parseFloat(offerCancel.base_amount)).toPrecision(8);

            delete ts.rowkey;
            offerCancelRecord.push(offerCancel);

            resolve(offerCancelRecord);
          });
        }
      });
    })
  }
 /**
  * errorResponse
  * return an error response
  * @param {Object} err
  */

  function errorResponse (err) {
    log.error(err.error || err);
    if (err.code && err.code.toString()[0] === '4') {
      res.status(err.code).json({
        result:'error',
        message:err.error
      });
    } else {
      res.status(500).json({
        result:'error',
        message:'unable to retrieve exchanges'
      });
    }
  }

 /**
  * successResponse
  * return a successful response
  * @param {Object} exchanges
  */

  function successResponse(exchanges) {
    var filename = options.account + ' - exchanges';

    if (exchanges.marker) {
      utils.addLinkHeader(req, res, exchanges.marker);
    }

    if (options.format === 'csv') {
      if (options.base.currency && options.counter.currency) {
        filename += ' - ' +
          options.base.currency + '-' +
          options.counter.currency;
      } else if (options.base.currency) {
        filename += ' - ' + options.base.currency;
      } else if (options.counter.currency) {
        filename += ' - ' + options.counter.currency;
      }

      filename += '.csv';

      //ensure consistency in ordering
      if (exchanges.rows.length) {
        exchanges.rows[0] = {
          base_currency: exchanges.rows[0].base_currency,
          base_issuer: exchanges.rows[0].base_issuer,
          counter_currency: exchanges.rows[0].counter_currency,
          counter_issuer: exchanges.rows[0].counter_issuer,
          base_amount: exchanges.rows[0].base_amount,
          counter_amount: exchanges.rows[0].counter_amount,
          rate: exchanges.rows[0].rate,
          executed_time: exchanges.rows[0].executed_time,
          ledger_index: exchanges.rows[0].ledger_index,
          buyer: exchanges.rows[0].buyer,
          seller: exchanges.rows[0].seller,
          taker: exchanges.rows[0].taker,
          provider: exchanges.rows[0].provider,
          autobridged_currency: exchanges.rows[0].autobridged_currency,
          autobridged_issuer: exchanges.rows[0].autobridged_issuer,
          offer_sequence: exchanges.rows[0].offer_sequence,
          tx_type: exchanges.rows[0].tx_type,
          tx_index: exchanges.rows[0].tx_index,
          node_index: exchanges.rows[0].node_index,
          tx_hash: exchanges.rows[0].tx_hash
        };
      }

      res.csv(exchanges.rows, filename);

    } else {
      res.json({
        result: 'success',
        count: exchanges.rows.length,
        marker: exchanges.marker,
        exchanges: exchanges.rows
      });
    }
  }
};

module.exports = function(db) {
  hbase = db;
  return AccountExchanges;
};
