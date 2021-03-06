var BigNumber  = require('bignumber.js');
var parseQuality = require('./quality.js');
var ZXC_ADJUST = 1000000.0;

/**
 * OffersExercised;
 * parse a single transaction to extract
 * all offers exercised
 */

var OffersExercised = function (tx) {
  var list = [];
  var node;
  var affNode;

  if (tx.metaData.TransactionResult !== 'tesSUCCESS') {
    return list;
  }

  if (tx.TransactionType !== 'Payment' && tx.TransactionType !== 'OfferCreate') {
    return list;
  }

  for (var i=0; i<tx.metaData.AffectedNodes.length; i++) {
    affNode = tx.metaData.AffectedNodes[i];
    node    = affNode.ModifiedNode || affNode.DeletedNode;

    if (!node || node.LedgerEntryType !== 'Offer') {
      continue;
    }

    if (tx.TransactionType !== 'OfferCancel' && (!node.PreviousFields || !node.PreviousFields.TakerPays || !node.PreviousFields.TakerGets)) {
      continue;
    }

    node.nodeIndex = i;
    list.push(parseOfferExercised(node, tx));
  }

  return list;

  /**
   * parseOfferExercised
   * after determining the presence of an
   * excercised offer, extract it into
   * the required form
   */

  function parseOfferExercised (node, tx) {

    var taker = tx.Account;
    var seller = tx.Account;
    var base;
    var counter;
    var exchangeRate;
    var change;
    var previousFields = node.PreviousFields;
    var factor = 1;

    if (tx.TransactionType === 'OfferCancel'){
      taker = '';
      seller = '';
      previousFields = node.FinalFields;
      factor = 2;
    }

    // TakerPays IOU
    if (typeof previousFields.TakerPays === "object") {
      change = new BigNumber(previousFields.TakerPays.value).times(factor)
        .minus(node.FinalFields.TakerPays.value)

      base = {
        currency: previousFields.TakerPays.currency,
        issuer: previousFields.TakerPays.issuer,
        amount: change.toString()
      }

    // TakerPays ZXC
    } else {
      change = new BigNumber(previousFields.TakerPays).times(factor)
        .minus(node.FinalFields.TakerPays);

      base = {
        currency: 'ZXC',
        amount: change.dividedBy(ZXC_ADJUST).toString()
      }
    }

    // TakerGets IOU
    if (typeof previousFields.TakerGets === "object") {
      change = new BigNumber(previousFields.TakerGets.value).times(factor)
        .minus(node.FinalFields.TakerGets.value)

      counter = {
        currency: previousFields.TakerGets.currency,
        issuer: previousFields.TakerGets.issuer,
        amount: change.toString()
      }

    // TakerGets ZXC
    } else {
      change = new BigNumber(previousFields.TakerGets).times(factor)
        .minus(node.FinalFields.TakerGets);

      counter = {
        currency: 'ZXC',
        amount: change.dividedBy(ZXC_ADJUST).toString()
      }
    }

    try {
      exchangeRate = parseQuality(
        node.FinalFields.BookDirectory,
        base.currency,
        counter.currency
      );


    } catch (e) {
      //unable to calculate from quality
      console.log(e);
    }

    if (!exchangeRate) {
      exchangeRate = new BigNumber(base.amount).dividedBy(counter.amount);
    }

    var offer = {
      base         : base,
      counter      : counter,
      rate         : exchangeRate,
      buyer        : node.FinalFields.Account,
      seller       : seller,
      taker        : taker,
      provider     : node.FinalFields.Account,
      sequence     : node.FinalFields.Sequence,
      time         : tx.executed_time,
      tx_type      : tx.TransactionType,
      tx_index     : tx.tx_index,
      ledger_index : tx.ledger_index,
      node_index   : node.nodeIndex,
      tx_hash      : tx.hash,
      client       : tx.client
    };

    // look for autobridge data
    if (tx.TransactionType === 'OfferCreate' &&
        tx.TakerPays.currency &&
        tx.TakerGets.currency) {

      if (counter.currency === 'ZXC' &&
        base.currency === tx.TakerPays.currency) {
        offer.autobridged = {
          currency: tx.TakerGets.currency,
          issuer: tx.TakerGets.issuer
        };

      } else if (counter.currency === 'ZXC' &&
        base.currency === tx.TakerGets.currency) {
        offer.autobridged = {
          currency: tx.TakerPays.currency,
          issuer: tx.TakerPays.issuer
        };

      } else if (base.currency === 'ZXC' &&
        counter.currency === tx.TakerPays.currency) {
        offer.autobridged = {
          currency: tx.TakerGets.currency,
          issuer: tx.TakerGets.issuer
        };

      } else if (base.currency === 'ZXC' &&
        counter.currency === tx.TakerGets.currency) {
        offer.autobridged = {
          currency: tx.TakerPays.currency,
          issuer: tx.TakerPays.issuer
        };
      }
    }

    return orderPair(offer);
  }

  /**
   * orderPair
   * swap currencies based on
   * lexigraphical order
   */

  function orderPair (offer) {
    var c1 = (offer.base.currency + offer.base.issuer).toLowerCase();
    var c2 = (offer.counter.currency + offer.counter.issuer).toLowerCase();
    var swap;

    if (c2 < c1) {
      swap          = offer.base;
      offer.base    = offer.counter;
      offer.counter = swap;
      offer.rate    = offer.rate.toString();
      swap          = offer.buyer;
      offer.buyer   = offer.seller;
      offer.seller  = swap;

    } else {
      offer.rate = offer.rate.pow(-1).toString();
    }

    return offer;
  }
};

module.exports = OffersExercised;
